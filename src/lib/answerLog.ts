import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { answers, questions } from "@/db/schema";
import type { ReviewItem } from "@/components/exam/AttemptReview";

// Registro permanente de cada questão respondida (texto, alternativas,
// correta, marcada), gravado no momento em que a prova é finalizada.
//
// Por que existe: `answers` aponta pra `questions` com ON DELETE CASCADE, e
// regerar uma prova (manual ou depois de 3 tentativas — ver
// lib/regenerateExam.ts) apaga as questões antigas; aí as respostas de quem
// já fez a prova sumiam junto e não dava mais pra abrir a prova dessa
// pessoa. Aqui guardamos uma cópia que não depende das questões existirem.
//
// A tabela fica FORA do schema do Drizzle de propósito (criada pelo script
// src/scripts/ensure-answer-log.ts no start, com IF NOT EXISTS), pra não
// entrar na sequência de migrações do drizzle-kit.
export type LoggedAnswer = {
  questionId: number;
  position: number;
  text: string;
  options: unknown;
  correctKey: string;
  selectedKey: string | null;
  correct: boolean;
  topic: string | null;
  explanation: string | null;
};

export async function logAttemptAnswers(attemptId: number, rows: LoggedAnswer[]) {
  if (rows.length === 0) return;
  const values = rows.map(
    (r) =>
      sql`(${attemptId}, ${r.questionId}, ${r.position}, ${r.text}, ${JSON.stringify(r.options)}::jsonb, ${r.correctKey}, ${r.selectedKey}, ${r.correct}, ${r.topic}, ${r.explanation})`,
  );
  await db.execute(sql`
    INSERT INTO attempt_answer_log
      (attempt_id, question_id, position, question_text, options, correct_key, selected_key, correct, topic, explanation)
    VALUES ${sql.join(values, sql`, `)}
  `);
}

// Questões de uma tentativa finalizada, na ordem da prova. Usa o registro
// permanente; se a tentativa for anterior a ele e ainda não tiver sido
// copiada, cai nas tabelas originais (answers + questions).
export async function getAttemptReviewItems(attemptId: number, examId: number): Promise<ReviewItem[]> {
  const logged = await db.execute(sql`
    SELECT question_id, question_text, options, correct_key, selected_key, correct, topic, explanation
    FROM attempt_answer_log WHERE attempt_id = ${attemptId} ORDER BY position, id
  `);
  if (logged.rows.length > 0) {
    return logged.rows.map((r: Record<string, unknown>, i: number) => ({
      questionId: Number(r.question_id ?? -(i + 1)),
      text: String(r.question_text),
      options: (r.options as ReviewItem["options"]) ?? [],
      correctKey: String(r.correct_key),
      selectedKey: (r.selected_key as string | null) ?? null,
      correct: Boolean(r.correct),
      explanation: (r.explanation as string | null) ?? null,
      topic: (r.topic as string | null) ?? null,
    }));
  }
  const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId)).orderBy(asc(questions.order));
  const attemptAnswers = await db.select().from(answers).where(eq(answers.attemptId, attemptId));
  const byQuestion = new Map(attemptAnswers.map((a) => [a.questionId, a]));
  return examQuestions
    .filter((q) => byQuestion.has(q.id))
    .map((q) => {
      const a = byQuestion.get(q.id);
      return {
        questionId: q.id,
        text: q.text,
        options: q.options as ReviewItem["options"],
        correctKey: q.correctKey,
        selectedKey: a?.selectedKey ?? null,
        correct: a?.correct ?? false,
        explanation: q.explanation,
        topic: q.topic,
      };
    });
}
