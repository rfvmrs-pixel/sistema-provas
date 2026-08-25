import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sectors } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  try {
    await db.delete(sectors).where(eq(sectors.id, Number(id)));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Não é possível excluir: existem funcionários cadastrados nesse setor." },
      { status: 409 },
    );
  }
}
