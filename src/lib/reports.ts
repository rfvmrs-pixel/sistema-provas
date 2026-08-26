import { and, avg, count, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { attempts, employees, sectors, roles, answers, questions, exams } from "@/db/schema";
import { TENURE_OPTIONS, tenureLabel } from "@/lib/tenure";

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

// Todas as funções abaixo aceitam uma lista `sectorIds` opcional: quando
// informada (gestor de um contrato = 1 item; Diretoria/Superintendência
// escopada a um grupo = vários), os números só consideram esses contratos.
// Quando omitida (admin geral, ou Diretoria/Superintendência sem grupo
// definido), consideram a empresa toda.

function round(n: number | string | null): number {
  if (n === null) return 0;
  return Math.round(Number(n));
}

export async function getSectorSummary(sectorIds?: number[]): Promise<SummaryRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(sectors.id, sectorIds) : undefined;
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
    .where(scope)
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

export async function getRoleSummary(sectorIds?: number[]): Promise<SummaryRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      id: roles.id,
      name: roles.name,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(roles)
    .leftJoin(employees, and(eq(employees.roleId, roles.id), scope))
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

export async function getEmployeeSummary(
  sectorIds?: number[],
): Promise<(SummaryRow & { sectorName: string; roleName: string })[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
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
    .where(scope)
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

export async function getTopicSummary(sectorIds?: number[]): Promise<TopicRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      topic: questions.topic,
      totalAnswers: count(answers.id),
      correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(scope)
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

export async function getTopicBySector(sectorIds?: number[]): Promise<TopicByGroupRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(sectors.id, sectorIds) : undefined;
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
    .where(scope)
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

export async function getTopicByRole(sectorIds?: number[]): Promise<TopicByGroupRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
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
    .where(scope)
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

export type DocumentTypeRow = {
  documentType: string;
  avgScore: number;
  attemptCount: number;
};

// Compara o desempenho médio em provas de IT (Instrução de Trabalho) x APR
// (Análise Preliminar de Risco) — ajuda a apontar se o problema está mais no
// "como fazer" (IT) ou no "quais riscos existem" (APR).
export async function getDocumentTypeSummary(sectorIds?: number[]): Promise<DocumentTypeRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      documentType: exams.documentType,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(attempts)
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(and(isNotNull(attempts.percentage), scope))
    .groupBy(exams.documentType)
    .orderBy(exams.documentType);

  return rows.map((r) => ({
    documentType: r.documentType,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
  }));
}

// Tempo médio (em minutos) que os colaboradores levam pra terminar uma
// prova — calculado a partir de startedAt/finishedAt, sem precisar de coluna
// nova no banco.
export async function getAvgDurationMinutes(sectorIds?: number[]): Promise<number> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const [row] = await db
    .select({
      avgSeconds: sql<number | null>`avg(extract(epoch from (${attempts.finishedAt} - ${attempts.startedAt})))`,
    })
    .from(attempts)
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(and(isNotNull(attempts.finishedAt), scope));

  if (!row || row.avgSeconds === null) return 0;
  return Math.round(Number(row.avgSeconds) / 60);
}

export type TenureSummaryRow = {
  code: string | null;
  label: string;
  avgScore: number;
  attemptCount: number;
  needsTraining: boolean;
};

// Desempenho agrupado por tempo de empresa (faixas fixas cadastradas no
// autocadastro) — ajuda a ver se colaboradores mais novos de casa erram mais
// que os veteranos.
export async function getTenureSummary(sectorIds?: number[]): Promise<TenureSummaryRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      code: employees.tempoDeEmpresa,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(employees)
    .leftJoin(
      attempts,
      and(eq(attempts.employeeId, employees.id), isNotNull(attempts.percentage)),
    )
    .where(scope)
    .groupBy(employees.tempoDeEmpresa);

  const order: (string | null)[] = [...TENURE_OPTIONS.map((o) => o.value), null];
  return rows
    .map((r) => ({
      code: r.code,
      label: tenureLabel(r.code),
      avgScore: round(r.avgScore),
      attemptCount: Number(r.attemptCount),
      needsTraining: r.attemptCount > 0 && round(r.avgScore) < TRAINING_THRESHOLD,
    }))
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
}

export type TrendPoint = {
  date: string; // YYYY-MM-DD
  avgScore: number;
  attemptCount: number;
};

// Média de nota por dia nos últimos `days` dias — pra visualizar se o
// desempenho geral está melhorando ou piorando ao longo do tempo.
export async function getScoreTrend(days = 30, sectorIds?: number[]): Promise<TrendPoint[]> {
  const sinceExpr = sql`now() - (${days}::text || ' days')::interval`;
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const dateExpr = sql<string>`to_char(${attempts.finishedAt}, 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      date: dateExpr,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(attempts)
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(and(isNotNull(attempts.percentage), gte(attempts.finishedAt, sinceExpr), scope))
    .groupBy(dateExpr)
    .orderBy(dateExpr);

  return rows.map((r) => ({
    date: r.date,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
  }));
}

export async function getAttemptsByExam(examId: number) {
  return db
    .select({
      id: attempts.id,
      finishedAt: attempts.finishedAt,
      percentage: attempts.percentage,
      score: attempts.score,
      totalQuestions: attempts.totalQuestions,
      mode: attempts.mode,
      sessionLabel: attempts.sessionLabel,
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

export async function getRecentAttempts(limit = 30, sectorIds?: number[]) {
  const conditions: SQL[] = [isNotNull(attempts.finishedAt)];
  if (sectorIds && sectorIds.length > 0) conditions.push(inArray(employees.sectorId, sectorIds));

  return db
    .select({
      id: attempts.id,
      finishedAt: attempts.finishedAt,
      percentage: attempts.percentage,
      score: attempts.score,
      totalQuestions: attempts.totalQuestions,
      mode: attempts.mode,
      sessionLabel: attempts.sessionLabel,
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
    .where(and(...conditions))
    .orderBy(sql`${attempts.finishedAt} desc`)
    .limit(limit);
}
