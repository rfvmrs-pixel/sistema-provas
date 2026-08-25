import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";
import { extractPdfText } from "@/lib/pdf";
import { generateExamFromText } from "@/lib/ai";

export const maxDuration = 120;

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const list = await db
    .select({
      id: exams.id,
      title: exams.title,
      sourceFileName: exams.sourceFileName,
      active: exams.active,
      passingScore: exams.passingScore,
      createdAt: exams.createdAt,
      questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
      attemptCount: sql<number>`count(distinct ${attempts.id})`.mapWith(Number),
    })
    .from(exams)
    .leftJoin(questions, eq(questions.examId, exams.id))
    .leftJoin(attempts, eq(attempts.examId, exams.id))
    .groupBy(exams.id)
    .orderBy(desc(exams.createdAt));

  return NextResponse.json({ exams: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Envio inválido, esperado multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const numQuestionsRaw = form.get("numQuestions");
  const numQuestions = numQuestionsRaw ? Math.min(30, Math.max(4, Number(numQuestionsRaw))) : 10;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo PDF enviado." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
  }

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    text = await extractPdfText(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao ler o PDF." },
      { status: 400 },
    );
  }

  let generated;
  try {
    generated = await generateExamFromText(text, { numQuestions, sourceFileName: file.name });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar a prova com IA." },
      { status: 502 },
    );
  }

  const [exam] = await db
    .insert(exams)
    .values({
      title: generated.title || file.name,
      sourceFileName: file.name,
      summary: generated.summary,
    })
    .returning();

  if (generated.questions.length > 0) {
    await db.insert(questions).values(
      generated.questions.map((q, idx) => ({
        examId: exam.id,
        text: q.text,
        options: q.options,
        correctKey: q.correctKey,
        topic: q.topic,
        explanation: q.explanation,
        order: idx,
      })),
    );
  }

  return NextResponse.json({ exam }, { status: 201 });
}
