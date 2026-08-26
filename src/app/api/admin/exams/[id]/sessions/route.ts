import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { exams, employees } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

const CODE_EXPIRES_HOURS = 48;

function generateCode(): string {
  // 6 dígitos, fácil de digitar no celular. Não precisa ser imprevisível como
  // uma senha de verdade: é de uso único, vinculado a nome+setor+prova, e
  // queimado assim que o colaborador termina a prova.
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// "Prova do dia": o gestor escolhe quais colaboradores (já cadastrados nesse
// Setor + Função) vão fazer essa prova hoje. Para cada um, geramos um código
// de 6 dígitos de uso único (login = nome + setor, senha = código). O código
// é queimado no /api/employee/attempts/[id]/submit assim que a tentativa é
// finalizada, então não dá pra reusar depois — e por não ter login
// persistente, o colaborador não consegue consultar o resultado depois; só
// aparece nos relatórios do gestor.
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
  const employeeIds: number[] = Array.isArray(body?.employeeIds)
    ? body.employeeIds.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
    : [];
  const label = body?.label?.toString().trim() || `Prova do dia ${new Date().toLocaleDateString("pt-BR")}`;

  if (employeeIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um colaborador." }, { status: 400 });
  }

  const candidates = await db
    .select()
    .from(employees)
    .where(inArray(employees.id, employeeIds));

  const invalid = candidates.filter(
    (e) => e.sectorId !== exam.sectorId || e.roleId !== exam.roleId || !e.active,
  );
  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error:
          "Todos os colaboradores selecionados precisam estar ativos e no mesmo Setor e Função da prova.",
      },
      { status: 400 },
    );
  }
  if (candidates.length !== employeeIds.length) {
    return NextResponse.json({ error: "Um ou mais colaboradores não foram encontrados." }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + CODE_EXPIRES_HOURS * 60 * 60 * 1000);
  const results: { employeeId: number; employeeName: string; sectorId: number; code: string }[] = [];

  for (const employee of candidates) {
    const code = generateCode();
    const tempCodeHash = await hashPassword(code);
    await db
      .update(employees)
      .set({
        tempCodeHash,
        tempCodeExamId: examId,
        tempCodeSessionLabel: label,
        tempCodeExpiresAt: expiresAt,
      })
      .where(eq(employees.id, employee.id));
    results.push({
      employeeId: employee.id,
      employeeName: employee.name,
      sectorId: employee.sectorId,
      code,
    });
  }

  return NextResponse.json({ label, expiresAt, credentials: results });
}
