import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions } from "@/db/schema";

// Rota pública (sem login) — lista as provas ativas (IT/APR) de um
// Contrato+Função, pra tela de Simulado (autosserviço) mostrar as opções
// depois que o colaborador escolhe o Contrato e a Função.
export async function GET(req: NextRequest) {
  const sectorId = Number(req.nextUrl.searchParams.get("sectorId"));
  const roleId = Number(req.nextUrl.searchParams.get("roleId"));
  if (!sectorId || !roleId) {
    return NextResponse.json({ error: "Informe o Contrato e a Função." }, { status: 400 });
  }

  const list = await db
    .select({
      id: exams.id,
      title: exams.title,
      summary: exams.summary,
      passingScore: exams.passingScore,
      documentType: exams.documentType,
      questionCount: sql<number>`count(${questions.id})`.mapWith(Number),
    })
    .from(exams)
    .innerJoin(questions, eq(questions.examId, exams.id))
    .where(and(eq(exams.sectorId, sectorId), eq(exams.roleId, roleId), eq(exams.active, true)))
    .groupBy(exams.id)
    .orderBy(desc(exams.createdAt));

  return NextResponse.json({ exams: list.filter((e) => e.questionCount > 0) });
}
