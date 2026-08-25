import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  try {
    await db.delete(roles).where(eq(roles.id, Number(id)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não é possível excluir: existem funcionários cadastrados nessa função." },
      { status: 409 },
    );
  }
}
