import { NextRequest, NextResponse } from "next/server";
import { verifyQuizToken } from "@/lib/quizToken";

// POST { token, answers: { [questionId]: selectedKey | null } } -> confere
// contra o gabarito assinado no token (ver /quizzes/start) e devolve a
// correção pergunta a pergunta, com a explicação de cada uma pra feedback
// imediato. As perguntas foram geradas na hora pela IA e vêm embutidas no
// próprio token — não existe linha em `questions` pra consultar, nada foi
// persistido no banco.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const payload = await verifyQuizToken(body?.token);
  if (!payload) {
    return NextResponse.json({ error: "Sessão do quiz expirada. Comece de novo." }, { status: 400 });
  }

  const answers: Record<string, string | null> = body?.answers ?? {};

  let correctCount = 0;
  const perQuestion = payload.questions.map((q) => {
    const selectedKey = answers[String(q.id)] ?? null;
    const correct = selectedKey !== null && selectedKey === q.correctKey;
    if (correct) correctCount++;
    return {
      questionId: q.id,
      text: q.text,
      options: q.options,
      selectedKey,
      correctKey: q.correctKey,
      correct,
      explanation: q.explanation ?? null,
    };
  });

  const total = payload.questions.length;
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
