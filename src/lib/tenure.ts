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
