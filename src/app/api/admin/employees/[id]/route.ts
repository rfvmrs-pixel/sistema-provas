import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);

  const update: Partial<typeof employees.$inferInsert> = {};
  if (typeof body?.active === "boolean") update.active = body.active;
  if (body?.sectorId) update.sectorId = Number(body.sectorId);
  if (body?.roleId) update.roleId = Number(body.roleId);
  if (body?.name) update.name = body.name.toString().trim();
  if (body?.password) {
    if (body.password.toString().length < 4) {
      return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
    }
    update.passwordHash = await hashPassword(body.password.toString());
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const [updated] = await db
    .update(employees)
    .set(update)
    .where(eq(employees.id, Number(id)))
    .returning();

  return NextResponse.json({ employee: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  await db.delete(employees).where(eq(employees.id, Number(id)));
  return NextResponse.json({ ok: true });
}
