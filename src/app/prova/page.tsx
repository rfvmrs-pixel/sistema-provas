"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { AttemptReview, type ReviewItem } from "@/components/exam/AttemptReview";

type Sector = { id: number; name: string };
type DocumentType = "IT" | "APR" | "MANUAL";
type ExamListItem = {
  id: number;
  title: string;
  summary: string | null;
  passingScore: number;
  documentType: DocumentType;
  questionCount: number;
  lastResult: { percentage: number | null; finishedAt: string | null } | null;
};
type Option = { key: string; text: string };
type Question = { id: number; text: string; options: Option[]; order: number };

type Mode = "simulado" | "oficial";

// Item do histórico em "Minhas provas" — provas já finalizadas pelo
// colaborador, com nota, pra ele ver onde acertou/errou depois. Só faz
// sentido no modo "simulado" (login com senha pessoal); no modo "oficial" a
// sessão encerra assim que a prova termina.
type MyAttemptItem = {
  id: number;
  examTitle: string;
  finishedAt: string | null;
  percentage: number | null;
  mode: string;
  sessionLabel: string | null;
};
type MyAttemptDetail = {
  attempt: {
    id: number;
    examTitle: string;
    finishedAt: string | null;
    percentage: number | null;
    passingScore: number;
    passed?: boolean;
  };
  review: ReviewItem[];
};

type Step =
  | { kind: "login" }
  | { kind: "list"; employeeName: string; mode: Mode }
  | {
      kind: "taking";
      attemptId: number;
      examTitle: string;
      questions: Question[];
      mode: Mode;
      startedAt?: string;
    }
  | { kind: "myExams"; employeeName: string; mode: Mode; attempts: MyAttemptItem[]; loading: boolean }
  | { kind: "myExamDetail"; employeeName: string; mode: Mode; detail: MyAttemptDetail | null; loading: boolean };

