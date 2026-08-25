"use client";

import { useEffect, useState, use as usePromise } from "react";
import Link from "next/link";

type Option = { key: string; text: string };
type Question = {
  id: number;
  text: string;
  options: Option[];
  correctKey: string;
  topic: string | null;
  explanation: string | null;
};
type Exam = { id: number; title: string; summary: string | null; active: boolean; passingScore: number };
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/exams/${id}`);
      const data = await res.json();
      setExam(data.exam);
      setQuestions(data.questions ?? []);
      setAttempts(data.attempts ?? []);
      setLoading(false);
    })();
  }, [id]);

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
