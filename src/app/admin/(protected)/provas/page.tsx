"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Exam = {
  id: number;
  title: string;
  sourceFileName: string | null;
  active: boolean;
  passingScore: number;
  createdAt: string;
  questionCount: number;
  attemptCount: number;
};

export default function ProvasPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [numQuestions, setNumQuestions] = useState(10);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/exams");
    const data = await res.json();
    setExams(data.exams ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("numQuestions", String(numQuestions));
      const res = await fetch("/api/admin/exams", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao gerar a prova.");
        return;
      }
      setFile(null);
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
          Envie um PDF de treinamento e a IA gera automaticamente uma prova de múltipla escolha.
        </p>
      </div>

      <form onSubmit={handleUpload} className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700">Arquivo PDF</label>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
              required
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-sm font-medium text-slate-700">Nº de questões</label>
            <input
              type="number"
              min={4}
              max={30}
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            disabled={uploading || !file}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {uploading ? "Gerando prova com IA..." : "Gerar prova"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3">Prova</th>
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
                <td className="px-5 py-4 text-slate-400" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            ) : exams.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={6}>
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
