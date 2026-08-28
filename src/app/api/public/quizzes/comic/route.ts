import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { examComics } from "@/db/schema";

// GET ?examId= -> as 4 imagens do quadrinho de segurança dessa prova, sem
// revelar qual é a correta (isso só sai depois de responder — ver POST
// /api/public/quizzes/comic/check). Se a prova ainda não tem quadrinho
// cadastrado, devolve hasComic: false — o Quiz simplesmente não mostra essa
// etapa nesse caso.
export async function GET(req: NextRequest) {
  const examId = Number(req.nextUrl.searchParams.get("examId"));
  if (!examId) return NextResponse.json({ error: "Informe a prova." }, { status: 400 });

  const comic = await db.query.examComics.findFirst({ where: eq(examComics.examId, examId) });
  if (!comic) return NextResponse.json({ hasComic: false });

  return NextResponse.json({ hasComic: true, images: comic.images });
}
