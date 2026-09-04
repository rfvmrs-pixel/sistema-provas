"use client";

import { useEffect, useState, use as usePromise } from "react";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { TENURE_OPTIONS } from "@/lib/tenure";

type Option = { key: string; text: string };
type Question = { id: number; text: string; options: Option[]; order: number };

type LinkInfo = {
  examTitle: string;
  sectorName: string;
  roleName: string;
  kind: "geral" | "direcionada" | "curso" | "simulado";
  valid: boolean;
};

type Step =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "form" }
  | { kind: "taking"; attemptId: number; examTitle: string; questions: Question[]; startedAt?: string };

// Autocadastro por link: sem senha, sem cadastro prévio (a não ser que a
// prova seja direcionada a alguém específico, que já foi criado quando o
// gestor gerou o link). Contrato e Função vêm fixos da prova — o colaborador
// só preenche nome, matrícula e tempo de empresa.
export default function ExamLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [info, setInfo] = useState<LinkInfo | null>(null);

  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [tempoDeEmpresa, setTempoDeEmpresa] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/public/exam-links/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.valid) {
          setStep({ kind: "invalid", message: data.error || "Essa prova não está mais disponível." });
          return;
        }
        setInfo(data);
        setStep({ kind: "form" });
      })
      .catch(() => setStep({ kind: "invalid", message: "Não foi possível carregar esse link." }));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/public/exam-links/${token}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, matricula, tempoDeEmpresa }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Não foi possível iniciar a prova.");
        return;
      }
      setStep({
        kind: "taking",
        attemptId: data.attemptId,
        examTitle: data.examTitle,
        questions: data.questions,
        startedAt: data.startedAt,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-2xl">
        {step.kind === "loading" && <p className="text-sm text-slate-400">Carregando...</p>}

        {step.kind === "invalid" && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-red-600">{step.message}</p>
          </div>
        )}

        {step.kind === "form" && info && (
          <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-900">{info.examTitle}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {info.kind === "direcionada"
                ? "Essa prova é direcionada a você. Confirme seus dados pra começar."
                : info.kind === "curso"
                  ? "Prova de curso/formação. Preencha seus dados pra começar."
                  : info.kind === "simulado"
                    ? "Simulado oficial aplicado pelo gestor. Preencha seus dados pra começar."
                    : "Preencha seus dados pra começar a prova."}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-500">Contrato</label>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {info.sectorName}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Função</label>
                <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {info.roleName}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Nome completo</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Matrícula</label>
                <input
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Tempo de empresa</label>
                <select
                  value={tempoDeEmpresa}
                  onChange={(e) => setTempoDeEmpresa(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  required
                >
                  <option value="">Selecione...</option>
                  {TENURE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formError && <p className="mt-4 text-sm text-red-600">{formError}</p>}

            <button
              disabled={busy}
              className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? "Entrando..." : "Começar prova"}
            </button>
          </form>
        )}

        {step.kind === "taking" && (
          <ExamRunner
            attemptId={step.attemptId}
            examTitle={step.examTitle}
            questions={step.questions}
            mode="oficial"
            startedAt={step.startedAt}
          />
        )}
      </div>
    </div>
  );
}
