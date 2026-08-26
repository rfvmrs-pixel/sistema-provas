"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR";
type Option = { key: string; text: string };
type Question = {
  id: number;
  text: string;
  options: Option[];
  correctKey: string;
  topic: string | null;
  explanation: string | null;
};
type Exam = {
  id: number;
  title: string;
  summary: string | null;
  active: boolean;
  passingScore: number;
  documentType: DocumentType;
  sourceFileName: string | null;
  sectorId: number;
  roleId: number;
  sector?: { id: number; name: string };
  role?: { id: number; name: string };
};
type Attempt = {
  id: number;
  finishedAt: string | null;
  percentage: number | null;
  score: number | null;
  totalQuestions: number | null;
  mode: "simulado" | "oficial";
  sessionLabel: string | null;
  employeeName: string;
  sectorName: string;
  roleName: string;
};
type Employee = { id: number; name: string; active: boolean; sectorId: number; roleId: number };
type GeneratedCredential = { employeeId: number; employeeName: string; code: string };
type LibraryDocument = { id: number; fileName: string; sectorId: number; sectorName: string };

const QUESTION_COUNT_OPTIONS = [10, 15];

export default function ProvaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorId, setSectorId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [regenDocumentId, setRegenDocumentId] = useState("");
  const [regenNumQuestions, setRegenNumQuestions] = useState(15);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<number[]>([]);
  const [sessionLabel, setSessionLabel] = useState("");
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState<GeneratedCredential[]>([]);

  async function load() {
    setLoading(true);
    const [examRes, secRes, roleRes, empRes, docRes] = await Promise.all([
      fetch(`/api/admin/exams/${id}`),
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
      fetch("/api/admin/employees"),
      fetch("/api/admin/documents"),
    ]);
    const [data, secData, roleData, empData, docData] = await Promise.all([
      examRes.json(),
      secRes.json(),
      roleRes.json(),
      empRes.json(),
      docRes.json(),
    ]);
    setExam(data.exam);
    setQuestions(data.questions ?? []);
    setAttempts(data.attempts ?? []);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
    setEmployees(empData.employees ?? []);
    setDocuments(docData.documents ?? []);
    if (data.exam) {
      setSectorId(String(data.exam.sectorId));
      setRoleId(String(data.exam.roleId));
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveLink(e: React.FormEvent) {
    e.preventDefault();
    setSavingLink(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectorId: Number(sectorId), roleId: Number(roleId) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao atualizar Contrato/Função.");
        return;
      }
      load();
    } finally {
      setSavingLink(false);
    }
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!regenDocumentId) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: Number(regenDocumentId), numQuestions: regenNumQuestions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao regenerar a prova.");
        return;
      }
      setRegenDocumentId("");
      load();
    } finally {
      setRegenerating(false);
    }
  }

  async function handleGenerateCodes(e: React.FormEvent) {
    e.preventDefault();
    if (selectedEmployeeIds.length === 0) return;
    setGeneratingCodes(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/exams/${id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeIds: selectedEmployeeIds, label: sessionLabel || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao gerar os códigos.");
        return;
      }
      setGeneratedCredentials(data.credentials ?? []);
      setSelectedEmployeeIds([]);
    } finally {
      setGeneratingCodes(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando...</p>;
  if (!exam) return <p className="text-sm text-red-600">Prova não encontrada.</p>;

  const eligibleEmployees = employees.filter(
    (emp) => emp.active && emp.sectorId === exam.sectorId && emp.roleId === exam.roleId,
  );

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/provas" className="text-xs text-slate-500 hover:underline">
          ← voltar para provas
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">
          {exam.title}{" "}
          <span
            className={`align-middle rounded-full px-2 py-0.5 text-xs font-medium ${
              exam.documentType === "APR" ? "bg-amber-100 text-amber-700" : "bg-sky-100 text-sky-700"
            }`}
          >
            {exam.documentType}
          </span>
        </h1>
        {exam.summary && <p className="mt-1 text-sm text-slate-500">{exam.summary}</p>}
        {exam.sourceFileName && (
          <p className="mt-1 text-xs text-slate-400">Origem: {exam.sourceFileName}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Contrato e Função</h2>
          <p className="mt-1 text-xs text-slate-500">
            Só funcionários deste Contrato e Função enxergam esta prova.
          </p>
          <form onSubmit={handleSaveLink} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700">Contrato</label>
              <select
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700">Função</label>
              <select
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={savingLink}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Salvar
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Regerar a partir da biblioteca</h2>
          <p className="mt-1 text-xs text-slate-500">
            Se a IT/APR mudou (ou quer trocar a quantidade de questões), escolha um PDF da
            biblioteca do mesmo Contrato. As questões são regeneradas automaticamente; Contrato,
            Função e o histórico de tentativas continuam os mesmos.
          </p>
          <form onSubmit={handleRegenerate} className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">PDF da biblioteca</label>
              <select
                value={regenDocumentId}
                onChange={(e) => setRegenDocumentId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                {documents
                  .filter((d) => d.sectorId === exam.sectorId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fileName}
                    </option>
                  ))}
              </select>
              {documents.filter((d) => d.sectorId === exam.sectorId).length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Nenhum PDF salvo ainda para este Contrato — envie um em Provas primeiro.
                </p>
              )}
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-700">Quantidade de questões</label>
                <select
                  value={regenNumQuestions}
                  onChange={(e) => setRegenNumQuestions(Number(e.target.value))}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {QUESTION_COUNT_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n} questões
                    </option>
                  ))}
                </select>
              </div>
              <button
                disabled={regenerating || !regenDocumentId}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {regenerating ? "Regenerando..." : "Regenerar prova"}
              </button>
            </div>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Prova do dia</h2>
        <p className="mt-1 text-xs text-slate-500">
          Escolha quem vai fazer essa prova hoje. Cada colaborador selecionado recebe um código de
          6 dígitos de uso único (login = nome + contrato, senha = código). O código expira assim
          que a prova é finalizada, e o resultado só aparece nos relatórios do gestor.
        </p>

        <form onSubmit={handleGenerateCodes} className="mt-4 space-y-3">
          <input
            value={sessionLabel}
            onChange={(e) => setSessionLabel(e.target.value)}
            placeholder={`Rótulo (opcional) — ex: Prova do dia ${new Date().toLocaleDateString("pt-BR")}`}
            className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm"
          />

          {eligibleEmployees.length === 0 ? (
            <p className="text-sm text-slate-400">
              Nenhum funcionário ativo cadastrado nesse Contrato + Função ainda. Cadastre em
              Funcionários primeiro.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-3">
              {eligibleEmployees.map((emp) => (
                <label key={emp.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedEmployeeIds.includes(emp.id)}
                    onChange={(e) =>
                      setSelectedEmployeeIds((ids) =>
                        e.target.checked ? [...ids, emp.id] : ids.filter((i) => i !== emp.id),
                      )
                    }
                  />
                  {emp.name}
                </label>
              ))}
            </div>
          )}

          <button
            disabled={generatingCodes || selectedEmployeeIds.length === 0}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {generatingCodes
              ? "Gerando códigos..."
              : `Gerar código para ${selectedEmployeeIds.length || ""} colaborador(es)`}
          </button>
        </form>

        {generatedCredentials.length > 0 && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">
              Códigos gerados — anote e envie agora, eles só aparecem esta vez:
            </p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-emerald-700">
                  <th className="pb-1">Colaborador</th>
                  <th className="pb-1">Código</th>
                </tr>
              </thead>
              <tbody>
                {generatedCredentials.map((c) => (
                  <tr key={c.employeeId}>
                    <td className="py-1 text-emerald-900">{c.employeeName}</td>
                    <td className="py-1 font-mono text-base font-semibold text-emerald-900">{c.code}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-emerald-700">
              O colaborador acessa /prova pelo celular, informa nome + contrato e digita esse
              código no lugar da senha.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Questões ({questions.length})</h2>
        <ol className="mt-4 space-y-5">
          {questions.map((q, idx) => (
            <li key={q.id} className="border-t border-slate-100 pt-4 first:border-0 first:pt-0">
              <p className="text-sm font-medium text-slate-800">
                {idx + 1}. {q.text}{" "}
                {q.topic && (
                  <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">
                    {q.topic}
                  </span>
                )}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {q.options.map((opt) => (
                  <li
                    key={opt.key}
                    className={
                      opt.key === q.correctKey
                        ? "font-medium text-emerald-700"
                        : "text-slate-600"
                    }
                  >
                    {opt.key}) {opt.text} {opt.key === q.correctKey && "✓"}
                  </li>
                ))}
              </ul>
              {q.explanation && (
                <p className="mt-1 text-xs text-slate-400">{q.explanation}</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Tentativas ({attempts.length})</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2">Funcionário</th>
              <th className="pb-2">Contrato</th>
              <th className="pb-2">Função</th>
              <th className="pb-2">Modo</th>
              <th className="pb-2">Data</th>
              <th className="pb-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 && (
              <tr>
                <td className="py-3 text-slate-400" colSpan={6}>
                  Ninguém respondeu essa prova ainda.
                </td>
              </tr>
            )}
            {attempts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-800">{a.employeeName}</td>
                <td className="py-2 text-slate-500">{a.sectorName}</td>
                <td className="py-2 text-slate-500">{a.roleName}</td>
                <td className="py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.mode === "oficial" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                    }`}
                    title={a.sessionLabel ?? undefined}
                  >
                    {a.mode === "oficial" ? a.sessionLabel || "oficial" : "simulado"}
                  </span>
                </td>
                <td className="py-2 text-slate-500">
                  {a.finishedAt ? new Date(a.finishedAt).toLocaleString("pt-BR") : "em andamento"}
                </td>
                <td className="py-2 text-slate-500">
                  {a.percentage !== null ? `${a.percentage}%` : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
