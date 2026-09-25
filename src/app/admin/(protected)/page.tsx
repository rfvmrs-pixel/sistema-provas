import {
  getSectorSummary,
  getRoleSummary,
  getEmployeeSummary,
  getTopicSummary,
  getRecentAttempts,
  getDocumentTypeSummary,
  getAvgDurationMinutes,
  getAvailableAttemptYears,
  getAttemptsCountByMonth,
  employeeTier,
  type EmployeeTier,
} from "@/lib/reports";
import { getContractView } from "@/lib/contractView";
import { ContractView, TopEmployees } from "@/components/dashboard/ContractView";
import { getAdminSession } from "@/lib/session";
import { getVisibleSectorIds } from "@/lib/requireAdmin";
import { MeterBarList } from "@/components/charts/MeterBar";
import { MonthlyBarChart } from "@/components/charts/MonthlyBarChart";
import { RecentAttemptsTable } from "@/components/dashboard/RecentAttemptsTable";

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

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function HighlightCard({
  label,
  name,
  detail,
}: {
  label: string;
  name: string | null;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{name ?? "—"}</p>
      <p className="mt-0.5 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export default async function AdminDashboardPage() {
  // Gestor de contrato só pode ver os números do próprio Contrato; Diretoria/
  // Superintendência escopada a um grupo só vê os do grupo dela — admin
  // geral e Diretoria/Superintendência sem grupo definido veem a empresa toda.
  const admin = await getAdminSession();
  const sectorIds = admin ? getVisibleSectorIds(admin) : undefined;

  // Sem filtro de período: os gráficos mensais mostram o ano corrente (ou o
  // último ano com provas) e o resto do Painel usa o histórico completo.
  const availableYears = await getAvailableAttemptYears(sectorIds);
  const currentYear = new Date().getFullYear();
  const selectedYear = availableYears.includes(currentYear) ? currentYear : (availableYears[0] ?? currentYear);

  const [
    sectorSummary,
    roleSummary,
    employeeSummary,
    topicSummary,
    recentAttempts,
    documentTypeSummary,
    avgDurationMinutes,
    examsPerMonth,
    simuladosPerMonth,
    contracts,
  ] = await Promise.all([
    getSectorSummary(sectorIds),
    getRoleSummary(sectorIds),
    getEmployeeSummary(sectorIds),
    getTopicSummary(sectorIds),
    getRecentAttempts(15, sectorIds),
    getDocumentTypeSummary(sectorIds),
    getAvgDurationMinutes(sectorIds),
    getAttemptsCountByMonth("oficial", selectedYear, sectorIds),
    getAttemptsCountByMonth("simulado", selectedYear, sectorIds),
    getContractView(sectorIds),
  ]);

  const totalAttempts = employeeSummary.reduce((acc, e) => acc + e.attemptCount, 0);
  const evaluated = employeeSummary.filter((e) => e.attemptCount > 0);
  const overallAvg = evaluated.length
    ? Math.round(evaluated.reduce((acc, e) => acc + e.avgScore, 0) / evaluated.length)
    : 0;

  const employeesNeedingTraining = employeeSummary.filter((e) => e.needsTraining);
  const ranked = [...evaluated].sort((a, b) => b.avgScore - a.avgScore || b.attemptCount - a.attemptCount);
  const toTop = (e: (typeof evaluated)[number]) => ({ id: e.id, name: e.name, detail: `${e.sectorName} · ${e.roleName}`, avgScore: e.avgScore });
  const top10Best = ranked.slice(0, 10).map(toTop);
  const top10Worst = [...ranked].reverse().slice(0, 10).map(toTop);

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
        <Card label="Provas realizadas" value={totalAttempts} />
        <Card label="Média geral" value={`${overallAvg}%`} />
        <Card label="Precisam de treinamento" value={employeesNeedingTraining.length} />
        <Card label="Tempo médio de prova" value={avgDurationMinutes > 0 ? `${avgDurationMinutes} min` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Provas aplicadas por mês</h2>
          <p className="text-xs text-slate-500">
            Tentativas oficiais (código de &quot;prova do dia&quot; ou link de aplicação) em {selectedYear}.
          </p>
          <div className="mt-4">
            <MonthlyBarChart
              data={examsPerMonth.map((m) => ({ label: m.label, value: m.count }))}
              emptyMessage="Nenhuma prova aplicada nesse ano."
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Simulados avulsos por mês</h2>
          <p className="text-xs text-slate-500">
            Testes que os próprios colaboradores fizeram por conta própria, logados com a senha
            deles, em {selectedYear}.
          </p>
          <div className="mt-4">
            <MonthlyBarChart
              data={simuladosPerMonth.map((m) => ({ label: m.label, value: m.count }))}
              emptyMessage="Nenhum simulado avulso nesse ano."
              color="#8b5cf6"
            />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Visão por contrato</h2>
        <p className="text-xs text-slate-500">
          Nível de cada contrato (🥇 Ouro acima de 95%, 🥈 Prata de 70% a 95%, 🥉 Bronze abaixo de 70% — pela
          nota média) e o % de realização das ITs/APRs/Manuais que cada função tem prova ativa. Clique no
          contrato para abrir as funções, na função para ver os colaboradores e no colaborador para o painel
          dele com as provas feitas.
        </p>
        <div className="mt-4">
          <ContractView contracts={contracts} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
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

        <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Top 10 colaboradores — maiores e menores notas</h2>
            <a href="/admin/funcionarios" className="text-xs text-slate-500 hover:underline">
              ver todos
            </a>
          </div>
          <p className="text-xs text-slate-500">Pela nota média de todas as provas feitas. Clique no nome para abrir o painel do colaborador.</p>
          <div className="mt-4">
            <TopEmployees best={top10Best} worst={top10Worst} />
          </div>
        </section>
      </div>

      {(admin?.role === "admin" || admin?.role === "diretoria" || admin?.role === "superintendencia") && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Ranking Bronze / Prata / Ouro
          </h2>
          <p className="text-xs text-slate-500">
            Visível pra contas de admin geral e Diretoria/Superintendência — classifica pela nota
            média: Bronze abaixo de 70%, Prata de 70% a 95%, Ouro acima de 95%.
          </p>

          {(() => {
            const evaluatedSectors = sectorSummary.filter((s) => s.attemptCount > 0);
            const mostAttempts = [...evaluatedSectors].sort((a, b) => b.attemptCount - a.attemptCount)[0] ?? null;
            const bestAvg = [...evaluatedSectors].sort((a, b) => b.avgScore - a.avgScore)[0] ?? null;
            return (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <HighlightCard
                  label="Contrato que mais fez provas"
                  name={mostAttempts?.name ?? null}
                  detail={
                    mostAttempts
                      ? `${mostAttempts.attemptCount} ${mostAttempts.attemptCount === 1 ? "tentativa" : "tentativas"} · média ${mostAttempts.avgScore}%`
                      : "Ainda sem tentativas registradas."
                  }
                />
                <HighlightCard
                  label="Contrato com a melhor média"
                  name={bestAvg?.name ?? null}
                  detail={
                    bestAvg
                      ? `média ${bestAvg.avgScore}% · ${bestAvg.attemptCount} ${bestAvg.attemptCount === 1 ? "tentativa" : "tentativas"}`
                      : "Ainda sem tentativas registradas."
                  }
                />
              </div>
            );
          })()}

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

      <RecentAttemptsTable
        initialAttempts={recentAttempts.map((a) => ({
          ...a,
          finishedAt: a.finishedAt ? a.finishedAt.toISOString() : null,
        }))}
        roles={roleSummary.map((r) => ({ id: r.id, name: r.name }))}
      />
    </div>
  );
}
