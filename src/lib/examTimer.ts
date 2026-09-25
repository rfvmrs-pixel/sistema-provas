// Tempo máximo permitido por prova/simulado — ao zerar, a tela envia as
// respostas já marcadas automaticamente (ver ExamRunner). Um único lugar pra
// essa regra, usado tanto na tela (contagem regressiva) quanto se algum dia
// precisar validar no servidor.
//
// Regra: 15 minutos a cada 10 perguntas (1,5 min por pergunta), nunca menos
// que 15 minutos — ex.: 10 perguntas = 15 min, 15 = 23 min, 20 = 30 min.
export const MINUTES_PER_10_QUESTIONS = 15;

export function examTimeLimitMinutes(numQuestions: number): number {
  const n = Number.isFinite(numQuestions) && numQuestions > 0 ? numQuestions : 10;
  return Math.max(MINUTES_PER_10_QUESTIONS, Math.ceil((n * MINUTES_PER_10_QUESTIONS) / 10));
}

export function examTimeLimitMs(numQuestions: number): number {
  return examTimeLimitMinutes(numQuestions) * 60 * 1000;
}
