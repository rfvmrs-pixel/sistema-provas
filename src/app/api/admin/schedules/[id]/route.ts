import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examSchedules } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";

const KINDS = ["geral", "direcionada", "curso", "simulado"] as const;

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const schedule = await db.query.examSchedules.findFirst({ where: eq(examSchedules.id, Number(id)) });
  if (!schedule) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, schedule.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse item." }, { status: 403 });
  }
  if (schedule.examId) {
    return NextResponse.json(
      { error: "Esse item já virou uma prova — edite a prova diretamente em vez do cronograma." },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  const update: Partial<typeof examSchedules.$inferInsert> = {};
  if (typeof body?.scheduledDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.scheduledDate)) {
    update.scheduledDate = body.scheduledDate;
  }
  if (typeof body?.note === "string") update.note = body.note.trim().slice(0, 300) || null;
  if (KINDS.includes(body?.kind)) update.kind = body.kind;
  if (body?.roleId !== undefined) update.roleId = body.roleId ? Number(body.roleId) : null;
  if (typeof body?.documentLabel === "string" && body.documentLabel.trim()) {
    update.documentLabel = body.documentLabel.trim();
  }
  if (typeof body?.targetEmployeeName === "string") update.targetEmployeeName = body.targetEmployeeName.trim() || null;
  if (typeof body?.targetEmployeeMatricula === "string") {
    update.targetEmployeeMatricula = body.targetEmployeeMatricula.trim() || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const [updated] = await db
    .update(examSchedules)
    .set(update)
    .where(eq(examSchedules.id, Number(id)))
    .returning();

  return NextResponse.json({ schedule: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const schedule = await db.query.examSchedules.findFirst({ where: eq(examSchedules.id, Number(id)) });
  if (!schedule) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, schedule.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse item." }, { status: 403 });
  }

  await db.delete(examSchedules).where(eq(examSchedules.id, Number(id)));
  return NextResponse.json({ ok: true });
}
