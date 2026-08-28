import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";

// Rota pública — usada na tela de Quizzes: depois que o colaborador escolhe
// o Contrato, listamos todos os IT/APR da Biblioteca desse Contrato (de
// qualquer Função — o Quiz gera as perguntas na hora, via IA, direto do PDF,
// então não depende de nenhuma prova pré-cadastrada nem de Função).
export async function GET(req: NextRequest) {
  const sectorId = Number(req.nextUrl.searchParams.get("sectorId"));
  if (!sectorId) {
    return NextResponse.json({ error: "Informe o Contrato." }, { status: 400 });
  }

  const rows = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      documentType: documents.documentType,
    })
    .from(documents)
    .where(eq(documents.sectorId, sectorId))
    .orderBy(asc(documents.documentType), asc(documents.fileName));

  return NextResponse.json({
    exams: rows.map((r) => ({
      id: r.id,
      title: r.fileName.replace(/\.pdf$/i, ""),
      documentType: r.documentType,
    })),
  });
}
