import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts } from "@/db/schema";
import { getEmployeeSession } from "@/lib/session";
import { sql } from "drizzle-orm";

export async function GET() {
  const employee = await getEmployeeSession();
  if (!employee) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const activeExams = await db
    .select({
      id: exams.id,
      title: exams.title,
      summary: exams.summary,
      passingScore: exams.passingScore,
      questionCount: sql<number>`count(${questions.id})`.mapWith(Number),
    })
    .from(exams)
    .leftJoin(questions, eq(questions.examId, exams.id))
    .where(eq(exams.active, true))
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
      lastResult: lastAttemptByExam.get(e.id) ?? null,
    }));

  return NextResponse.json({ employee, exams: result });
}
