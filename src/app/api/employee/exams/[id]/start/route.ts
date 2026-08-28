import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts } from "@/db/schema";
import { getEmployeeSession } from "@/lib/session";
import { ensureFreshQuestionSet } from "@/lib/attemptLimit";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await ctx.params;
  const examId = Number(id);

  const mode = employee.mode === "oficial" ? "oficial" : "simulado";
  if (mode === "oficial" && employee.examId !== examId) {
    return NextResponse.json(
      { error: "Esse código só dá acesso a uma prova específica." },
      { status: 403 },
    );
  }

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam || !exam.active) {
    return NextResponse.json({ error: "Prova não disponível." }, { status: 404 });
  }
  if (exam.sectorId !== employee.sectorId || exam.roleId !== employee.roleId) {
    return NextResponse.json({ error: "Essa prova não é do seu Setor/Função." }, { status: 403 });
  }

  // Modo "oficial" (prova aplicada de verdade) tem limite de 3 tentativas por
  // colaborador no mesmo conjunto de perguntas; ao estourar, regenera as
  // questões na hora (ver src/lib/attemptLimit.ts).
  let currentExam = exam;
  let questionSetVersion = exam.currentVersion;
  if (mode === "oficial") {
    const fresh = await ensureFreshQuestionSet(examId, employee.employeeId);
    questionSetVersion = fresh.currentVersion;
    if (fresh.regenerated) {
      currentExam = (await db.query.exams.findFirst({ where: eq(exams.id, examId) })) ?? exam;
    }
  }

  const examQuestions = await db
    .select({
      id: questions.id,
      text: questions.text,
      options: questions.options,
      order: questions.order,
    })
    .from(questions)
    .where(eq(questions.examId, examId))
    .orderBy(asc(questions.order));

  if (examQuestions.length === 0) {
    return NextResponse.json({ error: "Essa prova ainda não tem questões." }, { status: 400 });
  }

  const [attempt] = await db
    .insert(attempts)
    .values({
      examId,
      employeeId: employee.employeeId,
      totalQuestions: examQuestions.length,
      mode,
      sessionLabel: mode === "oficial" ? employee.sessionLabel ?? null : null,
      examLinkId: mode === "oficial" ? employee.examLinkId ?? null : null,
      questionSetVersion,
    })
    .returning();

  return NextResponse.json({
    attemptId: attempt.id,
    exam: { id: currentExam.id, title: currentExam.title, passingScore: currentExam.passingScore },
    questions: examQuestions,
    startedAt: attempt.startedAt,
  });
}
