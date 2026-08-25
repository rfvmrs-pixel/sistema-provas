"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type Exam = {
  id: number;
  title: string;
  sourceFileName: string | null;
  active: boolean;
  passingScore: number;
  createdAt: string;
  sectorId: number;
  sectorName: string;
  roleId: number;
  roleName: string;
  questionCount: number;
  attemptCount: number;
};

export default function ProvasPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sectorId, setSectorId] = useState("");
  const [roleId, setRoleId] = useState("");

  async function load() {
    setLoading(true);
    const [examRes, secRes, roleRes] = await Promise.all([
      fetch("/api/admin/exams"),
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
    ]);
    const [examData, secData, roleData] = await Promise.all([
      examRes.json(),
      secRes.json(),
      roleRes.json(),
    ]);
    setExams(examData.exams ?? []);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !sectorId || !roleId) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("sectorId", sectorId);
      form.append("roleId", roleId);
      const res = await fetch("/api/admin/exams", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao gerar a prova.");
        return;
      }
      setFile(null);
      setSectorId("");
      setRoleId("");
      (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
      load();
    } finally {
      setUploading(false);
    }
  }

  async function toggleActive(exam: Exam) {
    await fetch(`/api/admin/exams/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !exam.active }),
    });
    load();
  }

  async function handleDelete(exam: Exam) {
    if (!confirm(`Excluir a prova "${exam.title}"? Isso apaga também os resultados dela.`)) return;
    await fetch(`/api/admin/exams/${exam.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Provas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie o PDF de uma IT ou APR e a IA gera automaticamente uma prova de múltipla
          escolha com 15 questões, vinculada a um Setor e uma Função. Só funcionários desse
          Setor e Função veem a prova.
        </p>
      </div>

      <form onSubmit={handleUpload} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Arquivo PDF (IT/APR)</label>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
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
            <label className="block text-sm font-medium text-slate-700">Função</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            >
              <option value="">Selecione...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          disabled={uploading || !file || !sectorId || !roleId}
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {uploading ? "Gerando prova com IA (15 questões)..." : "Gerar prova"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3">Prova</th>
              <th className="px-5 py-3">Setor</th>
              <th className="px-5 py-3">Função</th>
              <th className="px-5 py-3">Questões</th>
              <th className="px-5 py-3">Tentativas</th>
              <th className="px-5 py-3">Criada em</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={8}>
                  Carregando...
                </td>
              </tr>
            ) : exams.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={8}>
                  Nenhuma prova gerada ainda.
                </td>
              </tr>
            ) : (
              exams.map((exam) => (
                <tr key={exam.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <Link href={`/admin/provas/${exam.id}`} className="text-slate-800 hover:underline">
                      {exam.title}
                    </Link>
                    {exam.sourceFileName && (
                      <p className="text-xs text-slate-400">{exam.sourceFileName}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{exam.sectorName}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.roleName}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.questionCount}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.attemptCount}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(exam)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        exam.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {exam.active ? "disponível" : "desativada"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right text-xs">
                    <button onClick={() => handleDelete(exam)} className="text-red-600 hover:underline">
                      excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
