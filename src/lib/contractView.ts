import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { attempts, documents, employees, exams, roles, sectors } from "@/db/schema";
import { employeeTier, type EmployeeTier } from "@/lib/reports";
import { effectiveTenureCode, tenureLabel, TENURE_OPTIONS } from "@/lib/tenure";

// Visão por Contrato do Painel geral: Contrato → Funções → Colaboradores,
// com o nível (Ouro/Prata/Bronze pela nota média) e o % de realização.
//
// "Módulo" = cada IT/APR/MANUAL que tem prova ATIVA para aquela Função no
// Contrato (várias versões/provas do mesmo documento contam como um módulo
// só). Provas fixas sem documento (ex.: Regras de Ouro) viram um módulo
// próprio pelo id da prova. O colaborador "fez" o módulo quando tem pelo
// menos uma tentativa finalizada em qualquer prova daquele documento.

export type ModuleRef = { key: string; label: string; type: string };
export type ModuleProgress = ModuleRef & { required: number; done: number; pct: number };

export type EmployeeNode = {
  id: number;
  name: string;
  matricula: string | null;
  tenure: string;
  avgScore: number;
  attemptCount: number;
  tier: EmployeeTier | null;
  modulesRequired: number;
  modulesDone: number;
  pct: number; // % de realização dos módulos da Função
};

export type RoleNode = {
  id: number;
  name: string;
  avgScore: number;
  attemptCount: number;
  tier: EmployeeTier | null;
  employeesTotal: number;
  employeesEvaluated: number;
  pct: number; // módulos feitos / (colaboradores × módulos da Função)
  modules: ModuleProgress[];
  employees: EmployeeNode[];
};

export type TenureNode = { code: string; label: string; avgScore: number; attemptCount: number; employees: number; tier: EmployeeTier | null };

export type ContractNode = {
  id: number;
  name: string;
  avgScore: number;
  attemptCount: number;
  tier: EmployeeTier | null;
  employeesTotal: number;
  employeesEvaluated: number;
  pct: number;
  modules: ModuleProgress[];
  modulesComplete: number; // módulos que todos os colaboradores obrigados já fizeram
  tenure: TenureNode[];
  roles: RoleNode[];
};

