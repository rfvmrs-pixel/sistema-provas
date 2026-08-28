import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documentComics } from "@/db/schema";

// GET ?documentId= -> as 4 imagens do quadrinho de segurança desse IT/APR da
// Biblioteca, sem revelar qual é a correta (isso só sai depois de responder
// — ver POST /api/public/comic/check). Se o documento ainda não tem
// quadrinho cadastrado, devolve hasComic: false — o Simulado simplesmente não
// mostra essa etapa nesse caso.
export async function GET(req: NextRequest) {
  const documentId = Number(req.nextUrl.searchParams.get("documentId"));
  if (!documentId) return NextResponse.json({ error: "Informe o IT/APR." }, { status: 400 });

  const comic = await db.query.documentComics.findFirst({ where: eq(documentComics.documentId, documentId) });
  if (!comic) return NextResponse.json({ hasComic: false });

  return NextResponse.json({ hasComic: true, images: comic.images });
}
