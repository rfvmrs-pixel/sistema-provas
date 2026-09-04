"use client";

import { useEffect, useState } from "react";

type RoleRow = { id: number; name: string; avgScore: number; attemptCount: number };
type EmployeeRow = {
  id: number;
  name: string;
  roleId: number;
  sectorName: string;
  avgScore: number;
  attemptCount: number;
};

type TopicRow = { topic: string; accuracy: number; totalAnswers: number };
type EmployeeReport = {
  employee: { id: number; name: string; matricula: string | null; sectorName: string; roleName: string; tenure: string };
  avgScore: number;
  attemptCount: number;
  tier: "bronze" | "prata" | "ouro" | null;
  bestTopics: TopicRow[];
  worstTopics: TopicRow[];
};

const TIER_INFO: Record<"bronze" | "prata" | "ouro", { label: string; range: string; className: string; emoji: string }> = {
  bronze: { label: "Bronze", range: "abaixo de 70%", className: "bg-orange-100 text-orange-800 border-orange-200", emoji: "🥉" },
  prata: { label: "Prata", range: "entre 70% e 95%", className: "bg-slate-200 text-slate-700 border-slate-300", emoji: "🥈" },
  ouro: { label: "Ouro", range: "acima de 95%", className: "bg-amber-100 text-amber-800 border-amber-300", emoji: "🥇" },
};

function severityColor(value: number) {
  if (value >= 70) return "text-emerald-700";
  if (value >= 50) return "text-amber-700";
  return "text-red-700";
}

function TierCard({ tier }: { tier: "bronze" | "prata" | "ouro" | null }) {
  if (!tier) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-400">
        Ainda sem provas avaliadas para classificar.
      </div>
    );
  }
  const info = TIER_INFO[tier];
  return (
    <div className={`rounded-xl border p-4 text-center ${info.className}`}>
      <p className="text-2xl">{info.emoji}</p>
      <p className="mt-1 text-sm font-semibold">{info.label}</p>
      <p className="text-xs opacity-80">{info.range}</p>
    </div>
  );
}

function EmployeeModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const [report, setReport] = useState<EmployeeReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/employees/${employeeId}/report`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
        } else {
          setReport(d);
        }
      })
      .catch(() => {
        if (!cancelled) setError("Erro de conexão ao carregar o prontuário.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Prontuário do funcionário</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
            ✕
          </button>
        </div>

        {loading && <p className="mt-6 text-sm text-slate-400">Carregando...</p>}
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        {report && (
          <div className="mt-4 space-y-5">
            <div>
              <p className="text-base font-semibold text-slate-900">{report.employee.name}</p>
              <p className="text-xs text-slate-500">
                Matrícula {report.employee.matricula || "—"} · {report.employee.sectorName} ·{" "}
                {report.employee.roleName} · {report.employee.tenure}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500">Provas feitas</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{report.attemptCount}</p>
              </div>
              <div className="rounded-lg border border-slate-200 p-3 text-center">
                <p className="text-xs text-slate-500">Nota média</p>
                <p className={`mt-1 text-xl font-semibold ${severityColor(report.avgScore)}`}>
                  {report.attemptCount > 0 ? `${report.avgScore}%` : "—"}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <TierCard tier={report.tier} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-600">Onde está melhor</p>
                {report.bestTopics.length === 0 && <p className="mt-1 text-sm text-slate-400">Sem dados ainda.</p>}
                <ul className="mt-2 space-y-1">
                  {report.bestTopics.map((t) => (
                    <li key={t.topic} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-700">{t.topic}</span>
                      <span className="ml-2 shrink-0 font-medium text-emerald-700">{t.accuracy}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-red-600">Onde está pior</p>
                {report.worstTopics.length === 0 && <p className="mt-1 text-sm text-slate-400">Sem dados ainda.</p>}
                <ul className="mt-2 space-y-1">
                  {report.worstTopics.map((t) => (
                    <li key={t.topic} className="flex items-center justify-between text-sm">
                      <span className="truncate text-slate-700">{t.topic}</span>
                      <span className="ml-2 shrink-0 font-medium text-red-700">{t.accuracy}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Desempenho por Função, com a lista de funcionários daquela função escondida
// até o clique (evita poluir o Painel) — clicar num funcionário abre o
// prontuário individual dele (ver EmployeeModal / /api/admin/employees/[id]/report).
export function RoleEmployeeDrilldown({
  roleSummary,
  employeeSummary,
}: {
  roleSummary: RoleRow[];
  employeeSummary: EmployeeRow[];
}) {
  const [openRoleId, setOpenRoleId] = useState<number | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  if (roleSummary.length === 0) {
    return <p className="text-sm text-slate-400">Nenhuma função cadastrada.</p>;
  }

  return (
    <div className="space-y-1">
      {roleSummary.map((role) => {
        const isOpen = openRoleId === role.id;
        const clamped = Math.max(0, Math.min(100, role.avgScore));
        const color = clamped >= 70 ? "#10b981" : clamped >= 50 ? "#f59e0b" : "#ef4444";
        const employeesForRole = employeeSummary.filter((e) => e.roleId === role.id);

        return (
          <div key={role.id} className="rounded-md">
            <button
              type="button"
              onClick={() => setOpenRoleId(isOpen ? null : role.id)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-slate-50"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
              </svg>
              <span className="w-24 shrink-0 truncate text-sm text-slate-700 sm:w-36" title={role.name}>
                {role.name}
              </span>
              <div className="relative h-4 flex-1">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${clamped}%`, minWidth: clamped > 0 ? 4 : 0, backgroundColor: color }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-xs font-semibold" style={{ color }}>
                {clamped}%
              </span>
            </button>

            {isOpen && (
              <div className="ml-8 mt-1 mb-2 space-y-0.5 border-l border-slate-100 pl-4">
                {employeesForRole.length === 0 && (
                  <p className="py-1.5 text-xs text-slate-400">Nenhum funcionário nessa função.</p>
                )}
                {employeesForRole.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedEmployeeId(emp.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-50 hover:underline"
                  >
                    <span className="truncate">{emp.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {emp.attemptCount > 0 ? `${emp.avgScore}% · ${emp.attemptCount} prova(s)` : "sem provas"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {selectedEmployeeId !== null && (
        <EmployeeModal employeeId={selectedEmployeeId} onClose={() => setSelectedEmployeeId(null)} />
      )}
    </div>
  );
}
