// Barra horizontal "meter": o preenchimento carrega a severidade (verde/
// amarelo/vermelho conforme a meta de 70%), a trilha é um tom mais claro da
// mesma cor — assim o estado se lê olhando só pra barra, sem precisar do
// número. Ponta arredondada, espessura fixa (12px, dentro do limite de 24px).
type MeterBarProps = {
  label: string;
  value: number; // 0-100
  sublabel?: string;
  threshold?: number;
};

function severity(value: number, threshold: number) {
  if (value >= threshold) {
    return { fill: "#10b981", track: "#d1fae5", text: "text-emerald-700" }; // emerald-500 / emerald-100
  }
  if (value >= threshold - 20) {
    return { fill: "#f59e0b", track: "#fef3c7", text: "text-amber-700" }; // amber-500 / amber-100
  }
  return { fill: "#ef4444", track: "#fee2e2", text: "text-red-700" }; // red-500 / red-100
}

export function MeterBar({ label, value, sublabel, threshold = 70 }: MeterBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const { fill, track, text } = severity(clamped, threshold);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm text-slate-700">{label}</span>
        <span className={`shrink-0 text-xs font-semibold ${text}`}>{clamped}%</span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: track }}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${clamped}%`, backgroundColor: fill }}
        />
      </div>
      {sublabel && <p className="mt-0.5 text-xs text-slate-400">{sublabel}</p>}
    </div>
  );
}

export function MeterBarList({
  items,
  emptyMessage,
  threshold = 70,
}: {
  items: { id: string | number; label: string; value: number; sublabel?: string }[];
  emptyMessage: string;
  threshold?: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <MeterBar key={item.id} label={item.label} value={item.value} sublabel={item.sublabel} threshold={threshold} />
      ))}
    </div>
  );
}
