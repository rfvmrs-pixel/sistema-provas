"use client";

import { useEffect, useState } from "react";

type Sector = { id: number; name: string };
type ExamListItem = {
  id: number;
  title: string;
  summary: string | null;
  passingScore: number;
  questionCount: number;
  lastResult: { percentage: number | null; finishedAt: string | null } | null;
};
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

type Step =
  | { kind: "login" }
  | { kind: "list"; employeeName: string }
  | { kind: "taking"; attemptId: number; examTitle: string; questions: Question[] }
  | { kind: "result"; percentage: number; passed: boolean; passingScore: number; review: ReviewItem[] };

export default function ProvaPage() {
  const [step, setStep] = useState<Step>({ kind: "login" });
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [exams, setExams] = useState<ExamListItem[]>([]);
  const [answersMap, setAnswersMap] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((r) => r.json())
      .then((d) => setSectors(d.sectors ?? []));
  }, []);

  async function loadExams() {
    const res = await fetch("/api/employee/exams");
    const data = await res.json();
    if (res.ok) setExams(data.exams ?? []);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sectorId: Number(sectorId), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Falha ao entrar.");
        return;
      }
      await loadExams();
      setStep({ kind: "list", employeeName: name });
    } finally {
      setBusy(false);
    }
  }

  async function startExam(examId: number, examTitle: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/employee/exams/${examId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Não foi possível iniciar a prova.");
        return;
      }
      setAnswersMap({});
      setStep({
        kind: "taking",
        attemptId: data.attemptId,
        examTitle,
        questions: data.questions,
      });
    } finally {
      setBusy(false);
    }
  }

  async function submitExam() {
    if (step.kind !== "taking") return;
    const unanswered = step.questions.filter((q) => !answersMap[q.id]);
    if (unanswered.length > 0 && !confirm(`Você deixou ${unanswered.length} questão(ões) em branco. Enviar mesmo assim?`)) {
      return;
    }
    setBusy(true);
    try {
      const payload = {
        answers: step.questions.map((q) => ({
          questionId: q.id,
          selectedKey: answersMap[q.id] ?? null,
        })),
      };
      const res = await fetch(`/api/employee/attempts/${step.attemptId}/submit`, {
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

  async function backToList() {
    await loadExams();
    setStep((s) => (s.kind === "login" ? s : { kind: "list", employeeName: name }));
  }

  return (
    <div className="flex flex-1 justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-2xl">
        {step.kind === "login" && (
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
                <label className="block text-sm font-medium text-slate-700">Setor</label>
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
                <label className="block text-sm font-medium text-slate-700">Senha</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required
                />
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
                    <h2 className="text-sm font-semibold text-slate-900">{ex.title}</h2>
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
                    onClick={() => startExam(ex.id, ex.title)}
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
          <div className="space-y-5">
            <h1 className="text-lg font-semibold text-slate-900">{step.examTitle}</h1>
            {step.questions.map((q, idx) => (
              <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-medium text-slate-800">
                  {idx + 1}. {q.text}
                </p>
                <div className="mt-3 space-y-2">
                  {q.options.map((opt) => (
                    <label
                      key={opt.key}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        answersMap[q.id] === opt.key
                          ? "border-slate-900 bg-slate-50"
                          : "border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={answersMap[q.id] === opt.key}
                        onChange={() => setAnswersMap((m) => ({ ...m, [q.id]: opt.key }))}
                      />
                      <span>
                        {opt.key}) {opt.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button
              disabled={busy}
              onClick={submitExam}
              className="w-full rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Enviando..." : "Finalizar e enviar"}
            </button>
          </div>
        )}

        {step.kind === "result" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <p className="text-sm text-slate-500">Sua nota</p>
              <p
                className={`mt-1 text-4xl font-semibold ${
                  step.passed ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {step.percentage}%
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {step.passed
                  ? "Parabéns, você atingiu a nota mínima!"
                  : `Nota mínima exigida: ${step.passingScore}%. Recomendamos revisar o material.`}
              </p>
              <button
                onClick={backToList}
                className="mt-6 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Voltar para a lista de provas
              </button>
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
        )}
      </div>
    </div>
  );
}
