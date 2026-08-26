import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";

// GET: baixa o PDF original salvo na biblioteca.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const document = await db.query.documents.findFirst({ where: eq(documents.id, Number(id)) });
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Sem acesso a este documento." }, { status: 403 });
  }

  const bytes = Buffer.from(document.fileData, "base64");
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${document.fileName.replace(/"/g, "")}"`,
    },
  });
}

// DELETE: remove o PDF da biblioteca. Provas já geradas a partir dele continuam
// existindo normalmente (exams.documentId só fica null).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const document = await db.query.documents.findFirst({ where: eq(documents.id, Number(id)) });
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Sem acesso a este documento." }, { status: 403 });
  }

  await db.delete(documents).where(eq(documents.id, Number(id)));
  return NextResponse.json({ ok: true });
}
