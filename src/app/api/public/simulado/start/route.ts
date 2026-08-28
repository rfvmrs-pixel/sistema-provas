import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, employees, questions, attempts } from "@/db/schema";
import { createEmployeeSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { generateLinkToken } from "@/lib/token";

// Autosserviço de Simulado — sem senha, sem cadastro prévio. O colaborador
// informa nome, matrícula, Contrato e Função, escolhe qual IT/APR quer
// praticar, e a gente acha (ou cria) o funcionário por matrícula+Contrato,
// abre a sessão dele em modo "simulado" e já entrega a prova pronta pra
// responder — mesmo padrão do autocadastro por link (ver
// /api/public/exam-links/[token]/register), só que aqui o colaborador escolhe
// livremente a prova em vez de vir presa a um link específico.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const matricula = body?.matricula?.toString().trim();
  const sectorId = Number(body?.sectorId);
  const roleId = Number(body?.roleId);
  const examId = Number(body?.examId);

  if (!name || !matricula || !sectorId || !roleId || !examId) {
    return NextResponse.json(
      { error: "Informe nome, matrícula, Contrato, Função e a prova escolhida." },
      { status: 400 },
    );
  }

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam || !exam.active) {
    return NextResponse.json({ error: "Essa prova não está mais disponível." }, { status: 400 });
  }
  if (exam.sectorId !== sectorId || exam.roleId !== roleId) {
    return NextResponse.json(
      { error: "Essa prova não é desse Contrato/Função." },
      { status: 400 },
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
    return NextResponse.json({ error: "Essa prova ainda não tem questões." }, { status: 400 });
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
