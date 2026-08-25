import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, questions, answers, exams, employees } from "@/db/schema";
import { getEmployeeSession, clearEmployeeSession } from "@/lib/session";

type SubmittedAnswer = { questionId: number; selectedKey: string | null };

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  if (attempt.finishedAt) {
    return NextResponse.json({ error: "Essa prova já foi finalizada." }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const submitted: SubmittedAnswer[] = Array.isArray(body?.answers) ? body.answers : [];

  const examQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, attempt.examId));

  let score = 0;

  const answerRows = examQuestions.map((q) => {
    const found = submitted.find((s) => s.questionId === q.id);
    const selectedKey = found?.selectedKey ?? null;
    const correct = selectedKey !== null && selectedKey === q.correctKey;
    if (correct) score += 1;
    return { attemptId, questionId: q.id, selectedKey, correct };
  });

  if (answerRows.length > 0) {
    await db.insert(answers).values(answerRows);
  }

  const totalQuestions = examQuestions.length;
  const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

  const [updated] = await db
    .update(attempts)
    .set({ finishedAt: new Date(), score, totalQuestions, percentage })
    .where(eq(attempts.id, attemptId))
    .returning();

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, attempt.examId) });

  // Modo "oficial" (prova do dia): o código de uso único é queimado agora que
  // a tentativa terminou, e a sessão é encerrada — não dá pra reusar o mesmo
  // código nem continuar navegando como esse colaborador depois disso.
  if (attempt.mode === "oficial") {
    await db
      .update(employees)
      .set({
        tempCodeHash: null,
        tempCodeExamId: null,
        tempCodeSessionLabel: null,
        tempCodeExpiresAt: null,
      })
      .where(eq(employees.id, employee.employeeId));
    await clearEmployeeSession();
  }

  const review = examQuestions
    .sort((a, b) => a.order - b.order)
    .map((q) => {
      const ans = answerRows.find((a) => a.questionId === q.id);
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
    attempt: updated,
    passed: exam ? percentage >= exam.passingScore : undefined,
    passingScore: exam?.passingScore,
    review,
  });
}
