import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
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

  await createAdminSession({ adminId: admin.id, username: admin.username });
  return NextResponse.json({ ok: true });
}
