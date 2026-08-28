import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { generateExamFromText, type DocumentType } from "@/lib/ai";
import { signQuizToken } from "@/lib/quizToken";

export const QUIZ_QUESTION_COUNT = 5;
export const QUIZ_SECONDS_PER_QUESTION = 90;

// POST { sectorId, documentId } -> gera na hora, via IA, QUIZ_QUESTION_COUNT
// perguntas a partir do PDF desse IT/APR da Biblioteca — sem depender de
// nenhuma prova pré-cadastrada e sem filtrar por Função (a mesma pergunta
// vale pra qualquer colaborador do Contrato). Devolve um token assinado com
// o gabarito (ver src/lib/quizToken.ts) + as perguntas sem
// correctKey/explanation. Não cria funcionário nem tentativa no banco, nem
// persiste as perguntas geradas: Quiz é prática avulsa, não entra nos
// relatórios nem no indicador de auditoria.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const sectorId = Number(body?.sectorId);
  const documentId = Number(body?.documentId);
  if (!sectorId || !documentId) {
    return NextResponse.json({ error: "Informe o Contrato e o IT/APR." }, { status: 400 });
  }

  const document = await db.query.documents.findFirst({
    where: and(eq(documents.id, documentId), eq(documents.sectorId, sectorId)),
  });
  if (!document) {
    return NextResponse.json({ error: "IT/APR não encontrado para esse Contrato." }, { status: 404 });
  }

  let generated;
  try {
    generated = await generateExamFromText(document.extractedText, {
      numQuestions: QUIZ_QUESTION_COUNT,
      documentType: document.documentType as DocumentType,
      sourceFileName: document.fileName,
      // Sem roleName de propósito: o Quiz não é escolhido por Função, então
      // a IA não filtra por responsável — vale pra qualquer colaborador.
    });
  } catch (err) {
    console.error("Erro ao gerar quiz por IA:", err);
    return NextResponse.json(
      { error: "Não consegui gerar as perguntas desse IT/APR agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const questions = generated.questions.map((q, i) => ({
    id: i + 1,
    text: q.text,
    options: q.options,
    correctKey: q.correctKey,
    explanation: q.explanation ?? null,
  }));

  const token = await signQuizToken({
    documentId: document.id,
    examTitle: generated.title,
    documentType: document.documentType,
    questions,
  });

  return NextResponse.json({
    token,
    documentId: document.id,
    examTitle: generated.title,
    documentType: document.documentType,
    secondsPerQuestion: QUIZ_SECONDS_PER_QUESTION,
    questions: questions.map((q) => ({ id: q.id, text: q.text, options: q.options })),
  });
}
