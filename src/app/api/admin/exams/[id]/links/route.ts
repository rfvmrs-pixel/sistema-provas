import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, examLinks, employees } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";
import { generateLinkToken } from "@/lib/token";

// Lista os links de aplicação (Prova Geral/Direcionada) já gerados pra essa
// prova, com o nome do funcionário-alvo quando for direcionado.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const list = await db
    .select({
      id: examLinks.id,
      token: examLinks.token,
      kind: examLinks.kind,
      label: examLinks.label,
      active: examLinks.active,
      createdAt: examLinks.createdAt,
      targetEmployeeId: examLinks.targetEmployeeId,
      targetEmployeeName: employees.name,
    })
    .from(examLinks)
    .leftJoin(employees, eq(examLinks.targetEmployeeId, employees.id))
    .where(eq(examLinks.examId, examId))
    .orderBy(examLinks.createdAt);

  return NextResponse.json({ links: list });
}

// Cria um novo link de aplicação:
// - kind "geral": qualquer colaborador do Setor+Função da prova pode usar,
//   autocadastrando-se pela matrícula.
// - kind "direcionada": travado num funcionário específico — informe
//   name+matricula (acha um já existente com essa matrícula nesse Setor, ou
//   cria na hora).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }
  if (!exam.active) {
    return NextResponse.json({ error: "Essa prova está desativada." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const kind = body?.kind === "direcionada" ? "direcionada" : "geral";
  const label = body?.label?.toString().trim() || null;

  let targetEmployeeId: number | null = null;

  if (kind === "direcionada") {
    const name = body?.name?.toString().trim();
    const matricula = body?.matricula?.toString().trim();
    if (!name || !matricula) {
      return NextResponse.json(
        { error: "Informe nome e matrícula do colaborador pra gerar um link direcionado." },
        { status: 400 },
      );
    }

    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.sectorId, exam.sectorId), eq(employees.matricula, matricula)),
    });

    if (existing) {
      const [updated] = await db
        .update(employees)
        .set({ name, roleId: exam.roleId, active: true })
        .where(eq(employees.id, existing.id))
        .returning({ id: employees.id });
      targetEmployeeId = updated.id;
    } else {
      const randomPasswordHash = await hashPassword(generateLinkToken());
      const [created] = await db
        .insert(employees)
        .values({
          name,
          matricula,
          sectorId: exam.sectorId,
          roleId: exam.roleId,
          passwordHash: randomPasswordHash,
          active: true,
        })
        .returning({ id: employees.id });
      targetEmployeeId = created.id;
    }
  }

  // Gera um token único — colisão é praticamente impossível (18 bytes
  // aleatórios), mas tenta de novo se acontecer.
  let token = generateLinkToken();
  for (let attempt = 0; attempt < 3; attempt++) {
    const clash = await db.query.examLinks.findFirst({ where: eq(examLinks.token, token) });
    if (!clash) break;
    token = generateLinkToken();
  }

  const [link] = await db
    .insert(examLinks)
    .values({ examId, token, kind, targetEmployeeId, label })
    .returning();

  return NextResponse.json({ link }, { status: 201 });
}
