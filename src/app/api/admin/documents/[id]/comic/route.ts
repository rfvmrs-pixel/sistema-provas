import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, documentComics } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector } from "@/lib/requireAdmin";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB por imagem (base64), suficiente pra um desenho/foto de treinamento

async function loadDocument(id: number) {
  return db.query.documents.findFirst({ where: eq(documents.id, id) });
}

// GET: quadrinho de segurança cadastrado pra esse documento (IT/APR) da
// Biblioteca, se houver — usado pra pré-preencher a tela de edição no admin.
// Fica ligado ao documento (não a uma prova de uma Função específica) porque
// o Simulado gera as perguntas na hora direto do documento, valendo pra
// qualquer Função.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const document = await loadDocument(Number(id));
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse documento." }, { status: 403 });
  }

  const comic = await db.query.documentComics.findFirst({ where: eq(documentComics.documentId, Number(id)) });
  return NextResponse.json({ comic: comic ?? null });
}

// PUT: cria ou substitui o quadrinho do documento — 4 imagens (data URL
// base64), qual delas é a correta (0-3) e uma explicação opcional. O gestor
// sobe as 4 imagens quando tiver a arte de cada IT/APR — enquanto não subir,
// o Simulado simplesmente não mostra essa etapa pra esse documento (ver
// /api/public/comic).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const documentId = Number(id);
  const document = await loadDocument(documentId);
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse documento." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const images: unknown = body?.images;
  const correctIndex = Number(body?.correctIndex);
  const explanation = typeof body?.explanation === "string" ? body.explanation.trim() || null : null;

  if (!Array.isArray(images) || images.length !== 4 || images.some((img) => typeof img !== "string" || !img)) {
    return NextResponse.json({ error: "Envie exatamente 4 imagens." }, { status: 400 });
  }
  if (images.some((img: string) => img.length > MAX_IMAGE_BYTES)) {
    return NextResponse.json({ error: "Cada imagem deve ter no máximo 2MB." }, { status: 400 });
  }
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return NextResponse.json({ error: "Informe qual das 4 imagens (0 a 3) é a correta." }, { status: 400 });
  }

  const existing = await db.query.documentComics.findFirst({ where: eq(documentComics.documentId, documentId) });
  if (existing) {
    await db
      .update(documentComics)
      .set({ images, correctIndex, explanation })
      .where(eq(documentComics.id, existing.id));
  } else {
    await db.insert(documentComics).values({ documentId, images, correctIndex, explanation });
  }

  const comic = await db.query.documentComics.findFirst({ where: eq(documentComics.documentId, documentId) });
  return NextResponse.json({ comic });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const documentId = Number(id);
  const document = await loadDocument(documentId);
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse documento." }, { status: 403 });
  }

  await db.delete(documentComics).where(eq(documentComics.documentId, documentId));
  return NextResponse.json({ ok: true });
}
