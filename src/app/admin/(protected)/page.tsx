import {
  getSectorSummary,
  getRoleSummary,
  getEmployeeSummary,
  getTopicSummary,
  getRecentAttempts,
  getDocumentTypeSummary,
  getScoreTrend,
  getAvgDurationMinutes,
  getTenureSummary,
  employeeTier,
  type EmployeeTier,
} from "@/lib/reports";
import { getAdminSession } from "@/lib/session";
import { getVisibleSectorIds } from "@/lib/requireAdmin";
import { MeterBarList } from "@/components/charts/MeterBar";
import { BarChart } from "@/components/charts/BarChart";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { RoleEmployeeDrilldown } from "@/components/dashboard/RoleEmployeeDrilldown";

const TIER_ORDER: EmployeeTier[] = ["ouro", "prata", "bronze"];
const TIER_INFO: Record<EmployeeTier, { label: string; emoji: string; className: string }> = {
  ouro: { label: "Ouro (acima de 95%)", emoji: "🥇", className: "border-amber-300 bg-amber-50 text-amber-800" },
  prata: { label: "Prata (70% a 95%)", emoji: "🥈", className: "border-slate-300 bg-slate-50 text-slate-700" },
  bronze: { label: "Bronze (abaixo de 70%)", emoji: "🥉", className: "border-orange-300 bg-orange-50 text-orange-800" },
};

