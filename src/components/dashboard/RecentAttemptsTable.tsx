"use client";

import { useEffect, useState } from "react";

type AttemptRow = {
  id: number;
  finishedAt: string | null;
  percentage: number | null;
  score: number | null;
  totalQuestions: number | null;
  mode: string;
  sessionLabel: string | null;
  employeeName: string;
  sectorName: string;
  roleName: string;
  examTitle: string;
};

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-emerald-100 text-emerald-700"
      : value >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{value}%</span>
  );
}

// Tabela "Últimas tentativas" do Painel, com filtros combináveis: mês, dia,
// nome do colaborador e função. Cada filtro preenchido restringe mais o
// resultado (um AND de todos) — ex.: escolher o mês mostra todo mundo que fez
// prova naquele mês; digitar um nome em seguida restringe só a esse nome
// dentro do mês já escolhido.
export function RecentAttemptsTable({
  initialAttempts,
  roles,
}: {
  initialAttempts: AttemptRow[];
  roles: { id: number; name: string }[];
}) {
  const [attempts, setAttempts] = useState<AttemptRow[]>(initialAttempts);
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);

  const hasFilter = Boolean(month || day || name.trim() || roleId);

  useEffect(() => {
    if (!hasFilter) {
      setAttempts(initialAttempts);
      return;
    }
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    if (day) params.set("day", day);
    if (name.trim()) params.set("name", name.trim());
    if (roleId) params.set("roleId", roleId);

    setLoading(true);
    const timeout = setTimeout(() => {
      fetch(`/api/admin/reports/attempts?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => setAttempts(data.attempts ?? []))
        .finally(() => setLoading(false));
    }, 300); // pequeno debounce pro campo de nome não disparar uma busca por letra

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, day, name, roleId]);

  function clearFilters() {
    setMonth("");
    setDay("");
    setName("");
    setRoleId("");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-900">Últimas tentativas</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Mês
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setDay("");
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Dia
          <input
            type="date"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setMonth("");
            }}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-slate-500">
          Colaborador
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Buscar por nome..."
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Função
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-800 focus:border-slate-500 focus:outline-none"
          >
            <option value="">Todas</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {hasFilter && (
          <button
            onClick={clearFilters}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
          >
            limpar filtros
          </button>
        )}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2">Funcionário</th>
              <th className="pb-2">Setor</th>
              <th className="pb-2">Função</th>
              <th className="pb-2">Prova</th>
              <th className="pb-2">Data</th>
              <th className="pb-2">Nota</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="py-3 text-slate-400" colSpan={6}>
                  Carregando...
                </td>
              </tr>
            )}
            {!loading && attempts.length === 0 && (
              <tr>
                <td className="py-3 text-slate-400" colSpan={6}>
                  {hasFilter ? "Nenhuma tentativa encontrada com esses filtros." : "Nenhuma prova respondida ainda."}
                </td>
              </tr>
            )}
            {!loading &&
              attempts.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-800">{a.employeeName}</td>
                  <td className="py-2 text-slate-500">{a.sectorName}</td>
                  <td className="py-2 text-slate-500">{a.roleName}</td>
                  <td className="py-2 text-slate-500">{a.examTitle}</td>
                  <td className="py-2 text-slate-500">
                    {a.finishedAt ? new Date(a.finishedAt).toLocaleString("pt-BR") : "-"}
                  </td>
                  <td className="py-2">
                    <ScoreBadge value={a.percentage ?? 0} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
