import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, attempts } from "@/db/schema";
import { regenerateExamQuestions } from "@/lib/regenerateExam";

const MAX_ATTEMPTS_PER_SET = 3;

export type FreshQuestionSetResult = {
  regenerated: boolean;
  currentVersion: number;
};

// Antes de criar uma nova tentativa "oficial" (prova aplicada de verdade —
// código do dia ou link geral/direcionado) pro colaborador, garante que ele
// ainda não estourou o limite de 3 tentativas com o mesmo nome/matrícula pro
// conjunto de perguntas ATUAL da prova (exams.currentVersion). Se já tiver
// feito 3 tentativas oficiais nesse conjunto, regenera as questões na hora
// (outras perguntas, mesmo IT/APR de origem) — o que também incrementa
// currentVersion e, por consequência, zera a contagem pra todo mundo.
//
// Retorna a versão do conjunto de perguntas que a NOVA tentativa deve
// gravar em attempts.questionSetVersion.
export async function ensureFreshQuestionSet(
  examId: number,
  employeeId: number,
): Promise<FreshQuestionSetResult> {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return { regenerated: false, currentVersion: 1 };

  const attemptsInSet = await db.query.attempts.findMany({
    where: and(
      eq(attempts.examId, examId),
      eq(attempts.employeeId, employeeId),
      eq(attempts.mode, "oficial"),
      eq(attempts.questionSetVersion, exam.currentVersion),
    ),
  });

  if (attemptsInSet.length < MAX_ATTEMPTS_PER_SET) {
    return { regenerated: false, currentVersion: exam.currentVersion };
  }

  if (!exam.documentId) {
    // Prova sem documento de origem na biblioteca (criada/importada na mão)
    // — não tem como regenerar sozinho. Deixa passar sem travar o
    // colaborador, em vez de bloquear a prova sem solução.
    return { regenerated: false, currentVersion: exam.currentVersion };
  }

  try {
    const updated = await regenerateExamQuestions(examId);
    return { regenerated: true, currentVersion: updated?.currentVersion ?? exam.currentVersion + 1 };
  } catch {
    // Se a geração por IA falhar (ex.: chave inválida no momento), deixa o
    // colaborador seguir com o conjunto atual em vez de travar a prova.
    return { regenerated: false, currentVersion: exam.currentVersion };
  }
}
