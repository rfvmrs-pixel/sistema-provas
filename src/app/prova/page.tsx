"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExamRunner } from "@/components/exam/ExamRunner";

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
    };

export default function ProvaPage() {
  const [step, setStep] = useState<Step>({ kind: "login" });
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useCode, setUseCode] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((r) => r.json())
      .then((d) => setSectors(d.sectors ?? []));
  }, []);

  async function loadExams(): Promise<{ mode: Mode; exams: ExamListItem[] }> {
    const res = await fetch("/api/employee/exams");
    const data = await res.json();
    const list: ExamListItem[] = res.ok ? data.exams ?? [] : [];
    const mode: Mode = data.employee?.mode === "oficial" ? "oficial" : "simulado";
    setExams(list);
    return { mode, exams: list };
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          useCode
            ? { name, sectorId: Number(sectorId), code }
            : { name, sectorId: Number(sectorId), password },
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Falha ao entrar.");
        return;
      }
      const { mode, exams: list } = await loadExams();
      // Prova do dia: já vem travada em uma única prova, então pula direto
      // pra ela em vez de mostrar uma lista de 1 item.
      if (mode === "oficial" && list.length === 1) {
        await startExam(list[0].id, list[0].title, mode);
        return;
      }
      setStep({ kind: "list", employeeName: name, mode });
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
    const { mode } = await loadExams();
    setStep({ kind: "list", employeeName: name, mode });
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
                <label className="block text-sm font-medium text-slate-700">Nome completo</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required
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
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-700">
                    {useCode ? "Código da prova do dia" : "Senha"}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUseCode((v) => !v);
                      setPassword("");
                      setCode("");
                    }}
                    className="text-xs text-slate-500 underline"
                  >
                    {useCode ? "usar minha senha" : "tenho um código de prova do dia"}
                  </button>
                </div>
                {useCode ? (
                  <input
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="000000"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm tracking-widest focus:border-slate-500 focus:outline-none"
                    required
                  />
                ) : (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                    required
                  />
                )}
              </div>
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
            <h1 className="text-lg font-semibold text-slate-900">Olá, {step.employeeName.split(" ")[0]}</h1>
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
      </div>
    </div>
  );
}