const cleanName = (s: string) => s.replace(/\.pdf$/i, "").trim();
export function moduleKey(exam: { id: number; documentId: number | null }) {
  return exam.documentId ? `d${exam.documentId}` : `e${exam.id}`;
}
const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export async function getContractView(sectorIds?: number[]): Promise<ContractNode[]> {
  const scoped = sectorIds && sectorIds.length > 0;
  const [sectorRows, empRows, examRows, attRows] = await Promise.all([
    db.select({ id: sectors.id, name: sectors.name }).from(sectors).where(scoped ? inArray(sectors.id, sectorIds) : undefined).orderBy(sectors.name),
    db
      .select({
        id: employees.id, name: employees.name, matricula: employees.matricula, sectorId: employees.sectorId,
        roleId: employees.roleId, roleName: roles.name, hireDate: employees.hireDate, tempoDeEmpresa: employees.tempoDeEmpresa,
      })
      .from(employees)
      .innerJoin(roles, eq(employees.roleId, roles.id))
      .where(and(eq(employees.active, true), scoped ? inArray(employees.sectorId, sectorIds) : undefined))
      .orderBy(employees.name),
    db
      .select({
        id: exams.id, sectorId: exams.sectorId, roleId: exams.roleId, documentId: exams.documentId, active: exams.active,
        title: exams.title, documentType: exams.documentType, fileName: documents.fileName,
      })
      .from(exams)
      .leftJoin(documents, eq(exams.documentId, documents.id))
      .where(scoped ? inArray(exams.sectorId, sectorIds) : undefined),
    db
      .select({ employeeId: attempts.employeeId, examId: attempts.examId, percentage: attempts.percentage })
      .from(attempts)
      .innerJoin(employees, eq(attempts.employeeId, employees.id))
      .where(and(isNotNull(attempts.finishedAt), isNotNull(attempts.percentage), scoped ? inArray(employees.sectorId, sectorIds) : undefined)),
  ]);

  const examById = new Map(examRows.map((e) => [e.id, e]));
  // módulos obrigatórios por Contrato+Função (provas ativas com Função)
  const required = new Map<string, Map<string, ModuleRef>>();
  for (const e of examRows) {
    if (!e.active || e.roleId == null) continue;
    const k = `${e.sectorId}|${e.roleId}`;
    if (!required.has(k)) required.set(k, new Map());
    const mk = moduleKey(e);
    if (!required.get(k)!.has(mk)) required.get(k)!.set(mk, { key: mk, label: cleanName(e.fileName ?? e.title), type: e.documentType });
  }
  // o que cada colaborador fez
  const scoresByEmp = new Map<number, number[]>();
  const doneByEmp = new Map<number, Set<string>>();
  for (const a of attRows) {
    if (!scoresByEmp.has(a.employeeId)) scoresByEmp.set(a.employeeId, []);
    scoresByEmp.get(a.employeeId)!.push(a.percentage ?? 0);
    const ex = examById.get(a.examId);
    if (ex) {
      if (!doneByEmp.has(a.employeeId)) doneByEmp.set(a.employeeId, new Set());
      doneByEmp.get(a.employeeId)!.add(moduleKey(ex));
    }
  }

  return sectorRows.map((s) => {
    const emps = empRows.filter((e) => e.sectorId === s.id);
    const roleIds = [...new Set(emps.map((e) => e.roleId))];
    const contractModules = new Map<string, ModuleProgress>();
    const tenureAgg = new Map<string, { scores: number[]; employees: number }>();
    const contractScores: number[] = [];
    let contractReq = 0, contractDone = 0;

    const roleNodes: RoleNode[] = roleIds.map((roleId) => {
      const roleEmps = emps.filter((e) => e.roleId === roleId);
      const req = [...(required.get(`${s.id}|${roleId}`)?.values() ?? [])];
      const modules: ModuleProgress[] = req.map((m) => ({ ...m, required: roleEmps.length, done: 0, pct: 0 }));
      const roleScores: number[] = [];
      let roleDone = 0;
      const employeeNodes: EmployeeNode[] = roleEmps.map((e) => {
        const scores = scoresByEmp.get(e.id) ?? [];
        const done = doneByEmp.get(e.id) ?? new Set<string>();
        const doneReq = req.filter((m) => done.has(m.key));
        doneReq.forEach((m) => { modules.find((x) => x.key === m.key)!.done += 1; });
        roleDone += doneReq.length;
        roleScores.push(...scores);
        const code = effectiveTenureCode(e) ?? "none";
        if (!tenureAgg.has(code)) tenureAgg.set(code, { scores: [], employees: 0 });
        tenureAgg.get(code)!.scores.push(...scores);
        tenureAgg.get(code)!.employees += 1;
        const avg = avgOf(scores);
        return {
          id: e.id, name: e.name, matricula: e.matricula, tenure: tenureLabel(effectiveTenureCode(e)),
          avgScore: avg, attemptCount: scores.length, tier: scores.length ? employeeTier(avg) : null,
          modulesRequired: req.length, modulesDone: doneReq.length, pct: pctOf(doneReq.length, req.length),
        };
      });
      modules.forEach((m) => {
        m.pct = pctOf(m.done, m.required);
        const c = contractModules.get(m.key) ?? { ...m, required: 0, done: 0, pct: 0 };
        c.required += m.required; c.done += m.done;
        contractModules.set(m.key, c);
      });
      contractScores.push(...roleScores);
      contractReq += roleEmps.length * req.length;
      contractDone += roleDone;
      const avg = avgOf(roleScores);
      return {
        id: roleId, name: roleEmps[0].roleName, avgScore: avg, attemptCount: roleScores.length,
        tier: roleScores.length ? employeeTier(avg) : null,
        employeesTotal: roleEmps.length, employeesEvaluated: employeeNodes.filter((x) => x.attemptCount > 0).length,
        pct: pctOf(roleDone, roleEmps.length * req.length),
        modules: modules.sort((a, b) => a.pct - b.pct || a.label.localeCompare(b.label)),
        employees: employeeNodes.sort((a, b) => b.pct - a.pct || b.avgScore - a.avgScore || a.name.localeCompare(b.name)),
      };
    });

    const modules = [...contractModules.values()].map((m) => ({ ...m, pct: pctOf(m.done, m.required) }))
      .sort((a, b) => a.pct - b.pct || a.label.localeCompare(b.label));
    const avg = avgOf(contractScores);
    const tenureOrder = [...TENURE_OPTIONS.map((o) => o.value as string), "none"];
    return {
      id: s.id, name: s.name, avgScore: avg, attemptCount: contractScores.length,
      tier: contractScores.length ? employeeTier(avg) : null,
      employeesTotal: emps.length,
      employeesEvaluated: emps.filter((e) => (scoresByEmp.get(e.id) ?? []).length > 0).length,
      pct: pctOf(contractDone, contractReq),
      modules,
      modulesComplete: modules.filter((m) => m.required > 0 && m.done >= m.required).length,
      tenure: tenureOrder.filter((c) => tenureAgg.has(c)).map((c) => {
        const t = tenureAgg.get(c)!;
        const a = avgOf(t.scores);
        return { code: c, label: c === "none" ? "Não informado" : tenureLabel(c), avgScore: a, attemptCount: t.scores.length, employees: t.employees, tier: t.scores.length ? employeeTier(a) : null };
      }),
      roles: roleNodes.sort((a, b) => a.name.localeCompare(b.name)),
    };
  });
}

