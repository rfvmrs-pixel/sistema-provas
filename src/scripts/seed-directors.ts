import "dotenv/config";
import { db } from "../db";
import { admins, adminSectors, sectors } from "../db/schema";
import { hashPassword } from "../lib/password";
import { eq } from "drizzle-orm";

// Diretoria/Superintendência não é uma gerência de 1 Contrato só (isso é o
// gestor) — é a "média" de várias gerências ao mesmo tempo. Aqui a gente
// garante 3 contas de Diretoria pré-configuradas, cada uma já travada num
// GRUPO de Contratos:
//   - Diretoria de Operações -> ARM RIO + TPS + SPOT + EQUINOR
//   - Diretoria LON1/LON2    -> LON1 + LON2
//   - Diretoria Prime Ocean  -> PRIME OCEAN
// Só ATUA na criação: se a conta já existe, não mexe em senha nem no grupo
// de Contratos (o admin geral pode ajustar os dois livremente depois pela
// tela Contratos > Contas de Diretoria/Superintendência). Roda em todo boot,
// mas depois da primeira vez vira um no-op (idempotente).
const DESIRED_DIRECTORS = [
  {
    username: "diretoria.operacoes",
    label: "Diretoria de Operações",
    password: "Operacoes@2026",
    sectorNames: ["ARM RIO", "TPS", "SPOT", "EQUINOR"],
  },
  {
    username: "diretoria.lon",
    label: "Diretoria LON1/LON2",
    password: "LonDiretoria@2026",
    sectorNames: ["LON1", "LON2"],
  },
  {
    username: "diretoria.prime",
    label: "Diretoria Prime Ocean",
    password: "PrimeDiretoria@2026",
    sectorNames: ["PRIME OCEAN"],
  },
];

function norm(name: string) {
  return name.trim().toUpperCase();
}

async function main() {
  const allSectors = await db.query.sectors.findMany({ columns: { id: true, name: true } });

  for (const desired of DESIRED_DIRECTORS) {
    const existing = await db.query.admins.findFirst({ where: eq(admins.username, desired.username) });
    if (existing) {
      console.log(`Diretoria "${desired.username}" já existe. Nada a fazer.`);
      continue;
    }

    const matched = allSectors.filter((s) => desired.sectorNames.map(norm).includes(norm(s.name)));
    const notFound = desired.sectorNames.filter(
      (name) => !allSectors.some((s) => norm(s.name) === norm(name)),
    );
    if (notFound.length > 0) {
      console.warn(
        `Diretoria "${desired.username}": não achei o(s) Contrato(s) [${notFound.join(", ")}] ainda — ` +
          `a conta vai ser criada SEM restrição (vê todos os Contratos) até alguém ajustar o grupo dela ` +
          `em Contratos > Contas de Diretoria/Superintendência.`,
      );
    }

    const passwordHash = await hashPassword(desired.password);
    const [created] = await db
      .insert(admins)
      .values({
        username: desired.username,
        passwordHash,
        sectorId: null,
        role: "diretoria",
        label: desired.label,
      })
      .returning({ id: admins.id });

    if (matched.length > 0) {
      await db.insert(adminSectors).values(matched.map((s) => ({ adminId: created.id, sectorId: s.id })));
    }

    console.log(
      `Diretoria criada -> "${desired.label}" | usuário: "${desired.username}" | senha: "${desired.password}" | ` +
        `Contratos: ${matched.length > 0 ? matched.map((s) => s.name).join(", ") : "TODOS (nenhum encontrado ainda)"}`,
    );
    console.log("IMPORTANTE: troque essa senha assim que possível.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
