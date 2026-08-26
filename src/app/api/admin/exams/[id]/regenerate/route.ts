import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exams } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { regenerateExamQuestions, RegenerateExamError } from "@/lib/regenerateExam";

export const maxDuration = 120;

// Quando a IT/APR de origem muda (ou quer trocar a quantidade de questões),
// o admin escolhe um PDF da biblioteca (do mesmo Contrato da prova) aqui.
// A prova (id, Setor, Função, tipo de documento, histórico de tentativas)
// continua a mesma — só as questões são substituídas pelas geradas a partir
// do documento escolhido, e exams.currentVersion incrementa (zerando a
// contagem de tentativas de todo mundo pra essa prova — ver
// src/lib/attemptLimit.ts, que também chama regenerateExamQuestions).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Envio inválido, esperado JSON." }, { status: 400 });
  }

  const documentId = Number(body.documentId);
  if (!documentId) {
    return NextResponse.json({ error: "Selecione um PDF da biblioteca." }, { status: 400 });
  }

  try {
    const updated = await regenerateExamQuestions(examId, {
      documentId,
      numQuestions: Number(body.numQuestions),
    });
    return NextResponse.json({ exam: updated });
  } catch (err) {
    if (err instanceof RegenerateExamError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar a prova com IA." },
      { status: 502 },
    );
  }
}
