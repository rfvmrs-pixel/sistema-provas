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
} from "@/lib/reports";
import { getAdminSession } from "@/lib/session";
import { getVisibleSectorIds } from "@/lib/requireAdmin";
import { MeterBarList } from "@/components/charts/MeterBar";
import { TrendLineChart } from "@/components/charts/TrendLineChart";

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
            <MeterBarList
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
          <div className="mt-4">
            <MeterBarList
              emptyMessage="Nenhuma função cadastrada."
              items={roleSummary.map((r) => ({
                id: r.id,
                label: r.name,
                value: r.avgScore,
                sublabel: `${r.attemptCount} ${r.attemptCount === 1 ? "tentativa" : "tentativas"}`,
              }))}
            />
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
          <h2 className="text-sm font-semibold text-slate-900">IT x APR</h2>
          <p className="text-xs text-slate-500">
            Compara o desempenho em provas de Instrução de Trabalho (IT) com as de Análise
            Preliminar de Risco (APR) — ajuda a apontar se falta mais conhecimento de processo ou
            de segurança.
          </p>
          <div className="mt-4">
            <MeterBarList
              emptyMessage="Ainda sem provas respondidas para comparar."
              items={documentTypeSummary.map((d) => ({
                id: d.documentType,
                label: d.documentType === "APR" ? "APR (Análise Preliminar de Risco)" : "IT (Instrução de Trabalho)",
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
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="pb-2">Tema</th>
                <th className="pb-2">Respostas</th>
                <th className="pb-2">Acerto</th>
              </tr>
            </thead>
            <tbody>
              {topicSummary.length === 0 && (
                <tr>
                  <td className="py-3 text-slate-400" colSpan={3}>
                    Ainda sem dados suficientes.
                  </td>
                </tr>
              )}
              {topicSummary.map((t) => (
                <tr key={t.topic} className="border-t border-slate-100">
                  <td className="py-2 text-slate-800">{t.topic}</td>
                  <td className="py-2 text-slate-500">{t.totalAnswers}</td>
                  <td className="py-2">
                    <ScoreBadge value={t.accuracy} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Funcionários que precisam de atenção</h2>
            <a href="/admin/funcionarios" className="text-xs text-slate-500 hover:underline">
              ver todos
            </a>
          </div>
          <table className="mt-3 w-full text-sm">
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
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Últimas tentativas</h2>
        <table className="mt-3 w-full text-sm">
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
      </section>
    </div>
  );
}
