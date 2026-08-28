import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentComics } from "@/db/schema";

// POST { documentId, selectedIndex } -> confere contra o gabarito do
// quadrinho e devolve se acertou, qual era a correta e a explicação. Assim
// como o Quiz de perguntas, isso não grava nada no banco — é prática avulsa.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const documentId = Number(body?.documentId);
  const selectedIndex = Number(body?.selectedIndex);
  if (!documentId || !Number.isInteger(selectedIndex)) {
    return NextResponse.json({ error: "Informe o IT/APR e a imagem escolhida." }, { status: 400 });
  }

  const comic = await db.query.documentComics.findFirst({ where: eq(documentComics.documentId, documentId) });
  if (!comic) return NextResponse.json({ error: "Esse IT/APR não tem quadrinho cadastrado." }, { status: 404 });

  return NextResponse.json({
    correct: selectedIndex === comic.correctIndex,
    correctIndex: comic.correctIndex,
    explanation: comic.explanation,
  });
}
