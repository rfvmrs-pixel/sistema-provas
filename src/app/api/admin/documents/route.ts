import { NextRequest, NextResponse } from "next/server";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, sectors, exams } from "@/db/schema";
import { requireAdmin, requireEditor, canAccessSector, getVisibleSectorIds } from "@/lib/requireAdmin";
import { extractPdfText } from "@/lib/pdf";

export const maxDuration = 60;

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB

// GET: lista os PDFs já salvos na biblioteca (escopado por contrato do
// gestor, ou pelo grupo de Contratos da Diretoria/Superintendência).
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const visibleSectorIds = getVisibleSectorIds(guard.admin);
  const scope = visibleSectorIds ? inArray(documents.sectorId, visibleSectorIds) : undefined;

  const list = await db
    .select({
      id: documents.id,
      fileName: documents.fileName,
      documentType: documents.documentType,
      fileSize: documents.fileSize,
      uploadedAt: documents.uploadedAt,
      sectorId: documents.sectorId,
      sectorName: sectors.name,
      examCount: sql<number>`count(distinct ${exams.id})`.mapWith(Number),
    })
    .from(documents)
    .innerJoin(sectors, eq(sectors.id, documents.sectorId))
    .leftJoin(exams, eq(exams.documentId, documents.id))
    .where(scope)
    .groupBy(documents.id, sectors.name)
    .orderBy(desc(documents.uploadedAt));

  return NextResponse.json({ documents: list });
}

// POST: sobe um novo PDF pra biblioteca. Pede o Contrato e o Tipo (IT/APR) —
// Função continua ficando pra quando forem gerar a prova a partir dele.
export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Envio inválido, esperado multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  const sectorId = Number(form.get("sectorId"));
  const documentTypeRaw = form.get("documentType");
  const documentType = documentTypeRaw === "APR" ? "APR" : "IT";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo PDF enviado." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "O arquivo precisa ser um PDF." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF muito grande (máximo 15MB)." }, { status: 400 });
  }
  if (!sectorId) {
    return NextResponse.json({ error: "Selecione o Contrato deste PDF." }, { status: 400 });
  }
  if (!canAccessSector(guard.admin, sectorId)) {
    return NextResponse.json(
      { error: "Você só pode enviar PDFs para o próprio contrato." },
      { status: 403 },
    );
  }

  const sector = await db.query.sectors.findFirst({ where: eq(sectors.id, sectorId) });
  if (!sector) return NextResponse.json({ error: "Contrato inválido." }, { status: 400 });

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
    .insert(documents)
    .values({
      sectorId,
      fileName: file.name,
      documentType,
      extractedText,
      fileData: buffer.toString("base64"),
      fileSize: file.size,
    })
    .returning({
      id: documents.id,
      fileName: documents.fileName,
      documentType: documents.documentType,
      fileSize: documents.fileSize,
      uploadedAt: documents.uploadedAt,
      sectorId: documents.sectorId,
    });

  return NextResponse.json({ document: { ...document, sectorName: sector.name, examCount: 0 } }, { status: 201 });
}
