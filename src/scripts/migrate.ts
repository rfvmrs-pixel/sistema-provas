import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  console.log("[migrate] Conectando ao banco de dados...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_URL?.includes("localhost") ||
      process.env.DATABASE_URL?.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  pool.on("error", (err) => {
    console.error("[migrate] Erro inesperado no pool de conexões:", err);
  });

  const db = drizzle(pool);

  console.log("[migrate] Aplicando migrações (pasta ./drizzle)...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[migrate] Migrações aplicadas com sucesso.");

  await pool.end();
  console.log("[migrate] Pool encerrado. Finalizando processo.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] Falha ao aplicar migrações:", err);
  process.exit(1);
});
