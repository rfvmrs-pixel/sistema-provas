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
