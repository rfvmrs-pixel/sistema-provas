import { and, avg, count, eq, gte, ilike, inArray, isNotNull, lt, sql, type SQL } from "drizzle-orm";
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
): Promise<(SummaryRow & { sectorName: string; roleId: number; roleName: string })[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      sectorName: sectors.name,
      roleId: roles.id,
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
    .groupBy(employees.id, employees.name, sectors.name, roles.id, roles.name)
    .orderBy(employees.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sectorName: r.sectorName,
    roleId: r.roleId,
    roleName: r.roleName,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
    needsTraining: r.attemptCount > 0 && round(r.avgScore) < TRAINING_THRESHOLD,
  }));
}

// Classificação usada no prontuário individual do funcionário — Bronze
// (abaixo de 70%), Prata (70% a 95%) e Ouro (acima de 95%). Só faz sentido
// quando já existe pelo menos uma tentativa avaliada; ver getEmployeeReport.
export type EmployeeTier = "bronze" | "prata" | "ouro";

export function employeeTier(avgScore: number): EmployeeTier {
  if (avgScore > 95) return "ouro";
  if (avgScore >= 70) return "prata";
  return "bronze";
}

// Tópicos/critérios de um único funcionário — mesmo padrão de
// getTopicByRole/getTopicBySector, mas agrupado por funcionário. Usado só no
// prontuário individual (getEmployeeReport), não precisa de sectorIds porque
// já é filtrado por um employeeId específico (a visibilidade do Contrato é
// checada antes, com canAccessSector, na rota que chama isso).
export async function getEmployeeTopicSummary(employeeId: number): Promise<TopicRow[]> {
  const rows = await db
    .select({
      topic: questions.topic,
      totalAnswers: count(answers.id),
      correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
    })
    .from(answers)
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .where(eq(attempts.employeeId, employeeId))
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

// Histórico de tentativas de um funcionário — mostrado no prontuário
// individual (ver getEmployeeReport), mais recentes primeiro.
export async function getEmployeeAttemptHistory(employeeId: number, limit = 15) {
  return db
    .select({
      id: attempts.id,
      examTitle: exams.title,
      finishedAt: attempts.finishedAt,
      percentage: attempts.percentage,
      mode: attempts.mode,
      sessionLabel: attempts.sessionLabel,
    })
    .from(attempts)
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .where(and(eq(attempts.employeeId, employeeId), isNotNull(attempts.finishedAt)))
    .orderBy(sql`${attempts.finishedAt} desc`)
    .limit(limit);
}

// Prontuário individual: quantas provas feitas, % da nota média, onde o
// funcionário está melhor/pior (por tema), o histórico de tentativas e a
// classificação Bronze/Prata/Ouro. `avgScore`/`attemptCount` somam Prova +
// Simulado (todas as tentativas com nota do funcionário), igual ao resto do
// Painel.
export async function getEmployeeReport(employeeId: number) {
  const [summaryRow] = await db
    .select({
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(attempts)
    .where(and(eq(attempts.employeeId, employeeId), isNotNull(attempts.percentage)));

  const avgScore = round(summaryRow?.avgScore ?? null);
  const attemptCount = Number(summaryRow?.attemptCount ?? 0);
  const [topics, history] = await Promise.all([
    getEmployeeTopicSummary(employeeId),
    getEmployeeAttemptHistory(employeeId),
  ]);

  return {
    avgScore,
    attemptCount,
    tier: attemptCount > 0 ? employeeTier(avgScore) : null,
    bestTopics: [...topics].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5),
    worstTopics: topics.slice(0, 5),
    history,
  };
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

// Desempenho agrupado por tempo de empresa. Quando o funcionário tem data de
// contratação cadastrada (hireDate), a faixa é calculada na hora a partir
// dela — mesmos limites de lib/tenure.ts#tenureCodeFromHireDate — em vez de
// depender de uma faixa fixa escolhida manualmente, então "atualiza sozinha"
// conforme o tempo passa. Sem hireDate, cai no valor manual antigo
// (autocadastro/importação em lote).
const TENURE_CODE_EXPR = sql<string>`
  case
    when ${employees.hireDate} is null then ${employees.tempoDeEmpresa}
    when (current_date - ${employees.hireDate}) < 182 then '0-6m'
    when (current_date - ${employees.hireDate}) < 365 then '6m-1a'
    when (current_date - ${employees.hireDate}) < 1095 then '1-3a'
    when (current_date - ${employees.hireDate}) < 1825 then '3-5a'
    else '5a+'
  end
`;

export async function getTenureSummary(sectorIds?: number[]): Promise<TenureSummaryRow[]> {
  const scope = sectorIds && sectorIds.length > 0 ? inArray(employees.sectorId, sectorIds) : undefined;
  const rows = await db
    .select({
      code: TENURE_CODE_EXPR,
      avgScore: avg(attempts.percentage),
      attemptCount: count(attempts.id),
    })
    .from(employees)
    .leftJoin(
      attempts,
      and(eq(attempts.employeeId, employees.id), isNotNull(attempts.percentage)),
    )
    .where(scope)
    .groupBy(TENURE_CODE_EXPR);

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

export type AttemptFilters = {
  // "YYYY-MM" — restringe a um mês inteiro.
  month?: string;
  // "YYYY-MM-DD" — restringe a um único dia (tem prioridade sobre `month` se
  // os dois vierem preenchidos, já que é mais específico).
  day?: string;
  // Busca por nome do colaborador (parcial, sem diferenciar maiúsc./minúsc.).
  name?: string;
  roleId?: number;
};

// "Últimas tentativas" do Painel com filtros combináveis (mês, dia, nome do
// colaborador, função) — cada filtro aplicado restringe mais a lista, igual a
// um AND de todos os campos preenchidos. Usado pela tabela filtrável do
// Painel (ver RecentAttemptsTable).
export async function getFilteredAttempts(
  sectorIds?: number[],
  filters: AttemptFilters = {},
  limit = 50,
) {
  const conditions: SQL[] = [isNotNull(attempts.finishedAt)];
  if (sectorIds && sectorIds.length > 0) conditions.push(inArray(employees.sectorId, sectorIds));
  if (filters.roleId) conditions.push(eq(employees.roleId, filters.roleId));
  if (filters.name && filters.name.trim()) {
    conditions.push(ilike(employees.name, `%${filters.name.trim()}%`));
  }
  if (filters.day) {
    const start = new Date(`${filters.day}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      conditions.push(gte(attempts.finishedAt, start));
      conditions.push(lt(attempts.finishedAt, end));
    }
  } else if (filters.month) {
    const start = new Date(`${filters.month}-01T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime());
      end.setUTCMonth(end.getUTCMonth() + 1);
      conditions.push(gte(attempts.finishedAt, start));
      conditions.push(lt(attempts.finishedAt, end));
    }
  }

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

export type PresentationFilters = {
  // "YYYY-MM" — restringe a um mês inteiro.
  month?: string;
  roleIds?: number[];
  // Subconjunto de "IT" | "APR" | "MANUAL".
  documentTypes?: string[];
};

export type PresentationGroupRow = { id: number; name: string; avgScore: number; attemptCount: number };
export type PresentationDocTypeRow = { documentType: string; avgScore: number; attemptCount: number };
export type PresentationTopicRow = { topic: string; accuracy: number; totalAnswers: number };

export type PresentationData = {
  totalAttempts: number;
  avgScore: number;
  approvalRate: number; // % de tentativas com nota >= passingScore da prova
  employeesEvaluated: number;
  tierCounts: { bronze: number; prata: number; ouro: number };
  bySector: PresentationGroupRow[];
  byRole: PresentationGroupRow[];
  byDocumentType: PresentationDocTypeRow[];
  bestTopics: PresentationTopicRow[];
  worstTopics: PresentationTopicRow[];
};

// Condições comuns a todas as consultas da Apresentação — sempre join em
// employees (Contrato/Função) e exams (tipo de documento), pra poder filtrar
// por qualquer combinação de mês/função/tipo, além do Contrato de sempre.
function presentationConditions(sectorIds: number[] | undefined, filters: PresentationFilters): SQL[] {
  const conditions: SQL[] = [isNotNull(attempts.percentage)];
  if (sectorIds && sectorIds.length > 0) conditions.push(inArray(employees.sectorId, sectorIds));
  if (filters.roleIds && filters.roleIds.length > 0) conditions.push(inArray(employees.roleId, filters.roleIds));
  if (filters.documentTypes && filters.documentTypes.length > 0) {
    conditions.push(inArray(exams.documentType, filters.documentTypes));
  }
  if (filters.month) {
    const start = new Date(`${filters.month}-01T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime());
      end.setUTCMonth(end.getUTCMonth() + 1);
      conditions.push(gte(attempts.finishedAt, start));
      conditions.push(lt(attempts.finishedAt, end));
    }
  }
  return conditions;
}

// Dados agregados pra aba "Apresentação": números gerais, distribuição
// Bronze/Prata/Ouro, comparativos por Contrato/Função/tipo de documento e os
// temas com melhor/pior desempenho — tudo já filtrado por
// Contrato(s)/mês/função(ões)/tipo(s) de documento escolhidos no formulário.
export async function getPresentationSummary(
  sectorIds: number[] | undefined,
  filters: PresentationFilters = {},
): Promise<PresentationData> {
  const conditions = presentationConditions(sectorIds, filters);
  const where = and(...conditions);

  const [totalsRow] = await db
    .select({
      totalAttempts: count(attempts.id),
      avgScore: avg(attempts.percentage),
      approvedCount:
        sql<number>`sum(case when ${attempts.percentage} >= ${exams.passingScore} then 1 else 0 end)`.mapWith(
          Number,
        ),
      employeesEvaluated: sql<number>`count(distinct ${attempts.employeeId})`.mapWith(Number),
    })
    .from(attempts)
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(where);

  const totalAttempts = Number(totalsRow?.totalAttempts ?? 0);
  const avgScore = round(totalsRow?.avgScore ?? null);
  const approvedCount = Number(totalsRow?.approvedCount ?? 0);
  const approvalRate = totalAttempts > 0 ? Math.round((approvedCount / totalAttempts) * 100) : 0;
  const employeesEvaluated = Number(totalsRow?.employeesEvaluated ?? 0);

  const [employeeAvgRows, sectorRows, roleRows, docTypeRows, topicRows] = await Promise.all([
    db
      .select({ employeeId: employees.id, avgScore: avg(attempts.percentage) })
      .from(attempts)
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .where(where)
      .groupBy(employees.id),
    db
      .select({
        id: sectors.id,
        name: sectors.name,
        avgScore: avg(attempts.percentage),
        attemptCount: count(attempts.id),
      })
      .from(attempts)
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .innerJoin(sectors, eq(employees.sectorId, sectors.id))
      .where(where)
      .groupBy(sectors.id, sectors.name)
      .orderBy(sectors.name),
    db
      .select({
        id: roles.id,
        name: roles.name,
        avgScore: avg(attempts.percentage),
        attemptCount: count(attempts.id),
      })
      .from(attempts)
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .where(where)
      .groupBy(roles.id, roles.name)
      .orderBy(roles.name),
    db
      .select({
        documentType: exams.documentType,
        avgScore: avg(attempts.percentage),
        attemptCount: count(attempts.id),
      })
      .from(attempts)
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .where(where)
      .groupBy(exams.documentType)
      .orderBy(exams.documentType),
    db
      .select({
        topic: questions.topic,
        totalAnswers: count(answers.id),
        correctAnswers: sql<number>`sum(case when ${answers.correct} then 1 else 0 end)`.mapWith(Number),
      })
      .from(answers)
      .innerJoin(questions, eq(answers.questionId, questions.id))
      .innerJoin(attempts, eq(answers.attemptId, attempts.id))
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .where(where)
      .groupBy(questions.topic),
  ]);

  const tierCounts = { bronze: 0, prata: 0, ouro: 0 };
  for (const r of employeeAvgRows) {
    tierCounts[employeeTier(round(r.avgScore))]++;
  }

  const bySector: PresentationGroupRow[] = sectorRows.map((r) => ({
    id: r.id,
    name: r.name,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
  }));

  const byRole: PresentationGroupRow[] = roleRows.map((r) => ({
    id: r.id,
    name: r.name,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
  }));

  const byDocumentType: PresentationDocTypeRow[] = docTypeRows.map((r) => ({
    documentType: r.documentType,
    avgScore: round(r.avgScore),
    attemptCount: Number(r.attemptCount),
  }));

  const topics: PresentationTopicRow[] = topicRows
    .filter((r) => r.topic)
    .map((r) => ({
      topic: r.topic as string,
      accuracy: r.totalAnswers > 0 ? Math.round((r.correctAnswers / r.totalAnswers) * 100) : 0,
      totalAnswers: Number(r.totalAnswers),
    }));
  const worstTopics = [...topics].sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
  const bestTopics = [...topics].sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);

  return {
    totalAttempts,
    avgScore,
    approvalRate,
    employeesEvaluated,
    tierCounts,
    bySector,
    byRole,
    byDocumentType,
    bestTopics,
    worstTopics,
  };
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
