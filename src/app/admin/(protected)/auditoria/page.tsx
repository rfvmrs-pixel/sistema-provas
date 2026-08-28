import { getAuditSummary, AUDIT_WINDOW_DAYS } from "@/lib/audit";
import { getAdminSession } from "@/lib/session";
import { getVisibleSectorIds } from "@/lib/requireAdmin";
import { MeterBarList } from "@/components/charts/MeterBar";

function DocTypeBadge({ documentType }: { documentType: string }) {
  const isApr = documentType === "APR";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isApr ? "bg-purple-100 text-purple-700" : "bg-sky-100 text-sky-700"
      }`}
    >
      {documentType}
    </span>
  );
}

export default async function AuditoriaPage() {
  const admin = await getAdminSession();
  const sectorIds = admin ? getVisibleSectorIds(admin) : undefined;
  const sectorRows = await getAuditSummary(sectorIds);

  const sectorsWithTeam = sectorRows.filter((s) => s.totalEmployees > 0);
  const overallTotal = sectorsWithTeam.reduce((acc, s) => acc + s.totalEmployees, 0);
  const overallAudited = sectorsWithTeam.reduce((acc, s) => acc + s.fullyAuditedEmployees, 0);
  const overallPercentage = overallTotal > 0 ? Math.round((overallAudited / overallTotal) * 100) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Auditoria de equipe</h1>
        <p className="mt-1 text-sm text-slate-500">
          Um funcionário está &quot;auditado&quot; quando concluiu (com qualquer nota) todas as
          provas de IT/APR da própria Função nos últimos {AUDIT_WINDOW_DAYS} dias. Passado esse
          prazo sem refazer, ele volta a contar como pendente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Equipe auditada (geral)
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{overallPercentage}%</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Funcionários auditados
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {overallAudited} / {overallTotal}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Contratos com pendências
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {sectorsWithTeam.filter((s) => (s.auditedPercentage ?? 100) < 100).length}
          </p>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">% da equipe auditada por Contrato</h2>
        <div className="mt-4">
          <MeterBarList
            emptyMessage="Nenhum Contrato com funcionários cadastrados."
            threshold={100}
            items={sectorsWithTeam.map((s) => ({
              id: s.sectorId,
              label: s.sectorName,
              value: s.auditedPercentage ?? 0,
              sublabel: `${s.fullyAuditedEmployees} de ${s.totalEmployees} funcionário(s)`,
            }))}
          />
        </div>
      </section>

      <div className="space-y-6">
        {sectorRows.map((sector) => (
          <section key={sector.sectorId} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{sector.sectorName}</h2>
              {sector.totalEmployees > 0 ? (
                <span className="text-xs text-slate-500">
                  {sector.fullyAuditedEmployees} de {sector.totalEmployees} funcionário(s) auditado(s) —{" "}
                  <strong className="text-slate-700">{sector.auditedPercentage}%</strong>
                </span>
              ) : (
                <span className="text-xs text-slate-400">Sem funcionários ativos</span>
              )}
            </div>

            {sector.pendingExams.length === 0 ? (
              <p className="mt-3 text-sm text-emerald-700">
                {sector.totalEmployees > 0
                  ? "Nenhuma pendência — equipe 100% auditada."
                  : "Nada a auditar neste Contrato."}
              </p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="pb-2">IT/APR</th>
                      <th className="pb-2">Tipo</th>
                      <th className="pb-2">Função</th>
                      <th className="pb-2">Pendentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sector.pendingExams.map((exam) => (
                      <tr key={exam.examId} className="border-t border-slate-100">
                        <td className="py-2 text-slate-800">{exam.examTitle}</td>
                        <td className="py-2">
                          <DocTypeBadge documentType={exam.documentType} />
                        </td>
                        <td className="py-2 text-slate-500">{exam.roleName}</td>
                        <td className="py-2 text-slate-500">
                          {exam.missingCount} de {exam.totalApplicable}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}

        {sectorRows.length === 0 && (
          <p className="text-sm text-slate-400">Nenhum Contrato cadastrado.</p>
        )}
      </div>
    </div>
  );
}
