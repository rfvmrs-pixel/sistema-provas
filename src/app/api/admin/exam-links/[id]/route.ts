import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examLinks, exams } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";

// Ativa/desativa um link de aplicação (ex: encerrar uma "Prova Geral" depois
// que todo mundo já respondeu).
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const linkId = Number(id);

  const link = await db.query.examLinks.findFirst({ where: eq(examLinks.id, linkId) });
  if (!link) return NextResponse.json({ error: "Link não encontrado." }, { status: 404 });

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, link.examId) });
  if (!exam || !canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse link." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.active !== "boolean") {
    return NextResponse.json({ error: "Informe active (true/false)." }, { status: 400 });
  }

  const [updated] = await db
    .update(examLinks)
    .set({ active: body.active })
    .where(eq(examLinks.id, linkId))
    .returning();

  return NextResponse.json({ link: updated });
}