// Detalhe de um colaborador para o painel: módulos da Função (feitos e
// pendentes, com a melhor nota) e todas as provas finalizadas.
export async function getEmployeePanel(employeeId: number) {
  const [emp] = await db
    .select({
      id: employees.id, name: employees.name, matricula: employees.matricula, sectorId: employees.sectorId, sectorName: sectors.name,
      roleId: employees.roleId, roleName: roles.name, hireDate: employees.hireDate, tempoDeEmpresa: employees.tempoDeEmpresa,
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(eq(employees.id, employeeId))
    .limit(1);
  if (!emp) return null;

  const [examRows, attRows] = await Promise.all([
    db
      .select({ id: exams.id, roleId: exams.roleId, documentId: exams.documentId, active: exams.active, title: exams.title, documentType: exams.documentType, fileName: documents.fileName })
      .from(exams)
      .leftJoin(documents, eq(exams.documentId, documents.id))
      .where(eq(exams.sectorId, emp.sectorId)),
    db
      .select({ id: attempts.id, examId: attempts.examId, percentage: attempts.percentage, finishedAt: attempts.finishedAt, mode: attempts.mode, examTitle: exams.title, documentType: exams.documentType, documentId: exams.documentId, fileName: documents.fileName })
      .from(attempts)
      .innerJoin(exams, eq(attempts.examId, exams.id))
      .leftJoin(documents, eq(exams.documentId, documents.id))
      .where(and(eq(attempts.employeeId, employeeId), isNotNull(attempts.finishedAt)))
      .orderBy(attempts.finishedAt),
  ]);

  const modules = new Map<string, ModuleRef & { attempts: number; best: number | null; last: Date | null }>();
  for (const e of examRows) {
    if (!e.active || e.roleId !== emp.roleId) continue;
    const k = moduleKey(e);
    if (!modules.has(k)) modules.set(k, { key: k, label: cleanName(e.fileName ?? e.title), type: e.documentType, attempts: 0, best: null, last: null });
  }
  for (const a of attRows) {
    const m = modules.get(moduleKey({ id: a.examId, documentId: a.documentId }));
    if (!m || a.percentage == null) continue;
    m.attempts += 1;
    m.best = Math.max(m.best ?? 0, a.percentage);
    if (!m.last || (a.finishedAt && a.finishedAt > m.last)) m.last = a.finishedAt;
  }
  const scores = attRows.filter((a) => a.percentage != null).map((a) => a.percentage as number);
  const avg = avgOf(scores);
  const list = [...modules.values()].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  const done = list.filter((m) => m.attempts > 0).length;

  let tempoDeCasa: string | null = null;
  if (emp.hireDate) {
    const d = new Date(emp.hireDate);
    const meses = Math.max(0, (new Date().getFullYear() - d.getFullYear()) * 12 + (new Date().getMonth() - d.getMonth()));
    const anos = Math.floor(meses / 12), resto = meses % 12;
    tempoDeCasa = [anos ? `${anos} ano${anos > 1 ? "s" : ""}` : "", resto ? `${resto} ${resto > 1 ? "meses" : "mês"}` : ""].filter(Boolean).join(" e ") || "menos de 1 mês";
  }

  return {
    employee: {
      id: emp.id, name: emp.name, matricula: emp.matricula, sectorId: emp.sectorId, sectorName: emp.sectorName, roleName: emp.roleName,
      hireDate: emp.hireDate, tempoDeCasa, tenure: tenureLabel(effectiveTenureCode(emp)),
    },
    avgScore: avg,
    attemptCount: scores.length,
    tier: scores.length ? employeeTier(avg) : null,
    modulesRequired: list.length,
    modulesDone: done,
    pct: pctOf(done, list.length),
    modules: list.map((m) => ({ ...m, done: m.attempts > 0, last: m.last ? m.last.toISOString() : null })),
    attempts: attRows
      .slice()
      .reverse()
      .map((a) => ({
        id: a.id, examTitle: a.examTitle, module: cleanName(a.fileName ?? a.examTitle), documentType: a.documentType,
        finishedAt: a.finishedAt ? a.finishedAt.toISOString() : null, percentage: a.percentage, mode: a.mode,
      })),
  };
}
