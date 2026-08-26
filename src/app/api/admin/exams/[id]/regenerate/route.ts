import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, roles, documents } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { generateExamFromText, type DocumentType } from "@/lib/ai";

export const maxDuration = 120;

const ALLOWED_QUESTION_COUNTS = [10, 15];

// Quando a IT/APR de origem muda (ou quer trocar a quantidade de questões),
// o admin escolhe um PDF da biblioteca (do mesmo Contrato da prova) aqui.
// A prova (id, Setor, Função, tipo de documento, histórico de tentativas)
// continua a mesma — só as questões são substituídas pelas geradas a partir
// do documento escolhido. Por padrão mantém a mesma quantidade de questões
// que a prova já tinha; o admin pode enviar numQuestions para trocar (10 ou 15).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const role = await db.query.roles.findFirst({ where: eq(roles.id, exam.roleId) });

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Envio inválido, esperado JSON." }, { status: 400 });
  }

  const documentId = Number(body.documentId);
  if (!documentId) {
    return NextResponse.json({ error: "Selecione um PDF da biblioteca." }, { status: 400 });
  }

  const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) return NextResponse.json({ error: "Documento não encontrado na biblioteca." }, { status: 404 });
  if (document.sectorId !== exam.sectorId) {
    return NextResponse.json(
      { error: "Escolha um PDF do mesmo Contrato desta prova." },
      { status: 400 },
    );
  }

  const [{ count: currentQuestionCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(questions)
    .where(eq(questions.examId, examId));
  const numQuestionsRaw = Number(body.numQuestions);
  const numQuestions = ALLOWED_QUESTION_COUNTS.includes(numQuestionsRaw)
    ? numQuestionsRaw
    : ALLOWED_QUESTION_COUNTS.includes(currentQuestionCount)
      ? currentQuestionCount
      : 15;

  const documentType = (exam.documentType === "APR" ? "APR" : "IT") as DocumentType;

  let generated;
  try {
    generated = await generateExamFromText(document.extractedText, {
      numQuestions,
      sourceFileName: document.fileName,
      documentType,
      roleName: role?.name,
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
      title: generated.title || document.fileName,
      sourceFileName: document.fileName,
      summary: generated.summary,
      documentId: document.id,
    })
    .where(eq(exams.id, examId))
    .returning();

  return NextResponse.json({ exam: updated });
}
