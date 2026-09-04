import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examLinks, exams } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { isExamLinkOpen } from "@/lib/examLinkPeriod";

// Ativa/desativa um link de aplicação (ex: encerrar uma "Prova Geral" depois
// que todo mundo já respondeu) e/ou autoriza responder fora do período
// (period_start/period_end) — autorização exige um comentário do gestor
// justificando, fica registrado em authorized_by/authorization_comment/
// authorized_at (ver isExamLinkOpen em lib/examLinkPeriod.ts).
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
  const update: Partial<typeof examLinks.$inferInsert> = {};

  if (typeof body?.active === "boolean") {
    update.active = body.active;
  }

  if (body?.action === "authorize") {
    const comment = body?.comment?.toString().trim();
    if (!comment) {
      return NextResponse.json(
        { error: "Informe um comentário explicando por que está autorizando fora do período." },
        { status: 400 },
      );
    }
    update.authorizedBy = guard.admin.label || guard.admin.username;
    update.authorizationComment = comment;
    update.authorizedAt = new Date();
  }

  if (body?.action === "revoke-authorization") {
    update.authorizedBy = null;
    update.authorizationComment = null;
    update.authorizedAt = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const [updated] = await db
    .update(examLinks)
    .set(update)
    .where(eq(examLinks.id, linkId))
    .returning();

  return NextResponse.json({ link: { ...updated, open: isExamLinkOpen(updated) } });
}

