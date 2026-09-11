import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { examSchedules, exams, questions, roles, documents, employees, examLinks } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { generateExamFromText, type DocumentType } from "@/lib/ai";
import { generateLinkToken } from "@/lib/token";
import { hashPassword } from "@/lib/password";

// "Gerar prova agora" num item do cronograma: usa (ou reaproveita, se já
// existir) a prova pra esse documento+função+tipo, e cria o link de
// aplicação (Geral/Direcionada/Curso/Simulado) com o período começando na
// data programada — sem precisar passar pela tela de Gerar Prova de novo.
// Reaproveitar a prova existente (em vez de gerar de novo) é de propósito:
// evita ficar replicando a mesma prova toda vez que o cronograma dispara
// pra uma nova data.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const schedule = await db.query.examSchedules.findFirst({ where: eq(examSchedules.id, Number(id)) });
  if (!schedule) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, schedule.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse item." }, { status: 403 });
  }
  if (schedule.examId && schedule.examLinkId) {
    return NextResponse.json({ error: "Esse item já foi gerado." }, { status: 400 });
  }
  if (!schedule.documentId || !schedule.roleId) {
    return NextResponse.json(
      { error: "Esse item ainda não tem PDF e Função definidos — edite o cronograma antes de gerar." },
      { status: 400 },
    );
  }
  if (schedule.kind === "direcionada" && (!schedule.targetEmployeeName || !schedule.targetEmployeeMatricula)) {
    return NextResponse.json(
      { error: "Esse item Direcionado está sem nome/matrícula do colaborador." },
      { status: 400 },
    );
  }

  const document = await db.query.documents.findFirst({ where: eq(documents.id, schedule.documentId) });
  if (!document) return NextResponse.json({ error: "PDF de origem não existe mais na biblioteca." }, { status: 404 });
  const role = await db.query.roles.findFirst({ where: eq(roles.id, schedule.roleId) });
  if (!role) return NextResponse.json({ error: "Função não existe mais." }, { status: 404 });

  const documentType = document.documentType as DocumentType;

  let examId = schedule.examId;
  if (!examId) {
    const existing = await db
      .select({ id: exams.id, version: exams.version })
      .from(exams)
      .where(
        sql`${exams.documentId} = ${schedule.documentId} and ${exams.roleId} = ${schedule.roleId} and ${exams.documentType} = ${documentType} and ${exams.active} = true`,
      )
      .orderBy(desc(exams.version))
      .limit(1);

    if (existing.length > 0) {
      // Já existe prova pra esse documento+função+tipo — reaproveita em vez
      // de gerar (e replicar) de novo.
      examId = existing[0].id;
    } else {
      let generated;
      try {
        generated = await generateExamFromText(document.extractedText, {
          numQuestions: schedule.numQuestions,
          sourceFileName: document.fileName,
          documentType,
          roleName: role.name,
        });
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Falha ao gerar a prova com IA." },
          { status: 502 },
        );
      }

      const [exam] = await db
        .insert(exams)
        .values({
          title: generated.title || document.fileName,
          sourceFileName: document.fileName,
          summary: generated.summary,
          documentType,
          category: document.category,
          documentId: document.id,
          sectorId: document.sectorId,
          roleId: schedule.roleId,
          version: 1,
        })
        .returning();
      examId = exam.id;

      if (generated.questions.length > 0) {
        await db.insert(questions).values(
          generated.questions.map((q, idx) => ({
            examId: exam.id,
            text: q.text,
            options: q.options,
            correctKey: q.correctKey,
            topic: q.topic,
            explanation: q.explanation,
            order: idx,
          })),
        );
      }
    }
  }

  let targetEmployeeId: number | null = null;
  if (schedule.kind === "direcionada" && schedule.targetEmployeeName && schedule.targetEmployeeMatricula) {
    const existingEmployee = await db.query.employees.findFirst({
      where: sql`${employees.sectorId} = ${schedule.sectorId} and ${employees.matricula} = ${schedule.targetEmployeeMatricula}`,
    });
    if (existingEmployee) {
      targetEmployeeId = existingEmployee.id;
    } else {
      const passwordHash = await hashPassword(schedule.targetEmployeeMatricula);
      const [newEmployee] = await db
        .insert(employees)
        .values({
          name: schedule.targetEmployeeName,
          matricula: schedule.targetEmployeeMatricula,
          sectorId: schedule.sectorId,
          roleId: schedule.roleId,
          passwordHash,
        })
        .returning();
      targetEmployeeId = newEmployee.id;
    }
  }

  const token = generateLinkToken();
  const [link] = await db
    .insert(examLinks)
    .values({
      examId,
      token,
      kind: schedule.kind,
      targetEmployeeId,
      label: schedule.note || undefined,
      periodStart: schedule.scheduledDate,
    })
    .returning();

  await db
    .update(examSchedules)
    .set({ examId, examLinkId: link.id })
    .where(eq(examSchedules.id, schedule.id));

  return NextResponse.json({ examId, link });
}
