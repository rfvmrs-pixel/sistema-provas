import { NextRequest, NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { sectors } from "@/db/schema";
import { requireAdmin, getVisibleSectorIds } from "@/lib/requireAdmin";
import { getPresentationSummary, type PresentationFilters } from "@/lib/reports";

const VALID_DOC_TYPES = ["IT", "APR", "MANUAL"];

// Dados pra aba "Apresentação": mesma visibilidade de Contrato de sempre
// (gestor só o próprio, Diretoria/Superintendência escopada só o grupo dela),
// com filtros adicionais de mês/função/tipo de documento e, quando o admin
// enxerga mais de um Contrato, a escolha de quais Contratos entram na conta —
// sempre restrita à interseção com o que ele realmente pode ver.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const visibleSectorIds = getVisibleSectorIds(guard.admin);

  let sectorIds: number[] | undefined;
  const sectorIdsParam = searchParams.get("sectorIds");
  if (sectorIdsParam) {
    const requested = sectorIdsParam
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    if (visibleSectorIds) {
      const allowed = requested.filter((id) => visibleSectorIds.includes(id));
      sectorIds = allowed.length > 0 ? allowed : visibleSectorIds;
    } else {
      sectorIds = requested.length > 0 ? requested : undefined;
    }
  } else {
    sectorIds = visibleSectorIds;
  }

  const month = searchParams.get("month") || undefined;

  const roleIdsParam = searchParams.get("roleIds");
  const roleIds = roleIdsParam
    ? roleIdsParam
        .split(",")
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
    : undefined;

  const docTypesParam = searchParams.get("documentTypes");
  const documentTypes = docTypesParam
    ? docTypesParam.split(",").filter((v) => VALID_DOC_TYPES.includes(v))
    : undefined;

  const filters: PresentationFilters = { month, roleIds, documentTypes };

  const [data, sectorRows] = await Promise.all([
    getPresentationSummary(sectorIds, filters),
    sectorIds && sectorIds.length > 0
      ? db
          .select({ id: sectors.id, name: sectors.name })
          .from(sectors)
          .where(inArray(sectors.id, sectorIds))
          .orderBy(asc(sectors.name))
      : Promise.resolve([]),
  ]);

  return NextResponse.json({ data, sectors: sectorRows });
}
