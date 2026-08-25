import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const list = await db.select().from(roles).orderBy(asc(roles.name));
  return NextResponse.json({ roles: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  if (!name) {
    return NextResponse.json({ error: "Nome da função é obrigatório." }, { status: 400 });
  }

  try {
    const [created] = await db.insert(roles).values({ name }).returning();
    return NextResponse.json({ role: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Já existe uma função com esse nome." }, { status: 409 });
  }
}
