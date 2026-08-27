import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, employees, sectors, roles, exams, questions, answers } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { generateAttemptPdf, type AttemptPdfQuestion } from "@/lib/attemptPdf";

export const maxDuration = 30;

// GET: exporta o resultado de UMA tentativa (prova já respondida por um
// colaborador) em PDF. Cabeçalho traz Setor, Nome do Colaborador, Função e
// Data da Prova, seguido do resultado e do detalhe de cada questão.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const attemptId = Number(id);

  const [row] = await db
    .select({
      id: attempts.id,
      finishedAt: attempts.finishedAt,
      score: attempts.score,
      totalQuestions: attempts.totalQuestions,
      percentage: attempts.percentage,
      mode: attempts.mode,
      sessionLabel: attempts.sessionLabel,
      examId: attempts.examId,
      employeeName: employees.name,
      sectorId: employees.sectorId,
      sectorName: sectors.name,
      roleName: roles.name,
      examTitle: exams.title,
      documentType: exams.documentType,
      passingScore: exams.passingScore,
    })
    .from(attempts)
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .where(eq(attempts.id, attemptId));

  if (!row) return NextResponse.json({ error: "Tentativa não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, row.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa tentativa." }, { status: 403 });
  }
  if (!row.finishedAt) {
    return NextResponse.json({ error: "Essa prova ainda não foi finalizada." }, { status: 409 });
  }

  const examQuestions = await db
    .select()
    .from(questions)
    .where(eq(questions.examId, row.examId))
    .orderBy(asc(questions.order));

  const attemptAnswers = await db.select().from(answers).where(eq(answers.attemptId, attemptId));
  const answerByQuestionId = new Map(attemptAnswers.map((a) => [a.questionId, a]));

  const pdfQuestions: AttemptPdfQuestion[] = examQuestions.map((q) => {
    const ans = answerByQuestionId.get(q.id);
    return {
      order: q.order,
      text: q.text,
      options: q.options as unknown as { key: string; text: string }[],
      correctKey: q.correctKey,
      selectedKey: ans?.selectedKey ?? null,
      correct: ans?.correct ?? false,
    };
  });

  const pdfBuffer = await generateAttemptPdf({
    employeeName: row.employeeName,
    sectorName: row.sectorName,
    roleName: row.roleName,
    examTitle: row.examTitle,
    documentType: row.documentType === "APR" ? "APR" : "IT",
    finishedAt: row.finishedAt,
    score: row.score,
    totalQuestions: row.totalQuestions,
    percentage: row.percentage,
    passingScore: row.passingScore,
    mode: row.mode,
    sessionLabel: row.sessionLabel,
    questions: pdfQuestions,
  });

  const safeName = row.employeeName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prova-${safeName}-${attemptId}.pdf"`,
    },
  });
}
