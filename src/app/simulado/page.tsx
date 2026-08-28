"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { EXAM_TIME_LIMIT_MINUTES } from "@/lib/examTimer";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR";
type SimuladoExam = {
  id: number;
  title: string;
  summary: string | null;
  passingScore: number;
  documentType: DocumentType;
  questionCount: number;
};
type Question = { id: number; text: string; options: { key: string; text: string }[]; order: number };

type Step =
  | { kind: "form" }
  | { kind: "taking"; attemptId: number; examTitle: string; questions: Question[]; startedAt?: string };

// Simulado autosserviço: sem senha, sem cadastro prévio pelo gestor. O
// próprio colaborador informa nome, matrícula, Contrato e Função e, dentro do
// Contrato escolhido, escolhe livremente qual IT ou APR quer praticar — ver
// /api/public/roles, /api/public/simulado/exams e /api/public/simulado/start.
// Separado da tela clássica de "Fazer prova" (/prova), que exige senha
// pessoal (simulado com conta já cadastrada) ou código da prova do dia
// (oficial).
export default function SimuladoPage() {
  const [step, setStep] = useState<Step>({ kind: "form" });

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [exams, setExams] = useState<SimuladoExam[]>([]);

  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [roleId, setRoleId] = useState("");

  const [loadingRoles, setLoadingRoles] = useState(false);
  const [loadingExams, setLoadingExams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [startingExamId, setStartingExamId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((r) => r.json())
      .then((d) => setSectors(d.sectors ?? []));
  }, []);

  // Contrato mudou -> recarrega as Funções que têm prova disponível nesse
  // Contrato. Zerar Função/lista de provas já escolhidas acontece no próprio
  // handler de troca (handleSectorChange), não aqui — o efeito só busca dado.
  useEffect(() => {
    if (!sectorId) return;
    setLoadingRoles(true);
    fetch(`/api/public/roles?sectorId=${sectorId}`)
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []))
      .finally(() => setLoadingRoles(false));
  }, [sectorId]);

  // Função mudou -> recarrega as provas (IT/APR) disponíveis pra esse
  // Contrato+Função.
  useEffect(() => {
    if (!sectorId || !roleId) return;
    setLoadingExams(true);
    fetch(`/api/public/simulado/exams?sectorId=${sectorId}&roleId=${roleId}`)
      .then((r) => r.json())
      .then((d) => setExams(d.exams ?? []))
      .finally(() => setLoadingExams(false));
  }, [sectorId, roleId]);

  function handleSectorChange(value: string) {
    setSectorId(value);
    setRoleId("");
    setRoles([]);
    setExams([]);
  }

  function handleRoleChange(value: string) {
    setRoleId(value);
    setExams([]);
  }

  const canChooseExam = name.trim().length > 0 && matricula.trim().length > 0 && !!sectorId && !!roleId;

  async function startSimulado(examId: number) {
    setError(null);
    if (!name.trim() || !matricula.trim()) {
      setError("Preencha seu nome e matrícula antes de escolher a prova.");
      return;
    }
    setBusy(true);
    setStartingExamId(examId);
    try {
      const res = await fetch("/api/public/simulado/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          matricula: matricula.trim(),
          sectorId: Number(sectorId),
          roleId: Number(roleId),
          examId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível iniciar o simulado.");
        return;
      }
      setStep({
        kind: "taking",
        attemptId: data.attemptId,
        examTitle: data.examTitle,
        questions: data.questions,
        startedAt: data.startedAt,
      });
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setBusy(false);
      setStartingExamId(null);
    }
  }

  return (
    <div className="flex flex-1 justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-2xl">
        {step.kind === "form" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-lg font-semibold text-slate-900">Fazer um Simulado</h1>
              <p className="mt-1 text-sm text-slate-500">
                Treino livre, sem senha: informe seus dados, escolha o Contrato e a Função e depois
                selecione qual IT ou APR você quer praticar. Cada prova tem no máximo{" "}
                {EXAM_TIME_LIMIT_MINUTES} minutos para ser respondida.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Precisa aplicar uma prova oficial (com código ou link do gestor)?{" "}
                <Link href="/prova" className="underline hover:text-slate-600">
                  Fazer prova oficial
                </Link>
              </p>

              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  <label className="block text-sm font-medium text-slate-700">Contrato</label>
                  <select
                    value={sectorId}
                    onChange={(e) => handleSectorChange(e.target.value)}
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
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Função</label>
                  <select
                    value={roleId}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    disabled={!sectorId || loadingRoles}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    required
                  >
                    <option value="">
                      {!sectorId
                        ? "Escolha o Contrato primeiro..."
                        : loadingRoles
                          ? "Carregando..."
                          : roles.length === 0
                            ? "Nenhuma prova disponível nesse Contrato"
                            : "Selecione..."}
                    </option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {sectorId && roleId && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">Escolha o IT ou APR do simulado</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Provas disponíveis para esse Contrato e Função:
                </p>

                <div className="mt-4 space-y-3">
                  {loadingExams && <p className="text-sm text-slate-400">Carregando provas...</p>}
                  {!loadingExams && exams.length === 0 && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                      Nenhum IT/APR disponível para esse Contrato/Função no momento.
                    </p>
                  )}
                  {exams.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      disabled={busy}
                      onClick={() => startSimulado(ex.id)}
                      className="flex w-full items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm disabled:opacity-50"
                    >
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          {ex.title}{" "}
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              ex.documentType === "APR"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-sky-100 text-sky-700"
                            }`}
                          >
                            {ex.documentType}
                          </span>
                        </h3>
                        {ex.summary && <p className="mt-1 text-xs text-slate-500">{ex.summary}</p>}
                        <p className="mt-1 text-xs text-slate-400">{ex.questionCount} questões</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white">
                        {startingExamId === ex.id ? "Entrando..." : "Começar"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            {!canChooseExam && sectorId && roleId && (
              <p className="text-xs text-slate-400">
                Preencha seu nome e matrícula acima para poder começar uma prova.
              </p>
            )}
          </div>
        )}

        {step.kind === "taking" && (
          <ExamRunner
            attemptId={step.attemptId}
            examTitle={step.examTitle}
            questions={step.questions}
            mode="simulado"
            startedAt={step.startedAt}
          />
        )}
      </div>
    </div>
  );
}
