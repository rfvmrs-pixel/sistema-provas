import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sectors, admins } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

// Gestor(es) do contrato: só o admin geral vê/gerencia isso.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const list = await db
    .select({ id: admins.id, username: admins.username, createdAt: admins.createdAt })
    .from(admins)
    .where(eq(admins.sectorId, Number(id)));

  return NextResponse.json({ gestores: list });
}

// Cria (ou, se já existir usuário com esse nome, redefine a senha do) gestor
// deste contrato.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const sectorId = Number(id);
  const sector = await db.query.sectors.findFirst({ where: eq(sectors.id, sectorId) });
  if (!sector) return NextResponse.json({ error: "Contrato não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => null);
  const username = body?.username?.toString().trim();
  const password = body?.password?.toString();

  if (!username || !password) {
    return NextResponse.json({ error: "Usuário e senha do gestor são obrigatórios." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const existing = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  if (existing) {
    if (existing.sectorId !== sectorId) {
      return NextResponse.json(
        { error: "Já existe um usuário admin com esse nome vinculado a outro contrato." },
        { status: 409 },
      );
    }
    const [updated] = await db
      .update(admins)
      .set({ passwordHash })
      .where(eq(admins.id, existing.id))
      .returning({ id: admins.id, username: admins.username });
    return NextResponse.json({ gestor: updated, updated: true });
  }

  const [created] = await db
    .insert(admins)
    .values({ username, passwordHash, sectorId })
    .returning({ id: admins.id, username: admins.username });
  return NextResponse.json({ gestor: created }, { status: 201 });
}
