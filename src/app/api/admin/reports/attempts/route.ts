import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, getVisibleSectorIds } from "@/lib/requireAdmin";
import { getFilteredAttempts } from "@/lib/reports";

// "Últimas tentativas" do Painel com filtros combináveis (mês, dia, nome,
// função) — cada filtro preenchido restringe mais o resultado (ver
// getFilteredAttempts). Mesma visibilidade de Contrato de sempre: gestor só
// vê o próprio, Diretoria/Superintendência escopada só o grupo dela, admin
// geral e Diretoria/Superintendência sem grupo veem tudo.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") || undefined;
  const day = searchParams.get("day") || undefined;
  const name = searchParams.get("name") || undefined;
  const roleIdRaw = searchParams.get("roleId");
  const roleId = roleIdRaw ? Number(roleIdRaw) : undefined;

  const sectorIds = getVisibleSectorIds(guard.admin);
  const attempts = await getFilteredAttempts(sectorIds, { month, day, name, roleId }, 100);

  return NextResponse.json({ attempts });
}
