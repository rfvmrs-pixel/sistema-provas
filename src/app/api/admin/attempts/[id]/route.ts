import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attempts, employees, exams } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { getAttemptReviewItems } from "@/lib/answerLog";

// Uma prova finalizada de um colaborador, aberta pelo gestor no painel: data,
// nota e cada questão com a alternativa marcada, a correta e se acertou.
// Vem do registro permanente (lib/answerLog.ts), então continua abrindo mesmo
// depois que a prova for regerada.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const attemptId = Number(id);
  if (!Number.isFinite(attemptId)) return NextResponse.json({ error: "Prova inválida." }, { status: 400 });

  const [row] = await db
    .select({
      id: attempts.id, examId: attempts.examId, finishedAt: attempts.finishedAt, startedAt: attempts.startedAt,
      percentage: attempts.percentage, score: attempts.score, totalQuestions: attempts.totalQuestions, mode: attempts.mode,
      examTitle: exams.title, documentType: exams.documentType, passingScore: exams.passingScore,
      employeeName: employees.name, sectorId: employees.sectorId,
    })
    .from(attempts)
    .innerJoin(exams, eq(attempts.examId, exams.id))
    .innerJoin(employees, eq(attempts.employeeId, employees.id))
    .where(eq(attempts.id, attemptId))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, row.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }
  if (!row.finishedAt) return NextResponse.json({ error: "Essa prova ainda não foi finalizada." }, { status: 409 });

  const review = await getAttemptReviewItems(row.id, row.examId);
  return NextResponse.json({
    attempt: {
      id: row.id, examTitle: row.examTitle, documentType: row.documentType, employeeName: row.employeeName, mode: row.mode,
      startedAt: row.startedAt, finishedAt: row.finishedAt, percentage: row.percentage, score: row.score,
      totalQuestions: row.totalQuestions, passingScore: row.passingScore, passed: (row.percentage ?? 0) >= row.passingScore,
    },
    review,
  });
}
