import { and, avg, count, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { attempts, employees, sectors, roles, answers, questions, exams } from "@/db/schema";

const TRAINING_THRESHOLD = 70; // % abaixo disso é sinalizado como "precisa de treinamento"

export type SummaryRow = {
  id: number;
  name: string;
  avgScore: number;
  attemptCount: number;
  needsTraining: boolean;
};

export type TopicRow = {
  topic: string;
  accuracy: number;
  totalAnswers: number;
  needsTraining: boolean;
};

export type TopicByGroupRow = TopicRow & { groupId: number; groupName: string };

function round(n: number | string | null): number {
  if (n === null) return 0;
  return Math.round(Number(n));
}

export async function getSectorSummary(): Promise<SummaryRow[]> {
  const rows = await db
    .select({
      id: sectors.id,
      name: sectors.name,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(sectors)
    .leftJoin(employees, eq(employees.sectorId, sectors.id))
    .leftJoin(
      attempts,
      and(eq(attempts.employeeId, employees.id), isNotNull(attempts.percentage)),
    )
    .groupBy(sectors.id, sectors.name)
    .orderBy(sectors.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
    needsTraining: r.attemptCount > 0 && round(r.avgScore) < TRAINING_THRESHOLD,
  }));
}

export async function getRoleSummary(): Promise<SummaryRow[]> {
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(roles)
    .leftJoin(employees, eq(employees.roleId, roles.id))
    .leftJoin(
      attempts,
      and(eq(attempts.employeeId, employees.id), isNotNull(attempts.percentage)),
    )
    .groupBy(roles.id, roles.name)
    .orderBy(roles.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
    needsTraining: r.attemptCount > 0 && round(r.avgScore) < TRAINING_THRESHOLD,
  }));
}

export async function getEmployeeSummary(): Promise<
  (SummaryRow & { sectorName: string; roleName: string })[]
> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      sectorName: sectors.name,
      roleName: roles.name,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .leftJoin(
      attempts,
      and(eq(attempts.employeeId, employees.id), isNotNull(attempts.percentage)),
    )
    .groupBy(employees.id, employees.name, sectors.name, roles.name)
    .orderBy(employees.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sectorName: r.sectorName,
    roleName: r.roleName,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
    needsTraining: r.attemptCount > 0 && round(r.avgScore) < TRAINING_THRESHOLD,
  }));
}

export async function getTopicSummary(): Promise<TopicRow[]> {
  const rows = await db
    .select({
      topic: questions.topic,
      totalAnswers: count(answers.id),
      correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .groupBy(questions.topic)
    .orderBy(questions.topic);

  return rows
    .filter((r) => r.topic)
    .map((r) => {
      const accuracy = r.totalAnswers > 0 ? Math.round((r.correctAnswers / r.totalAnswers) * 100) : 0;
      return {
        topic: r.topic as string,
        accuracy,
        totalAnswers: Number(r.totalAnswers),
        needsTraining: accuracy < TRAINING_THRESHOLD,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

export async function getTopicBySector(): Promise<TopicByGroupRow[]> {
  const rows = await db
    .select({
      groupId: sectors.id,
      groupName: sectors.name,
      topic: questions.topic,
      totalAnswers: count(answers.id),
      correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .groupBy(sectors.id, sectors.name, questions.topic)
    .orderBy(sectors.name, questions.topic);

  return rows
    .filter((r) => r.topic)
    .map((r) => {
      const accuracy = r.totalAnswers > 0 ? Math.round((r.correctAnswers / r.totalAnswers) * 100) : 0;
      return {
        groupId: r.groupId,
        groupName: r.groupName,
        topic: r.topic as string,
        accuracy,
        totalAnswers: Number(r.totalAnswers),
        needsTraining: accuracy < TRAINING_THRESHOLD,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

export async function getTopicByRole(): Promise<TopicByGroupRow[]> {
  const rows = await db
    .select({
      groupId: roles.id,
      groupName: roles.name,
      topic: questions.topic,
      totalAnswers: count(answers.id),
      correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .groupBy(roles.id, roles.name, questions.topic)
    .orderBy(roles.name, questions.topic);

  return rows
    .filter((r) => r.topic)
    .map((r) => {
      const accuracy = r.totalAnswers > 0 ? Math.round((r.correctAnswers / r.totalAnswers) * 100) : 0;
      return {
        groupId: r.groupId,
        groupName: r.groupName,
        topic: r.topic as string,
        accuracy,
        totalAnswers: Number(r.totalAnswers),
        needsTraining: accuracy < TRAINING_THRESHOLD,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

export async function getAttemptsByExam(examId: number) {
  return db
    .select({
      id: attempts.id,
      finishedAt: attempts.finishedAt,
      percentage: attempts.percentage,
      score: attempts.score,
      totalQuestions: attempts.totalQuestions,
      employeeName: employees.name,
      sectorName: sectors.name,
      roleName: roles.name,
    })
    .from(attempts)
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(eq(attempts.examId, examId))
    .orderBy(sql`${attempts.finishedAt} desc nulls last`);
}

export async function getRecentAttempts(limit = 30) {
  return db
    .select({
      id: attempts.id,
      finishedAt: attempts.finishedAt,
      percentage: attempts.percentage,
      score: attempts.score,
      totalQuestions: attempts.totalQuestions,
      employeeName: employees.name,
      sectorName: sectors.name,
      roleName: roles.name,
      examTitle: exams.title,
    })
    .from(attempts)
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .where(isNotNull(attempts.finishedAt))
    .orderBy(sql`${attempts.finishedAt} desc`)
    .limit(limit);
}
