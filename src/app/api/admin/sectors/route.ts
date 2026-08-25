import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sectors, admins } from "@/db/schema";
import { requireAdmin, requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

// "Setor" = "Contrato" na linguagem do dia a dia (TPS, EQUINOR, LON1...).
// Gestor de contrato (admin.sectorId setado) só enxerga o próprio contrato
// aqui — é o que popula os <select> de Setor nas telas de Provas/Funcionários.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const list =
    guard.admin.sectorId !== null
      ? await db.select().from(sectors).where(eq(sectors.id, guard.admin.sectorId))
      : await db.select().from(sectors).orderBy(asc(sectors.name));

  return NextResponse.json({ sectors: list });
}

// Só o admin geral cria contratos. Opcionalmente já cria o login do gestor
// desse contrato no mesmo passo (gestorUsername + gestorPassword).
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const gestorUsername = body?.gestorUsername?.toString().trim();
  const gestorPassword = body?.gestorPassword?.toString();

  if (!name) {
    return NextResponse.json({ error: "Nome do contrato é obrigatório." }, { status: 400 });
  }
  if ((gestorUsername && !gestorPassword) || (!gestorUsername && gestorPassword)) {
    return NextResponse.json(
      { error: "Informe usuário e senha do gestor juntos, ou nenhum dos dois." },
      { status: 400 },
    );
  }
  if (gestorPassword && gestorPassword.length < 4) {
    return NextResponse.json({ error: "Senha do gestor deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  let created;
  try {
    [created] = await db.insert(sectors).values({ name }).returning();
  } catch {
    return NextResponse.json({ error: "Já existe um contrato com esse nome." }, { status: 409 });
  }

  if (gestorUsername && gestorPassword) {
    try {
      const passwordHash = await hashPassword(gestorPassword);
      await db.insert(admins).values({ username: gestorUsername, passwordHash, sectorId: created.id });
    } catch {
      return NextResponse.json(
        {
          sector: created,
          warning: "Contrato criado, mas já existe um usuário admin com esse nome de gestor.",
        },
        { status: 201 },
      );
    }
  }

  return NextResponse.json({ sector: created }, { status: 201 });
}
