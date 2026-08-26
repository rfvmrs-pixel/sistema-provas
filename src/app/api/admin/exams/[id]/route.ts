import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, sectors, roles } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { getAttemptsByExam } from "@/lib/reports";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const exam = await db.query.exams.findFirst({
    where: eq(exams.id, Number(id)),
    with: { sector: true, role: true },
  });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const examQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, Number(id)))
    .orderBy(asc(questions.order));

  const attempts = await getAttemptsByExam(Number(id));

  return NextResponse.json({ exam, questions: examQuestions, attempts });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const existing = await db.query.exams.findFirst({ where: eq(exams.id, Number(id)) });
  if (!existing) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, existing.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  const update: Partial<typeof exams.$inferInsert> = {};
  if (typeof body?.active === "boolean") update.active = body.active;
  if (body?.passingScore !== undefined) update.passingScore = Number(body.passingScore);
  if (body?.title) update.title = body.title.toString().trim();
  if (body?.documentType) {
    const dt = body.documentType.toString().toUpperCase();
    if (dt !== "IT" && dt !== "APR") {
      return NextResponse.json({ error: "Tipo de documento inválido (use IT ou APR)." }, { status: 400 });
    }
    update.documentType = dt;
  }

  if (body?.sectorId !== undefined) {
    const sectorId = Number(body.sectorId);
    if (!canAccessSector(guard.admin, sectorId)) {
      return NextResponse.json(
        { error: "Você só pode mover a prova para o próprio contrato." },
        { status: 403 },
      );
    }
    const sector = await db.query.sectors.findFirst({ where: eq(sectors.id, sectorId) });
    if (!sector) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });
    update.sectorId = sectorId;
  }
  if (body?.roleId !== undefined) {
    const roleId = Number(body.roleId);
    const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
    if (!role) return NextResponse.json({ error: "Função inválida." }, { status: 400 });
    update.roleId = roleId;
  }

  if (body?.sectorId !== undefined) {
    const sectorId = Number(body.sectorId);
    const sector = await db.query.sectors.findFirst({ where: eq(sectors.id, sectorId) });
    if (!sector) return NextResponse.json({ error: "Setor inválido." }, { status: 400 });
    update.sectorId = sectorId;
  }
  if (body?.roleId !== undefined) {
    const roleId = Number(body.roleId);
    const role = await db.query.roles.findFirst({ where: eq(roles.id, roleId) });
    if (!role) return NextResponse.json({ error: "Função inválida." }, { status: 400 });
    update.roleId = roleId;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const [updated] = await db.update(exams).set(update).where(eq(exams.id, Number(id))).returning();
  return NextResponse.json({ exam: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const existing = await db.query.exams.findFirst({ where: eq(exams.id, Number(id)) });
  if (!existing) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, existing.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  await db.delete(exams).where(eq(exams.id, Number(id)));
  return NextResponse.json({ ok: true });
}
