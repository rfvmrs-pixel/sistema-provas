"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { getContractBranding } from "@/lib/contractBranding";

const TRIUNFO_MARK = "/logos/triunfo_mark.png";
const TRIUNFO_FULL = "/logos/triunfo_full.png";

const DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "IT", label: "IT — Instrução de Trabalho" },
  { value: "APR", label: "APR — Análise Preliminar de Risco" },
  { value: "MANUAL", label: "Manual de equipamento" },
];

const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return "";
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type IdName = { id: number; name: string };

type PresentationData = {
  totalAttempts: number;
  avgScore: number;
  approvalRate: number;
  employeesEvaluated: number;
  tierCounts: { bronze: number; prata: number; ouro: number };
  bySector: { id: number; name: string; avgScore: number; attemptCount: number }[];
  byRole: { id: number; name: string; avgScore: number; attemptCount: number }[];
  byDocumentType: { documentType: string; avgScore: number; attemptCount: number }[];
  bestTopics: { topic: string; accuracy: number; totalAnswers: number }[];
  worstTopics: { topic: string; accuracy: number; totalAnswers: number }[];
};

const DOC_TYPE_LABELS: Record<string, string> = { IT: "IT", APR: "APR", MANUAL: "Manual" };

function scoreColor(value: number): string {
  if (value >= 70) return "#34d399"; // emerald-400
  if (value >= 50) return "#fbbf24"; // amber-400
  return "#f87171"; // red-400
}

function Bar({ label, value, count }: { label: string; value: number; count: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-white">{label}</span>
        <span className="text-slate-300">
          {value}% <span className="text-slate-400">· {count} tentativa(s)</span>
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full rounded-full bg-white/10">
        <div
          className="h-2.5 rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: scoreColor(value) }}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <p className="text-4xl font-bold" style={{ color: accent ?? "#ffffff" }}>
        {value}
      </p>
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-300">{label}</p>
    </div>
  );
}

function SlideHeader({ contractLabel, monthLabel, tema }: { contractLabel: string; monthLabel: string; tema: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/10 pb-3 text-xs text-slate-300">
      <div className="flex items-center gap-2">
        <Image src={TRIUNFO_MARK} alt="Triunfo" width={20} height={20} className="h-5 w-5 object-contain" />
        <span className="font-medium text-slate-200">{contractLabel}</span>
      </div>
      <div className="text-right">
        {tema && <p className="font-medium text-slate-200">{tema}</p>}
        <p className="capitalize text-slate-400">{monthLabel}</p>
      </div>
    </div>
  );
}

function Slide({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`slide flex min-h-[70vh] flex-col justify-between gap-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-8 text-white shadow-xl sm:p-10 ${className}`}
    >
      {children}
    </section>
  );
}

