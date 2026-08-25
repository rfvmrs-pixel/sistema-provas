import "dotenv/config";
import { db } from "../db";
import { exams, questions, sectors, roles } from "../db/schema";

async function main() {
  const [sector] = await db.select().from(sectors).limit(1);
  const [role] = await db.select().from(roles).limit(1);
  if (!sector || !role) {
    throw new Error(
      "Nenhum contrato/função cadastrado ainda. Rode o seed principal (src/scripts/seed.ts) antes.",
    );
  }

  const [exam] = await db
    .insert(exams)
    .values({
      sectorId: sector.id,
      roleId: role.id,
      title: "Prova de Teste - Segurança no Almoxarifado",
      sourceFileName: "teste.pdf",
      summary: "Prova de teste inserida manualmente para validar o fluxo.",
    })
    .returning();

  await db.insert(questions).values([
    {
      examId: exam.id,
      text: "Qual EPI é obrigatório ao operar empilhadeira?",
      options: [
        { key: "A", text: "Óculos de sol" },
        { key: "B", text: "Capacete de segurança" },
        { key: "C", text: "Luvas de látex" },
        { key: "D", text: "Nenhum" },
      ],
      correctKey: "B",
      topic: "EPI",
      explanation: "O capacete protege contra impactos na área de movimentação de cargas.",
      order: 0,
    },
    {
      examId: exam.id,
      text: "O que fazer ao identificar uma avaria em uma prateleira?",
      options: [
        { key: "A", text: "Ignorar e continuar o trabalho" },
        { key: "B", text: "Reportar imediatamente ao supervisor" },
        { key: "C", text: "Tentar consertar sozinho" },
        { key: "D", text: "Remover os produtos sem avisar ninguém" },
      ],
      correctKey: "B",
      topic: "Procedimentos de segurança",
      explanation: "Avarias estruturais devem ser reportadas para avaliação profissional.",
      order: 1,
    },
  ]);

  console.log("Prova de teste criada:", exam.id);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
