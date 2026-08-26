import { NextResponse } from "next/server";
import { getAdminSession, type AdminSessionData } from "@/lib/session";

export async function requireAdmin(): Promise<
  { ok: true; admin: AdminSessionData } | { ok: false; response: NextResponse }
> {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
    };
  }
  return { ok: true, admin };
}

// Admin geral (role "admin") só passa por aqui. Use nas rotas que só fazem
// sentido para quem gerencia todos os contratos (ex: criar contrato + gestor,
// criar/gerenciar contas de Diretoria). Diretoria NÃO passa por aqui mesmo
// enxergando todos os contratos, porque ela é só leitura.
export async function requireSuperAdmin(): Promise<
  { ok: true; admin: AdminSessionData } | { ok: false; response: NextResponse }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (guard.admin.role !== "admin") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Só o admin geral pode fazer isso." },
        { status: 403 },
      ),
    };
  }
  return guard;
}

// Bloqueia contas só-leitura ("diretoria" e "superintendencia") em qualquer
// rota de escrita (POST/PATCH/DELETE). Admin geral e gestor de contrato
// passam normalmente — a checagem de qual Contrato cada um pode mexer
// continua com canAccessSector. Use isso no lugar de requireAdmin() em todo
// handler que cria, edita ou exclui algo.
const READ_ONLY_ROLES: AdminSessionData["role"][] = ["diretoria", "superintendencia"];

export async function requireEditor(): Promise<
  { ok: true; admin: AdminSessionData } | { ok: false; response: NextResponse }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (READ_ONLY_ROLES.includes(guard.admin.role)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            guard.admin.role === "superintendencia"
              ? "Sua conta é somente leitura (Superintendência) — essa ação não é permitida."
              : "Sua conta é somente leitura (Diretoria) — essa ação não é permitida.",
        },
        { status: 403 },
      ),
    };
  }
  return guard;
}

// Lista de Contratos que o admin logado enxerga, ou `undefined` quando não
// há restrição (enxerga a empresa toda): admin geral, e Diretoria/
// Superintendência sem grupo definido (sectorIds null). Gestor sempre volta
// um array de 1 item (o próprio Contrato); Diretoria/Superintendência
// escopada a um grupo volta os Contratos desse grupo.
export function getVisibleSectorIds(admin: AdminSessionData): number[] | undefined {
  if (admin.sectorIds && admin.sectorIds.length > 0) return admin.sectorIds;
  if (admin.sectorId !== null) return [admin.sectorId];
  return undefined;
}

// true se o admin logado pode ver/gerenciar dados do contrato `sectorId`:
// sem restrição (undefined) vê tudo; senão só se `sectorId` estiver na lista
// de Contratos visíveis (gestor: só o próprio; Diretoria/Superintendência
// escopada: os do grupo dela).
export function canAccessSector(admin: AdminSessionData, sectorId: number): boolean {
  const visible = getVisibleSectorIds(admin);
  return visible === undefined || visible.includes(sectorId);
}
