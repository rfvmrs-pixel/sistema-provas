import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts, sectors, roles } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { extractPdfText } from "@/lib/pdf";
import { generateExamFromText, type DocumentType } from "@/lib/ai";

export const maxDuration = 120;

const ALLOWED_QUESTION_COUNTS = [10, 15];

// Nota: este arquivo (sem [id]) responde por /api/admin/exams (lista + criação).
// CRUD de UMA prova específica fica em ./[id]/route.ts. Os dois já estiveram
// trocados entre si nesse repo (o que quebrava upload de PDF e edição/exclusão
// de provas) — mantenha essa separação ao editar.
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const scope = guard.admin.sectorId !== null ? eq(exams.sectorId, guard.admin.sectorId) : undefined;

  const list = await db
    .select({
      id: exams.id,
      title: exams.title,
      sourceFileName: exams.sourceFileName,
      active: exams.active,
      passingScore: exams.passingScore,
      documentType: exams.documentType,
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
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Envio inválido, esperado multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const sectorId = Number(form.get("sectorId"));
  const roleId = Number(form.get("roleId"));
  const documentTypeRaw = form.get("documentType")?.toString().toUpperCase();
  const documentType: DocumentType = documentTypeRaw === "APR" ? "APR" : "IT";
  const numQuestionsRaw = Number(form.get("numQuestions"));
  const numQuestions = ALLOWED_QUESTION_COUNTS.includes(numQuestionsRaw) ? numQuestionsRaw : 15;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo PDF enviado." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
  }
  if (!sectorId) {
    return NextResponse.json({ error: "Selecione o Contrato (Setor) desta prova." }, { status: 400 });
  }
  if (!roleId) {
    return NextResponse.json({ error: "Selecione a Função desta prova." }, { status: 400 });
  }
  if (!canAccessSector(guard.admin, sectorId)) {
    return NextResponse.json(
      { error: "Você só pode criar provas para o próprio contrato." },
      { status: 403 },
    );
  }

  const [sector, role] = await Promise.all([
    db.query.sectors.findFirst({ where: eq(sectors.id, sectorId) }),
    db.query.roles.findFirst({ where: eq(roles.id, roleId) }),
  ]);
  if (!sector) return NextResponse.json({ error: "Contrato (Setor) inválido." }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Função inválida." }, { status: 400 });

  let text: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    text = await extractPdfText(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao ler o PDF." },
      { status: 400 },
    );
  }

  let generated;
  try {
    generated = await generateExamFromText(text, {
      numQuestions,
      sourceFileName: file.name,
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
      title: generated.title || file.name,
      sourceFileName: file.name,
      summary: generated.summary,
      documentType,
      sectorId,
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
