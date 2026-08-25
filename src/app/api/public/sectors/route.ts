import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { sectors } from "@/db/schema";

export async function GET() {
  const list = await db.select().from(sectors).orderBy(asc(sectors.name));
  return NextResponse.json({ sectors: list });
}
