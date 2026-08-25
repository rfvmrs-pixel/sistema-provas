import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { employees, sectors, roles } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createEmployeeSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const sectorId = Number(body?.sectorId);
  const password = body?.password?.toString();

  if (!name || !sectorId || !password) {
    return NextResponse.json(
      { error: "Nome, setor e senha são obrigatórios." },
      { status: 400 },
    );
  }

  const row = await db
    .select({
      id: employees.id,
      name: employees.name,
      passwordHash: employees.passwordHash,
      active: employees.active,
      sectorId: sectors.id,
      sectorName: sectors.name,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(and(ilike(employees.name, name), eq(employees.sectorId, sectorId)))
    .limit(1);

  const employee = row[0];
  if (!employee || !employee.active) {
    return NextResponse.json({ error: "Funcionário, setor ou senha inválidos." }, { status: 401 });
  }

  const ok = await verifyPassword(password, employee.passwordHash);
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
  });

  return NextResponse.json({ ok: true });
}
