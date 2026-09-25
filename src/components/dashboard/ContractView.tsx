"use client";

import { useEffect, useState } from "react";
import { AttemptReview, type ReviewItem } from "@/components/exam/AttemptReview";
import type { ContractNode, RoleNode } from "@/lib/contractView";

type Tier = "ouro" | "prata" | "bronze" | null;
const TIER: Record<"ouro" | "prata" | "bronze", { label: string; cls: string; emoji: string }> = {
  ouro: { label: "Ouro", cls: "border-amber-300 bg-amber-50 text-amber-800", emoji: "🥇" },
  prata: { label: "Prata", cls: "border-slate-300 bg-slate-100 text-slate-700", emoji: "🥈" },
  bronze: { label: "Bronze", cls: "border-orange-300 bg-orange-50 text-orange-800", emoji: "🥉" },
};

function TierBadge({ tier }: { tier: Tier }) {
  if (!tier) return <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400">sem prova</span>;
  const t = TIER[tier];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${t.cls}`}>{t.emoji} {t.label}</span>;
}

function Pct({ value, label }: { value: number; label?: string }) {
  const color = value >= 90 ? "#10b981" : value >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="min-w-[110px]">
      <div className="flex justify-between text-xs"><span className="text-slate-500">{label}</span><span className="font-semibold text-slate-700">{value}%</span></div>
      <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
    </div>
  );
}

type EmployeePanel = {
  employee: { id: number; name: string; matricula: string | null; sectorName: string; roleName: string; hireDate: string | null; tempoDeCasa: string | null; tenure: string };
  avgScore: number; attemptCount: number; tier: Tier; modulesRequired: number; modulesDone: number; pct: number;
  modules: { key: string; label: string; type: string; done: boolean; attempts: number; best: number | null; last: string | null }[];
  attempts: { id: number; examTitle: string; module: string; documentType: string; finishedAt: string | null; percentage: number | null; mode: string }[];
  bestTopics: { topic: string; accuracy: number; totalAnswers: number }[];
  worstTopics: { topic: string; accuracy: number; totalAnswers: number }[];
};
type AttemptDetail = {
  attempt: { id: number; examTitle: string; employeeName: string; finishedAt: string; percentage: number | null; score: number | null; totalQuestions: number | null; passingScore: number; passed: boolean; mode: string };
  review: ReviewItem[];
};

const fmtData = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="my-6 w-full max-w-4xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div><h3 className="text-base font-semibold text-slate-900">{title}</h3>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function AttemptModal({ attemptId, onClose }: { attemptId: number; onClose: () => void }) {
  const [data, setData] = useState<AttemptDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/attempts/${attemptId}`).then(async (r) => {
      const d = await r.json();
      if (!vivo) return;
      if (!r.ok) setErro(d.error || "Não foi possível abrir a prova."); else setData(d);
    }).catch(() => vivo && setErro("Não foi possível abrir a prova."));
    return () => { vivo = false; };
  }, [attemptId]);
  const a = data?.attempt;
  return (
    <Modal title={a ? a.examTitle : "Prova"} sub={a ? `${a.employeeName} · ${fmtData(a.finishedAt)} · ${a.mode === "oficial" ? "prova oficial" : "simulado"}` : undefined} onClose={onClose}>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!data && !erro && <p className="text-sm text-slate-400">Carregando…</p>}
      {data && a && (
        <>
          <div className="mb-4 flex flex-wrap gap-3 text-sm">
            <span className={`rounded-full px-3 py-1 font-semibold ${a.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{a.percentage ?? 0}% · {a.passed ? "aprovado" : "reprovado"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Acertou {data.review.filter((r) => r.correct).length} de {data.review.length}</span>
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Errou {data.review.filter((r) => !r.correct).length}</span>
          </div>
          {data.review.length === 0 ? <p className="text-sm text-slate-400">As questões desta prova não foram guardadas (prova antiga, regerada antes do registro existir).</p> : <AttemptReview items={data.review} selectedLabel="resposta do colaborador" />}
        </>
      )}
    </Modal>
  );
}

export function EmployeeModal({ employeeId, onClose }: { employeeId: number; onClose: () => void }) {
  const [data, setData] = useState<EmployeePanel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/painel/colaborador/${employeeId}`).then(async (r) => {
      const d = await r.json();
      if (!vivo) return;
      if (!r.ok) setErro(d.error || "Não foi possível abrir o colaborador."); else setData(d);
    }).catch(() => vivo && setErro("Não foi possível abrir o colaborador."));
    return () => { vivo = false; };
  }, [employeeId]);
  const e = data?.employee;
  const tipos = data ? [...new Set(data.modules.map((m) => m.type))] : [];
  return (
    <>
      <Modal title={e ? e.name : "Colaborador"} sub={e ? `${e.sectorName} · ${e.roleName}${e.matricula ? ` · matrícula ${e.matricula}` : ""}` : undefined} onClose={onClose}>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {!data && !erro && <p className="text-sm text-slate-400">Carregando…</p>}
        {data && e && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Nível</p><div className="mt-1"><TierBadge tier={data.tier} /></div></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Média das provas</p><p className="mt-1 text-lg font-semibold">{data.attemptCount ? `${data.avgScore}%` : "—"}</p></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">ITs/APRs realizadas</p><p className="mt-1 text-lg font-semibold">{data.modulesDone} de {data.modulesRequired}</p><Pct value={data.pct} /></div>
              <div className="rounded-lg border border-slate-200 p-3"><p className="text-[11px] uppercase text-slate-500">Tempo de casa</p><p className="mt-1 text-sm font-semibold">{e.tempoDeCasa ?? e.tenure}</p>{e.hireDate && <p className="text-[11px] text-slate-400">desde {new Date(e.hireDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>}</div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900">ITs e APRs que {e.name.split(" ")[0]} tem que fazer</h4>
              <p className="text-xs text-slate-500">Cada IT, APR ou Manual que tem prova ativa para a função {e.roleName} neste contrato.</p>
              {data.modules.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Nenhuma prova ativa cadastrada para esta função.</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase text-slate-500">Total a fazer</p><p className="text-xl font-semibold text-slate-900">{data.modulesRequired}</p></div>
                    <div className="rounded-lg bg-emerald-50 p-3"><p className="text-[11px] uppercase text-emerald-700">Já fez</p><p className="text-xl font-semibold text-emerald-700">{data.modulesDone}</p></div>
                    <div className="rounded-lg bg-red-50 p-3"><p className="text-[11px] uppercase text-red-700">Não fez</p><p className="text-xl font-semibold text-red-700">{data.modulesRequired - data.modulesDone}</p></div>
                    <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] uppercase text-slate-500">Realizado</p><p className="text-xl font-semibold text-slate-900">{data.pct}%</p><Pct value={data.pct} /></div>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {tipos.map((t) => { const ms = data.modules.filter((m) => m.type === t); return `${t}: ${ms.filter((m) => m.done).length} de ${ms.length}`; }).join(" · ")}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-red-700">⏳ Não fez ({data.modulesRequired - data.modulesDone})</p>
                      <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-red-100">
                        {data.modules.filter((m) => !m.done).length === 0 && <li className="px-3 py-2 text-sm text-emerald-700">Fez todas 🎉</li>}
                        {data.modules.filter((m) => !m.done).map((m) => (
                          <li key={m.key} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700">
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{m.type}</span>
                            <span className="min-w-0 truncate" title={m.label}>{m.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-emerald-700">✅ Já fez ({data.modulesDone})</p>
                      <ul className="mt-1 divide-y divide-slate-100 rounded-lg border border-emerald-100">
                        {data.modulesDone === 0 && <li className="px-3 py-2 text-sm text-slate-400">Nenhuma ainda.</li>}
                        {data.modules.filter((m) => m.done).map((m) => (
                          <li key={m.key} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-800">
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{m.type}</span>
                            <span className="min-w-0 flex-1 truncate" title={m.label}>{m.label}</span>
                            <span className="shrink-0 text-xs text-slate-500" title={`${m.attempts} tentativa(s) · última em ${fmtData(m.last)}`}>{m.best}%</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}
            </div>

            {(data.bestTopics.length > 0 || data.worstTopics.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs font-semibold uppercase text-emerald-600">Onde mais acerta</p><ul className="mt-1 space-y-1 text-sm">{data.bestTopics.map((t) => <li key={t.topic} className="flex justify-between"><span className="truncate">{t.topic}</span><span className="font-medium">{t.accuracy}%</span></li>)}</ul></div>
                <div><p className="text-xs font-semibold uppercase text-red-600">Onde mais erra</p><ul className="mt-1 space-y-1 text-sm">{data.worstTopics.map((t) => <li key={t.topic} className="flex justify-between"><span className="truncate">{t.topic}</span><span className="font-medium">{t.accuracy}%</span></li>)}</ul></div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-slate-900">Provas realizadas ({data.attempts.length})</h4>
              <p className="text-xs text-slate-500">Clique numa prova para ver as questões, o que marcou, o que acertou e o que errou.</p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="px-3 py-2">Data</th><th className="px-3 py-2">Prova</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Nota</th></tr></thead>
                  <tbody>
                    {data.attempts.length === 0 && <tr><td colSpan={4} className="px-3 py-3 text-slate-400">Nenhuma prova realizada ainda.</td></tr>}
                    {data.attempts.map((a) => (
                      <tr key={a.id} onClick={() => setAberta(a.id)} className="cursor-pointer border-t border-slate-100 hover:bg-red-50/40">
                        <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fmtData(a.finishedAt)}</td>
                        <td className="px-3 py-2 text-slate-800">{a.examTitle}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{a.documentType} · {a.mode === "oficial" ? "oficial" : "simulado"}</td>
                        <td className="px-3 py-2 font-semibold">{a.percentage ?? 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
      {aberta != null && <AttemptModal attemptId={aberta} onClose={() => setAberta(null)} />}
    </>
  );
}

function RoleBlock({ role, onEmployee }: { role: RoleNode; onEmployee: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50">
        <span className={`text-xs text-slate-400 transition ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="min-w-[160px] flex-1 text-sm font-medium text-slate-800">{role.name}</span>
        <TierBadge tier={role.tier} />
        <span className="text-xs text-slate-500">{role.attemptCount ? `média ${role.avgScore}%` : "sem provas"}</span>
        <span className="text-xs text-slate-500">{role.employeesEvaluated}/{role.employeesTotal} colaboradores com prova</span>
        <div className="w-44"><Pct value={role.pct} label={`${role.modules.length} IT/APR`} /></div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          {role.modules.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {role.modules.map((m) => (
                <span key={m.key} title={`${m.done} de ${m.required} colaboradores fizeram`} className={`rounded-full border px-2 py-0.5 text-[11px] ${m.pct >= 100 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{m.type} · {m.label} — {m.pct}%</span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5">Colaborador</th><th className="pb-1.5">Tempo de casa</th><th className="pb-1.5">Nível</th><th className="pb-1.5">Média</th><th className="pb-1.5">ITs/APRs feitas</th><th className="pb-1.5">Realização</th></tr></thead>
              <tbody>
                {role.employees.map((e) => (
                  <tr key={e.id} onClick={() => onEmployee(e.id)} className="cursor-pointer border-t border-slate-100 hover:bg-red-50/40">
                    <td className="py-2 pr-2 text-slate-800">{e.name}{e.matricula && <span className="ml-1 text-xs text-slate-400">({e.matricula})</span>}</td>
                    <td className="py-2 pr-2 text-xs text-slate-500">{e.tenure}</td>
                    <td className="py-2 pr-2"><TierBadge tier={e.tier} /></td>
                    <td className="py-2 pr-2 text-slate-700">{e.attemptCount ? `${e.avgScore}%` : "—"}</td>
                    <td className="py-2 pr-2 text-slate-700">{e.modulesDone} de {e.modulesRequired}</td>
                    <td className="py-2"><div className="w-32"><Pct value={e.pct} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ContractBlock({ c, onEmployee }: { c: ContractNode; onEmployee: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [aba, setAba] = useState<"funcoes" | "modulos" | "tempo">("funcoes");
  const faltam = c.modules.filter((m) => m.done < m.required);
  return (
    <div className="rounded-xl border border-slate-200">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span className={`text-xs text-slate-400 transition ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="min-w-[160px] flex-1 font-semibold text-slate-900">{c.name}</span>
        <TierBadge tier={c.tier} />
        <span className="text-xs text-slate-500">{c.attemptCount ? `média ${c.avgScore}%` : "sem provas"}</span>
        <span className="text-xs text-slate-500">{c.employeesEvaluated}/{c.employeesTotal} colaboradores com prova</span>
        <span className="text-xs text-slate-500">{c.modulesComplete}/{c.modules.length} IT/APR concluídas</span>
        <div className="w-48"><Pct value={c.pct} label="realização" /></div>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="mb-3 flex gap-2">
            {([["funcoes", `Funções (${c.roles.length})`], ["modulos", `ITs e APRs (${c.modulesComplete} feitas · ${faltam.length} faltam)`], ["tempo", "Tempo de casa"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setAba(k)} className={`rounded-full px-3 py-1 text-xs font-medium ${aba === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{l}</button>
            ))}
          </div>
          {aba === "funcoes" && (
            <div className="space-y-2">
              {c.roles.length === 0 && <p className="text-sm text-slate-400">Nenhum colaborador cadastrado neste contrato.</p>}
              {c.roles.map((r) => <RoleBlock key={r.id} role={r} onEmployee={onEmployee} />)}
            </div>
          )}
          {aba === "modulos" && (
            <div className="overflow-x-auto">
              <p className="mb-2 text-xs text-slate-500">Total de {c.modules.length} ITs/APRs/Manuais com prova ativa no contrato: {c.modulesComplete} concluídas por todos os colaboradores obrigados, {faltam.length} com pendência.</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5">IT / APR / Manual</th><th className="pb-1.5">Tipo</th><th className="pb-1.5">Colaboradores que fizeram</th><th className="pb-1.5">Faltam</th><th className="pb-1.5">Realização</th></tr></thead>
                <tbody>
                  {c.modules.map((m) => (
                    <tr key={m.key} className="border-t border-slate-100">
                      <td className="py-2 pr-2 text-slate-800">{m.done >= m.required ? "✅" : "⏳"} {m.label}</td>
                      <td className="py-2 pr-2 text-xs text-slate-500">{m.type}</td>
                      <td className="py-2 pr-2 text-slate-700">{m.done} de {m.required}</td>
                      <td className="py-2 pr-2 text-slate-700">{Math.max(0, m.required - m.done)}</td>
                      <td className="py-2"><div className="w-32"><Pct value={m.pct} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aba === "tempo" && (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5">Tempo de casa</th><th className="pb-1.5">Nível</th><th className="pb-1.5">Média</th><th className="pb-1.5">Colaboradores</th><th className="pb-1.5">Provas</th></tr></thead>
              <tbody>
                {c.tenure.map((t) => (
                  <tr key={t.code} className="border-t border-slate-100">
                    <td className="py-2 pr-2 text-slate-800">{t.label}</td>
                    <td className="py-2 pr-2"><TierBadge tier={t.tier} /></td>
                    <td className="py-2 pr-2">{t.attemptCount ? `${t.avgScore}%` : "—"}</td>
                    <td className="py-2 pr-2">{t.employees}</td>
                    <td className="py-2">{t.attemptCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function ContractView({ contracts }: { contracts: ContractNode[] }) {
  const [emp, setEmp] = useState<number | null>(null);
  return (
    <>
      <div className="space-y-2">
        {contracts.length === 0 && <p className="text-sm text-slate-400">Nenhum contrato cadastrado.</p>}
        {contracts.map((c) => <ContractBlock key={c.id} c={c} onEmployee={setEmp} />)}
      </div>
      {emp != null && <EmployeeModal employeeId={emp} onClose={() => setEmp(null)} />}
    </>
  );
}

// Top 10 maiores e menores notas (média por colaborador) — clique abre o painel do colaborador.
export function TopEmployees({ best, worst }: { best: { id: number; name: string; detail: string; avgScore: number }[]; worst: { id: number; name: string; detail: string; avgScore: number }[] }) {
  const [emp, setEmp] = useState<number | null>(null);
  const Lista = ({ titulo, cor, itens }: { titulo: string; cor: string; itens: typeof best }) => (
    <div>
      <p className={`text-xs font-semibold uppercase ${cor}`}>{titulo}</p>
      <ol className="mt-2 space-y-1">
        {itens.length === 0 && <li className="text-sm text-slate-400">Sem dados ainda.</li>}
        {itens.map((e, i) => (
          <li key={e.id} onClick={() => setEmp(e.id)} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-slate-50">
            <span className="w-5 text-right text-xs text-slate-400">{i + 1}.</span>
            <span className="min-w-0 flex-1 truncate text-slate-800">{e.name}<span className="ml-1 text-xs text-slate-400">{e.detail}</span></span>
            <span className="shrink-0 font-semibold text-slate-700">{e.avgScore}%</span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        <Lista titulo="Maiores notas" cor="text-emerald-600" itens={best} />
        <Lista titulo="Menores notas" cor="text-red-600" itens={worst} />
      </div>
      {emp != null && <EmployeeModal employeeId={emp} onClose={() => setEmp(null)} />}
    </>
  );
}
