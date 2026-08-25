import "dotenv/config";
import { db } from "../db";
import { admins, sectors, roles } from "../db/schema";
import { hashPassword } from "../lib/password";
import { eq } from "drizzle-orm";

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const password = process.env.SEED_ADMIN_PASSWORD || "TrocarSenha123";

  const existing = await db.query.admins.findFirst({ where: eq(admins.username, username) });
  if (existing) {
    console.log(`Admin "${username}" já existe. Nada a fazer.`);
  } else {
    const passwordHash = await hashPassword(password);
    await db.insert(admins).values({ username, passwordHash });
    console.log(`Admin criado -> usuário: "${username}" | senha: "${password}"`);
    console.log("IMPORTANTE: troque essa senha assim que possível.");
  }

  const defaultSectors = ["Logística", "Almoxarifado", "Manutenção", "Administrativo", "Transporte"];
  const defaultRoles = ["Motorista", "Auxiliar de Logística", "Conferente", "Supervisor", "Analista"];

  for (const name of defaultSectors) {
    const found = await db.query.sectors.findFirst({ where: eq(sectors.name, name) });
    if (!found) await db.insert(sectors).values({ name });
  }
  for (const name of defaultRoles) {
    const found = await db.query.roles.findFirst({ where: eq(roles.name, name) });
    if (!found) await db.insert(roles).values({ name });
  }

  console.log("Setores e funções padrão garantidos (podem ser editados/removidos no painel).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
