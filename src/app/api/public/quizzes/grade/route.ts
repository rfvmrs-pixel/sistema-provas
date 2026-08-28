import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { questions } from "@/db/schema";
import { verifyQuizToken } from "@/lib/quizToken";

// POST { token, answers: { [questionId]: selectedKey | null } } -> confere
// contra o gabarito assinado no token (ver /quizzes/start) e devolve a
// correção pergunta a pergunta, com a explicação de cada uma pra feedback
// imediato — sem gravar nada no banco.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const payload = await verifyQuizToken(body?.token);
  if (!payload) {
    return NextResponse.json({ error: "Sessão do quiz expirada. Comece de novo." }, { status: 400 });
  }

  const answers: Record<string, string | null> = body?.answers ?? {};
  const explanationRows = await db
    .select({ id: questions.id, explanation: questions.explanation, options: questions.options, text: questions.text })
    .from(questions)
    .where(inArray(questions.id, payload.questionIds));
  const byId = new Map(explanationRows.map((q) => [q.id, q]));

  let correctCount = 0;
  const perQuestion = payload.questionIds.map((questionId) => {
    const q = byId.get(questionId);
    const correctKey = payload.correctKeys[String(questionId)];
    const selectedKey = answers[String(questionId)] ?? null;
    const correct = selectedKey !== null && selectedKey === correctKey;
    if (correct) correctCount++;
    return {
      questionId,
      text: q?.text ?? "",
      options: q?.options ?? [],
      selectedKey,
      correctKey,
      correct,
      explanation: q?.explanation ?? null,
    };
  });

  const total = payload.questionIds.length;
  const percentage = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return NextResponse.json({
    examTitle: payload.examTitle,
    documentType: payload.documentType,
    score: correctCount,
    total,
    percentage,
    perQuestion,
  });
}
