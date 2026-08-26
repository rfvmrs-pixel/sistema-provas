import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, sectors, adminSectors } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { createAdminSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = body?.username?.toString().trim();
  const password = body?.password?.toString();

  if (!username || !password) {
    return NextResponse.json({ error: "Usuário e senha são obrigatórios." }, { status: 400 });
  }

  const admin = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  if (!admin) {
    return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Usuário ou senha inválidos." }, { status: 401 });
  }

  const role =
    admin.role === "admin" || admin.role === "diretoria" || admin.role === "superintendencia"
      ? admin.role
      : "gestor";

  // Diretoria/Superintendência podem estar restritas a um GRUPO específico
  // de Contratos (ex.: "Diretoria de Operações"), guardado em admin_sectors.
  // Sem linhas lá, continuam enxergando a empresa toda (sectorId/sectorIds
  // ficam null, igual ao admin geral).
  let sectorIds: number[] | null = null;
  if (role === "diretoria" || role === "superintendencia") {
    const links = await db
      .select({ sectorId: adminSectors.sectorId })
      .from(adminSectors)
      .where(eq(adminSectors.adminId, admin.id));
    if (links.length > 0) sectorIds = links.map((l) => l.sectorId);
  }

  let sectorName: string | null = null;
  const displaySectorId = sectorIds ? sectorIds[0] : admin.sectorId;
  if (displaySectorId !== null) {
    const sector = await db.query.sectors.findFirst({ where: eq(sectors.id, displaySectorId) });
    sectorName = sector?.name ?? null;
  }

  await createAdminSession({
    adminId: admin.id,
    username: admin.username,
    label: admin.label ?? null,
    sectorId: admin.sectorId,
    sectorName,
    sectorIds,
    role,
  });
  return NextResponse.json({
    ok: true,
    sectorId: admin.sectorId,
    sectorName,
    sectorIds,
    label: admin.label ?? null,
    role,
  });
}
