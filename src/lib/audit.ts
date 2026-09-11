import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { employees, exams, questions, attempts, sectors, roles } from "@/db/schema";

// "Auditado" = o colaborador concluiu (qualquer nota, qualquer modo —
// simulado ou oficial) TODAS as provas (IT/APR) ativas da própria
// Função dentro do próprio Contrato, nos últimos AUDIT_WINDOW_DAYS dias.
// Provas sem nenhuma questão cadastrada não contam (ninguém consegue
// completar uma prova vazia).
export const AUDIT_WINDOW_DAYS = 90;

export type AuditPendingExam = {
  examId: number;
  examTitle: string;
  documentType: string;
  roleId: number | null;
  roleName: string;
  totalApplicable: number;
  completedCount: number;
  missingCount: number;
};

export type AuditSectorRow = {
  sectorId: number;
  sectorName: string;
  totalEmployees: number;
  fullyAuditedEmployees: number;
  auditedPercentage: number | null; // null = sem funcionários ativos no Contrato
  pendingExams: AuditPendingExam[];
};

export async function getAuditSummary(sectorIds?: number[]): Promise<AuditSectorRow[]> {
  const sectorScope = sectorIds && sectorIds.length > 0 ? inArray(sectors.id, sectorIds) : undefined;

  const sectorList = await db
    .select({ id: sectors.id, name: sectors.name })
    .from(sectors)
    .where(sectorScope)
    .orderBy(sectors.name);
  if (sectorList.length === 0) return [];
  const sectorIdList = sectorList.map((s) => s.id);

  const employeeList = await db
    .select({ id: employees.id, sectorId: employees.sectorId, roleId: employees.roleId })
    .from(employees)
    .where(and(eq(employees.active, true), inArray(employees.sectorId, sectorIdList)));

  // Provas ativas com pelo menos 1 questão, nos Contratos em escopo — é
  // isso que conta como "aplicável" pra Função+Contrato daquela prova.
  const examRows = await db
    .select({
      id: exams.id,
      title: exams.title,
      documentType: exams.documentType,
      sectorId: exams.sectorId,
      roleId: exams.roleId,
      roleName: roles.name,
      questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
    })
    .from(exams)
    .innerJoin(roles, eq(exams.roleId, roles.id))
    .leftJoin(questions, eq(questions.examId, exams.id))
    .where(and(eq(exams.active, true), inArray(exams.sectorId, sectorIdList)))
    .groupBy(exams.id, exams.title, exams.documentType, exams.sectorId, exams.roleId, roles.name);

  const applicableExams = examRows.filter((e) => e.questionCount > 0);

  const employeeIds = employeeList.map((e) => e.id);
  const sinceExpr = sql`now() - (${AUDIT_WINDOW_DAYS}::text || ' days')::interval`;
  const attemptRows =
    employeeIds.length > 0 && applicableExams.length > 0
      ? await db
          .select({ employeeId: attempts.employeeId, examId: attempts.examId })
          .from(attempts)
          .where(
            and(
              inArray(attempts.employeeId, employeeIds),
              inArray(
                attempts.examId,
                applicableExams.map((e) => e.id),
              ),
              gte(attempts.finishedAt, sinceExpr),
            ),
          )
      : [];

  const completedSet = new Set(attemptRows.map((a) => `${a.employeeId}:${a.examId}`));

  return sectorList.map((sector) => {
    const sectorEmployees = employeeList.filter((e) => e.sectorId === sector.id);
    const sectorExams = applicableExams.filter((e) => e.sectorId === sector.id);

    let fullyAuditedEmployees = 0;
    for (const emp of sectorEmployees) {
      const applicableForEmployee = sectorExams.filter((e) => e.roleId === emp.roleId);
      const audited = applicableForEmployee.every((e) => completedSet.has(`${emp.id}:${e.id}`));
      if (audited) fullyAuditedEmployees++;
    }

    const pendingExams: AuditPendingExam[] = sectorExams
      .map((exam) => {
        const applicableEmployees = sectorEmployees.filter((e) => e.roleId === exam.roleId);
        const totalApplicable = applicableEmployees.length;
        const completedCount = applicableEmployees.filter((e) => completedSet.has(`${e.id}:${exam.id}`)).length;
        return {
          examId: exam.id,
          examTitle: exam.title,
          documentType: exam.documentType,
          roleId: exam.roleId,
          roleName: exam.roleName,
          totalApplicable,
          completedCount,
          missingCount: totalApplicable - completedCount,
        };
      })
      .filter((row) => row.totalApplicable > 0 && row.missingCount > 0)
      .sort((a, b) => b.missingCount - a.missingCount);

    return {
      sectorId: sector.id,
      sectorName: sector.name,
      totalEmployees: sectorEmployees.length,
      fullyAuditedEmployees,
      auditedPercentage:
        sectorEmployees.length > 0 ? Math.round((fullyAuditedEmployees / sectorEmployees.length) * 100) : null,
      pendingExams,
    };
  });
}
