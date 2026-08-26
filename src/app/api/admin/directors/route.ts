import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { admins, adminSectors, sectors } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

const FULL_ACCESS_ROLES = ["diretoria", "superintendencia"] as const;
type FullAccessRole = (typeof FULL_ACCESS_ROLES)[number];

function isFullAccessRole(value: unknown): value is FullAccessRole {
  return typeof value === "string" && (FULL_ACCESS_ROLES as readonly string[]).includes(value);
}

// Contas "Diretoria" e "Superintendência": são só leitura (todo endpoint de
// escrita usa requireEditor, que bloqueia os dois roles). Por padrão (sem
// linhas em admin_sectors) enxergam todos os Contratos, igual ao admin
// geral; opcionalmente podem ficar restritas a um GRUPO específico de
// Contratos (ex.: "Diretoria de Operações"). Só o admin geral cria/gerencia
// essas contas.
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const list = await db
    .select({
      id: admins.id,
      username: admins.username,
      label: admins.label,
      role: admins.role,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .where(inArray(admins.role, [...FULL_ACCESS_ROLES]));

  const links = await db
    .select({ adminId: adminSectors.adminId, sectorId: adminSectors.sectorId, sectorName: sectors.name })
    .from(adminSectors)
    .innerJoin(sectors, eq(sectors.id, adminSectors.sectorId));

  const sectorsByAdmin = new Map<number, { id: number; name: string }[]>();
  for (const link of links) {
    const arr = sectorsByAdmin.get(link.adminId) ?? [];
    arr.push({ id: link.sectorId, name: link.sectorName });
    sectorsByAdmin.set(link.adminId, arr);
  }

  const directors = list.map((d) => ({ ...d, sectors: sectorsByAdmin.get(d.id) ?? [] }));

  return NextResponse.json({ directors });
}

// Cria (ou, se já existir usuário com esse nome no mesmo role, redefine a
// senha/grupo de Contratos de) uma conta de Diretoria ou Superintendência.
// `sectorIds` vazio ou omitido = sem restrição (enxerga a empresa toda).
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const username = body?.username?.toString().trim();
  const password = body?.password?.toString();
  const role = isFullAccessRole(body?.role) ? body.role : "diretoria";
  const label = body?.label?.toString().trim() || null;
  const sectorIds: number[] = Array.isArray(body?.sectorIds)
    ? body.sectorIds.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n) && n > 0)
    : [];

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuário e senha são obrigatórios." },
      { status: 400 },
    );
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  if (sectorIds.length > 0) {
    const found = await db.select({ id: sectors.id }).from(sectors).where(inArray(sectors.id, sectorIds));
    if (found.length !== sectorIds.length) {
      return NextResponse.json({ error: "Um ou mais Contratos selecionados são inválidos." }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(password);

  const existing = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  let adminId: number;
  let responseBody: { id: number; username: string; label: string | null; role: string };
  let updated = false;

  if (existing) {
    if (!isFullAccessRole(existing.role)) {
      return NextResponse.json(
        { error: "Já existe um usuário admin com esse nome, mas não é uma conta de Diretoria/Superintendência." },
        { status: 409 },
      );
    }
    const [row] = await db
      .update(admins)
      .set({ passwordHash, role, label })
      .where(eq(admins.id, existing.id))
      .returning({ id: admins.id, username: admins.username, label: admins.label, role: admins.role });
    adminId = row.id;
    responseBody = row;
    updated = true;
  } else {
    const [row] = await db
      .insert(admins)
      .values({ username, passwordHash, sectorId: null, role, label })
      .returning({ id: admins.id, username: admins.username, label: admins.label, role: admins.role });
    adminId = row.id;
    responseBody = row;
  }

  // Sincroniza o grupo de Contratos: substitui tudo pelo conjunto enviado
  // agora (lista vazia = sem restrição, enxerga a empresa toda).
  await db.delete(adminSectors).where(eq(adminSectors.adminId, adminId));
  if (sectorIds.length > 0) {
    await db.insert(adminSectors).values(sectorIds.map((sectorId) => ({ adminId, sectorId })));
  }

  return NextResponse.json({ director: responseBody, updated }, { status: updated ? 200 : 201 });
}
