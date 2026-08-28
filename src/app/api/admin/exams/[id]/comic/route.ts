import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, examComics } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector } from "@/lib/requireAdmin";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB por imagem (base64), suficiente pra um desenho/foto de treinamento

async function loadExam(id: number) {
  return db.query.exams.findFirst({ where: eq(exams.id, id) });
}

// GET: quadrinho de segurança cadastrado pra essa prova (se houver) — usado
// pra pré-preencher a tela de edição no admin.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const exam = await loadExam(Number(id));
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const comic = await db.query.examComics.findFirst({ where: eq(examComics.examId, Number(id)) });
  return NextResponse.json({ comic: comic ?? null });
}

// PUT: cria ou substitui o quadrinho da prova — 4 imagens (data URL base64),
// qual delas é a correta (0-3) e uma explicação opcional. Estrutura pronta
// desde já; o gestor sobe as 4 imagens quando tiver a arte de cada IT/APR —
// enquanto não subir, o Quiz simplesmente não mostra essa etapa pra essa
// prova (ver /api/public/quizzes/comic).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);
  const exam = await loadExam(examId);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
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

  const existing = await db.query.examComics.findFirst({ where: eq(examComics.examId, examId) });
  if (existing) {
    await db
      .update(examComics)
      .set({ images, correctIndex, explanation })
      .where(eq(examComics.id, existing.id));
  } else {
    await db.insert(examComics).values({ examId, images, correctIndex, explanation });
  }

  const comic = await db.query.examComics.findFirst({ where: eq(examComics.examId, examId) });
  return NextResponse.json({ comic });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);
  const exam = await loadExam(examId);
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  await db.delete(examComics).where(eq(examComics.examId, examId));
  return NextResponse.json({ ok: true });
}
