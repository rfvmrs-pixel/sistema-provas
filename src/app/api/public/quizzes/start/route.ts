import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";
import { signQuizToken } from "@/lib/quizToken";

export const QUIZ_QUESTION_COUNT = 5;
export const QUIZ_SECONDS_PER_QUESTION = 30;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// POST { sectorId, examId } -> sorteia até QUIZ_QUESTION_COUNT questões da
// prova escolhida e devolve um token assinado com o gabarito (ver
// src/lib/quizToken.ts) + as perguntas sem correctKey/explanation. Não cria
// funcionário nem tentativa no banco: Quiz é uma prática avulsa, não entra
// nos relatórios nem no indicador de auditoria.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sectorId = Number(body?.sectorId);
  const examId = Number(body?.examId);
  if (!sectorId || !examId) {
    return NextResponse.json({ error: "Informe o Contrato e o IT/APR." }, { status: 400 });
  }

  const exam = await db.query.exams.findFirst({
    where: and(eq(exams.id, examId), eq(exams.sectorId, sectorId), eq(exams.active, true)),
  });
  if (!exam) {
    return NextResponse.json({ error: "IT/APR não encontrado para esse Contrato." }, { status: 404 });
  }

  const allQuestions = await db.select().from(questions).where(eq(questions.examId, examId));
  if (allQuestions.length === 0) {
    return NextResponse.json({ error: "Esse IT/APR ainda não tem perguntas cadastradas." }, { status: 400 });
  }

  const picked = shuffle(allQuestions).slice(0, QUIZ_QUESTION_COUNT);
  const correctKeys: Record<string, string> = {};
  for (const q of picked) correctKeys[String(q.id)] = q.correctKey;

  const token = await signQuizToken({
    examId: exam.id,
    examTitle: exam.title,
    documentType: exam.documentType,
    questionIds: picked.map((q) => q.id),
    correctKeys,
  });

  return NextResponse.json({
    token,
    examTitle: exam.title,
    documentType: exam.documentType,
    secondsPerQuestion: QUIZ_SECONDS_PER_QUESTION,
    questions: picked.map((q) => ({ id: q.id, text: q.text, options: q.options })),
  });
}
