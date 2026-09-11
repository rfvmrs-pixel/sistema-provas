import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { examSchedules, sectors, roles, documents, examLinks } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector, getVisibleSectorIds } from "@/lib/requireAdmin";

const KINDS = ["geral", "direcionada", "curso", "simulado"] as const;

// Cronograma de provas: cada Contrato pode deixar programadas, com data,
// todas as provas do ano (Geral/Direcionada/Curso/Simulado) — sem precisar
// gerar tudo de uma vez. Cada item vira uma prova+link de verdade só quando
// alguém aciona "Gerar prova agora" (ver POST .../[id]/generate); até lá é
// só planejamento.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const sectorIdParam = searchParams.get("sectorId");
  const visibleSectorIds = getVisibleSectorIds(guard.admin);

  const conditions = [];
  if (visibleSectorIds) conditions.push(inArray(examSchedules.sectorId, visibleSectorIds));
  if (sectorIdParam) {
    const sectorId = Number(sectorIdParam);
    if (visibleSectorIds && !visibleSectorIds.includes(sectorId)) {
      return NextResponse.json({ error: "Você não tem acesso a esse Contrato." }, { status: 403 });
    }
    conditions.push(eq(examSchedules.sectorId, sectorId));
  }

  const list = await db
    .select({
      id: examSchedules.id,
      sectorId: examSchedules.sectorId,
      sectorName: sectors.name,
      documentId: examSchedules.documentId,
      documentLabel: examSchedules.documentLabel,
      scheduledDate: examSchedules.scheduledDate,
      note: examSchedules.note,
      kind: examSchedules.kind,
      roleId: examSchedules.roleId,
      roleName: roles.name,
      numQuestions: examSchedules.numQuestions,
      targetEmployeeName: examSchedules.targetEmployeeName,
      targetEmployeeMatricula: examSchedules.targetEmployeeMatricula,
      examId: examSchedules.examId,
      examLinkId: examSchedules.examLinkId,
      linkToken: examLinks.token,
    })
    .from(examSchedules)
    .innerJoin(sectors, eq(examSchedules.sectorId, sectors.id))
    .leftJoin(roles, eq(examSchedules.roleId, roles.id))
    .leftJoin(examLinks, eq(examSchedules.examLinkId, examLinks.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(examSchedules.scheduledDate));

  return NextResponse.json({ schedules: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Envio inválido." }, { status: 400 });

  const sectorId = Number(body.sectorId);
  const scheduledDate = typeof body.scheduledDate === "string" ? body.scheduledDate.trim() : "";
  const kind = KINDS.includes(body.kind) ? body.kind : "geral";
  const documentId = body.documentId ? Number(body.documentId) : null;
  const roleId = body.roleId ? Number(body.roleId) : null;
  const numQuestionsRaw = Number(body.numQuestions);
  const numQuestions = [10, 15].includes(numQuestionsRaw) ? numQuestionsRaw : 15;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 300) || null : null;
  const targetEmployeeName = kind === "direcionada" ? (body.targetEmployeeName?.toString().trim() ?? "") : null;
  const targetEmployeeMatricula =
    kind === "direcionada" ? (body.targetEmployeeMatricula?.toString().trim() ?? "") : null;

  if (!sectorId) return NextResponse.json({ error: "Selecione o Contrato." }, { status: 400 });
  if (!canAccessSector(guard.admin, sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse Contrato." }, { status: 403 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    return NextResponse.json({ error: "Informe a data da prova." }, { status: 400 });
  }
  if (kind === "direcionada" && (!targetEmployeeName || !targetEmployeeMatricula)) {
    return NextResponse.json(
      { error: "Informe nome e matrícula do colaborador pra um item Direcionado." },
      { status: 400 },
    );
  }

  let documentLabel = typeof body.documentLabel === "string" ? body.documentLabel.trim() : "";
  if (documentId) {
    const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
    if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
    if (!canAccessSector(guard.admin, document.sectorId)) {
      return NextResponse.json({ error: "Esse documento não é desse Contrato." }, { status: 403 });
    }
    documentLabel = document.fileName;
  }
  if (!documentLabel) {
    return NextResponse.json(
      { error: "Escolha um PDF da biblioteca ou descreva o que essa prova vai cobrir." },
      { status: 400 },
    );
  }

  const [schedule] = await db
    .insert(examSchedules)
    .values({
      sectorId,
      documentId,
      documentLabel,
      scheduledDate,
      note,
      kind,
      roleId,
      numQuestions,
      targetEmployeeName: targetEmployeeName || null,
      targetEmployeeMatricula: targetEmployeeMatricula || null,
    })
    .returning();

  return NextResponse.json({ schedule }, { status: 201 });
}
