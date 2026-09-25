import "dotenv/config";
import { Pool } from "pg";

// Cria (se ainda não existir) a tabela attempt_answer_log — registro
// permanente das questões respondidas em cada tentativa, ver
// src/lib/answerLog.ts — e copia pra ela as tentativas antigas cujas
// questões ainda existem (idempotente: só copia tentativas que ainda não
// estão no registro). Roda no start, depois das migrações.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false, connectionTimeoutMillis: 15000 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS attempt_answer_log (
        id serial PRIMARY KEY,
        attempt_id integer NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
        question_id integer,
        position integer NOT NULL DEFAULT 0,
        question_text text NOT NULL,
        options jsonb NOT NULL,
        correct_key varchar(5) NOT NULL,
        selected_key varchar(5),
        correct boolean NOT NULL,
        topic varchar(200),
        explanation text,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS attempt_answer_log_attempt_idx ON attempt_answer_log (attempt_id);
    `);
    const r = await pool.query(`
      INSERT INTO attempt_answer_log
        (attempt_id, question_id, position, question_text, options, correct_key, selected_key, correct, topic, explanation)
      SELECT a.attempt_id, q.id, q."order", q.text, q.options, q.correct_key, a.selected_key, a.correct, q.topic, q.explanation
      FROM answers a
      JOIN questions q ON q.id = a.question_id
      WHERE NOT EXISTS (SELECT 1 FROM attempt_answer_log l WHERE l.attempt_id = a.attempt_id)
    `);
    console.log(`[answer-log] Tabela pronta; ${r.rowCount ?? 0} resposta(s) antiga(s) copiada(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  // Não derruba o start: sem o registro, a revisão cai nas tabelas originais.
  console.error("[answer-log] Falha ao preparar o registro de respostas:", err);
  process.exit(0);
});