export default function ProvaPage() {
  const [step, setStep] = useState<Step>({ kind: "login" });
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [matricula, setMatricula] = useState("");
  // "senha" (login pessoal) | "codigo" (código de uso único da prova do dia)
  // | "matricula" (acesso rápido só com nome + matrícula, sem senha).
  const [loginMethod, setLoginMethod] = useState<"senha" | "codigo" | "matricula">("senha");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((r) => r.json())
      .then((d) => setSectors(d.sectors ?? []));
    // ?mode=matricula pré-seleciona o acesso por matrícula — usado pelo cartão
    // "Minha área" da tela de abertura, que já leva direto pra esse método.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "matricula") setLoginMethod("matricula");
    }
  }, []);

  async function loadExams(): Promise<{ mode: Mode; exams: ExamListItem[]; employeeName: string }> {
    const res = await fetch("/api/employee/exams");
    const data = await res.json();
    const list: ExamListItem[] = res.ok ? data.exams ?? [] : [];
    const mode: Mode = data.employee?.mode === "oficial" ? "oficial" : "simulado";
    const employeeName: string = data.employee?.name || name;
    setExams(list);
    return { mode, exams: list, employeeName };
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setBusy(true);
    try {
      const payload =
        loginMethod === "codigo"
          ? { name, sectorId: Number(sectorId), code }
          : loginMethod === "matricula"
            ? { name, sectorId: Number(sectorId), matricula }
            : { name, sectorId: Number(sectorId), password };
      const res = await fetch("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Falha ao entrar.");
        return;
      }
      const { mode, exams: list, employeeName } = await loadExams();
      // Prova do dia: já vem travada em uma única prova, então pula direto
      // pra ela em vez de mostrar uma lista de 1 item.
      if (mode === "oficial" && list.length === 1) {
        await startExam(list[0].id, list[0].title, mode);
        return;
      }
      setStep({ kind: "list", employeeName, mode });
    } finally {
      setBusy(false);
    }
  }

  async function startExam(examId: number, examTitle: string, mode: Mode) {
    setBusy(true);
    try {
      const res = await fetch(`/api/employee/exams/${examId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Não foi possível iniciar a prova.");
        return;
      }
      setStep({
        kind: "taking",
        attemptId: data.attemptId,
        examTitle,
        questions: data.questions,
        mode,
        startedAt: data.startedAt,
      });
    } finally {
      setBusy(false);
    }
  }

  async function backToList() {
    const { mode, employeeName } = await loadExams();
    setStep({ kind: "list", employeeName, mode });
  }

  async function openMyExams(employeeName: string, mode: Mode) {
    setStep({ kind: "myExams", employeeName, mode, attempts: [], loading: true });
    const res = await fetch("/api/employee/attempts");
    const data = await res.json();
    setStep({
      kind: "myExams",
      employeeName,
      mode,
      attempts: res.ok ? data.attempts ?? [] : [],
      loading: false,
    });
  }

  async function openMyExamDetail(employeeName: string, mode: Mode, attemptId: number) {
    setStep({ kind: "myExamDetail", employeeName, mode, detail: null, loading: true });
    const res = await fetch(`/api/employee/attempts/${attemptId}`);
    const data = await res.json();
    setStep({
      kind: "myExamDetail",
      employeeName,
      mode,
      detail: res.ok ? data : null,
      loading: false,
    });
  }

  return (
    <div className="flex flex-1 justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-2xl">
        {step.kind === "login" && (
          <div className="space-y-5">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Voltar ao menu
            </Link>
            <form
              onSubmit={handleLogin}
              className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
            >
              <h1 className="text-lg font-semibold text-slate-900">Fazer prova</h1>
            <p className="mt-1 text-sm text-slate-500">Informe seus dados para começar.</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Nome completo {loginMethod === "matricula" && <span className="font-normal text-slate-400">(opcional)</span>}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required={loginMethod !== "matricula"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Contrato</label>
                <select
                  value={sectorId}
                  onChange={(e) => setSectorId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
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
              <div>
                <label className="block text-sm font-medium text-slate-700">Como você vai entrar?</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      { value: "senha", label: "Minha senha" },
                      { value: "matricula", label: "Nome + matrícula" },
                      { value: "codigo", label: "Código da prova do dia" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setLoginMethod(opt.value);
                        setPassword("");
                        setCode("");
                        setMatricula("");
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        loginMethod === opt.value
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {loginMethod === "matricula" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Matrícula</label>
                  <input
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    placeholder="Sua matrícula"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    required
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Sem senha — dá pra ver suas provas já feitas, praticar e fazer prova oficial.
                  </p>
                </div>
              )}
              {loginMethod === "codigo" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Código da prova do dia</label>
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-slate-500 focus:outline-none"
                    required
                  />
                </div>
              )}
              {loginMethod === "senha" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    required
                  />
                </div>
              )}
            </div>

            {loginError && <p className="mt-4 text-sm text-red-600">{loginError}</p>}

            <button
              disabled={busy}
              className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Entrando..." : "Entrar"}
            </button>
            </form>
          </div>
        )}

        {step.kind === "list" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-slate-900">Olá, {step.employeeName.split(" ")[0]}</h1>
              {step.mode === "simulado" && (
                <button
                  onClick={() => openMyExams(step.employeeName, step.mode)}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Minhas provas
                </button>
              )}
            </div>
            <p className="text-sm text-slate-500">Provas disponíveis:</p>
            {exams.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
                Nenhuma prova disponível no momento.
              </p>
            )}
            {exams.map((ex) => (
              <div key={ex.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      {ex.title}{" "}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          ex.documentType === "APR"
                            ? "bg-amber-100 text-amber-700"
                            : ex.documentType === "MANUAL"
                              ? "bg-violet-100 text-violet-700"
                              : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {ex.documentType}
                      </span>
                    </h2>
                    {ex.summary && <p className="mt-1 text-xs text-slate-500">{ex.summary}</p>}
                    <p className="mt-1 text-xs text-slate-400">{ex.questionCount} questões</p>
                    {ex.lastResult?.finishedAt && (
                      <p className="mt-1 text-xs text-slate-500">
                        Última tentativa: {ex.lastResult.percentage}%
                      </p>
                    )}
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => startExam(ex.id, ex.title, step.mode)}
                    className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {ex.lastResult?.finishedAt ? "Refazer" : "Começar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {step.kind === "taking" && (
          <ExamRunner
            attemptId={step.attemptId}
            examTitle={step.examTitle}
            questions={step.questions}
            mode={step.mode}
            startedAt={step.startedAt}
            onExit={backToList}
          />
        )}

        {step.kind === "myExams" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-slate-900">Minhas provas</h1>
              <button
                onClick={() => setStep({ kind: "list", employeeName: step.employeeName, mode: step.mode })}
                className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                ← voltar
              </button>
            </div>
            <p className="text-sm text-slate-500">
              Provas que você já respondeu — clique numa delas pra ver onde acertou e errou.
            </p>
            {step.loading && <p className="text-sm text-slate-400">Carregando...</p>}
            {!step.loading && step.attempts.length === 0 && (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
                Você ainda não finalizou nenhuma prova.
              </p>
            )}
            {!step.loading &&
              step.attempts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => openMyExamDetail(step.employeeName, step.mode, a.id)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left hover:border-slate-300 hover:shadow-sm"
                >
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{a.examTitle}</h2>
                    <p className="mt-1 text-xs text-slate-400">
                      {a.finishedAt ? new Date(a.finishedAt).toLocaleString("pt-BR") : "-"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                      (a.percentage ?? 0) >= 70
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {a.percentage ?? 0}%
                  </span>
                </button>
              ))}
          </div>
        )}

        {step.kind === "myExamDetail" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-slate-900">
                {step.detail?.attempt.examTitle ?? "Prova"}
              </h1>
              <button
                onClick={() => openMyExams(step.employeeName, step.mode)}
                className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                ← voltar
              </button>
            </div>
            {step.loading && <p className="text-sm text-slate-400">Carregando...</p>}
            {!step.loading && !step.detail && (
              <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
                Não foi possível carregar essa prova.
              </p>
            )}
            {!step.loading && step.detail && (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
                  <p className="text-sm text-slate-500">Sua nota</p>
                  <p
                    className={`mt-1 text-3xl font-semibold ${
                      (step.detail.attempt.percentage ?? 0) >= step.detail.attempt.passingScore
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {step.detail.attempt.percentage ?? 0}%
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {step.detail.attempt.finishedAt
                      ? new Date(step.detail.attempt.finishedAt).toLocaleString("pt-BR")
                      : ""}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <h2 className="text-sm font-semibold text-slate-900">Revisão</h2>
                  <div className="mt-3">
                    <AttemptReview items={step.detail.review} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
