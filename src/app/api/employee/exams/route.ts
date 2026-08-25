import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts } from "@/db/schema";
import { getEmployeeSession } from "@/lib/session";

export async function GET() {
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Modo "oficial" (prova do dia, código de uso único): trava na única prova
  // combinada no login, não deixa navegar por outras provas do Setor/Função.
  const scope =
    employee.mode === "oficial" && employee.examId
      ? eq(exams.id, employee.examId)
      : and(eq(exams.sectorId, employee.sectorId), eq(exams.roleId, employee.roleId));

  const activeExams = await db
    .select({
      id: exams.id,
      title: exams.title,
      summary: exams.summary,
      passingScore: exams.passingScore,
      documentType: exams.documentType,
      questionCount: sql<number>`count(${questions.id})`.mapWith(Number),
    })
    .from(exams)
    .leftJoin(questions, eq(questions.examId, exams.id))
    .where(and(eq(exams.active, true), scope))
    .groupBy(exams.id)
    .orderBy(desc(exams.createdAt));

  const myAttempts = await db
    .select({
      examId: attempts.examId,
      percentage: attempts.percentage,
      finishedAt: attempts.finishedAt,
    })
    .from(attempts)
    .where(and(eq(attempts.employeeId, employee.employeeId)));

  const lastAttemptByExam = new Map<number, { percentage: number | null; finishedAt: Date | null }>();
  for (const a of myAttempts) {
    if (a.finishedAt && !lastAttemptByExam.has(a.examId)) {
      lastAttemptByExam.set(a.examId, { percentage: a.percentage, finishedAt: a.finishedAt });
    }
  }

  const result = activeExams
    .filter((e) => e.questionCount > 0)
    .map((e) => ({
      ...e,
      // No modo oficial o colaborador não tem login persistente pra consultar
      // depois, então não expomos resultado de tentativas anteriores aqui.
      lastResult: employee.mode === "oficial" ? null : lastAttemptByExam.get(e.id) ?? null,
    }));

  return NextResponse.json({
    employee: { name: employee.name, mode: employee.mode ?? "simulado", sessionLabel: employee.sessionLabel ?? null },
    exams: result,
  });
}
