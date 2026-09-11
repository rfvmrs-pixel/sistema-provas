import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, sectors, roles } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { getEmployeeReport } from "@/lib/reports";
import { tenureLabel } from "@/lib/tenure";

// Prontuário individual do funcionário — usado no drilldown "Desempenho por
// função" do Painel: quantas provas feitas, % da nota média, onde está
// melhor/pior e a classificação Bronze/Prata/Ouro. Somente leitura, então
// requireAdmin (não requireEditor) já basta — Diretoria/Superintendência
// também podem abrir o prontuário.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const employeeId = Number(id);
  if (!Number.isFinite(employeeId)) {
    return NextResponse.json({ error: "Funcionário inválido." }, { status: 400 });
  }

  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      matricula: employees.matricula,
      tempoDeEmpresa: employees.tempoDeEmpresa,
      sectorId: employees.sectorId,
      sectorName: sectors.name,
      roleName: roles.name,
    })
    .from(employees)
    .innerJoin(sectors, eq(employees.sectorId, sectors.id))
    .innerJoin(roles, eq(employees.roleId, roles.id))
    .where(eq(employees.id, employeeId))
    .limit(1);

  if (!employee) {
    return NextResponse.json({ error: "Funcionário não encontrado." }, { status: 404 });
  }
  if (!canAccessSector(guard.admin, employee.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse funcionário." }, { status: 403 });
  }

  const report = await getEmployeeReport(employeeId);

  return NextResponse.json({
    employee: {
      id: employee.id,
      name: employee.name,
      matricula: employee.matricula,
      sectorName: employee.sectorName,
      roleName: employee.roleName,
      tenure: tenureLabel(employee.tempoDeEmpresa),
    },
    ...report,
  });
}
