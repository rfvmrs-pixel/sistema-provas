import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, sectors, roles } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const list = await db
    .select({
      id: employees.id,
      name: employees.name,
      active: employees.active,
      createdAt: employees.createdAt,
      sectorId: employees.sectorId,
      sectorName: sectors.name,
      roleId: employees.roleId,
      roleName: roles.name,
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .orderBy(asc(employees.name));

  return NextResponse.json({ employees: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const sectorId = Number(body?.sectorId);
  const roleId = Number(body?.roleId);
  const password = body?.password?.toString();

  if (!name || !sectorId || !roleId || !password) {
    return NextResponse.json(
      { error: "Nome, setor, função e senha são obrigatórios." },
      { status: 400 },
    );
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [created] = await db
      .insert(employees)
      .values({ name, sectorId, roleId, passwordHash })
      .returning();
    return NextResponse.json({ employee: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Já existe um funcionário com esse nome nesse setor." },
      { status: 409 },
    );
  }
}
