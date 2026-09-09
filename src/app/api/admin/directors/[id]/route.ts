import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, adminSectors } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

const FULL_ACCESS_ROLES = ["diretoria", "superintendencia"] as const;

// Redefine a senha (e, opcionalmente, o nome de exibição) de UMA conta de
// Diretoria/Superintendência já existente — usado pelo botão "editar senha"
// em Contratos > Contas de Diretoria/Superintendência. Só mexe em contas com
// esse role (não dá pra usar essa rota pra trocar senha de admin geral ou
// gestor por engano).
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const adminId = Number(id);

  const existing = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!existing || !FULL_ACCESS_ROLES.includes(existing.role as (typeof FULL_ACCESS_ROLES)[number])) {
    return NextResponse.json({ error: "Conta de Diretoria/Superintendência não encontrada." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const password = body?.password?.toString();
  const label = typeof body?.label === "string" ? body.label.trim() || null : undefined;

  if (!password) {
    return NextResponse.json({ error: "Informe a nova senha." }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const [row] = await db
    .update(admins)
    .set({ passwordHash, ...(label !== undefined ? { label } : {}) })
    .where(eq(admins.id, adminId))
    .returning({ id: admins.id, username: admins.username, label: admins.label, role: admins.role });

  return NextResponse.json({ director: row });
}

// Exclui uma conta de Diretoria/Superintendência (e os vínculos de Contrato
// dela em admin_sectors, via onDelete cascade). Mesma restrição de role da
// rota acima — só exclui contas de Diretoria/Superintendência por aqui.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const adminId = Number(id);

  const existing = await db.query.admins.findFirst({ where: eq(admins.id, adminId) });
  if (!existing || !FULL_ACCESS_ROLES.includes(existing.role as (typeof FULL_ACCESS_ROLES)[number])) {
    return NextResponse.json({ error: "Conta de Diretoria/Superintendência não encontrada." }, { status: 404 });
  }

  await db.delete(adminSectors).where(eq(adminSectors.adminId, adminId));
  await db.delete(admins).where(eq(admins.id, adminId));

  return NextResponse.json({ ok: true });
}
