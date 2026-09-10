// Faixas fixas de "tempo de empresa", usadas no autocadastro (links de prova)
// e nas análises do painel. Código curto salvo no banco (employees.tempoDeEmpresa)
// + rótulo pra exibir.
export const TENURE_OPTIONS = [
  { value: "0-6m", label: "Até 6 meses" },
  { value: "6m-1a", label: "6 meses a 1 ano" },
  { value: "1-3a", label: "1 a 3 anos" },
  { value: "3-5a", label: "3 a 5 anos" },
  { value: "5a+", label: "Mais de 5 anos" },
] as const;

export type TenureCode = (typeof TENURE_OPTIONS)[number]["value"];

const TENURE_LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  TENURE_OPTIONS.map((o) => [o.value, o.label]),
);

export function tenureLabel(value: string | null): string {
  if (!value) return "Não informado";
  return TENURE_LABEL_BY_VALUE[value] ?? value;
}

export function isValidTenureCode(value: unknown): value is TenureCode {
  return typeof value === "string" && TENURE_OPTIONS.some((o) => o.value === value);
}

// Calcula a faixa de tempo de empresa a partir da data de contratação —
// mesmos limites usados na coluna SQL equivalente em getTenureSummary
// (lib/reports.ts): até 6 meses (~182 dias), até 1 ano (~365), até 3 anos
// (~1095), até 5 anos (~1825), senão "mais de 5 anos". `asOf` só existe pra
// facilitar teste; em uso normal é sempre "agora".
export function tenureCodeFromHireDate(hireDate: Date, asOf: Date = new Date()): TenureCode {
  const days = Math.floor((asOf.getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 182) return "0-6m";
  if (days < 365) return "6m-1a";
  if (days < 1095) return "1-3a";
  if (days < 1825) return "3-5a";
  return "5a+";
}

// Faixa "efetiva" de um funcionário: se ele tem data de contratação
// cadastrada, a faixa é sempre recalculada a partir dela (nunca fica
// desatualizada); senão cai no valor manual antigo (autocadastro/importação).
export function effectiveTenureCode(employee: {
  hireDate?: string | Date | null;
  tempoDeEmpresa?: string | null;
}): string | null {
  if (employee.hireDate) {
    const hireDate = employee.hireDate instanceof Date ? employee.hireDate : new Date(employee.hireDate);
    if (!Number.isNaN(hireDate.getTime())) return tenureCodeFromHireDate(hireDate);
  }
  return employee.tempoDeEmpresa ?? null;
}
