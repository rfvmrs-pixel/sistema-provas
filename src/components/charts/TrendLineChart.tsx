type TrendLineChartProps = {
  points: { date: string; avgScore: number; attemptCount: number }[];
  threshold?: number;
};

function formatDateLabel(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

// Gráfico de linha simples (SVG puro, sem dependências): média de nota ao
// longo do tempo, com uma linha de referência na meta (70%) e o valor mais
// recente rotulado diretamente no fim da linha.
export function TrendLineChart({ points, threshold = 70 }: TrendLineChartProps) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-slate-400">
        Ainda não há dados suficientes ao longo do tempo para montar o gráfico de tendência.
      </p>
    );
  }

  const width = 640;
  const height = 200;
  const padding = { top: 16, right: 16, bottom: 28, left: 34 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const n = points.length;
  const xFor = (i: number) => padding.left + (i * chartW) / (n - 1);
  const yFor = (value: number) => padding.top + (1 - Math.max(0, Math.min(100, value)) / 100) * chartH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(p.avgScore)}`).join(" ");
  const areaPath = `${linePath} L${xFor(n - 1)},${padding.top + chartH} L${xFor(0)},${padding.top + chartH} Z`;

  const last = points[n - 1];
  const gridSteps = [0, 50, 100];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de tendência da média de notas ao longo do tempo"
    >
      {/* gridlines + eixo Y */}
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
          <text x={padding.left - 8} y={yFor(step)} textAnchor="end" dominantBaseline="middle" className="fill-slate-400" fontSize={10}>
            {step}
          </text>
        </g>
      ))}

      {/* linha de referência da meta */}
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={yFor(threshold)}
        y2={yFor(threshold)}
        stroke="#c3c2b7"
        strokeWidth={1}
      />
      <text x={width - padding.right} y={yFor(threshold) - 4} textAnchor="end" className="fill-slate-400" fontSize={10}>
        meta {threshold}%
      </text>

      {/* área sob a linha */}
      <path d={areaPath} fill="#2a78d6" opacity={0.1} />

      {/* linha */}
      <path d={linePath} fill="none" stroke="#2a78d6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* marcador final + rótulo direto */}
      <circle cx={xFor(n - 1)} cy={yFor(last.avgScore)} r={4} fill="#2a78d6" stroke="#fff" strokeWidth={2} />
      <text
        x={xFor(n - 1) - 6}
        y={yFor(last.avgScore) - 10}
        textAnchor="end"
        className="fill-slate-900 font-semibold"
        fontSize={12}
      >
        {last.avgScore}%
      </text>

      {/* rótulos do eixo X: só o primeiro e o último, pra não poluir */}
      <text x={xFor(0)} y={height - 6} textAnchor="start" className="fill-slate-400" fontSize={10}>
        {formatDateLabel(points[0].date)}
      </text>
      <text x={xFor(n - 1)} y={height - 6} textAnchor="end" className="fill-slate-400" fontSize={10}>
        {formatDateLabel(last.date)}
      </text>
    </svg>
  );
}
