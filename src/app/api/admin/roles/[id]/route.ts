import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { requireEditor } from "@/lib/requireAdmin";

// Liga/desliga o marcador "Operador" de uma função já cadastrada — usado
// pela tela de Funções pra alternar sem precisar recriar a função. Só esse
// campo é editável por aqui; o nome continua imutável depois de criado.
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.isOperator !== "boolean") {
    return NextResponse.json({ error: "Informe isOperator (true/false)." }, { status: 400 });
  }

  const [updated] = await db
    .update(roles)
    .set({ isOperator: body.isOperator })
    .where(eq(roles.id, Number(id)))
    .returning();
  if (!updated) return NextResponse.json({ error: "Função não encontrada." }, { status: 404 });

  return NextResponse.json({ role: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
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
