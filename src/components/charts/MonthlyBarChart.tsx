"use client";

import { useState } from "react";

type MonthlyBarDatum = { label: string; value: number };

// Gráfico de barras verticais simples (SVG puro, sem dependências): usado
// pros dois gráficos de contagem mensal do Painel (provas aplicadas /
// simulados avulsos por mês). Diferente do BarChart (que é sempre 0-100%,
// com cor por severidade em relação a uma meta), aqui o valor é uma
// contagem sem teto fixo — uma única cor (identidade única = 1 série), eixo
// que se adapta ao maior valor do próprio período, e o número exato some
// no hover pra não poluir com 12 rótulos ao mesmo tempo.
export function MonthlyBarChart({
  data,
  emptyMessage,
  color = "#2a78d6",
}: {
  data: MonthlyBarDatum[];
  emptyMessage: string;
  color?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (data.length === 0 || total === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  const width = 640;
  const height = 200;
  const padding = { top: 16, right: 8, bottom: 22, left: 30 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(...data.map((d) => d.value));
  // "Teto redondo" pro grid: próximo múltiplo "bonito" acima do maior valor,
  // pra as linhas de grade caírem em números redondos (não em ex.: 37).
  const niceMax = (() => {
    if (maxValue <= 5) return 5;
    const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
    const step = magnitude / 2 || 1;
    return Math.ceil(maxValue / step) * step;
  })();

  const n = data.length;
  const gap = 6;
  const barW = (chartW - gap * (n - 1)) / n;
  const yFor = (v: number) => padding.top + (1 - v / niceMax) * chartH;
  const gridSteps = [0, niceMax / 2, niceMax];

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Gráfico de barras mensal"
      >
        {gridSteps.map((step) => (
          <g key={step}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={yFor(step)}
              y2={yFor(step)}
              stroke="#e1e0d9"
              strokeWidth={1}
            />
            <text
              x={padding.left - 6}
              y={yFor(step)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-slate-400"
              fontSize={9}
            >
              {Math.round(step)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const x = padding.left + i * (barW + gap);
          const barHeight = Math.max(d.value > 0 ? 3 : 0, (d.value / niceMax) * chartH);
          const y = padding.top + chartH - barHeight;
          const hovered = hoverIdx === i;
          return (
            <g
              key={d.label + i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((v) => (v === i ? null : v))}
            >
              {/* área invisível maior que a barra, pra facilitar o hover */}
              <rect x={x} y={padding.top} width={barW} height={chartH} fill="transparent" />
              <rect x={x} y={y} width={barW} height={barHeight} rx={3} fill={color} opacity={hovered ? 1 : 0.85} />
              {hovered && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-slate-900 font-semibold" fontSize={11}>
                  {d.value}
                </text>
              )}
              <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-slate-400" fontSize={9}>
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-right text-xs text-slate-400">Total no período: {total}</p>
    </div>
  );
}
