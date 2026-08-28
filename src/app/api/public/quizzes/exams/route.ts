import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, roles } from "@/db/schema";

// Rota pública — usada na tela de Quizzes: depois que o colaborador escolhe
// o Contrato, listamos todas as provas ativas (IT/APR) desse Contrato, de
// qualquer Função (no Quiz não se escolhe Função, só o IT/APR direto), com
// pelo menos 1 questão cadastrada.
export async function GET(req: NextRequest) {
  const sectorId = Number(req.nextUrl.searchParams.get("sectorId"));
  if (!sectorId) {
    return NextResponse.json({ error: "Informe o Contrato." }, { status: 400 });
  }

  const rows = await db
    .select({
      id: exams.id,
      title: exams.title,
      summary: exams.summary,
      documentType: exams.documentType,
      roleName: roles.name,
      questionCount: sql<number>`count(distinct ${questions.id})`.mapWith(Number),
    })
    .from(exams)
    .innerJoin(roles, eq(exams.roleId, roles.id))
    .innerJoin(questions, eq(questions.examId, exams.id))
    .where(and(eq(exams.sectorId, sectorId), eq(exams.active, true)))
    .groupBy(exams.id, exams.title, exams.summary, exams.documentType, roles.name)
    .orderBy(asc(exams.documentType), asc(exams.title));

  return NextResponse.json({
    exams: rows
      .filter((r) => r.questionCount > 0)
      .map((r) => ({
        id: r.id,
        title: r.title,
        summary: r.summary,
        documentType: r.documentType,
        roleName: r.roleName,
        questionCount: r.questionCount,
      })),
  });
}
