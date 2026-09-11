import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { generateComicScenario, type DocumentType } from "@/lib/ai";
import { generateComicImage } from "@/lib/imageAi";

export const maxDuration = 120;

// POST: gera as 4 imagens do quadrinho de segurança por IA a partir do
// IT/APR (2 etapas: Claude decide o cenário + as 4 variações — só 1
// correta —, depois a OpenAI gera 1 imagem por variação, com o mesmo estilo
// visual nas 4). NÃO salva direto: devolve o resultado pro admin revisar
// (ver a tela de edição do quadrinho) — só grava de fato quando o admin
// confirmar com o botão "Salvar" existente (PUT nesse mesmo recurso), igual
// a quando ele sobe as 4 imagens manualmente.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const documentId = Number(id);
  const document = await db.query.documents.findFirst({ where: eq(documents.id, documentId) });
  if (!document) return NextResponse.json({ error: "Documento não encontrado." }, { status: 404 });
  if (!canAccessSector(guard.admin, document.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a esse documento." }, { status: 403 });
  }

  let scenario;
  try {
    scenario = await generateComicScenario(document.extractedText, {
      documentType: document.documentType as DocumentType,
      sourceFileName: document.fileName,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar o cenário do quadrinho com IA." },
      { status: 502 },
    );
  }

  let images: string[];
  try {
    images = await Promise.all(scenario.options.map((opt) => generateComicImage(`${scenario.scenarioPrompt} ${opt.description}`)));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Falha ao gerar as imagens do quadrinho com IA." },
      { status: 502 },
    );
  }

  const correctIndex = scenario.options.findIndex((o) => o.isCorrect);

  return NextResponse.json({
    images,
    correctIndex,
    explanation: scenario.explanation,
  });
}
