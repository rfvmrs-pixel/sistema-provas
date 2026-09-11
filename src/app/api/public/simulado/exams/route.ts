import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";

// Rota pública (sem login) — lista os IT/APR da Biblioteca de um Contrato,
// pra tela de Simulado (autosserviço) mostrar as opções depois que o
// colaborador escolhe o Contrato. Não depende mais de Função nem de prova
// pré-cadastrada: o Simulado gera a prova (10 perguntas) na hora, via IA,
// direto do PDF escolhido — ver /api/public/simulado/start.
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
      category: documents.category,
    })
    .from(documents)
    .where(eq(documents.sectorId, sectorId))
    .orderBy(asc(documents.documentType), asc(documents.fileName));

  return NextResponse.json({
    exams: rows.map((r) => ({
      id: r.id,
      title: r.fileName.replace(/\.pdf$/i, ""),
      documentType: r.documentType,
      category: r.category,
    })),
  });
}
