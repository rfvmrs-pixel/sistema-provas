"use client";

import { useEffect, useRef, useState } from "react";
import { EXAM_TIME_LIMIT_MINUTES, EXAM_TIME_LIMIT_MS } from "@/lib/examTimer";

type Option = { key: string; text: string };
type Question = { id: number; text: string; options: Option[]; order: number };
type ReviewItem = {
  questionId: number;
  text: string;
  options: Option[];
  correctKey: string;
  selectedKey: string | null;
  correct: boolean;
  explanation: string | null;
  topic: string | null;
};

type Mode = "simulado" | "oficial";

type RunnerStep =
  | { kind: "taking" }
  | { kind: "result"; percentage: number; passed: boolean; passingScore: number; review: ReviewItem[] };

type ExamRunnerProps = {
  attemptId: number;
  examTitle: string;
  questions: Question[];
  mode: Mode;
  // Quando a prova começou (attempts.startedAt, vindo do servidor) — usada
  // pra calcular o prazo de 10 minutos. Se não vier, a contagem começa do
  // momento em que essa tela monta (fallback, não devia acontecer em uso
  // normal já que todas as rotas de início devolvem esse campo).
  startedAt?: string;
  // Só faz sentido em modo "simulado" (praticar livremente, com login
  // pessoal) — deixa voltar pra lista de provas depois do resultado. Em modo
  // "oficial" (prova do dia / link geral / link direcionado) a sessão já se
  // encerra sozinha ao finalizar, então não tem "lista" pra voltar.
  onExit?: () => void;
};

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Tela de responder a prova (de marcar, uma caixinha por alternativa) +
// resultado — usada tanto pelo login clássico (senha/código) em /prova
// quanto pelo autocadastro por link em /prova/link/[token] e pelo Simulado
// autosserviço em /simulado, então o comportamento (marcar, finalizar, nota,
// sem editar depois, cronômetro de 10 minutos) fica idêntico nos três casos.
export function ExamRunner({ attemptId, examTitle, questions, mode, startedAt, onExit }: ExamRunnerProps) {
  const [step, setStep] = useState<RunnerStep>({ kind: "taking" });
  const [answersMap, setAnswersMap] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  // Prazo (timestamp absoluto) calculado dentro do efeito abaixo, não durante
  // o render — Date.now() é impuro, então só pode rodar em efeito/callback.
  // Até o efeito rodar, remainingMs começa no valor cheio (10:00) como
  // placeholder puro; a primeira execução do tick() já corrige isso.
  const [remainingMs, setRemainingMs] = useState(EXAM_TIME_LIMIT_MS);
  const autoSubmittedRef = useRef(false);
  const submitRef = useRef<() => void>(() => {});

  async function submitExam(reason?: "timeout") {
    const unanswered = questions.filter((q) => !answersMap[q.id]);
    if (
      reason !== "timeout" &&
      unanswered.length > 0 &&
      !confirm(`Você deixou ${unanswered.length} questão(ões) em branco. Enviar mesmo assim?`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const payload = {
        answers: questions.map((q) => ({
          questionId: q.id,
          selectedKey: answersMap[q.id] ?? null,
        })),
      };
      const res = await fetch(`/api/employee/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Falha ao enviar a prova.");
        return;
      }
      setStep({
        kind: "result",
        percentage: data.attempt.percentage,
        passed: !!data.passed,
        passingScore: data.passingScore ?? 70,
        review: data.review,
      });
    } finally {
      setBusy(false);
    }
  }

  // Mantém submitRef sempre apontando pro submitExam mais recente (que fecha
  // sobre answersMap/attemptId atuais), sem precisar listar submitExam como
  // dependência do efeito do cronômetro abaixo. Atribuição de ref só pode
  // acontecer em efeito/callback, nunca durante o render.
  useEffect(() => {
    submitRef.current = () => {
      submitExam("timeout");
    };
  });

  // Cronômetro de 10 minutos: contagem regressiva a partir de attempts.startedAt
  // (vindo do servidor, não do momento em que a tela montou — assim um F5 no
  // meio da prova não reseta o prazo). Ao zerar, envia automaticamente as
  // respostas já marcadas, mesmo com questões em branco. O prazo (que depende
  // do relógio) só é calculado aqui dentro, nunca durante o render.
  useEffect(() => {
    if (step.kind !== "taking") return;
    const deadline = (startedAt ? new Date(startedAt).getTime() : Date.now()) + EXAM_TIME_LIMIT_MS;
    const tick = () => {
      const left = deadline - Date.now();
      setRemainingMs(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        submitRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [step.kind, startedAt]);

  if (step.kind === "taking") {
    const timeIsUp = remainingMs <= 0;
    const lowTime = remainingMs <= 60_000;
    return (
      <div className="space-y-5">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{examTitle}</h1>
            <p className="text-xs text-slate-400">Tempo máximo: {EXAM_TIME_LIMIT_MINUTES} minutos</p>
          </div>
          <div
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums ${
              timeIsUp
                ? "bg-red-100 text-red-700"
                : lowTime
                  ? "animate-pulse bg-red-100 text-red-700"
                  : "bg-slate-100 text-slate-700"
            }`}
            aria-live="polite"
          >
            {timeIsUp ? "Enviando..." : formatClock(remainingMs)}
          </div>
        </div>
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-800">
              {idx + 1}. {q.text}
            </p>
            <div className="mt-3 space-y-2">
              {q.options.map((opt) => {
                const selected = answersMap[q.id] === opt.key;
                return (
                  <label
                    key={opt.key}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-3 text-sm ${
                      selected ? "border-slate-900 bg-slate-50" : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q-${q.id}`}
                      checked={selected}
                      onChange={() => setAnswersMap((m) => ({ ...m, [q.id]: opt.key }))}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                        selected ? "border-slate-900 bg-slate-900" : "border-slate-300 bg-white"
                      }`}
                    >
                      {selected && (
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
                          <path
                            d="M3 8.5l3 3 7-7"
                            stroke="white"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span>
                      {opt.key}) {opt.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <button
          disabled={busy || timeIsUp}
          onClick={() => submitExam()}
          className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy || timeIsUp ? "Enviando..." : "Finalizar e enviar"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">Sua nota</p>
        <p className={`mt-1 text-4xl font-semibold ${step.passed ? "text-emerald-600" : "text-red-600"}`}>
          {step.percentage}%
        </p>
        <p className="mt-2 text-sm text-slate-500">
          {step.passed
            ? "Parabéns, você atingiu a nota mínima!"
            : `Nota mínima exigida: ${step.passingScore}%. Recomendamos revisar o material.`}
        </p>
        {mode === "oficial" ? (
          <p className="mt-6 text-sm text-slate-500">
            Prova concluída. O resultado foi registrado para o seu gestor — pode fechar esta
            janela.
          </p>
        ) : (
          onExit && (
            <button
              onClick={onExit}
              className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Voltar para a lista de provas
            </button>
          )
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Revisão</h2>
        <ol className="mt-3 space-y-4">
          {step.review.map((r, idx) => (
            <li key={r.questionId} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
              <p className="text-sm font-medium text-slate-800">
                {idx + 1}. {r.text}
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {r.options.map((opt) => {
                  const isCorrect = opt.key === r.correctKey;
                  const isSelected = opt.key === r.selectedKey;
                  return (
                    <li
                      key={opt.key}
                      className={
                        isCorrect
                          ? "font-medium text-emerald-700"
                          : isSelected
                            ? "font-medium text-red-600"
                            : "text-slate-500"
                      }
                    >
                      {opt.key}) {opt.text}
                      {isCorrect && " ✓"}
                      {isSelected && !isCorrect && " (sua resposta)"}
                    </li>
                  );
                })}
              </ul>
              {r.explanation && <p className="mt-1 text-xs text-slate-400">{r.explanation}</p>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
