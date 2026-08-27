"use client";

import { useState } from "react";

// Gráfico de barras horizontal com eixo compartilhado (mesmas linhas de grade
// em 0/25/50/75/100% em todas as barras) — usado onde antes havia uma lista
// de barras "meter" soltas (MeterBarList) sem eixo comum. A cor de cada barra
// continua indicando a situação em relação à meta (verde/amarelo/vermelho),
// não uma categoria diferente por setor/função — por isso a legenda descreve
// faixas de meta, não nomes de série.
type BarDatum = { id: string | number; label: string; value: number; sublabel?: string };

const GRIDLINES = [0, 25, 50, 75, 100];

function severity(value: number, threshold: number) {
  if (value >= threshold) return { fill: "#10b981", text: "text-emerald-700" }; // emerald-500
  if (value >= threshold - 20) return { fill: "#f59e0b", text: "text-amber-700" }; // amber-500
  return { fill: "#ef4444", text: "text-red-700" }; // red-500
}

export function BarChart({
  items,
  emptyMessage,
  threshold = 70,
}: {
  items: BarDatum[];
  emptyMessage: string;
  threshold?: number;
}) {
  const [hoverId, setHoverId] = useState<string | number | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#10b981" }} />
          Meta atingida (≥{threshold}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
          Atenção ({threshold - 20}–{threshold - 1}%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#ef4444" }} />
          Abaixo da meta (&lt;{threshold - 20}%)
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item) => {
          const clamped = Math.max(0, Math.min(100, item.value));
          const { fill, text } = severity(clamped, threshold);
          const hovered = hoverId === item.id;
          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoverId(item.id)}
              onMouseLeave={() => setHoverId((id) => (id === item.id ? null : id))}
              className={`relative flex items-center gap-3 rounded-md px-2 py-1.5 transition ${
                hovered ? "bg-slate-50" : ""
              }`}
            >
              <span
                className="w-24 shrink-0 truncate text-sm text-slate-700 sm:w-36"
                title={item.label}
              >
                {item.label}
              </span>
              <div className="relative h-4 flex-1">
                {GRIDLINES.map((g) => (
                  <div
                    key={g}
                    className="absolute top-0 h-full w-px bg-slate-100"
                    style={{ left: `${g}%` }}
                  />
                ))}
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width]"
                  style={{ width: `${clamped}%`, minWidth: clamped > 0 ? 4 : 0, backgroundColor: fill }}
                />
              </div>
              <span className={`w-12 shrink-0 text-right text-xs font-semibold ${text}`}>
                {clamped}%
              </span>
              {hovered && item.sublabel && (
                <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg">
                  {item.label}: {clamped}% · {item.sublabel}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex pl-[6.5rem] pr-12 text-[10px] text-slate-400 sm:pl-[9.5rem]">
        {GRIDLINES.map((g, i) => (
          <span
            key={g}
            className="flex-1"
            style={{
              textAlign: i === 0 ? "left" : i === GRIDLINES.length - 1 ? "right" : "center",
            }}
          >
            {g}%
          </span>
        ))}
      </div>
    </div>
  );
}
