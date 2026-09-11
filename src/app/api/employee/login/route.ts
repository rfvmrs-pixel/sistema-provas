import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { employees, sectors, roles, exams } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createEmployeeSession } from "@/lib/session";

// Um único formulário de login serve os três modos:
// - password: login pessoal do colaborador -> modo "simulado" (livre, qualquer
//   prova ativa do seu Setor+Função).
// - code: código de 6 dígitos de uso único gerado pelo gestor para a "prova do
//   dia" -> modo "oficial", travado só naquela prova específica.
// - matricula: acesso rápido só com nome + matrícula (sem senha) -> mesmo modo
//   "simulado" de cima. Pensado pra quem já tem matrícula cadastrada (por
//   autocadastro em link de prova, importação em massa ou o gestor
//   preenchendo manualmente) e não tem/lembra a senha — usa só a matrícula
//   como identificador, igual ao autocadastro por link.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const sectorId = Number(body?.sectorId);
  const password = body?.password?.toString();
  const code = body?.code?.toString().trim();
  const matricula = body?.matricula?.toString().trim();

  if (!sectorId || (!password && !code && !matricula) || (!name && !matricula)) {
    return NextResponse.json(
      { error: "Informe setor e senha, código da prova do dia, ou nome + matrícula." },
      { status: 400 },
    );
  }

  const row = await db
    .select({
      id: employees.id,
      name: employees.name,
      passwordHash: employees.passwordHash,
      active: employees.active,
      matricula: employees.matricula,
      sectorId: sectors.id,
      sectorName: sectors.name,
      roleId: roles.id,
      roleName: roles.name,
      tempCodeHash: employees.tempCodeHash,
      tempCodeExamId: employees.tempCodeExamId,
      tempCodeSessionLabel: employees.tempCodeSessionLabel,
      tempCodeExpiresAt: employees.tempCodeExpiresAt,
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(
      matricula
        ? and(eq(employees.matricula, matricula), eq(employees.sectorId, sectorId))
        : and(ilike(employees.name, name!), eq(employees.sectorId, sectorId)),
    )
    .limit(1);

  const employee = row[0];
  if (!employee || !employee.active) {
    return NextResponse.json(
      {
        error: matricula
          ? "Matrícula não encontrada nesse Contrato. Confira o número ou peça pro seu gestor cadastrar."
          : "Funcionário, setor ou senha inválidos.",
      },
      { status: 401 },
    );
  }

  if (matricula) {
    await createEmployeeSession({
      employeeId: employee.id,
      name: employee.name,
      sectorId: employee.sectorId,
      sectorName: employee.sectorName,
      roleId: employee.roleId,
      roleName: employee.roleName,
      mode: "simulado",
    });
    return NextResponse.json({ ok: true, mode: "simulado" });
  }

  if (code) {
    if (
      !employee.tempCodeHash ||
      !employee.tempCodeExamId ||
      !employee.tempCodeExpiresAt ||
      employee.tempCodeExpiresAt.getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "Código inválido ou expirado. Peça um novo código ao seu gestor." },
        { status: 401 },
      );
    }
    const ok = await verifyPassword(code, employee.tempCodeHash);
    if (!ok) {
      return NextResponse.json({ error: "Código inválido." }, { status: 401 });
    }
    const exam = await db.query.exams.findFirst({ where: eq(exams.id, employee.tempCodeExamId) });
    if (!exam || !exam.active) {
      return NextResponse.json({ error: "Essa prova não está mais disponível." }, { status: 400 });
    }

    await createEmployeeSession({
      employeeId: employee.id,
      name: employee.name,
      sectorId: employee.sectorId,
      sectorName: employee.sectorName,
      roleId: employee.roleId,
      roleName: employee.roleName,
      mode: "oficial",
      examId: exam.id,
      sessionLabel: employee.tempCodeSessionLabel,
    });
    return NextResponse.json({ ok: true, mode: "oficial" });
  }

  const ok = await verifyPassword(password!, employee.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Funcionário, setor ou senha inválidos." }, { status: 401 });
  }

  await createEmployeeSession({
    employeeId: employee.id,
    name: employee.name,
    sectorId: employee.sectorId,
    sectorName: employee.sectorName,
    roleId: employee.roleId,
    roleName: employee.roleName,
    mode: "simulado",
  });

  return NextResponse.json({ ok: true, mode: "simulado" });
}
