import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { examLinks, exams, employees, questions, attempts } from "@/db/schema";
import { createEmployeeSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { generateLinkToken } from "@/lib/token";
import { isValidTenureCode } from "@/lib/tenure";
import { ensureFreshQuestionSet } from "@/lib/attemptLimit";

// Autocadastro público pelo link de aplicação — sem senha. O colaborador
// informa nome, matrícula e tempo de empresa (Contrato/Função já são fixos,
// vêm da prova); a gente acha (ou cria, se for "geral" e a matrícula for
// nova) o funcionário, abre a sessão dele e já entrega a prova pronta pra
// responder, tudo numa chamada só.
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const link = await db.query.examLinks.findFirst({ where: eq(examLinks.token, token) });
  if (!link || !link.active) {
    return NextResponse.json({ error: "Esse link não está mais disponível." }, { status: 404 });
  }

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, link.examId) });
  if (!exam || !exam.active) {
    return NextResponse.json({ error: "Essa prova não está mais disponível." }, { status: 400 });
  }
  if (!exam.roleId) {
    // Não deveria acontecer (links só são criados pra provas com Função —
    // ver /api/admin/exams/[id]/links), mas fica como guarda de segurança.
    return NextResponse.json({ error: "Essa prova não tem Função definida." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  const matricula = body?.matricula?.toString().trim();
  const tempoDeEmpresa = body?.tempoDeEmpresa?.toString().trim();

  if (!name || !matricula) {
    return NextResponse.json({ error: "Informe nome e matrícula." }, { status: 400 });
  }
  if (!isValidTenureCode(tempoDeEmpresa)) {
    return NextResponse.json({ error: "Selecione o tempo de empresa." }, { status: 400 });
  }

  let employeeId: number;

  if (link.kind === "direcionada") {
    if (!link.targetEmployeeId) {
      return NextResponse.json({ error: "Link direcionado sem colaborador definido." }, { status: 400 });
    }
    const target = await db.query.employees.findFirst({ where: eq(employees.id, link.targetEmployeeId) });
    if (!target || target.matricula?.trim().toLowerCase() !== matricula.toLowerCase()) {
      return NextResponse.json(
        { error: "Essa prova é direcionada a outra pessoa — confira sua matrícula." },
        { status: 403 },
      );
    }
    await db
      .update(employees)
      .set({ name, tempoDeEmpresa })
      .where(eq(employees.id, target.id));
    employeeId = target.id;
  } else {
    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.sectorId, exam.sectorId), eq(employees.matricula, matricula)),
    });
    if (existing) {
      await db
        .update(employees)
        .set({ name, roleId: exam.roleId, tempoDeEmpresa, active: true })
        .where(eq(employees.id, existing.id));
      employeeId = existing.id;
    } else {
      const randomPasswordHash = await hashPassword(generateLinkToken());
      const [created] = await db
        .insert(employees)
        .values({
          name,
          matricula,
          tempoDeEmpresa,
          sectorId: exam.sectorId,
          roleId: exam.roleId,
          passwordHash: randomPasswordHash,
          active: true,
        })
        .returning({ id: employees.id });
      employeeId = created.id;
    }
  }

  // Limite: no máximo 3 tentativas "oficial" pra esse colaborador (mesmo
  // nome/matrícula) dentro do mesmo conjunto de perguntas dessa prova. Ao
  // bater o limite, regenera as questões na hora (outras perguntas, mesma
  // IT/APR de origem) — ver src/lib/attemptLimit.ts. Isso substitui a antiga
  // regra de "só pode responder uma vez por link": agora conta contra a
  // prova/colaborador, não contra o link específico.
  const fresh = await ensureFreshQuestionSet(exam.id, employeeId);
  const questionSetVersion = fresh.currentVersion;
  const currentExam = fresh.regenerated
    ? ((await db.query.exams.findFirst({ where: eq(exams.id, exam.id) })) ?? exam)
    : exam;

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
    sectorId: exam.sectorId,
    sectorName: "",
    roleId: exam.roleId,
    roleName: "",
    mode: "oficial",
    examId: exam.id,
    sessionLabel: link.label,
    examLinkId: link.id,
  });

  const [attempt] = await db
    .insert(attempts)
    .values({
      examId: exam.id,
      employeeId,
      totalQuestions: examQuestions.length,
      mode: "oficial",
      sessionLabel: link.label,
      examLinkId: link.id,
      questionSetVersion,
    })
    .returning();

  return NextResponse.json({
    attemptId: attempt.id,
    examTitle: currentExam.title,
    passingScore: currentExam.passingScore,
    questions: examQuestions,
    startedAt: attempt.startedAt,
  });
}
