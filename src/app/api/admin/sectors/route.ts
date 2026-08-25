import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sectors } from "@/db/schema";
import { requireAdmin } from "@/lib/requireAdmin";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const list = await db.select().from(sectors).orderBy(asc(sectors.name));
  return NextResponse.json({ sectors: list });
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const name = body?.name?.toString().trim();
  if (!name) {
    return NextResponse.json({ error: "Nome do setor é obrigatório." }, { status: 400 });
  }

  try {
    const [created] = await db.insert(sectors).values({ name }).returning();
    return NextResponse.json({ sector: created }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Já existe um setor com esse nome." }, { status: 409 });
  }
}
