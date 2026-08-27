import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { extractPdfText } from "@/lib/pdf";

export const maxDuration = 60;

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB

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

// PUT: substitui o arquivo de um documento já existente na biblioteca — usado
// quando o upload é uma "atualização" (nova versão da mesma IT/APR) em vez de
// um documento novo. Mantém o mesmo id, então provas já geradas continuam
// linkadas a este documento (exams.documentId), só o PDF/texto extraído e a
// data de upload são trocados; o conteúdo das provas já geradas não muda
// sozinho (precisa gerar de novo se quiser refletir a nova versão).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const existing = await db.query.documents.findFirst({ where: eq(documents.id, Number(id)) });
  if (!existing) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, existing.sectorId)) {
    return NextResponse.json({ error: "Sem acesso a este documento." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Envio inválido, esperado multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const documentTypeRaw = form.get("documentType");
  const documentType = documentTypeRaw === "APR" ? "APR" : documentTypeRaw === "IT" ? "IT" : existing.documentType;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo PDF enviado." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF muito grande (máximo 15MB)." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extractedText: string;
  try {
    extractedText = await extractPdfText(buffer);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao ler o PDF." },
      { status: 400 },
    );
  }

  const [document] = await db
    .update(documents)
    .set({
      fileName: file.name,
      documentType,
      extractedText,
      fileData: buffer.toString("base64"),
      fileSize: file.size,
      uploadedAt: new Date(),
    })
    .where(eq(documents.id, Number(id)))
    .returning({
      id: documents.id,
      fileName: documents.fileName,
      documentType: documents.documentType,
      fileSize: documents.fileSize,
      uploadedAt: documents.uploadedAt,
      sectorId: documents.sectorId,
    });

  return NextResponse.json({ document });
}

// DELETE: remove o PDF da biblioteca. Provas já geradas a partir dele continuam
// existindo normalmente (exams.documentId só fica null).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
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
