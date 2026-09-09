import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, exams, questions, answers } from "@/db/schema";
import { getEmployeeSession } from "@/lib/session";

// Detalhe de UMA tentativa já finalizada do colaborador logado — cada
// questão com a alternativa correta, a que ele marcou e se acertou ou não.
// Usado pela tela "Minhas provas" pra abrir o que já foi respondido. Só
// devolve tentativas do PRÓPRIO colaborador (nunca de outra pessoa).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const attemptId = Number(id);

  const attempt = await db.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
  if (!attempt || attempt.employeeId !== employee.employeeId) {
    return NextResponse.json({ error: "Tentativa não encontrada." }, { status: 404 });
  }
  if (!attempt.finishedAt) {
    return NextResponse.json({ error: "Essa prova ainda não foi finalizada." }, { status: 409 });
  }

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, attempt.examId) });

  const examQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, attempt.examId))
    .orderBy(asc(questions.order));

  const attemptAnswers = await db.select().from(answers).where(eq(answers.attemptId, attemptId));
  const answerByQuestionId = new Map(attemptAnswers.map((a) => [a.questionId, a]));

  const review = examQuestions.map((q) => {
    const ans = answerByQuestionId.get(q.id);
    return {
      questionId: q.id,
      text: q.text,
      options: q.options,
      correctKey: q.correctKey,
      selectedKey: ans?.selectedKey ?? null,
      correct: ans?.correct ?? false,
      explanation: q.explanation,
      topic: q.topic,
    };
  });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      examTitle: exam?.title ?? "",
      finishedAt: attempt.finishedAt,
      percentage: attempt.percentage,
      passingScore: exam?.passingScore ?? 70,
      passed: exam ? (attempt.percentage ?? 0) >= exam.passingScore : undefined,
    },
    review,
  });
}
