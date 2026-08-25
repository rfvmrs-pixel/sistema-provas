import { PDFParse } from "pdf-parse";

const MAX_CHARS = 60_000; // limite de segurança para não estourar o contexto da IA

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = (result.text || "").trim();
    if (!text) {
      throw new Error(
        "Não foi possível extrair texto do PDF. Ele pode ser uma imagem escaneada sem OCR.",
      );
    }
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  } finally {
    await parser.destroy();
  }
}
