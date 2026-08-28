"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExamRunner } from "@/components/exam/ExamRunner";
import { EXAM_TIME_LIMIT_MINUTES } from "@/lib/examTimer";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR";
// Cada item aqui é um IT/APR da Biblioteca (não uma prova pré-cadastrada) —
// o Simulado gera as 10 perguntas na hora, via IA, direto do PDF, então todo
// IT/APR do Contrato aparece aqui, para qualquer Função.
type SimuladoExam = {
  id: number;
  title: string;
  documentType: DocumentType;
};
type Question = { id: number; text: string; options: { key: string; text: string }[]; order: number };
type ComicFeedback = { correct: boolean; correctIndex: number; explanation: string | null };

type Step =
  | { kind: "form" }
  | {
      kind: "taking";
      attemptId: number;
      examTitle: string;
      documentId: number;
      questions: Question[];
      startedAt?: string;
    };

// Quadrinho de segurança (opcional) — só aparece na tela de resultado do
// Simulado se o IT/APR escolhido tiver as 4 imagens cadastradas na
// Biblioteca (manual ou por IA, ver /admin/biblioteca). Vale pra qualquer
// Função, por isso fica ligado ao documento, não a uma prova específica —
// ver /api/public/comic e /api/public/comic/check.
function SafetyComic({ documentId }: { documentId: number }) {
  const [images, setImages] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<ComicFeedback | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/comic?documentId=${documentId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setImages(d.hasComic ? d.images : null);
      })
      .catch(() => {
        if (!cancelled) setImages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  async function checkAnswer(index: number) {
    if (feedback) return;
    setSelected(index);
    setChecking(true);
    try {
      const res = await fetch("/api/public/comic/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, selectedIndex: index }),
      });
      const data = await res.json();
      if (res.ok) setFeedback(data);
    } finally {
      setChecking(false);
    }
  }

  if (!images || images.length !== 4) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-900">Quadrinho de segurança</h2>
      <p className="mt-1 text-xs text-slate-500">
        Qual das 4 imagens mostra a forma correta de executar essa atividade?
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {images.map((src, i) => {
          const isSelected = selected === i;
          const isCorrectReveal = feedback && i === feedback.correctIndex;
          const isWrongPick = feedback && isSelected && !feedback.correct;
          return (
            <button
              key={i}
              type="button"
              onClick={() => checkAnswer(i)}
              disabled={checking || !!feedback}
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Opção ${i + 1}`} className="aspect-square w-full object-cover" />
            </button>
          );
        })}
      </div>
      {feedback && (
        <p className={`mt-3 text-sm font-medium ${feedback.correct ? "text-emerald-700" : "text-red-600"}`}>
          {feedback.correct ? "Isso mesmo! " : "Não é essa. "}
          {feedback.explanation}
        </p>
      )}
    </div>
  );
}

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

  // Função é só um dado do cadastro do colaborador — não depende do
  // Contrato nem filtra quais IT/APR aparecem (o Simulado gera a prova na
  // hora, via IA, vale pra qualquer Função). Por isso a lista de Funções é
  // carregada uma vez só, junto com os Contratos.
  useEffect(() => {
    setLoadingRoles(true);
    fetch("/api/public/roles")
      .then((r) => r.json())
      .then((d) => setRoles(d.roles ?? []))
      .finally(() => setLoadingRoles(false));
  }, []);

  // Contrato mudou -> recarrega os IT/APR da Biblioteca desse Contrato.
  useEffect(() => {
    if (!sectorId) return;
    setLoadingExams(true);
    fetch(`/api/public/simulado/exams?sectorId=${sectorId}`)
      .then((r) => r.json())
      .then((d) => setExams(d.exams ?? []))
      .finally(() => setLoadingExams(false));
  }, [sectorId]);

  function handleSectorChange(value: string) {
    setSectorId(value);
    setExams([]);
  }

  function handleRoleChange(value: string) {
    setRoleId(value);
  }

  const canChooseExam = name.trim().length > 0 && matricula.trim().length > 0 && !!sectorId && !!roleId;

  async function startSimulado(documentId: number) {
    setError(null);
    if (!name.trim() || !matricula.trim()) {
      setError("Preencha seu nome e matrícula antes de escolher a prova.");
      return;
    }
    setBusy(true);
    setStartingExamId(documentId);
    try {
      const res = await fetch("/api/public/simulado/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          matricula: matricula.trim(),
          sectorId: Number(sectorId),
          roleId: Number(roleId),
          documentId,
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
        documentId,
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
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
              Voltar ao menu
            </Link>
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
                    disabled={loadingRoles}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                    required
                  >
                    <option value="">{loadingRoles ? "Carregando..." : "Selecione..."}</option>
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
                <p className="mt-1 text-xs text-slate-500">IT/APR disponíveis para esse Contrato:</p>

                <div className="mt-4 space-y-3">
                  {loadingExams && <p className="text-sm text-slate-400">Carregando...</p>}
                  {!loadingExams && exams.length === 0 && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                      Nenhum IT/APR cadastrado na Biblioteca para esse Contrato ainda.
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
                        <p className="mt-1 text-xs text-slate-400">10 perguntas geradas na hora</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white">
                        {startingExamId === ex.id ? "Gerando..." : "Começar"}
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
            onExit={() => setStep({ kind: "form" })}
            afterResult={<SafetyComic documentId={step.documentId} />}
          />
        )}
      </div>
    </div>
  );
}
