import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireSuperAdmin } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";

// Contas "Diretoria": enxergam todos os Contratos e as estatísticas da
// empresa como um todo, igual ao admin geral, mas são só leitura (todo
// endpoint de escrita usa requireEditor, que bloqueia role "diretoria"). Só
// o admin geral cria/gerencia essas contas.
export async function GET() {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const list = await db
    .select({ id: admins.id, username: admins.username, createdAt: admins.createdAt })
    .from(admins)
    .where(eq(admins.role, "diretoria"));

  return NextResponse.json({ directors: list });
}

// Cria (ou, se já existir usuário com esse nome como diretoria, redefine a
// senha de) uma conta de Diretoria.
export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const username = body?.username?.toString().trim();
  const password = body?.password?.toString();

  if (!username || !password) {
    return NextResponse.json(
      { error: "Usuário e senha da Diretoria são obrigatórios." },
      { status: 400 },
    );
  }
  if (password.length < 4) {
    return NextResponse.json({ error: "Senha deve ter ao menos 4 caracteres." }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);

  const existing = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  if (existing) {
    if (existing.role !== "diretoria") {
      return NextResponse.json(
        { error: "Já existe um usuário admin com esse nome, mas não é uma conta de Diretoria." },
        { status: 409 },
      );
    }
    const [updated] = await db
      .update(admins)
      .set({ passwordHash })
      .where(eq(admins.id, existing.id))
      .returning({ id: admins.id, username: admins.username });
    return NextResponse.json({ director: updated, updated: true });
  }

  const [created] = await db
    .insert(admins)
    .values({ username, passwordHash, sectorId: null, role: "diretoria" })
    .returning({ id: admins.id, username: admins.username });
  return NextResponse.json({ director: created }, { status: 201 });
}
