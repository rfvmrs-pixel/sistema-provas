import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, roles, documents } from "@/db/schema";
import { generateExamFromText, type DocumentType } from "@/lib/ai";

const ALLOWED_QUESTION_COUNTS = [10, 15];

export class RegenerateExamError extends Error {}

// Regenera as questões de uma prova a partir de um documento da biblioteca,
// incrementando exams.currentVersion. Usada tanto pelo endpoint manual do
// admin (.../exams/[id]/regenerate) quanto pelo gatilho automático depois de
// 3 tentativas "oficial" do mesmo colaborador (ver src/lib/attemptLimit.ts) —
// mesma lógica nos dois casos, pra manter o comportamento consistente (e o
// contador de tentativas sempre zera junto, porque conta contra a versão).
export async function regenerateExamQuestions(
  examId: number,
  opts: { documentId?: number; numQuestions?: number } = {},
) {
  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) throw new RegenerateExamError("Prova não encontrada.");

  const documentId = opts.documentId ?? exam.documentId ?? undefined;
  if (!documentId) {
    throw new RegenerateExamError("Essa prova não tem um documento de origem para regenerar.");
  }

  const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) throw new RegenerateExamError("Documento não encontrado na biblioteca.");
  if (document.sectorId !== exam.sectorId) {
    throw new RegenerateExamError("Escolha um PDF do mesmo Contrato desta prova.");
  }

  // exam.roleId pode ser null pra provas auto-geradas pelo Simulado
  // autosserviço (ver /api/public/simulado/start) — nesse caso a geração
  // segue sem roleName, valendo pra qualquer Função (mesmo comportamento da
  // criação original dessas provas).
  const role = exam.roleId ? await db.query.roles.findFirst({ where: eq(roles.id, exam.roleId) }) : undefined;

  const [{ count: currentQuestionCount }] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(questions)
    .where(eq(questions.examId, examId));

  const numQuestionsRaw = Number(opts.numQuestions);
  const numQuestions = ALLOWED_QUESTION_COUNTS.includes(numQuestionsRaw)
    ? numQuestionsRaw
    : ALLOWED_QUESTION_COUNTS.includes(currentQuestionCount)
      ? currentQuestionCount
      : 15;

  const documentType = (document.documentType || exam.documentType) as DocumentType;

  const generated = await generateExamFromText(document.extractedText, {
    numQuestions,
    sourceFileName: document.fileName,
    documentType,
    roleName: role?.name,
  });

  await db.delete(questions).where(eq(questions.examId, examId));

  if (generated.questions.length > 0) {
    await db.insert(questions).values(
      generated.questions.map((q, idx) => ({
        examId,
        text: q.text,
        options: q.options,
        correctKey: q.correctKey,
        topic: q.topic,
        explanation: q.explanation,
        order: idx,
      })),
    );
  }

  const [updated] = await db
    .update(exams)
    .set({
      title: generated.title || document.fileName,
      sourceFileName: document.fileName,
      summary: generated.summary,
      documentType,
      category: document.category,
      documentId: document.id,
      currentVersion: exam.currentVersion + 1,
    })
    .where(eq(exams.id, examId))
    .returning();

  return updated;
}
