import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { exams, employees, questions, attempts, documents } from "@/db/schema";
import { createEmployeeSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { generateLinkToken } from "@/lib/token";
import { generateExamFromText, type DocumentType } from "@/lib/ai";

const SIMULADO_QUESTION_COUNT = 10;

// Acha uma prova auto-gerada (roleId nulo) já existente pra esse documento,
// ou gera uma nova na hora via IA e persiste (exams + questions) — assim o
// resto do fluxo (tentativa, respostas, PDF, indicador) funciona exatamente
// como uma prova comum, sem duplicar lógica de correção/resultado. A prova
// fica sem Função (vale pra qualquer colaborador do Contrato) e é reusada
// entre colaboradores/tentativas até alguém regenerar manualmente pelo
// admin — só a primeira pessoa a escolher aquele IT/APR paga o custo de
// gerar via IA.
async function findOrCreateAutoExam(document: typeof documents.$inferSelect) {
  const existing = await db.query.exams.findFirst({
    where: and(eq(exams.documentId, document.id), isNull(exams.roleId), eq(exams.active, true)),
  });
  if (existing) return existing;

  const documentType = document.documentType as DocumentType;
  const generated = await generateExamFromText(document.extractedText, {
    numQuestions: SIMULADO_QUESTION_COUNT,
    documentType,
    sourceFileName: document.fileName,
    // Sem roleName de propósito: o Simulado autosserviço não é escolhido por
    // Função, então a IA não filtra por responsável — vale pra qualquer
    // colaborador do Contrato.
  });

  const [exam] = await db
    .insert(exams)
    .values({
      title: generated.title || document.fileName,
      sourceFileName: document.fileName,
      summary: generated.summary,
      documentType,
      documentId: document.id,
      sectorId: document.sectorId,
      roleId: null,
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

  return exam;
}

// Autosserviço de Simulado — sem senha, sem cadastro prévio. O colaborador
// informa nome, matrícula, Contrato e Função, escolhe qual IT/APR quer
// praticar, e a gente acha (ou cria) o funcionário por matrícula+Contrato,
// abre a sessão dele em modo "simulado" e já entrega a prova pronta pra
// responder. A prova em si vem de findOrCreateAutoExam (gerada por IA direto
// do IT/APR, sem depender de Função) — mesmo padrão do autocadastro por link
// (ver /api/public/exam-links/[token]/register), só que aqui o colaborador
// escolhe livremente o IT/APR em vez de vir preso a um link específico.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const matricula = body?.matricula?.toString().trim();
  const sectorId = Number(body?.sectorId);
  const roleId = Number(body?.roleId);
  const documentId = Number(body?.documentId);

  if (!name || !matricula || !sectorId || !roleId || !documentId) {
    return NextResponse.json(
      { error: "Informe nome, matrícula, Contrato, Função e o IT/APR escolhido." },
      { status: 400 },
    );
  }

  const document = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.sectorId, sectorId)),
  });
  if (!document) {
    return NextResponse.json({ error: "IT/APR não encontrado para esse Contrato." }, { status: 404 });
  }

  let exam;
  try {
    exam = await findOrCreateAutoExam(document);
  } catch (err) {
    console.error("Erro ao gerar simulado por IA:", err);
    return NextResponse.json(
      { error: "Não consegui gerar o simulado desse IT/APR agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  let employeeId: number;
  const existing = await db.query.employees.findFirst({
    where: and(eq(employees.sectorId, sectorId), eq(employees.matricula, matricula)),
  });
  if (existing) {
    await db
      .update(employees)
      .set({ name, roleId, active: true })
      .where(eq(employees.id, existing.id));
    employeeId = existing.id;
  } else {
    const randomPasswordHash = await hashPassword(generateLinkToken());
    const [created] = await db
      .insert(employees)
      .values({
        name,
        matricula,
        sectorId,
        roleId,
        passwordHash: randomPasswordHash,
        active: true,
      })
      .returning({ id: employees.id });
    employeeId = created.id;
  }

  const examQuestions = await db
    .select({ id: questions.id, text: questions.text, options: questions.options, order: questions.order })
    .from(questions)
    .where(eq(questions.examId, exam.id))
    .orderBy(asc(questions.order));

  if (examQuestions.length === 0) {
    return NextResponse.json({ error: "Esse IT/APR ainda não tem questões cadastradas." }, { status: 400 });
  }

  await createEmployeeSession({
    employeeId,
    name,
    sectorId,
    sectorName: "",
    roleId,
    roleName: "",
    mode: "simulado",
  });

  const [attempt] = await db
    .insert(attempts)
    .values({
      examId: exam.id,
      employeeId,
      totalQuestions: examQuestions.length,
      mode: "simulado",
    })
    .returning();

  return NextResponse.json({
    attemptId: attempt.id,
    examTitle: exam.title,
    passingScore: exam.passingScore,
    questions: examQuestions,
    startedAt: attempt.startedAt,
  });
}
