import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";
import { extractPdfText } from "@/lib/pdf";
import { generateExamFromText } from "@/lib/ai";

export const maxDuration = 120;

// Toda prova gerada automaticamente tem sempre 15 questões.
const QUESTIONS_PER_EXAM = 15;

// Quando a IT/APR de origem muda, o admin sobe a versão nova do PDF aqui.
// A prova (id, Setor, Função, histórico de tentativas) continua a mesma —
// só as questões são substituídas pelas geradas a partir do novo conteúdo.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Envio inválido, esperado multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
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
    generated = await generateExamFromText(text, {
      numQuestions: QUESTIONS_PER_EXAM,
      sourceFileName: file.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar a prova com IA." },
      { status: 502 },
    );
  }

  await db.delete(questions).where(eq(questions.examId, examId));

  if (generated.questions.length > 0) {
    await db.insert(questions).values(
      generated.questions.map((q, idx) => ({
        examId,
        text: q.text,
        options: q.options,
        correctKey: q.correctKey,
        topic: q.topic,
        explanation: q.explanation,
        order: idx,
      })),
    );
  }

  const [updated] = await db
    .update(exams)
    .set({
      title: generated.title || file.name,
      sourceFileName: file.name,
      summary: generated.summary,
    })
    .where(eq(exams.id, examId))
    .returning();

  return NextResponse.json({ exam: updated });
}
