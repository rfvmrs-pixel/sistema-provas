const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      cliente_id TEXT REFERENCES clientes(id) ON DELETE CASCADE
    );
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'cliente';
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_trocada BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE usuarios ALTER COLUMN cliente_id DROP NOT NULL;
    CREATE TABLE IF NOT EXISTS navios (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      ano INT,
      trader TEXT,
      agente TEXT,
      status TEXT,
      peso_nf_t NUMERIC DEFAULT 0,
      peso_balanca_t NUMERIC DEFAULT 0,
      peso_arqueado_t NUMERIC DEFAULT 0,
      peso_nomeado_t NUMERIC DEFAULT 0,
      peso_carregado_t NUMERIC DEFAULT 0,
      lay_day_inicio DATE,
      lay_day_fim DATE
    );
    ALTER TABLE navios ADD COLUMN IF NOT EXISTS peso_nomeado_t NUMERIC DEFAULT 0;
    ALTER TABLE navios ADD COLUMN IF NOT EXISTS peso_nf_t NUMERIC DEFAULT 0;
    ALTER TABLE navios ADD COLUMN IF NOT EXISTS peso_balanca_t NUMERIC DEFAULT 0;
    ALTER TABLE navios ADD COLUMN IF NOT EXISTS peso_arqueado_t NUMERIC DEFAULT 0;
    ALTER TABLE navios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP;
    CREATE TABLE IF NOT EXISTS navio_clientes (
      navio_id TEXT REFERENCES navios(id) ON DELETE CASCADE,
      cliente_id TEXT REFERENCES clientes(id) ON DELETE CASCADE,
      PRIMARY KEY (navio_id, cliente_id)
    );
    CREATE TABLE IF NOT EXISTS pesagens (
      id SERIAL PRIMARY KEY,
      navio_id TEXT REFERENCES navios(id) ON DELETE CASCADE,
      placa TEXT,
      data DATE,
      hora TEXT,
      prefixo TEXT,
      cor TEXT,
      tara NUMERIC,
      peso_bruto NUMERIC,
      peso_liquido NUMERIC,
      criado_em TIMESTAMP DEFAULT now(),
      atualizado_em TIMESTAMP,
      UNIQUE (navio_id, placa, data, hora)
    );
    ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP;
    -- Marca uma pesagem como "desconsiderada": continua existindo no banco e
    -- aparece na lista (riscada), mas fica de fora de todas as somas
    -- (Toneladas líquidas, Peso Balança do navio, gráficos por prefixo/cor
    -- etc). Pode ser revertida a qualquer momento (Reconsiderar).
    ALTER TABLE pesagens ADD COLUMN IF NOT EXISTS desconsiderada BOOLEAN NOT NULL DEFAULT false;
    -- Peso NF por lote (navio + prefixo + cor), vindo da "Base de Trens" da
    -- Central de Relatórios. Alimenta a aba Análises com o comparativo
    -- NF x Balança por prefixo/origem/cor.
    CREATE TABLE IF NOT EXISTS lotes_nf (
      navio_id TEXT REFERENCES navios(id) ON DELETE CASCADE,
      prefixo TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT '',
      peso_nf_t NUMERIC DEFAULT 0,
      atualizado_em TIMESTAMP DEFAULT now(),
      PRIMARY KEY (navio_id, prefixo, cor)
    );
    -- Guarda o último nível de alerta ("soon"/"overdue") já avisado por
    -- e-mail para cada ação do Kanban de Ações, pra não mandar e-mail de
    -- novo todo dia enquanto a ação ficar parada no mesmo nível.
    CREATE TABLE IF NOT EXISTS kanban_alertas_enviados (
      card_id TEXT PRIMARY KEY,
      nivel TEXT NOT NULL,
      enviado_em TIMESTAMP DEFAULT now()
    );
    -- Kanban de Ações da Diretoria, migrado do arquivo HTML estático (que
    -- vivia num repositório do GitHub e precisava de "Publicar online" +
    -- token toda vez que alguém editava) para viver aqui dentro, como
    -- qualquer outra tela do portal: toda ação criada, movida, editada ou
    -- excluída já grava direto aqui, na hora, para todo mundo.
    CREATE TABLE IF NOT EXISTS kanban_cards (
      id TEXT PRIMARY KEY,
      company TEXT NOT NULL,
      texto TEXT NOT NULL,
      sub TEXT NOT NULL DEFAULT '',
      responsavel TEXT NOT NULL DEFAULT '',
      due DATE,
      status TEXT NOT NULL DEFAULT 'todo',
      evidencias JSONB NOT NULL DEFAULT '[]',
      criado_em TIMESTAMP NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMP NOT NULL DEFAULT now()
    );
    -- Uma senha por grupo de acesso (mesmos grupos de antes: Diretoria,
    -- Superintendência, ARM Rio, All Seas/Equinor/SPOT, Especialistas,
    -- TPS/Prime). Guardada com bcrypt (igual à tabela usuarios) em vez do
    -- hash não-criptográfico que o arquivo antigo usava.
    CREATE TABLE IF NOT EXISTS kanban_access (
      grupo_id TEXT PRIMARY KEY,
      senha_hash TEXT NOT NULL
    );
    -- Um ponto por dia com a foto do quadro inteiro (todas as empresas),
    -- para o gráfico de evolução da aba Análises.
    CREATE TABLE IF NOT EXISTS kanban_historico (
      data DATE PRIMARY KEY,
      total INT NOT NULL DEFAULT 0,
      todo INT NOT NULL DEFAULT 0,
      doing INT NOT NULL DEFAULT 0,
      done INT NOT NULL DEFAULT 0,
      por_empresa JSONB NOT NULL DEFAULT '{}'
    );
    -- Permissão do módulo "Descarga de Gusa" (lançamento vagão a vagão em
    -- tempo real) — independente do "tipo" (admin/consultor_geral/cliente):
    -- alguém pode não ser admin do resto do portal e mesmo assim precisar
    -- lançar vagão aqui, então isso é escolhido pessoa por pessoa na tela
    -- de Usuários. Admin sempre tem acesso total, não importa o valor
    -- aqui (ver gusaPermissaoEfetiva no server.js).
    -- 'nenhum' = módulo nem aparece no menu | 'visualizar' = só olha |
    -- 'lancar' = visualizar + registrar início/fim de vagão e lançamentos
    -- manuais | 'editar' = lancar + editar/excluir qualquer lançamento.
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS gusa_permissao TEXT NOT NULL DEFAULT 'nenhum';

    -- Descarga de Gusa — lançamento vagão a vagão em tempo real (fase 1).
    -- Cada linha é UM vagão: nasce com só inicio_descarga preenchido
    -- (status 'em_descarga') quando alguém clica "Iniciar", e ganha
    -- fim_descarga (status 'finalizado') no "Finalizar" — ou já nasce
    -- finalizada, num lançamento manual/retroativo com os dois horários
    -- de uma vez. Fica ligado a um Navio do cadastro existente, igual à
    -- coluna NAVIO da planilha de origem (aba "Descarga").
    CREATE TABLE IF NOT EXISTS gusa_descargas_vagao (
      id SERIAL PRIMARY KEY,
      navio_id TEXT REFERENCES navios(id) ON DELETE SET NULL,
      terminal TEXT,
      vagao TEXT NOT NULL,
      turno TEXT,
      data DATE NOT NULL,
      inicio_descarga TIMESTAMP NOT NULL,
      fim_descarga TIMESTAMP,
      tons NUMERIC,
      status TEXT NOT NULL DEFAULT 'em_descarga',
      origem TEXT NOT NULL DEFAULT 'manual',
      criado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMP
    );
    -- Prefixo do lote (mesmo conceito de navio+prefixo+cor já usado em
    -- lotes_nf/pesagens) — pedido depois da fase 1, pra dar pra filtrar e
    -- lançar vagão já ligado ao prefixo certo, não só ao navio.
    ALTER TABLE gusa_descargas_vagao ADD COLUMN IF NOT EXISTS prefixo TEXT;
    CREATE INDEX IF NOT EXISTS idx_gusa_vagao_data_turno ON gusa_descargas_vagao (data, turno);
    CREATE INDEX IF NOT EXISTS idx_gusa_vagao_status ON gusa_descargas_vagao (status);
    CREATE INDEX IF NOT EXISTS idx_gusa_vagao_prefixo ON gusa_descargas_vagao (prefixo);
    -- Fase 3 (grade de vagões): um vagão importado da planilha (aba
    -- "Descarga") nasce SEM início ainda — status 'aguardando' — até
    -- alguém clicar nele e lançar a data/hora. Por isso inicio_descarga
    -- precisa poder ficar em branco (deixa de ser NOT NULL); continua
    -- sendo preenchido normalmente no "Iniciar"/manual, como sempre foi.
    ALTER TABLE gusa_descargas_vagao ALTER COLUMN inicio_descarga DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_gusa_vagao_navio ON gusa_descargas_vagao (navio_id);

    -- Descarga de Gusa — paralisações (fase 2). Mesma lógica de
    -- iniciar/finalizar em tempo real dos vagões, pra registrar direto no
    -- sistema em vez de só pela planilha de paralisações (que continua
    -- podendo ser importada depois, numa fase futura — "origem" já
    -- distingue 'manual' de uma futura importação).
    CREATE TABLE IF NOT EXISTS gusa_paralisacoes (
      id SERIAL PRIMARY KEY,
      navio_id TEXT REFERENCES navios(id) ON DELETE SET NULL,
      terminal TEXT,
      turno TEXT,
      data DATE NOT NULL,
      inicio TIMESTAMP NOT NULL,
      termino TIMESTAMP,
      tipo TEXT,
      ocorrencia TEXT NOT NULL,
      responsavel TEXT,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'em_andamento',
      origem TEXT NOT NULL DEFAULT 'manual',
      criado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gusa_paralisacao_data_turno ON gusa_paralisacoes (data, turno);
    CREATE INDEX IF NOT EXISTS idx_gusa_paralisacao_status ON gusa_paralisacoes (status);
    -- Prefixo (coluna TABELA na aba "Ocorrências" da planilha de origem) —
    -- pedido junto da importação retroativa: essa aba não traz o Navio, só
    -- o prefixo do lote, então é isso que liga a paralisação importada ao
    -- lote certo.
    ALTER TABLE gusa_paralisacoes ADD COLUMN IF NOT EXISTS prefixo TEXT;
    CREATE INDEX IF NOT EXISTS idx_gusa_paralisacao_prefixo ON gusa_paralisacoes (prefixo);

    -- Descarga de Gusa — carretas por dia/turno (fase 2). Na planilha de
    -- origem esse dado é uma contagem por dia (não carreta por carreta,
    -- não existe placa nessa parte da planilha), então aqui é um único
    -- lançamento por terminal+turno+data que pode ser corrigido a
    -- qualquer momento (ON CONFLICT atualiza em vez de duplicar).
    CREATE TABLE IF NOT EXISTS gusa_carretas_turno (
      id SERIAL PRIMARY KEY,
      terminal TEXT NOT NULL DEFAULT '',
      turno TEXT NOT NULL,
      data DATE NOT NULL,
      viagens INT,
      carretas INT,
      origem TEXT NOT NULL DEFAULT 'manual',
      criado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT now(),
      atualizado_em TIMESTAMP,
      UNIQUE (terminal, turno, data)
    );
    -- Motivo da queda no número de carretas no turno (pedido junto do
    -- redesenho da tela — antes só existia a contagem, sem espaço pra
    -- explicar um turno fraco).
    ALTER TABLE gusa_carretas_turno ADD COLUMN IF NOT EXISTS observacao TEXT;

    -- Descarga de Gusa — metas mensais (Desafio/Plano em toneladas), pro
    -- Painel de Descarga. Não existe uma fonte automática pra esses dois
    -- números (são metas combinadas com o cliente/operação, não algo que o
    -- sistema calcula sozinho) — por isso ficam num lançamento manual por
    -- ano+mês, editável a qualquer momento (ON CONFLICT atualiza).
    CREATE TABLE IF NOT EXISTS gusa_metas_mensais (
      id SERIAL PRIMARY KEY,
      ano INT NOT NULL,
      mes INT NOT NULL,
      desafio_tons NUMERIC,
      plano_tons NUMERIC,
      atualizado_por TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
      atualizado_em TIMESTAMP NOT NULL DEFAULT now(),
      UNIQUE (ano, mes)
    );
    -- Carga inicial (uma vez só) dos meses de Jan/2025 a Set/2026, lidos
    -- direto da planilha Base_de_Pesagens_Unificada (aba "Descarga",
    -- colunas AN "DESAFIO" / AO "PLANO") que já era mantida manualmente.
    -- ON CONFLICT DO NOTHING: roda em todo boot (é idempotente como o
    -- resto deste arquivo), mas só preenche na primeira vez — uma vez que
    -- alguém edite um mês pela tela do Painel, essa edição nunca é
    -- sobrescrita de volta por este seed.
    INSERT INTO gusa_metas_mensais (ano, mes, desafio_tons, plano_tons) VALUES
      (2025, 1, 130000, 93000),
      (2025, 2, 159366, 132805),
      (2025, 3, 185717, 170717),
      (2025, 4, 203995, 185450),
      (2025, 5, 200473.92, 185624),
      (2025, 6, 207000, 186594),
      (2025, 7, 207000, 170000),
      (2025, 8, 100000, 80000),
      (2025, 9, 161078, 131078),
      (2025, 10, 170000, 150000),
      (2025, 11, 208106, 194106),
      (2025, 12, 210000, 195000),
      (2026, 1, 220000, 200852),
      (2026, 2, 165000, 130000),
      (2026, 3, 115000, 95000),
      (2026, 4, 166512, 166512),
      (2026, 5, 148424, 148424),
      (2026, 6, 58883, 53530),
      (2026, 7, 60500, 55000),
      (2026, 8, 93557, 85052),
      (2026, 9, 4524.06, 4112.77)
    ON CONFLICT (ano, mes) DO NOTHING;
  `);
}

// Grupos de acesso do Kanban — os mesmos seis contratos/áreas de antes.
// "companies" é a lista de empresas que aquele grupo pode ver, ou "ALL"
// para Diretoria/Superintendência, que veem tudo.
const KANBAN_ACCESS_GROUPS = [
  { id: 'admin', label: 'Diretoria', companies: 'ALL' },
  { id: 'superintendencia', label: 'Superintendência', companies: 'ALL' },
  { id: 'arm', label: 'ARM Rio', companies: ['arm'] },
  { id: 'allseas-equinor-spot', label: 'All Seas / Equinor / SPOT', companies: ['allseas', 'equinor', 'spot'] },
  { id: 'especialistas', label: 'Especialistas', companies: ['especialistas'] },
  { id: 'tps-prime', label: 'TPS / Prime', companies: ['tps', 'prime'] }
];
const KANBAN_DEFAULT_SENHA = 'Triunfo2026';

// Dados reais do quadro no dia da migração (27/08/2026), tirados da cópia
// publicada em produção — para ninguém perder as ações já cadastradas na
// troca do arquivo estático para o banco. Só roda se a tabela ainda
// estiver vazia (primeiro boot depois do deploy desta versão).
const KANBAN_SEED_CARDS = require('./kanban-seed-cards.json');
const KANBAN_SEED_HISTORICO = require('./kanban-seed-historico.json');

async function seedKanbanAccess() {
  for (const g of KANBAN_ACCESS_GROUPS) {
    const hash = bcrypt.hashSync(KANBAN_DEFAULT_SENHA, 10);
    await pool.query(
      `INSERT INTO kanban_access (grupo_id, senha_hash) VALUES ($1, $2) ON CONFLICT (grupo_id) DO NOTHING`,
      [g.id, hash]
    );
  }
}

async function seedKanbanCards() {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM kanban_cards');
  if (rows[0].n > 0) return; // já tem dados de verdade — nunca sobrescreve
  for (const c of KANBAN_SEED_CARDS) {
    await pool.query(
      `INSERT INTO kanban_cards (id, company, texto, sub, responsavel, due, status, evidencias, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.company, c.text, c.sub || '', c.responsavel || '', c.due || null, c.status || 'todo', JSON.stringify(c.evidence || []), c.createdAt]
    );
  }
  for (const h of KANBAN_SEED_HISTORICO) {
    await pool.query(
      `INSERT INTO kanban_historico (data, total, todo, doing, done, por_empresa)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (data) DO NOTHING`,
      [h.date, h.total, h.todo, h.doing, h.done, JSON.stringify(h.byCompany || {})]
    );
  }
}

module.exports = { pool, initSchema, KANBAN_ACCESS_GROUPS, KANBAN_DEFAULT_SENHA, seedKanbanAccess, seedKanbanCards };