function TierRankColumn({
  title,
  items,
}: {
  title: string;
  items: { id: number | string; name: string; avgScore: number; attemptCount: number }[];
}) {
  const evaluated = items.filter((it) => it.attemptCount > 0);
  const grouped: Record<EmployeeTier, typeof items> = { ouro: [], prata: [], bronze: [] };
  for (const item of evaluated) grouped[employeeTier(item.avgScore)].push(item);
  for (const tier of TIER_ORDER) grouped[tier].sort((a, b) => b.avgScore - a.avgScore);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase text-slate-500">{title}</h3>
      <div className="mt-2 space-y-2">
        {evaluated.length === 0 && <p className="text-sm text-slate-400">Sem dados ainda.</p>}
        {TIER_ORDER.map((tier) => {
          const list = grouped[tier];
          if (list.length === 0) return null;
          const info = TIER_INFO[tier];
          return (
            <div key={tier} className={`rounded-md border p-2.5 ${info.className}`}>
              <p className="text-xs font-semibold">
                {info.emoji} {info.label} · {list.length}
              </p>
              <ul className="mt-1 space-y-0.5">
                {list.map((it) => (
                  <li key={it.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{it.name}</span>
                    <span className="ml-2 shrink-0 font-medium">{it.avgScore}%</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBadge({ value }: { value: number }) {
  const color =
    value >= 70
      ? "bg-emerald-100 text-emerald-700"
      : value >= 50
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {value}%
    </span>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  // Gestor de contrato só pode ver os números do próprio Contrato; Diretoria/
  // Superintendência escopada a um grupo só vê os do grupo dela — admin
  // geral e Diretoria/Superintendência sem grupo definido veem a empresa toda.
  const admin = await getAdminSession();
  const sectorIds = admin ? getVisibleSectorIds(admin) : undefined;

  const [
    sectorSummary,
    roleSummary,
    employeeSummary,
    topicSummary,
    recentAttempts,
    documentTypeSummary,
    scoreTrend,
    avgDurationMinutes,
    tenureSummary,
  ] = await Promise.all([
    getSectorSummary(sectorIds),
    getRoleSummary(sectorIds),
    getEmployeeSummary(sectorIds),
    getTopicSummary(sectorIds),
    getRecentAttempts(15, sectorIds),
    getDocumentTypeSummary(sectorIds),
    getScoreTrend(30, sectorIds),
    getAvgDurationMinutes(sectorIds),
    getTenureSummary(sectorIds),
  ]);

  const totalAttempts = employeeSummary.reduce((acc, e) => acc + e.attemptCount, 0);
  const evaluated = employeeSummary.filter((e) => e.attemptCount > 0);
  const overallAvg = evaluated.length
    ? Math.round(evaluated.reduce((acc, e) => acc + e.avgScore, 0) / evaluated.length)
    : 0;

  const sectorsNeedingTraining = sectorSummary.filter((s) => s.needsTraining);
  const rolesNeedingTraining = roleSummary.filter((r) => r.needsTraining);
  const topicsNeedingTraining = topicSummary.filter((t) => t.needsTraining);
  const employeesNeedingTraining = employeeSummary
    .filter((e) => e.needsTraining)
    .sort((a, b) => a.avgScore - b.avgScore);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Painel geral</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visão consolidada de desempenho nas provas, por setor, função e funcionário.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card label="Funcionários avaliados" value={evaluated.length} />
        <Card label="Tentativas concluídas" value={totalAttempts} />
        <Card label="Média geral" value={`${overallAvg}%`} />
        <Card label="Precisam de treinamento" value={employeesNeedingTraining.length} />
        <Card label="Tempo médio de prova" value={avgDurationMinutes > 0 ? `${avgDurationMinutes} min` : "—"} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Tendência da média geral</h2>
        <p className="text-xs text-slate-500">Média de nota por dia, últimos 30 dias.</p>
        <div className="mt-4">
          <TrendLineChart points={scoreTrend} />
        </div>
      </section>

      {(sectorsNeedingTraining.length > 0 ||
        rolesNeedingTraining.length > 0 ||
        topicsNeedingTraining.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Pontos de atenção — abaixo de 70% de acerto
          </h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase text-amber-700">Setores</p>
              <ul className="mt-1 space-y-1 text-sm text-amber-900">
                {sectorsNeedingTraining.length === 0 && <li className="text-amber-700/60">Nenhum</li>}
                {sectorsNeedingTraining.map((s) => (
                  <li key={s.id}>
                    {s.name} — {s.avgScore}%
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-amber-700">Funções</p>
              <ul className="mt-1 space-y-1 text-sm text-amber-900">
                {rolesNeedingTraining.length === 0 && <li className="text-amber-700/60">Nenhuma</li>}
                {rolesNeedingTraining.map((r) => (
                  <li key={r.id}>
                    {r.name} — {r.avgScore}%
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-amber-700">Temas</p>
              <ul className="mt-1 space-y-1 text-sm text-amber-900">
                {topicsNeedingTraining.length === 0 && <li className="text-amber-700/60">Nenhum</li>}
                {topicsNeedingTraining.slice(0, 6).map((t) => (
                  <li key={t.topic}>
                    {t.topic} — {t.accuracy}%
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Desempenho por setor</h2>
          <div className="mt-4">
            <BarChart
              emptyMessage="Nenhum contrato cadastrado."
              items={sectorSummary.map((s) => ({
                id: s.id,
                label: s.name,
                value: s.avgScore,
                sublabel: `${s.attemptCount} ${s.attemptCount === 1 ? "tentativa" : "tentativas"}`,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Desempenho por função</h2>
          <p className="text-xs text-slate-500">
            Clique numa função para ver os funcionários dela; clique no nome do funcionário para
            abrir o prontuário individual.
          </p>
          <div className="mt-4">
            <RoleEmployeeDrilldown roleSummary={roleSummary} employeeSummary={employeeSummary} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Desempenho por tempo de casa</h2>
          <p className="text-xs text-slate-500">
            Compara colaboradores mais novos com os mais veteranos, pelas faixas informadas no
            cadastro/autocadastro.
          </p>
          <div className="mt-4">
            <MeterBarList
              emptyMessage="Ainda sem dados de tempo de empresa."
              items={tenureSummary
                .filter((t) => t.attemptCount > 0)
                .map((t) => ({
                  id: t.code ?? "none",
                  label: t.label,
                  value: t.avgScore,
                  sublabel: `${t.attemptCount} ${t.attemptCount === 1 ? "tentativa" : "tentativas"}`,
                }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">IT x APR x MANUAL</h2>
          <p className="text-xs text-slate-500">
            Compara o desempenho em provas de Instrução de Trabalho (IT), Análise Preliminar de
            Risco (APR) e manuais de equipamento (MANUAL) — ajuda a apontar se falta mais
            conhecimento de processo, de segurança ou do próprio equipamento.
          </p>
          <div className="mt-4">
            <MeterBarList
              emptyMessage="Ainda sem provas respondidas para comparar."
              items={documentTypeSummary.map((d) => ({
                id: d.documentType,
                label:
                  d.documentType === "APR"
                    ? "APR (Análise Preliminar de Risco)"
                    : d.documentType === "MANUAL"
                      ? "MANUAL (manual de equipamento)"
                      : "IT (Instrução de Trabalho)",
                value: d.avgScore,
                sublabel: `${d.attemptCount} ${d.attemptCount === 1 ? "tentativa" : "tentativas"}`,
              }))}
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Critérios/temas: onde mais acertam x onde mais erram</h2>
          <p className="text-xs text-slate-500">Temas identificados automaticamente pela IA dentro das provas.</p>
          {topicSummary.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-red-600">Onde mais erram</p>
                <MeterBarList
                  emptyMessage="—"
                  items={topicSummary.slice(0, 5).map((t) => ({
                    id: t.topic,
                    label: t.topic,
                    value: t.accuracy,
                    sublabel: `${t.totalAnswers} respostas`,
                  }))}
                />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-emerald-600">Onde mais acertam</p>
                <MeterBarList
                  emptyMessage="—"
                  items={[...topicSummary]
                    .sort((a, b) => b.accuracy - a.accuracy)
                    .slice(0, 5)
                    .map((t) => ({
                      id: t.topic,
                      label: t.topic,
                      value: t.accuracy,
                      sublabel: `${t.totalAnswers} respostas`,
                    }))}
                />
              </div>
            </div>
          )}
          {topicSummary.length === 0 && (
            <p className="mt-4 text-sm text-slate-400">Ainda sem dados suficientes.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Funcionários que precisam de atenção</h2>
            <a href="/admin/funcionarios" className="text-xs text-slate-500 hover:underline">
              ver todos
            </a>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="pb-2">Funcionário</th>
                  <th className="pb-2">Setor / Função</th>
                  <th className="pb-2">Média</th>
                </tr>
              </thead>
              <tbody>
                {employeesNeedingTraining.length === 0 && (
                  <tr>
                    <td className="py-3 text-slate-400" colSpan={3}>
                      Ninguém abaixo da meta no momento.
                    </td>
                  </tr>
                )}
                {employeesNeedingTraining.slice(0, 8).map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-800">{e.name}</td>
                    <td className="py-2 text-slate-500">
                      {e.sectorName} · {e.roleName}
                    </td>
                    <td className="py-2">
                      <ScoreBadge value={e.avgScore} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {admin?.role === "admin" && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Ranking Bronze / Prata / Ouro
          </h2>
          <p className="text-xs text-slate-500">
            Visível só pra contas com permissão de admin geral — classifica pela nota média:
            Bronze abaixo de 70%, Prata de 70% a 95%, Ouro acima de 95%.
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3">
            <TierRankColumn
              title="Por Contrato"
              items={sectorSummary.map((s) => ({ id: s.id, name: s.name, avgScore: s.avgScore, attemptCount: s.attemptCount }))}
            />
            <TierRankColumn
              title="Por Função"
              items={roleSummary.map((r) => ({ id: r.id, name: r.name, avgScore: r.avgScore, attemptCount: r.attemptCount }))}
            />
            <TierRankColumn
              title="Por Colaborador"
              items={employeeSummary.map((e) => ({ id: e.id, name: e.name, avgScore: e.avgScore, attemptCount: e.attemptCount }))}
            />
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Últimas tentativas</h2>
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
            {recentAttempts.length === 0 && (
              <tr>
                <td className="py-3 text-slate-400" colSpan={6}>
                  Nenhuma prova respondida ainda.
                </td>
              </tr>
            )}
            {recentAttempts.map((a) => (
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
    </div>
  );
}
