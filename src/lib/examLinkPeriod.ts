// Período de aplicação de um link de prova (Geral/Direcionada/Curso/
// Simulado específico) — ver exam_links.periodStart/periodEnd. Fora do
// período o link fecha sozinho pra apuração de notas; só reabre se um
// gestor autorizar (authorizedAt preenchido) com um comentário justificando
// (ver PATCH /api/admin/exam-links/[id]).
export type ExamLinkPeriod = {
  periodStart: string | null; // "YYYY-MM-DD"
  periodEnd: string | null;
  authorizedAt: Date | string | null;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isExamLinkOpen(link: ExamLinkPeriod): boolean {
  if (link.authorizedAt) return true; // autorizado pelo gestor, ignora o período
  if (!link.periodStart && !link.periodEnd) return true; // sem restrição de período
  const today = todayStr();
  if (link.periodStart && today < link.periodStart) return false; // ainda não começou
  if (link.periodEnd && today > link.periodEnd) return false; // já encerrou
  return true;
}

export function examLinkClosedReason(link: ExamLinkPeriod): string | null {
  if (isExamLinkOpen(link)) return null;
  const today = todayStr();
  if (link.periodStart && today < link.periodStart) {
    return `Essa prova só abre a partir de ${formatDate(link.periodStart)}.`;
  }
  return "Essa prova está fechada para apuração de notas. Peça ao gestor para autorizar uma nova resposta.";
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
