"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

type Sector = { id: number; name: string };
// Cada item aqui é um IT/APR da Biblioteca (não uma prova pré-cadastrada) —
// o Quiz gera as 5 perguntas na hora, via IA, direto do PDF, então todo
// IT/APR do Contrato aparece aqui, para qualquer Função.
type QuizExam = {
  id: number;
  title: string;
  documentType: string;
};
type QuizOption = { key: string; text: string };
type QuizQuestion = { id: number; text: string; options: QuizOption[] };
type GradedQuestion = {
  questionId: number;
  text: string;
  options: QuizOption[];
  selectedKey: string | null;
  correctKey: string;
  correct: boolean;
  explanation: string | null;
};
type GradeResult = {
  examTitle: string;
  documentType: string;
  score: number;
  total: number;
  percentage: number;
  perQuestion: GradedQuestion[];
};

type QuizSession = { name: string; matricula: string; sectorId: number; sectorName: string };

type Step =
  | { kind: "form" }
  | { kind: "pick" }
  | { kind: "quiz"; documentId: number; token: string; examTitle: string; documentType: string; questions: QuizQuestion[]; secondsPerQuestion: number }
  | { kind: "result"; documentId: number; examTitle: string; data: GradeResult };

function DocBadge({ documentType }: { documentType: string }) {
  const isApr = documentType === "APR";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
        isApr ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"
      }`}
    >
      {isApr ? "APR" : "IT"}
    </span>
  );
}

function ScoreRing({ percentage }: { percentage: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const color = percentage >= 70 ? "#10b981" : percentage >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold text-slate-900">{percentage}%</span>
      </div>
    </div>
  );
}

export default function QuizzesPage() {
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [session, setSession] = useState<QuizSession | null>(null);

  // ---- Passo 1: form (nome, matrícula opcional, setor) ----
  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [sectors, setSectors] = useState<Sector[]>([]);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((res) => res.json())
      .then((data) => setSectors(data.sectors ?? []));
  }, []);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sector = sectors.find((s) => s.id === Number(sectorId));
    if (!sector) return;
    setSession({ name: name.trim(), matricula: matricula.trim(), sectorId: sector.id, sectorName: sector.name });
    setDocFilter("IT");
    setStep({ kind: "pick" });
  }

  // ---- Passo 2: escolher IT/APR ----
  const [exams, setExams] = useState<QuizExam[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState<string | null>(null);
  const [starting, setStarting] = useState<number | null>(null);
  // Filtro 1 (IT ou APR) — o filtro 2 é a lista de cartões abaixo, já
  // restrita ao tipo escolhido aqui.
  const [docFilter, setDocFilter] = useState<"IT" | "APR">("IT");

  useEffect(() => {
    if (step.kind !== "pick" || !session) return;
    let cancelled = false;
    async function loadExams() {
      setExamsLoading(true);
      setExamsError(null);
      try {
        const res = await fetch(`/api/public/quizzes/exams?sectorId=${session!.sectorId}`);
        const data = await res.json();
        if (!cancelled) setExams(data.exams ?? []);
      } catch {
        if (!cancelled) setExamsError("Não consegui carregar os IT/APR desse Contrato.");
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    }
    loadExams();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, session?.sectorId]);

  // Se o filtro atual (IT ou APR) não tem nenhuma prova nesse Contrato mas o
  // outro tipo tem, troca o filtro automaticamente pra não mostrar uma lista
  // vazia por padrão.
  useEffect(() => {
    function pickDefaultFilter() {
      if (examsLoading || exams.length === 0) return;
      const hasCurrent = exams.some((e) => e.documentType === docFilter);
      if (hasCurrent) return;
      const other = exams.find((e) => e.documentType !== docFilter);
      if (other) setDocFilter(other.documentType === "APR" ? "APR" : "IT");
    }
    pickDefaultFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examsLoading, exams]);

  const filteredExams = exams.filter((e) => e.documentType === docFilter);
  const availableDocTypes = Array.from(new Set(exams.map((e) => e.documentType)));

  async function pickExam(exam: QuizExam) {
    if (!session) return;
    setStarting(exam.id);
    try {
      const res = await fetch("/api/public/quizzes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: session.sectorId, documentId: exam.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExamsError(data.error || "Não consegui iniciar o quiz.");
        return;
      }
      setStep({
        kind: "quiz",
        documentId: data.documentId,
        token: data.token,
        examTitle: data.examTitle,
        documentType: data.documentType,
        questions: data.questions,
        secondsPerQuestion: data.secondsPerQuestion,
      });
    } catch {
      setExamsError("Erro de conexão ao iniciar o quiz.");
    } finally {
      setStarting(null);
    }
  }

  // ---- Passo 3: respondendo o quiz ----
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string | null>>({});
  const [remainingMs, setRemainingMs] = useState(0);
  const [grading, setGrading] = useState(false);
  const advanceRef = useRef<() => void>(() => {});
  const autoAdvancedIndexRef = useRef<number>(-1);

  const currentQuestion = step.kind === "quiz" ? step.questions[currentIndex] : null;

  async function finishQuiz(finalAnswers: Record<number, string | null>) {
    if (step.kind !== "quiz") return;
    setGrading(true);
    try {
      const res = await fetch("/api/public/quizzes/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: step.token, answers: finalAnswers }),
      });
      const data: GradeResult = await res.json();
      setStep({ kind: "result", documentId: step.documentId, examTitle: step.examTitle, data });
    } catch {
      // volta pro quiz se der erro de conexão; usuário pode tentar de novo
      setGrading(false);
    }
  }

  function goToIndexOrFinish(nextIndex: number, finalAnswers: Record<number, string | null>) {
    if (step.kind !== "quiz") return;
    if (nextIndex >= step.questions.length) {
      finishQuiz(finalAnswers);
    } else {
      setCurrentIndex(nextIndex);
    }
  }

  function selectOption(key: string) {
    if (!currentQuestion) return;
    setAnswers((prev) => ({ ...prev, [currentQuestion.id]: key }));
  }

  function handleNext() {
    goToIndexOrFinish(currentIndex + 1, answers);
  }

  // Mantém a função de auto-avanço sempre atualizada (lida em efeito, não em
  // render) — mesmo padrão usado no ExamRunner pro cronômetro da prova.
  useEffect(() => {
    advanceRef.current = () => {
      goToIndexOrFinish(currentIndex + 1, answers);
    };
  });

  // Cronômetro de 90s por pergunta — reinicia a cada troca de pergunta.
  useEffect(() => {
    if (step.kind !== "quiz") return;
    const totalMs = step.secondsPerQuestion * 1000;
    const deadline = Date.now() + totalMs;
    const tick = () => {
      const left = deadline - Date.now();
      setRemainingMs(Math.max(0, left));
      if (left <= 0 && autoAdvancedIndexRef.current !== currentIndex) {
        autoAdvancedIndexRef.current = currentIndex;
        advanceRef.current();
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, currentIndex]);

  function backToPick() {
    setCurrentIndex(0);
    setAnswers({});
    autoAdvancedIndexRef.current = -1;
    setComicImages(null);
    setComicSelected(null);
    setComicFeedback(null);
    setStep({ kind: "pick" });
  }

  // ---- Quadrinho de segurança (opcional, só aparece se a prova tiver um) ----
  const [comicImages, setComicImages] = useState<string[] | null>(null);
  const [comicSelected, setComicSelected] = useState<number | null>(null);
  const [comicFeedback, setComicFeedback] = useState<{ correct: boolean; correctIndex: number; explanation: string | null } | null>(null);
  const [comicChecking, setComicChecking] = useState(false);

  useEffect(() => {
    if (step.kind !== "result") return;
    let cancelled = false;
    async function loadComic() {
      if (step.kind !== "result") return;
      try {
        const res = await fetch(`/api/public/quizzes/comic?documentId=${step.documentId}`);
        const data = await res.json();
        if (!cancelled) setComicImages(data.hasComic ? data.images : null);
      } catch {
        if (!cancelled) setComicImages(null);
      }
    }
    loadComic();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.kind, step.kind === "result" ? step.documentId : null]);

  async function checkComicAnswer(index: number) {
    if (step.kind !== "result" || comicFeedback) return;
    setComicSelected(index);
    setComicChecking(true);
    try {
      const res = await fetch("/api/public/quizzes/comic/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: step.documentId, selectedIndex: index }),
      });
      const data = await res.json();
      if (res.ok) setComicFeedback(data);
    } finally {
      setComicChecking(false);
    }
  }

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const timerPct = step.kind === "quiz" ? Math.max(0, Math.min(100, (remainingMs / (step.secondsPerQuestion * 1000)) * 100)) : 100;
  const timerColor = timerPct > 50 ? "#10b981" : timerPct > 20 ? "#f59e0b" : "#ef4444";

  return (
    <div className="min-h-full bg-gradient-to-br from-indigo-50 via-white to-sky-50">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 py-8 sm:px-6">
        {step.kind === "form" && (
          <>
            <Link
              href="/"
              className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
              </svg>
              Voltar ao menu
            </Link>

            <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
              <div className="relative h-40 w-full overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500">
                <Image
                  src="/quizzes/quizzes-card.jpg"
                  alt=""
                  fill
                  className="object-cover opacity-40 mix-blend-overlay"
                  priority
                />
                <div className="relative flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                  <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                    Triunfo Skill
                  </span>
                  <h1 className="text-2xl font-bold text-white sm:text-3xl">Quizzes</h1>
                  <p className="max-w-md text-sm text-indigo-50">
                    5 perguntas rápidas, 90 segundos cada — pratique um IT ou APR de forma leve e
                    divertida.
                  </p>
                </div>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-4 p-6 sm:p-8">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Nome</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Matrícula (opcional)</label>
                  <input
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Contrato</label>
                  <select
                    value={sectorId}
                    onChange={(e) => setSectorId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    required
                  >
                    <option value="">Selecione...</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500"
                >
                  Continuar
                </button>
              </form>
            </div>
          </>
        )}

        {step.kind === "pick" && session && (
          <div className="flex flex-1 flex-col">
            <button
              type="button"
              onClick={() => setStep({ kind: "form" })}
              className="mb-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              ← voltar
            </button>
            <h1 className="text-xl font-semibold text-slate-900">Escolha o IT ou APR</h1>
            <p className="mt-1 text-sm text-slate-500">
              Contrato: <strong className="text-slate-700">{session.sectorName}</strong> — 5 perguntas
              aleatórias, 90s cada.
            </p>

            {examsError && <p className="mt-4 text-sm text-red-600">{examsError}</p>}

            {!examsLoading && exams.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-medium text-slate-500">Tipo de documento</p>
                <div className="mt-1.5 inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                  {(["IT", "APR"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDocFilter(type)}
                      disabled={!availableDocTypes.includes(type)}
                      className={`rounded-md px-4 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        docFilter === type ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {examsLoading ? (
                <p className="text-sm text-slate-400">Carregando...</p>
              ) : exams.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nenhum IT/APR cadastrado na Biblioteca para esse Contrato ainda.
                </p>
              ) : filteredExams.length === 0 ? (
                <p className="text-sm text-slate-400">
                  Nenhum {docFilter} disponível para esse Contrato ainda.
                </p>
              ) : (
                filteredExams.map((exam) => (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => pickExam(exam)}
                    disabled={starting !== null}
                    className="group flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md disabled:opacity-60"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <DocBadge documentType={exam.documentType} />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{exam.title}</p>
                    <span className="mt-1 text-xs font-medium text-indigo-600 group-hover:text-indigo-700">
                      {starting === exam.id ? "Gerando perguntas..." : "Começar quiz →"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step.kind === "quiz" && currentQuestion && (
          <div className="flex flex-1 flex-col">
            <div className="mb-4 flex items-center justify-between">
              <DocBadge documentType={step.documentType} />
              <span className="text-xs font-medium text-slate-500">
                Pergunta {currentIndex + 1} de {step.questions.length}
              </span>
            </div>

            <div className="mb-1 flex gap-1.5">
              {step.questions.map((q, i) => (
                <div
                  key={q.id}
                  className={`h-1.5 flex-1 rounded-full ${
                    i < currentIndex ? "bg-indigo-500" : i === currentIndex ? "bg-indigo-300" : "bg-slate-200"
                  }`}
                />
              ))}
            </div>

            <div className="mt-4 overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-3">
                <p className="text-xs font-medium text-slate-400">{step.examTitle}</p>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${timerPct}%`, backgroundColor: timerColor }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-semibold tabular-nums" style={{ color: timerColor }}>
                    {secondsLeft}s
                  </span>
                </div>
              </div>

              <div className="p-6 sm:p-8">
                <p className="text-lg font-semibold text-slate-900">{currentQuestion.text}</p>

                <div className="mt-5 space-y-2.5">
                  {currentQuestion.options.map((opt) => {
                    const selected = answers[currentQuestion.id] === opt.key;
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => selectOption(opt.key)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                          selected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            selected ? "bg-indigo-600 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"
                          }`}
                        >
                          {opt.key}
                        </span>
                        {opt.text}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={grading}
                  className="mt-6 w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
                >
                  {grading
                    ? "Calculando resultado..."
                    : currentIndex + 1 === step.questions.length
                      ? "Ver resultado"
                      : "Próxima pergunta →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {step.kind === "result" && (
          <div className="flex flex-1 flex-col items-center">
            <div className="w-full overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-sm">
              <div className="flex flex-col items-center gap-3 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 px-6 py-8 text-center">
                <span className="text-sm font-medium text-indigo-50">
                  {session?.name ? `Mandou bem, ${session.name}!` : "Quiz concluído!"}
                </span>
                <ScoreRing percentage={step.data.percentage} />
                <p className="text-sm text-indigo-50">
                  {step.data.score} de {step.data.total} corretas — {step.examTitle}
                </p>
              </div>

              <div className="divide-y divide-slate-100">
                {step.data.perQuestion.map((q, i) => (
                  <div key={q.questionId} className="p-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                          q.correct ? "bg-emerald-500" : "bg-red-500"
                        }`}
                      >
                        {q.correct ? "✓" : "✕"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {i + 1}. {q.text}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {q.selectedKey ? (
                            <>
                              Sua resposta: <strong>{q.selectedKey}</strong>
                              {!q.correct && (
                                <>
                                  {" "}
                                  · Correta: <strong className="text-emerald-700">{q.correctKey}</strong>
                                </>
                              )}
                            </>
                          ) : (
                            <>
                              Não respondida (tempo esgotado) · Correta:{" "}
                              <strong className="text-emerald-700">{q.correctKey}</strong>
                            </>
                          )}
                        </p>
                        {q.explanation && <p className="mt-1.5 text-xs text-slate-400">{q.explanation}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {comicImages && comicImages.length === 4 && (
              <div className="mt-5 w-full overflow-hidden rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-sm font-semibold text-slate-900">Quadrinho de segurança</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Qual das 4 imagens mostra a forma correta de executar essa atividade?
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {comicImages.map((src, i) => {
                    const isSelected = comicSelected === i;
                    const isCorrectReveal = comicFeedback && i === comicFeedback.correctIndex;
                    const isWrongPick = comicFeedback && isSelected && !comicFeedback.correct;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => checkComicAnswer(i)}
                        disabled={comicChecking || !!comicFeedback}
                        className={`overflow-hidden rounded-xl border-2 transition ${
                          isCorrectReveal
                            ? "border-emerald-500"
                            : isWrongPick
                              ? "border-red-500"
                              : isSelected
                                ? "border-indigo-400"
                                : "border-transparent hover:border-indigo-200"
                        } disabled:cursor-default`}
                      >
                        <img src={src} alt={`Opção ${i + 1}`} className="aspect-square w-full object-cover" />
                      </button>
                    );
                  })}
                </div>
                {comicFeedback && (
                  <p className={`mt-3 text-sm font-medium ${comicFeedback.correct ? "text-emerald-700" : "text-red-600"}`}>
                    {comicFeedback.correct ? "Isso mesmo! " : "Não é essa. "}
                    {comicFeedback.explanation}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex w-full flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={backToPick}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Fazer outro quiz
              </button>
              <Link
                href="/"
                className="flex-1 rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white hover:bg-slate-700"
              >
                Voltar ao menu
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
