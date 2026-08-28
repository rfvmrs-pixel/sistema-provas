import { SignJWT, jwtVerify } from "jose";

// Token assinado (sem tocar no banco) que carrega o gabarito de um Quiz
// enquanto o colaborador está respondendo — assim o cliente nunca vê
// correctKey antes de terminar, mas também não precisamos criar
// funcionário/tentativa persistente pra um "quiz" avulso de 5 perguntas (que
// não é uma prova completa e não deve contar pra médias/relatórios/
// indicador de auditoria).
//
// As perguntas são geradas na hora pela IA a partir do PDF (Biblioteca) e
// NÃO são gravadas em nenhuma tabela — por isso o próprio token carrega o
// conjunto completo de perguntas (com correctKey e explanation embutidos),
// em vez de só ids que apontariam pra linhas em `questions`. Expira rápido:
// só cobre o tempo de responder.
const secretValue = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";
const secret = new TextEncoder().encode(secretValue);

export type QuizTokenQuestion = {
  id: number;
  text: string;
  options: { key: string; text: string }[];
  correctKey: string;
  explanation: string | null;
};

export type QuizTokenPayload = {
  documentId: number;
  examTitle: string;
  documentType: string;
  questions: QuizTokenQuestion[];
};

export async function signQuizToken(payload: QuizTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(secret);
}

export async function verifyQuizToken(token: string | undefined | null): Promise<QuizTokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as QuizTokenPayload;
  } catch {
    return null;
  }
}
