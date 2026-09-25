import { NextResponse } from "next/server";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { getEmployeePanel } from "@/lib/contractView";
import { getEmployeeTopicSummary } from "@/lib/reports";

// Painel do colaborador (Painel geral → Visão por contrato → Função →
// colaborador): % de realização dos módulos (ITs/APRs/Manuais da Função),
// feitos e pendentes, tempo de casa, temas onde vai melhor/pior e todas as
// provas já feitas. Somente leitura — Diretoria/Superintendência também abrem.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;
  const { id } = await ctx.params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });

  const panel = await getEmployeePanel(employeeId);
  if (!panel) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, panel.employee.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse colaborador." }, { status: 403 });
  }
  const topics = await getEmployeeTopicSummary(employeeId);
  return NextResponse.json({
    ...panel,
    bestTopics: [...topics].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5),
    worstTopics: topics.slice(0, 5),
  });
}
