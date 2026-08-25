import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  console.log("[migrate] Conectando ao banco de dados...");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // This is a self-hosted Postgres container (Railway's postgres:16 image),
    // not a managed database with TLS configured, so SSL must stay off —
    // the connection is already private/internal to the Railway network.
    ssl: false,
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
