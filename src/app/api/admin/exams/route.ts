import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts, sectors, roles, documents } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector, getVisibleSectorIds } from "@/lib/requireAdmin";
import { generateExamFromText, type DocumentType } from "@/lib/ai";

export const maxDuration = 120;

const ALLOWED_QUESTION_COUNTS = [10, 15];

// Nota: este arquivo (sem [id]) responde por /api/admin/exams (lista + criação).
// CRUD de UMA prova específica fica em ./[id]/route.ts. Os dois já estiveram
// trocados entre si nesse repo (o que quebrava upload de PDF e edição/exclusão
// de provas) — mantenha essa separação ao editar.
//
// A criação de prova NÃO recebe mais um PDF direto: o PDF já foi salvo antes
// na biblioteca (/api/admin/documents) e aqui só se escolhe qual documento,
// Função, Tipo (IT/APR) e quantidade de questões usar pra gerar a prova.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const visibleSectorIds = getVisibleSectorIds(guard.admin);
  const scope = visibleSectorIds ? inArray(exams.sectorId, visibleSectorIds) : undefined;

  const list = await db
    .select({
      id: exams.id,
      title: exams.title,
      sourceFileName: exams.sourceFileName,
      active: exams.active,
      passingScore: exams.passingScore,
      documentType: exams.documentType,
      category: exams.category,
      documentId: exams.documentId,
      createdAt: exams.createdAt,
      sectorId: exams.sectorId,
      sectorName: sectors.name,
      roleId: exams.roleId,
      roleName: roles.name,
      questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
      attemptCount: sql<number>`count(distinct ${attempts.id})`.mapWith(Number),
    })
    .from(exams)
    .leftJoin(questions, eq(questions.examId, exams.id))
    .leftJoin(attempts, eq(attempts.examId, exams.id))
    .innerJoin(sectors, eq(sectors.id, exams.sectorId))
    .innerJoin(roles, eq(roles.id, exams.roleId))
    .where(scope)
    .groupBy(exams.id, sectors.name, roles.name)
    .orderBy(desc(exams.createdAt));

  return NextResponse.json({ exams: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Envio inválido, esperado JSON." }, { status: 400 });
  }

  const documentId = Number(body.documentId);
  const roleId = Number(body.roleId);
  const numQuestionsRaw = Number(body.numQuestions);
  const numQuestions = ALLOWED_QUESTION_COUNTS.includes(numQuestionsRaw) ? numQuestionsRaw : 15;

  if (!documentId) {
    return NextResponse.json({ error: "Selecione um PDF da biblioteca." }, { status: 400 });
  }
  if (!roleId) {
    return NextResponse.json({ error: "Selecione a Função desta prova." }, { status: 400 });
  }

  const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) return NextResponse.json({ error: "Documento não encontrado na biblioteca." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json(
      { error: "Você só pode criar provas para o próprio contrato." },
      { status: 403 },
    );
  }

  // Tipo sempre vem do próprio documento (IT/APR/MANUAL definido no upload
  // da Biblioteca) — evita divergência entre o que foi enviado e o que o
  // client possa mandar aqui.
  const documentType = document.documentType as DocumentType;

  const [sector, role] = await Promise.all([
    db.query.sectors.findFirst({ where: eq(sectors.id, document.sectorId) }),
    db.query.roles.findFirst({ where: eq(roles.id, roleId) }),
  ]);
  if (!sector) return NextResponse.json({ error: "Contrato inválido." }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Função inválida." }, { status: 400 });

  let generated;
  try {
    generated = await generateExamFromText(document.extractedText, {
      numQuestions,
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
      roleId,
    })
    .returning();

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

  return NextResponse.json({ exam }, { status: 201 });
}
