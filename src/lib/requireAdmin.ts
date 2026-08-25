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

// Admin geral (sectorId null) só passa por aqui. Use nas rotas que só fazem
// sentido para quem gerencia todos os contratos (ex: criar contrato + gestor).
export async function requireSuperAdmin(): Promise<
  { ok: true; admin: AdminSessionData } | { ok: false; response: NextResponse }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (guard.admin.sectorId !== null) {
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

// true se o admin logado pode ver/gerenciar dados do contrato `sectorId`:
// admin geral (sectorId null) vê tudo; gestor de contrato só vê o próprio.
export function canAccessSector(admin: AdminSessionData, sectorId: number): boolean {
  return admin.sectorId === null || admin.sectorId === sectorId;
}
