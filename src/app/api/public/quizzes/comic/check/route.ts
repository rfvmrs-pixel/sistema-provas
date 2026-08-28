import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examComics } from "@/db/schema";

// POST { examId, selectedIndex } -> confere contra o gabarito do quadrinho
// e devolve se acertou, qual era a correta e a explicação. Assim como o
// Quiz de perguntas, isso não grava nada no banco — é prática avulsa.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const examId = Number(body?.examId);
  const selectedIndex = Number(body?.selectedIndex);
  if (!examId || !Number.isInteger(selectedIndex)) {
    return NextResponse.json({ error: "Informe a prova e a imagem escolhida." }, { status: 400 });
  }

  const comic = await db.query.examComics.findFirst({ where: eq(examComics.examId, examId) });
  if (!comic) return NextResponse.json({ error: "Esse IT/APR não tem quadrinho cadastrado." }, { status: 404 });

  return NextResponse.json({
    correct: selectedIndex === comic.correctIndex,
    correctIndex: comic.correctIndex,
    explanation: comic.explanation,
  });
}
