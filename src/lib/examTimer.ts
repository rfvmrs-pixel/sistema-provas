// Tempo máximo permitido por prova/simulado — ao zerar, a tela envia as
// respostas já marcadas automaticamente (ver ExamRunner). Um único lugar pra
// esse número, usado tanto na tela (contagem regressiva) quanto se algum dia
// precisar validar no servidor.
export const EXAM_TIME_LIMIT_MINUTES = 10;
export const EXAM_TIME_LIMIT_MS = EXAM_TIME_LIMIT_MINUTES * 60 * 1000;
