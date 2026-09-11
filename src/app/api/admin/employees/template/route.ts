import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sectors, roles } from "@/db/schema";
import { requireAdmin, getVisibleSectorIds } from "@/lib/requireAdmin";
import { generateEmployeeTemplate } from "@/lib/employeeTemplate";

// GET: planilha modelo (.xlsx) pra cadastro de funcionários em lote — Nome,
// Matrícula, Setor, Função, Tempo de empresa, mais uma aba de referência com
// os Setores/Funções válidos hoje. Gestor só vê o próprio Setor na lista de
// referência (mas pode preencher qualquer texto — a validação de verdade
// acontece na importação).
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const visibleSectorIds = getVisibleSectorIds(guard.admin);
  const sectorScope = visibleSectorIds ? inArray(sectors.id, visibleSectorIds) : undefined;

  const [sectorList, roleList] = await Promise.all([
    db.select().from(sectors).where(sectorScope).orderBy(asc(sectors.name)),
    db.select().from(roles).orderBy(asc(roles.name)),
  ]);

  const buffer = await generateEmployeeTemplate(sectorList, roleList);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modelo-funcionarios.xlsx"',
    },
  });
}
