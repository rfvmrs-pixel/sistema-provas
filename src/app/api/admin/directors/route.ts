import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

const FULL_ACCESS_ROLES = ["diretoria", "superintendencia"] as const;
type FullAccessRole = (typeof FULL_ACCESS_ROLES)[number];

function isFullAccessRole(value: unknown): value is FullAccessRole {
  return typeof value === "string" && (FULL_ACCESS_ROLES as readonly string[]).includes(value);
}

// Contas "Diretoria" e "Superintendência": enxergam todos os Contratos e as
// estatísticas da empresa como um todo, igual ao admin geral, mas são só
// leitura (todo endpoint de escrita usa requireEditor, que bloqueia os dois
// roles). Só o admin geral cria/gerencia essas contas.
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const list = await db
    .select({ id: admins.id, username: admins.username, role: admins.role, createdAt: admins.createdAt })
    .from(admins)
    .where(inArray(admins.role, [...FULL_ACCESS_ROLES]));

  return NextResponse.json({ directors: list });
}

// Cria (ou, se já existir usuário com esse nome no mesmo role, redefine a
// senha de) uma conta de Diretoria ou Superintendência.
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const username = body?.username?.toString().trim();
  const password = body?.password?.toString();
  const role = isFullAccessRole(body?.role) ? body.role : "diretoria";

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuário e senha são obrigatórios." },
      { status: 400 },
    );
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const existing = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  if (existing) {
    if (!isFullAccessRole(existing.role)) {
      return NextResponse.json(
        { error: "Já existe um usuário admin com esse nome, mas não é uma conta de Diretoria/Superintendência." },
        { status: 409 },
      );
    }
    const [updated] = await db
      .update(admins)
      .set({ passwordHash, role })
      .where(eq(admins.id, existing.id))
      .returning({ id: admins.id, username: admins.username, role: admins.role });
    return NextResponse.json({ director: updated, updated: true });
  }

  const [created] = await db
    .insert(admins)
    .values({ username, passwordHash, sectorId: null, role })
    .returning({ id: admins.id, username: admins.username, role: admins.role });
  return NextResponse.json({ director: created }, { status: 201 });
}
