import "dotenv/config";
import { db } from "../db";
import { documents } from "../db/schema";
import { eq } from "drizzle-orm";

// Documentos enviados ANTES do campo Tipo (IT/APR) existir na Biblioteca
// caíram todos como "IT" (valor padrão da coluna). Muitos desses PDFs já
// têm o tipo certo no PRÓPRIO nome do arquivo (ex.: "APR_TPS_007R03 ...pdf"),
// então aqui a gente corrige isso automaticamente pelo prefixo do nome —
// só na direção "IT" -> "APR" (nunca mexe num documento que já está como
// APR, e nunca troca pra IT sozinho), pra não sobrescrever uma escolha
// manual que um admin já tenha feito depois que o campo passou a existir.
// Roda em todo boot, mas depois da primeira vez vira um no-op (idempotente).
async function main() {
  const docs = await db.query.documents.findMany({
    columns: { id: true, fileName: true, documentType: true },
  });

  let fixed = 0;
  for (const doc of docs) {
    if (doc.documentType === "APR") continue;
    const looksLikeApr = /^apr[_\s-]/i.test(doc.fileName.trim());
    if (!looksLikeApr) continue;
    await db.update(documents).set({ documentType: "APR" }).where(eq(documents.id, doc.id));
    fixed++;
  }

  if (fixed > 0) {
    console.log(`Backfill de Tipo: ${fixed} documento(s) corrigido(s) de IT -> APR pelo nome do arquivo.`);
  } else {
    console.log("Backfill de Tipo: nada a corrigir.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
