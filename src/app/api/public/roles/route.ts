import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { roles, exams, questions } from "@/db/schema";

// Rota pública (sem login) — usada na tela de Simulado (autosserviço): depois
// que o colaborador escolhe o Contrato, listamos só as Funções que têm pelo
// menos uma prova ativa (com questões) nesse Contrato, pra não deixar
// escolher uma combinação Contrato+Função sem nenhum IT/APR disponível.
export async function GET(req: NextRequest) {
  const sectorId = Number(req.nextUrl.searchParams.get("sectorId"));
  if (!sectorId) {
    return NextResponse.json({ error: "Informe o Contrato." }, { status: 400 });
  }

  const rows = await db
    .select({ id: roles.id, name: roles.name, examCount: sql<number>`count(distinct ${exams.id})`.mapWith(Number) })
    .from(roles)
    .innerJoin(exams, and(eq(exams.roleId, roles.id), eq(exams.sectorId, sectorId), eq(exams.active, true)))
    .innerJoin(questions, eq(questions.examId, exams.id))
    .groupBy(roles.id)
    .orderBy(asc(roles.name));

  return NextResponse.json({ roles: rows.filter((r) => r.examCount > 0).map((r) => ({ id: r.id, name: r.name })) });
}