export default function ApresentacaoPage() {
  const [allSectors, setAllSectors] = useState<IdName[]>([]);
  const [allRoles, setAllRoles] = useState<IdName[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [selectedSectorIds, setSelectedSectorIds] = useState<number[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [selectedDocTypes, setSelectedDocTypes] = useState<string[]>(["IT", "APR", "MANUAL"]);
  const [month, setMonth] = useState(currentMonth());
  const [tema, setTema] = useState("");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ data: PresentationData; sectors: IdName[] } | null>(null);

  useEffect(() => {
    Promise.all([fetch("/api/admin/sectors").then((r) => r.json()), fetch("/api/admin/roles").then((r) => r.json())])
      .then(([sectorsRes, rolesRes]) => {
        const sectorList: IdName[] = sectorsRes.sectors ?? [];
        setAllSectors(sectorList);
        setAllRoles(rolesRes.roles ?? []);
        setSelectedSectorIds(sectorList.map((s: IdName) => s.id));
      })
      .finally(() => setLoadingOptions(false));
  }, []);

  const isMultiContract = allSectors.length > 1;

  function toggle(list: number[], value: number, setList: (v: number[]) => void) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function toggleDocType(value: string) {
    setSelectedDocTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (month) params.set("month", month);
      if (isMultiContract && selectedSectorIds.length > 0) params.set("sectorIds", selectedSectorIds.join(","));
      if (selectedRoleIds.length > 0) params.set("roleIds", selectedRoleIds.join(","));
      if (selectedDocTypes.length > 0) params.set("documentTypes", selectedDocTypes.join(","));

      const res = await fetch(`/api/admin/presentation?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao gerar a apresentação.");
      const json = await res.json();
      setResult(json);
    } catch {
      setError("Não foi possível gerar a apresentação. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  const monthLabel = formatMonthLabel(month);

  const contractLabel = useMemo(() => {
    if (!result) return "";
    if (result.sectors.length === 0) return "Triunfo Logística — Todos os Contratos";
    if (result.sectors.length === 1) return result.sectors[0].name;
    return result.sectors.map((s) => s.name).join(" • ");
  }, [result]);

  const selectedRoleLabels = useMemo(
    () => allRoles.filter((r) => selectedRoleIds.includes(r.id)).map((r) => r.name),
    [allRoles, selectedRoleIds],
  );

  const singleSector = result && result.sectors.length === 1 ? result.sectors[0] : null;
  const branding = singleSector ? getContractBranding(singleSector.name) : null;

  const highlights = useMemo(() => {
    if (!result) return [];
    const { data } = result;
    const items: string[] = [];

    if (data.totalAttempts === 0) {
      items.push("Nenhuma tentativa encontrada para os filtros escolhidos.");
      return items;
    }

    items.push(
      data.approvalRate >= 90
        ? `Excelente índice de aprovação: ${data.approvalRate}% das tentativas atingiram a nota mínima.`
        : data.approvalRate >= 70
          ? `Índice de aprovação em ${data.approvalRate}% — dentro do esperado, com espaço pra melhorar.`
          : `Atenção: apenas ${data.approvalRate}% das tentativas atingiram a nota mínima — recomenda-se reforço de treinamento.`,
    );

    const groups = data.bySector.length > 1 ? data.bySector : data.byRole;
    const groupLabel = data.bySector.length > 1 ? "Contrato" : "Função";
    if (groups.length > 1) {
      const best = [...groups].sort((a, b) => b.avgScore - a.avgScore)[0];
      const worst = [...groups].sort((a, b) => a.avgScore - b.avgScore)[0];
      items.push(`Melhor desempenho: ${groupLabel} "${best.name}", com média de ${best.avgScore}%.`);
      if (worst.id !== best.id) {
        items.push(`Ponto de atenção: ${groupLabel} "${worst.name}", com média de ${worst.avgScore}%.`);
      }
    }

    if (data.worstTopics.length > 0) {
      const t = data.worstTopics[0];
      items.push(`Tema com mais dificuldade: "${t.topic}" (${t.accuracy}% de acerto) — sugerido para reciclagem.`);
    }
    if (data.bestTopics.length > 0) {
      const t = data.bestTopics[0];
      items.push(`Tema mais dominado: "${t.topic}" (${t.accuracy}% de acerto).`);
    }

    const goldPct =
      data.employeesEvaluated > 0 ? Math.round((data.tierCounts.ouro / data.employeesEvaluated) * 100) : 0;
    if (data.employeesEvaluated > 0) {
      items.push(`${goldPct}% dos colaboradores avaliados estão no nível Ouro (acima de 95%).`);
    }

    return items;
  }, [result]);

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .slide {
            page-break-after: always;
            min-height: auto;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body { background: white; }
        }
      `}</style>

      <div className="no-print">
        <h1 className="text-xl font-semibold text-slate-900">Apresentação</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gere uma apresentação corporativa com os resultados de treinamento, filtrando por mês, função, tipo de
          prova{isMultiContract ? " e Contrato" : ""}.
        </p>
      </div>

      <section className="no-print rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Filtros</h2>
        {loadingOptions ? (
          <p className="mt-3 text-sm text-slate-400">Carregando opções...</p>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Mês
                <input
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-500">
                Tema da apresentação (opcional)
                <input
                  value={tema}
                  onChange={(e) => setTema(e.target.value)}
                  placeholder="Ex.: Resultados de Segurança do Trabalho"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
                />
              </label>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500">Tipo de prova</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {DOC_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleDocType(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      selectedDocTypes.includes(opt.value)
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {allRoles.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Função (nenhuma marcada = todas)
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {allRoles.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggle(selectedRoleIds, r.id, setSelectedRoleIds)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        selectedRoleIds.includes(r.id)
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isMultiContract && (
              <div>
                <p className="text-xs font-medium text-slate-500">Contrato (marque um ou mais)</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {allSectors.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(selectedSectorIds, s.id, setSelectedSectorIds)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                        selectedSectorIds.includes(s.id)
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {generating ? "Gerando..." : "Gerar apresentação"}
              </button>
              {result && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Imprimir / Salvar PDF
                </button>
              )}
              {error && <span className="text-sm text-red-600">{error}</span>}
            </div>
          </div>
        )}
      </section>

      {result && (
        <div className="space-y-4">
          {/* Slide 1 — Capa */}
          <Slide className="items-center justify-center text-center">
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              {branding && branding.kind === "client" && (
                <Image
                  src={branding.logoSrc}
                  alt={branding.clientName}
                  width={260}
                  height={100}
                  className="max-h-24 w-auto object-contain"
                />
              )}
              {branding && branding.kind === "combo" && (
                <div className="flex items-center justify-center gap-6">
                  <Image src={TRIUNFO_MARK} alt="Triunfo" width={90} height={90} className="h-20 w-20 object-contain" />
                  <Image
                    src={branding.logoSrc}
                    alt={branding.clientName}
                    width={140}
                    height={70}
                    className="max-h-16 w-auto object-contain"
                  />
                </div>
              )}
              {(!branding || branding.kind === "triunfo") && (
                <Image
                  src={TRIUNFO_FULL}
                  alt="Triunfo Logística"
                  width={280}
                  height={90}
                  className="max-h-20 w-auto object-contain"
                />
              )}
              <div>
                <p className="text-sm font-medium uppercase tracking-widest text-amber-400">{contractLabel}</p>
                <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                  {tema || "Relatório de Desempenho em Treinamentos"}
                </h2>
                <p className="mt-3 capitalize text-slate-300">{monthLabel}</p>
                {selectedRoleLabels.length > 0 && (
                  <p className="mt-1 text-sm text-slate-400">Função: {selectedRoleLabels.join(", ")}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500">Gerado pelo Sistema de Avaliação Triunfo</p>
          </Slide>

          {/* Slide 2 — Números gerais */}
          <Slide>
            <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
            <h3 className="text-xl font-semibold">Números gerais</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label="Tentativas" value={String(result.data.totalAttempts)} />
              <StatCard label="Média geral" value={`${result.data.avgScore}%`} accent={scoreColor(result.data.avgScore)} />
              <StatCard
                label="Taxa de aprovação"
                value={`${result.data.approvalRate}%`}
                accent={scoreColor(result.data.approvalRate)}
              />
              <StatCard label="Colaboradores avaliados" value={String(result.data.employeesEvaluated)} />
            </div>
          </Slide>

          {/* Slide 3 — Distribuição Bronze/Prata/Ouro */}
          <Slide>
            <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
            <h3 className="text-xl font-semibold">Classificação dos colaboradores</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(
                [
                  { key: "ouro", emoji: "🥇", label: "Ouro (acima de 95%)", color: "#fbbf24" },
                  { key: "prata", emoji: "🥈", label: "Prata (70% a 95%)", color: "#cbd5e1" },
                  { key: "bronze", emoji: "🥉", label: "Bronze (abaixo de 70%)", color: "#fb923c" },
                ] as const
              ).map((t) => {
                const value = result.data.tierCounts[t.key];
                const pct =
                  result.data.employeesEvaluated > 0 ? Math.round((value / result.data.employeesEvaluated) * 100) : 0;
                return (
                  <div key={t.key} className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
                    <p className="text-3xl">{t.emoji}</p>
                    <p className="mt-2 text-3xl font-bold" style={{ color: t.color }}>
                      {value}
                    </p>
                    <p className="mt-1 text-xs text-slate-300">{t.label}</p>
                    <p className="mt-1 text-xs text-slate-400">{pct}% dos colaboradores</p>
                  </div>
                );
              })}
            </div>
          </Slide>

          {/* Slide 4 — Por tipo de prova */}
          {result.data.byDocumentType.length > 0 && (
            <Slide>
              <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
              <h3 className="text-xl font-semibold">Desempenho por tipo de prova</h3>
              <div className="flex flex-1 flex-col justify-center gap-5">
                {result.data.byDocumentType.map((d) => (
                  <Bar
                    key={d.documentType}
                    label={DOC_TYPE_LABELS[d.documentType] ?? d.documentType}
                    value={d.avgScore}
                    count={d.attemptCount}
                  />
                ))}
              </div>
            </Slide>
          )}

          {/* Slide 5 — Por função */}
          {result.data.byRole.length > 0 && (
            <Slide>
              <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
              <h3 className="text-xl font-semibold">Desempenho por função</h3>
              <div className="flex flex-1 flex-col justify-center gap-5">
                {result.data.byRole.map((r) => (
                  <Bar key={r.id} label={r.name} value={r.avgScore} count={r.attemptCount} />
                ))}
              </div>
            </Slide>
          )}

          {/* Slide 6 — Por contrato (só quando mais de um Contrato entrou na conta) */}
          {result.data.bySector.length > 1 && (
            <Slide>
              <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
              <h3 className="text-xl font-semibold">Desempenho por Contrato</h3>
              <div className="flex flex-1 flex-col justify-center gap-5">
                {result.data.bySector.map((s) => (
                  <Bar key={s.id} label={s.name} value={s.avgScore} count={s.attemptCount} />
                ))}
              </div>
            </Slide>
          )}

          {/* Slide 7 — Destaques e comentários */}
          <Slide>
            <SlideHeader contractLabel={contractLabel} monthLabel={monthLabel} tema={tema} />
            <h3 className="text-xl font-semibold">Destaques</h3>
            <ul className="flex-1 space-y-4">
              {highlights.map((h, i) => (
                <li key={i} className="flex gap-3 text-base leading-relaxed text-slate-100">
                  <span className="mt-1 text-amber-400">●</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Triunfo Logística — Sistema de Avaliação</p>
          </Slide>
        </div>
      )}
    </div>
  );
}
