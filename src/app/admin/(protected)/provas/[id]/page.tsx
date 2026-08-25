"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
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
  employeeName: string;
  sectorName: string;
  roleName: string;
};

export default function ProvaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const [exam, setExam] = useState<Exam | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectorId, setSectorId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [newFile, setNewFile] = useState<File | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [examRes, secRes, roleRes] = await Promise.all([
      fetch(`/api/admin/exams/${id}`),
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
    ]);
    const [data, secData, roleData] = await Promise.all([
      examRes.json(),
      secRes.json(),
      roleRes.json(),
    ]);
    setExam(data.exam);
    setQuestions(data.questions ?? []);
    setAttempts(data.attempts ?? []);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
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
        setError(data.error || "Falha ao atualizar Setor/Função.");
        return;
      }
      load();
    } finally {
      setSavingLink(false);
    }
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!newFile) return;
    setRegenerating(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", newFile);
      const res = await fetch(`/api/admin/exams/${id}/regenerate`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao regenerar a prova.");
        return;
      }
      setNewFile(null);
      (document.getElementById("regen-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("regen-input") as HTMLInputElement).value = "");
      load();
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando...</p>;
  if (!exam) return <p className="text-sm text-red-600">Prova não encontrada.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/provas" className="text-xs text-slate-500 hover:underline">
          ← voltar para provas
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">{exam.title}</h1>
        {exam.summary && <p className="mt-1 text-sm text-slate-500">{exam.summary}</p>}
        {exam.sourceFileName && (
          <p className="mt-1 text-xs text-slate-400">Origem: {exam.sourceFileName}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Setor e Função</h2>
          <p className="mt-1 text-xs text-slate-500">
            Só funcionários deste Setor e Função enxergam esta prova.
          </p>
          <form onSubmit={handleSaveLink} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700">Setor</label>
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
          <h2 className="text-sm font-semibold text-slate-900">Atualizar a partir de um novo PDF</h2>
          <p className="mt-1 text-xs text-slate-500">
            Se a IT ou APR mudou, envie a versão nova aqui. As 15 questões são regeneradas
            automaticamente; Setor, Função e o histórico de tentativas continuam os mesmos.
          </p>
          <form onSubmit={handleRegenerate} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              id="regen-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setNewFile(e.target.files?.[0] ?? null)}
              className="flex-1 text-sm"
            />
            <button
              disabled={regenerating || !newFile}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {regenerating ? "Regenerando..." : "Regenerar prova"}
            </button>
          </form>
        </section>
      </div>

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
              <th className="pb-2">Setor</th>
              <th className="pb-2">Função</th>
              <th className="pb-2">Data</th>
              <th className="pb-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 && (
              <tr>
                <td className="py-3 text-slate-400" colSpan={5}>
                  Ninguém respondeu essa prova ainda.
                </td>
              </tr>
            )}
            {attempts.map((a) => (
              <tr key={a.id} className="border-t border-slate-100">
                <td className="py-2 text-slate-800">{a.employeeName}</td>
                <td className="py-2 text-slate-500">{a.sectorName}</td>
                <td className="py-2 text-slate-500">{a.roleName}</td>
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
