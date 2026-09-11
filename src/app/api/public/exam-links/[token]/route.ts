import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examLinks, exams, sectors, roles } from "@/db/schema";
import { isExamLinkOpen, examLinkClosedReason } from "@/lib/examLinkPeriod";

// Rota pública (sem login) — só o suficiente pra montar a tela de
// autocadastro: título da prova, Contrato/Função (fixos, vêm da prova), e se
// o link ainda está válido (ativo, prova ativa E dentro do período de
// aplicação, ou autorizado pelo gestor).
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const link = await db.query.examLinks.findFirst({ where: eq(examLinks.token, token) });
  if (!link) {
    return NextResponse.json({ error: "Link inválido." }, { status: 404 });
  }

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, link.examId) });
  if (!exam) {
    return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  }

  const [sector, role] = await Promise.all([
    db.query.sectors.findFirst({ where: eq(sectors.id, exam.sectorId) }),
    exam.roleId ? db.query.roles.findFirst({ where: eq(roles.id, exam.roleId) }) : Promise.resolve(undefined),
  ]);

  const open = isExamLinkOpen(link);

  return NextResponse.json({
    examTitle: exam.title,
    sectorName: sector?.name ?? "",
    roleName: role?.name ?? "",
    kind: link.kind,
    valid: link.active && exam.active && open,
    closedReason: !open ? examLinkClosedReason(link) : null,
    periodStart: link.periodStart,
    periodEnd: link.periodEnd,
  });
}
