const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { pool, initSchema, KANBAN_ACCESS_GROUPS, seedKanbanAccess, seedKanbanCards } = require('./db');

const app = express();

// ---------- Sessões salvas no Postgres (não em memória) ----------
// Sem isso, toda vez que o servidor reinicia (a cada deploy!) todo mundo
// era deslogado na hora, mesmo com a tela ainda aberta — a sessão vivia só
// na memória do processo antigo, que morre no redeploy. Guardando na
// mesma tabela do banco, a sessão sobrevive a reinícios do servidor.
class SessaoStorePostgres extends session.Store {
  async get(sid, cb) {
    try {
      const { rows } = await pool.query('SELECT sess FROM sessoes WHERE sid = $1 AND expire > now()', [sid]);
      cb(null, rows[0] ? rows[0].sess : null);
    } catch (err) { cb(err); }
  }
  async set(sid, sess, cb) {
    try {
      const maxAgeMs = (sess.cookie && sess.cookie.maxAge) || 1000 * 60 * 60 * 8;
      const expire = new Date(Date.now() + maxAgeMs);
      await pool.query(
        `INSERT INTO sessoes (sid, sess, expire) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, JSON.stringify(sess), expire]
      );
      cb && cb();
    } catch (err) { cb && cb(err); }
  }
  async destroy(sid, cb) {
    try {
      await pool.query('DELETE FROM sessoes WHERE sid = $1', [sid]);
      cb && cb();
    } catch (err) { cb && cb(err); }
  }
  async touch(sid, sess, cb) {
    try {
      const maxAgeMs = (sess.cookie && sess.cookie.maxAge) || 1000 * 60 * 60 * 8;
      const expire = new Date(Date.now() + maxAgeMs);
      await pool.query('UPDATE sessoes SET expire = $1 WHERE sid = $2', [expire, sid]);
      cb && cb();
    } catch (err) { cb && cb(err); }
  }
}

// Normaliza nome de navio para casar registros que às vezes vêm com o
// prefixo "MV " e às vezes sem (ex: "JOKER" vs "MV JOKER") — isso já
// acontece entre as diferentes abas da Central de Relatórios.
function normalizarNomeNavio(nome) {
  return String(nome || '').trim().toUpperCase().replace(/^MV\s+/, '');
}

// Decide a qual navio já cadastrado uma linha importada (planilha) pertence.
// Regra: casa só pelo NOME quando é inequívoco (existe apenas um navio
// cadastrado com esse nome) — o ano sugerido pela própria linha NUNCA entra
// em jogo nesse caso. Antes disso não era assim: cada rota de importação
// recalculava o ano a partir da data da própria linha (ex: Início de
// Descarga) e usava nome+ano como chave — bastava uma linha com o ano
// digitado errado na planilha (aconteceu de verdade com o Pelican Island:
// duas linhas de um mesmo lote com anos diferentes) pra ela cair num
// cadastro-fantasma em vez do navio real já existente, sem avisar ninguém.
// Só quando o NOME bate com mais de um navio cadastrado (caso raro, navio
// repetido em anos diferentes de verdade) é que o ano da linha é usado, e
// só pra desempatar entre esses candidatos — nunca pra criar um casamento
// que o nome sozinho não sustentaria.
// Retorna { id, ambiguo }: id preenchido = achou (ou desempatou) certinho;
// id null + ambiguo true = nome bate com 2+ navios e o ano não desempatou
// (não decide sozinho, evita criar mais um duplicado); id null + ambiguo
// false = nenhum navio com esse nome ainda (candidato a criar do zero).
function resolverNavioPorNome(naviosExistentes, nome, anoSugerido) {
  const nomeNorm = normalizarNomeNavio(nome);
  const candidatos = naviosExistentes.filter(n => normalizarNomeNavio(n.nome) === nomeNorm);
  if (candidatos.length === 1) return { id: candidatos[0].id, ambiguo: false };
  if (candidatos.length > 1) {
    const exato = candidatos.find(n => String(n.ano) === String(anoSugerido));
    return exato ? { id: exato.id, ambiguo: false } : { id: null, ambiguo: true };
  }
  return { id: null, ambiguo: false };
}

// Gera o mesmo formato de id usado no cadastro manual (POST /api/admin/navios)
// — mantém as rotas de importação consistentes com o cadastro pela tela.
function gerarIdNavio(nome, ano) {
  const slug = String(nome).trim().toLowerCase().normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `navio-${slug}-${ano}`;
}

// 12mb (não 10mb): uma evidência do Kanban pode ser uma imagem de até 8MB,
// que em base64 (dentro do JSON) fica ~33% maior — precisa de folga.
app.use(express.json({ limit: '12mb' }));

// Necessário pro Express confiar no cabeçalho X-Forwarded-Proto que o Railway
// envia — sem isso, o cookie "secure" abaixo nunca seria aceito como HTTPS
// de verdade e ninguém conseguiria logar.
app.set('trust proxy', 1);

// Permite que a ferramenta local de sincronização (aberta como arquivo no
// seu computador) envie pesagens para cá. Só a rota /api/importar-pesagens
// depende disso, e ela já exige um token — CORS liberado não é risco aqui.
app.use(cors());

app.use(session({
  store: new SessaoStorePostgres(),
  secret: process.env.SESSION_SECRET || 'troque-este-segredo-em-producao',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true, // exige HTTPS — o Railway já serve tudo em HTTPS
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 horas
  }
}));

// ---------- Proteção contra tentativas repetidas de login ----------
// Guarda em memória (reseta a cada deploy, mas é suficiente pra travar
// tentativas automatizadas de adivinhar senha).
const tentativasLogin = new Map(); // email normalizado -> { falhas, bloqueadoAte }
const MAX_TENTATIVAS_LOGIN = 5;
const BLOQUEIO_LOGIN_MS = 15 * 60 * 1000; // 15 minutos

// ---------- Autenticação ----------

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ erro: 'Informe usuário e senha.' });
  }

  const chaveTentativa = String(email).trim().toLowerCase();
  const registro = tentativasLogin.get(chaveTentativa);
  if (registro && registro.bloqueadoAte && registro.bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((registro.bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas erradas com esse login. Tente novamente em ${minutos} minuto(s).` });
  }

  const { rows } = await pool.query(
    'SELECT * FROM usuarios WHERE lower(email) = lower($1)',
    [email]
  );
  const usuario = rows[0];

  if (!usuario || !bcrypt.compareSync(senha, usuario.senha_hash)) {
    const falhas = (registro?.falhas || 0) + 1;
    if (falhas >= MAX_TENTATIVAS_LOGIN) {
      tentativasLogin.set(chaveTentativa, { falhas: 0, bloqueadoAte: Date.now() + BLOQUEIO_LOGIN_MS });
    } else {
      tentativasLogin.set(chaveTentativa, { falhas, bloqueadoAte: null });
    }
    return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });
  }

  tentativasLogin.delete(chaveTentativa);

  let clienteNome = null;
  if (usuario.cliente_id) {
    const { rows: clienteRows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [usuario.cliente_id]);
    clienteNome = clienteRows[0] ? clienteRows[0].nome : null;
  }

  req.session.userId = usuario.id;
  req.session.tipo = usuario.tipo || 'cliente';
  req.session.clienteId = usuario.cliente_id;
  req.session.clienteNome = clienteNome;
  req.session.acessoAnaliseDetalhada = !!usuario.acesso_analise_detalhada;
  req.session.gusaPermissao = usuario.gusa_permissao || 'nenhum';

  res.json({
    ok: true,
    cliente: clienteNome,
    tipo: req.session.tipo,
    senhaTrocada: usuario.senha_trocada
  });
});

app.post('/api/trocar-senha', requireAuth, async (req, res) => {
  const { senhaAtual, senhaNova } = req.body || {};
  if (!senhaAtual || !senhaNova) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  }
  if (senhaNova.length < 8) {
    return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.session.userId]);
  const usuario = rows[0];
  if (!usuario || !bcrypt.compareSync(senhaAtual, usuario.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta.' });
  }
  const novoHash = bcrypt.hashSync(senhaNova, 10);
  await pool.query('UPDATE usuarios SET senha_hash = $1, senha_trocada = true WHERE id = $2', [novoHash, req.session.userId]);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });
  res.json({
    id: req.session.userId,
    cliente: req.session.clienteNome,
    tipo: req.session.tipo,
    gusaPermissao: gusaPermissaoEfetiva(req)
  });
});

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });
  if (req.session.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  next();
}

function requireConsulta(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });
  if (!['admin', 'consultor_geral'].includes(req.session.tipo)) {
    return res.status(403).json({ erro: 'Acesso restrito.' });
  }
  next();
}

function requireAdminToken(req, res, next) {
  const token = req.header('x-admin-token');
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ erro: 'Servidor sem ADMIN_TOKEN configurado.' });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ erro: 'Token de administrador inválido.' });
  }
  next();
}

// ---------- Permissão do módulo "Descarga de Gusa" ----------
// Independente do "tipo" geral do login — ver coluna gusa_permissao em
// db.js. Admin sempre tem acesso total (nível "editar"), não importa o
// que estiver salvo nessa coluna pra ele.
const GUSA_RANKS = { nenhum: 0, visualizar: 1, lancar: 2, editar: 3 };
function gusaPermissaoEfetiva(req) {
  if (req.session.tipo === 'admin') return 'editar';
  return req.session.gusaPermissao || 'nenhum';
}
function requireGusaAcesso(minimo) {
  const minRank = GUSA_RANKS[minimo] ?? 99;
  return (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ erro: 'Não autenticado.' });
    const minha = gusaPermissaoEfetiva(req);
    if ((GUSA_RANKS[minha] ?? 0) < minRank) {
      return res.status(403).json({ erro: 'Sem permissão para esta ação em Descarga de Gusa.' });
    }
    next();
  };
}

// Horário "de Brasília" pra tudo relacionado a Descarga de Gusa, sem
// depender do fuso do container (Railway roda em UTC) — o Brasil não tem
// mais horário de verão desde 2019, então UTC-3 fixo é seguro pros
// terminais da Triunfo (todos em MG). agoraBrasil() é só pra timestamps
// calculados NO SERVIDOR (botão Iniciar/Finalizar, onde "agora" é o
// instante real do clique). Um lançamento manual/retroativo, por sua vez,
// já chega como string "YYYY-MM-DDTHH:MM" de um <input type="datetime-local">
// do navegador — ou seja, já é horário de parede de quem digitou — então
// essa string é usada literalmente (partesDataHoraLocal), nunca
// reinterpretada via `new Date(str)` (isso aplicaria o fuso do servidor
// por cima, errado).
function agoraBrasil() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}
function partesDataHoraLocal(str) {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return { ano: +m[1], mes: +m[2], dia: +m[3], hora: +m[4], minuto: +m[5] };
}
function dataAnterior(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
// Turno + "data do turno" a partir de um horário de Brasília (Date cujos
// getters UTC representam esse horário — ver agoraBrasil()). O turno da
// noite (19h-07h) usa como "data" o dia em que ele COMEÇOU: se já passou
// da meia-noite (0h-6h59), o turno começou ontem.
function turnoEDataDoTurno(d) {
  const h = d.getUTCHours();
  const dataBase = d.toISOString().slice(0, 10);
  if (h >= 7 && h < 19) return { turno: '07 - 19h', data: dataBase };
  if (h < 7) {
    const [ano, mes, dia] = dataBase.split('-').map(Number);
    return { turno: '19 - 07h', data: dataAnterior(ano, mes, dia) };
  }
  return { turno: '19 - 07h', data: dataBase };
}
// Início/fim (timestamps "wall-clock" de Brasília, mesmo formato salvo em
// inicio_descarga/fim_descarga) da janela de um turno — usado pra contar
// "finalizados no turno" pelo horário em que o vagão foi REALMENTE
// finalizado, não pela data/turno gravada em inicio_descarga (que fica
// parada no turno em que o vagão foi iniciado, e pode ser um turno
// anterior a esse se a descarga atravessou a virada).
function limitesTurno(turno, data) {
  const [ano, mes, dia] = data.split('-').map(Number);
  if (turno === '07 - 19h') {
    return { inicio: `${data} 07:00:00`, fim: `${data} 19:00:00` };
  }
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + 1);
  const proxData = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { inicio: `${data} 19:00:00`, fim: `${proxData} 07:00:00` };
}

// ---------- Dados filtrados pelo cliente logado ----------
// Regra central: um navio só aparece para o cliente se existir um vínculo
// em navio_clientes. Pesagens seguem o navio ao qual pertencem.

app.get('/api/clientes', requireConsulta, async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, logo_arquivo FROM clientes ORDER BY nome');
  res.json({ clientes: rows });
});

// ---------- Gestão de clientes (somente Admin) ----------
// A "logo" aqui é só o NOME do arquivo (ex: "gelf.png") que precisa ser
// enviado ao repositório do GitHub, na raiz, do mesmo jeito que os outros
// logos (triunfo.png, vetorial.png etc.) — o Railway não guarda arquivo
// enviado direto pelo navegador, então não dá pra fazer upload de imagem
// por aqui, só cadastrar o nome do arquivo que já está (ou vai ficar) lá.
app.post('/api/admin/clientes', requireAdmin, async (req, res) => {
  const { nome, logo_arquivo } = req.body || {};
  if (!nome || !nome.trim()) {
    return res.status(400).json({ erro: 'Informe o nome do cliente.' });
  }
  const slug = String(nome).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = `cli-${slug}`;

  const { rows: existente } = await pool.query('SELECT id FROM clientes WHERE id = $1', [id]);
  if (existente[0]) return res.status(409).json({ erro: `Já existe um cliente com esse nome (id: ${id}).` });

  const { rows } = await pool.query(
    `INSERT INTO clientes (id, nome, logo_arquivo) VALUES ($1, $2, $3) RETURNING *`,
    [id, nome.trim(), logo_arquivo ? logo_arquivo.trim() : null]
  );
  res.json({ ok: true, cliente: rows[0] });
});

app.put('/api/admin/clientes/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, logo_arquivo } = req.body || {};
  const updates = [];
  const valores = [];
  let i = 1;
  if (nome !== undefined) { updates.push(`nome = $${i++}`); valores.push(nome.trim()); }
  if (logo_arquivo !== undefined) { updates.push(`logo_arquivo = $${i++}`); valores.push(logo_arquivo ? logo_arquivo.trim() : null); }
  if (updates.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
  valores.push(id);
  const { rows } = await pool.query(`UPDATE clientes SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`, valores);
  if (!rows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' });
  res.json({ ok: true, cliente: rows[0] });
});

// ---------- Gestão de usuários/logins (somente Admin) ----------
// Evita ter que rodar SQL na mão toda vez que precisa cadastrar um cliente
// novo — o Admin cria login, senha e permissão direto pela tela.

app.get('/api/admin/usuarios', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.tipo, u.cliente_id, u.senha_trocada, u.acesso_analise_detalhada, u.gusa_permissao, c.nome AS cliente_nome
     FROM usuarios u
     LEFT JOIN clientes c ON c.id = u.cliente_id
     ORDER BY u.email`
  );
  res.json({ usuarios: rows });
});

app.post('/api/admin/usuarios', requireAdmin, async (req, res) => {
  const { email, senha, tipo, cliente_id } = req.body || {};
  if (!email || !senha || !tipo) {
    return res.status(400).json({ erro: 'Informe login, senha e permissão.' });
  }
  if (!['admin', 'consultor_geral', 'cliente'].includes(tipo)) {
    return res.status(400).json({ erro: 'Permissão inválida.' });
  }
  if (tipo === 'cliente' && !cliente_id) {
    return res.status(400).json({ erro: 'Login do tipo "só o próprio cliente" precisa de um cliente vinculado.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }

  const senhaHash = bcrypt.hashSync(senha, 10);
  const slug = String(email).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = `usuario-${slug}-${crypto.randomBytes(3).toString('hex')}`;
  try {
    const { rows } = await pool.query(
      `INSERT INTO usuarios (id, email, senha_hash, tipo, cliente_id, senha_trocada)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, email, tipo, cliente_id, senha_trocada, acesso_analise_detalhada`,
      [id, email, senhaHash, tipo, tipo === 'cliente' ? cliente_id : null]
    );
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe um usuário com esse login.' });
    }
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ erro: err.message || 'Erro interno ao criar usuário.' });
  }
});

app.put('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { tipo, cliente_id, nova_senha } = req.body || {};

  const updates = [];
  const valores = [];
  let i = 1;

  if (tipo !== undefined) {
    if (!['admin', 'consultor_geral', 'cliente'].includes(tipo)) {
      return res.status(400).json({ erro: 'Permissão inválida.' });
    }
    updates.push(`tipo = $${i++}`);
    valores.push(tipo);
  }
  if (cliente_id !== undefined) {
    updates.push(`cliente_id = $${i++}`);
    valores.push(cliente_id || null);
  }
  if (req.body.acesso_analise_detalhada !== undefined) {
    updates.push(`acesso_analise_detalhada = $${i++}`);
    valores.push(!!req.body.acesso_analise_detalhada);
  }
  if (req.body.gusa_permissao !== undefined) {
    if (!['nenhum', 'visualizar', 'lancar', 'editar'].includes(req.body.gusa_permissao)) {
      return res.status(400).json({ erro: 'Permissão de Descarga de Gusa inválida.' });
    }
    updates.push(`gusa_permissao = $${i++}`);
    valores.push(req.body.gusa_permissao);
  }
  if (nova_senha) {
    if (nova_senha.length < 8) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
    }
    updates.push(`senha_hash = $${i++}`);
    valores.push(bcrypt.hashSync(nova_senha, 10));
    updates.push(`senha_trocada = false`);
  }
  if (updates.length === 0) {
    return res.status(400).json({ erro: 'Nada para atualizar.' });
  }

  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, email, tipo, cliente_id, senha_trocada, acesso_analise_detalhada, gusa_permissao`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    return res.status(500).json({ erro: err.message || 'Erro interno ao atualizar usuário.' });
  }
});

app.delete('/api/admin/usuarios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (String(req.session.userId) === String(id)) {
    return res.status(400).json({ erro: 'Você não pode excluir o próprio usuário logado.' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ erro: err.message || 'Erro interno ao excluir usuário.' });
  }
});

// ---------- Ferramentas de administração da importação de pesagens ----------

// Lista todos os navios cadastrados (id, nome, ano) — usada pela página
// admin-pesagem.html para preencher a lista de navios conhecidos e para a
// ferramenta de limpeza de pesagens por navio.
app.get('/api/admin/navios-lista', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT n.id, n.nome, n.ano,
       (SELECT COUNT(*) FROM pesagens p WHERE p.navio_id = n.id) AS total_pesagens
     FROM navios n ORDER BY n.nome, n.ano`
  );
  res.json({ navios: rows });
});

// Apaga TODAS as pesagens de um navio específico — usada para limpar dados
// errados de uma importação ruim antes de reimportar corrigido. Exige
// confirmação explícita no corpo da requisição (confirmar: true) para
// reduzir o risco de clique acidental apagar dados por engano.
app.delete('/api/admin/navios/:id/pesagens', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (req.body?.confirmar !== true) {
    return res.status(400).json({ erro: 'Envie { "confirmar": true } no corpo da requisição para confirmar a exclusão.' });
  }
  const { rows: navioRows } = await pool.query('SELECT id, nome, ano FROM navios WHERE id = $1', [id]);
  if (!navioRows[0]) return res.status(404).json({ erro: 'Navio não encontrado.' });

  const { rowCount } = await pool.query('DELETE FROM pesagens WHERE navio_id = $1', [id]);
  res.json({ ok: true, navio: navioRows[0], pesagens_apagadas: rowCount });
});

// Exclui o navio inteiro (e tudo que depende dele: pesagens, lotes NF,
// vínculo com clientes) — irreversível, por isso exige confirmação
// explícita no corpo da requisição, igual a rota acima.
app.delete('/api/admin/navios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  if (req.body?.confirmar !== true) {
    return res.status(400).json({ erro: 'Envie { "confirmar": true } no corpo da requisição para confirmar a exclusão.' });
  }
  const { rows: navioRows } = await pool.query('SELECT id, nome, ano FROM navios WHERE id = $1', [id]);
  if (!navioRows[0]) return res.status(404).json({ erro: 'Navio não encontrado.' });

  await pool.query('DELETE FROM pesagens WHERE navio_id = $1', [id]);
  await pool.query('DELETE FROM lotes_nf WHERE navio_id = $1', [id]);
  await pool.query('DELETE FROM navio_clientes WHERE navio_id = $1', [id]);
  await pool.query('DELETE FROM navios WHERE id = $1', [id]);

  res.json({ ok: true, navio: navioRows[0] });
});

// Monta o timestamp real de uma pesagem (coluna "data" + "hora") como Date,
// pra dar pra comparar com o período de descarga de um lote. Se não der pra
// interpretar a hora, assume meia-noite (só a data já ajuda bastante).
function timestampDaPesagem(p) {
  if (!p.data) return null;
  const dataStr = (p.data instanceof Date) ? p.data.toISOString().slice(0, 10) : String(p.data).slice(0, 10);
  const horaStr = (p.hora && /^\d{1,2}:\d{2}/.test(String(p.hora))) ? String(p.hora).slice(0, 5) : '00:00';
  const dt = new Date(`${dataStr}T${horaStr}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

// Uma pesagem só "pertence" de fato a um prefixo se o horário dela cair
// dentro do período de descarga (início/fim) de ALGUM lote conhecido desse
// navio (não precisa ser exatamente o lote do prefixo dela — validamos
// contra o período agregado do navio como um todo). Se o navio não tem
// nenhum lote com início/fim cadastrado ainda, não dá pra validar nada —
// devolve false (não marca nada como fora do período) pra não fazer sumir
// dado à toa. O mesmo vale se a própria pesagem não tem data/hora legível.
function pesagemForaDoPeriodoDoNavio(p, lotesDoNavio) {
  const periodosDefinidos = (lotesDoNavio || []).filter(l => l.inicio_descarga && l.fim_descarga);
  if (periodosDefinidos.length === 0) return false;
  const ts = timestampDaPesagem(p);
  if (!ts) return false;
  const dentroDeAlgumPeriodo = periodosDefinidos.some(l => {
    const ini = new Date(l.inicio_descarga);
    const fim = new Date(l.fim_descarga);
    if (isNaN(ini.getTime()) || isNaN(fim.getTime())) return false;
    return ts >= ini && ts <= fim;
  });
  return !dentroDeAlgumPeriodo;
}

// prefixo_efetivo continua existindo só pra manter compatibilidade com quem
// já lê esse campo (ex.: relabeling pra "Sem prefixo" quando a pesagem tem
// um prefixo que não bate com o período) — mas agora quem realmente decide
// se a pesagem soma no total do navio é pesagemForaDoPeriodoDoNavio, abaixo.
function prefixoEfetivo(p, lotesDoNavio) {
  const original = p.prefixo || '';
  if (!original) return original;
  return pesagemForaDoPeriodoDoNavio(p, lotesDoNavio) ? '' : original;
}

app.get('/api/dados', requireAuth, async (req, res) => {
  let clienteId = req.session.clienteId;
  let clienteNome = req.session.clienteNome;
  let clienteLogo = null;
  let modoTodos = false;
  const podeEditar = req.session.tipo === 'admin';

  if (['admin', 'consultor_geral'].includes(req.session.tipo)) {
    const clienteIdQuery = req.query.clienteId || null;
    if (!clienteIdQuery || clienteIdQuery === 'todos') {
      // Ninguém marcou um cliente específico — mostra o agregado de todos.
      // Só quem tem essa permissão (admin/consultor_geral) cai aqui; login
      // do tipo "cliente" nem manda esse parâmetro, sempre usa o próprio.
      modoTodos = true;
      clienteId = null;
      clienteNome = 'Todos os clientes';
    } else {
      clienteId = clienteIdQuery;
      const { rows: clienteRows } = await pool.query('SELECT * FROM clientes WHERE id = $1', [clienteId]);
      if (!clienteRows[0]) return res.status(404).json({ erro: 'Cliente não encontrado.' });
      clienteNome = clienteRows[0].nome;
      clienteLogo = clienteRows[0].logo_arquivo || null;
    }
  } else if (clienteId) {
    const { rows: clienteRows } = await pool.query('SELECT logo_arquivo FROM clientes WHERE id = $1', [clienteId]);
    clienteLogo = clienteRows[0] ? clienteRows[0].logo_arquivo : null;
  }

  const { rows: navios } = modoTodos
    ? await pool.query(
        `SELECT DISTINCT n.* FROM navios n
         JOIN navio_clientes nc ON nc.navio_id = n.id
         ORDER BY n.lay_day_inicio DESC NULLS LAST`
      )
    : await pool.query(
        `SELECT n.* FROM navios n
         JOIN navio_clientes nc ON nc.navio_id = n.id
         WHERE nc.cliente_id = $1
         ORDER BY n.lay_day_inicio DESC NULLS LAST`,
        [clienteId]
      );

  const navioIds = navios.map(n => n.id);

  let pesagensPorNavio = {};
  let comparilhadoPorNavio = {};
  let lotesNfPorNavio = {};

  if (navioIds.length > 0) {
    const { rows: pesagens } = await pool.query(
      `SELECT * FROM pesagens WHERE navio_id = ANY($1) ORDER BY data, hora`,
      [navioIds]
    );
    for (const p of pesagens) {
      (pesagensPorNavio[p.navio_id] = pesagensPorNavio[p.navio_id] || []).push(p);
    }

    // No modo "Todos" não existe um cliente "dono" pra excluir da lista de
    // quem mais compartilha o navio — mostra todo mundo que tem acesso.
    const { rows: outrosClientes } = modoTodos
      ? await pool.query(
          `SELECT nc.navio_id, c.nome FROM navio_clientes nc
           JOIN clientes c ON c.id = nc.cliente_id
           WHERE nc.navio_id = ANY($1)`,
          [navioIds]
        )
      : await pool.query(
          `SELECT nc.navio_id, c.nome FROM navio_clientes nc
           JOIN clientes c ON c.id = nc.cliente_id
           WHERE nc.navio_id = ANY($1) AND nc.cliente_id != $2`,
          [navioIds, clienteId]
        );
    for (const row of outrosClientes) {
      (comparilhadoPorNavio[row.navio_id] = comparilhadoPorNavio[row.navio_id] || []).push(row.nome);
    }

    const { rows: lotesNf } = await pool.query(
      `SELECT * FROM lotes_nf WHERE navio_id = ANY($1)`,
      [navioIds]
    );
    for (const l of lotesNf) {
      (lotesNfPorNavio[l.navio_id] = lotesNfPorNavio[l.navio_id] || []).push(l);
    }
  }

  const naviosResp = navios.map(n => {
    const minhasPesagensDoNavio = pesagensPorNavio[n.id] || [];
    const meusLotesNf = lotesNfPorNavio[n.id] || [];
    // Calcula (e grava direto no objeto, por referência) o prefixo_efetivo de
    // cada pesagem ANTES de somar qualquer coisa — assim tanto o total deste
    // navio quanto a lista achatada "pesagens" (usada pelos gráficos globais
    // de Análises) enxergam o mesmo valor corrigido, sem duplicar a regra.
    minhasPesagensDoNavio.forEach(p => {
      p.fora_do_periodo = pesagemForaDoPeriodoDoNavio(p, meusLotesNf);
      p.prefixo_efetivo = p.fora_do_periodo ? '' : (p.prefixo || '');
    });
    // "a apurar" = pesagem com horário fora de todos os períodos de descarga
    // conhecidos do navio. Ela continua existindo e aparecendo nas telas de
    // conferência/edição (com a flag fora_do_periodo), mas sai de TODAS as
    // somas do navio (Resumo, Painel, Heatmap, Análises) até alguém revisar
    // e corrigir manualmente (navio errado, data errada, etc.).
    const pesagensAtivas = minhasPesagensDoNavio.filter(p => !p.desconsiderada && !p.fora_do_periodo);

    // Soma o "Pesado" por prefixo do mesmo jeito que a aba Análises: usa o
    // Peso Balança manual quando alguém sobrescreveu aquele prefixo
    // específico, senão soma as carretas reais dele. Isso faz o Resumo, o
    // Painel de Navios e o Heatmap baterem com o que aparece em Análises,
    // em vez de cada tela calcular o total de um jeito diferente.
    const pesadoPorPrefixo = {};
    pesagensAtivas.forEach(p => {
      const chave = p.prefixo_efetivo;
      pesadoPorPrefixo[chave] = (pesadoPorPrefixo[chave] || 0) + Number(p.peso_liquido || 0);
    });
    const prefixosVistos = new Set(Object.keys(pesadoPorPrefixo));
    meusLotesNf.forEach(l => { prefixosVistos.add(l.prefixo || ''); });

    let pesoPorPesagens = 0;
    let pesoNfPesado = 0;
    let pesoNfFila = 0;
    prefixosVistos.forEach(prefixo => {
      const lotesDoPrefixo = meusLotesNf.filter(l => (l.prefixo || '') === prefixo);
      const loteComBalancaManual = lotesDoPrefixo.find(l => l.peso_balanca_t != null && Number(l.peso_balanca_t) !== 0);
      const foiPesado = !!loteComBalancaManual || (pesadoPorPrefixo[prefixo] || 0) > 0;
      pesoPorPesagens += loteComBalancaManual ? Number(loteComBalancaManual.peso_balanca_t) : (pesadoPorPrefixo[prefixo] || 0);
      const nfDoPrefixo = lotesDoPrefixo.reduce((s, l) => s + Number(l.peso_nf_t || 0), 0);
      if (foiPesado) pesoNfPesado += nfDoPrefixo; else pesoNfFila += nfDoPrefixo;
    });
    // Nem todo NF necessariamente está detalhado por prefixo ainda (pode
    // ter sido lançado como total do navio antes de existir lote_nf) — a
    // diferença entre o total do navio e o que já foi somado por prefixo
    // também conta como "fila" (ainda não sabemos nem que trem é).
    const nfNaoItemizado = Math.max(0, Number(n.peso_nf_t || 0) - pesoNfPesado - pesoNfFila);
    pesoNfFila += nfNaoItemizado;

    const temAlgumPesoManual = meusLotesNf.some(l => l.peso_balanca_t != null && Number(l.peso_balanca_t) !== 0);
    const temPesagensSincronizadas = minhasPesagensDoNavio.length > 0 || temAlgumPesoManual;
    const pesoTotal = temPesagensSincronizadas ? pesoPorPesagens : Number(n.peso_carregado_t || 0);
    // peso_balanca_manual = o Admin sobrescreveu o Peso Balança do navio à
    // mão no Painel de Navios (ver PUT /api/admin/navios/:id) — nesse caso
    // o valor salvo em navios.peso_balanca_t manda, sem recalcular pela
    // soma das pesagens. Só volta a calcular automaticamente quando o
    // Admin desfizer o override ("Voltar a calcular automaticamente").
    const pesoBalancaCalculado = n.peso_balanca_manual
      ? Number(n.peso_balanca_t || 0)
      : (temPesagensSincronizadas
        ? Number(pesoPorPesagens.toFixed(2))
        : Number(n.peso_balanca_t || 0));

    const pesagensAApurar = minhasPesagensDoNavio.filter(p => !p.desconsiderada && p.fora_do_periodo);
    const pesoAApurarT = pesagensAApurar.reduce((s, p) => s + Number(p.peso_liquido || 0), 0);

    return {
      id: n.id,
      nome: n.nome,
      ano: n.ano,
      lotes: [{
        id: n.id,
        trader: n.trader,
        agente: n.agente,
        status: n.status,
        peso_nf_t: Number(n.peso_nf_t || 0),
        peso_nf_pesado_t: Number(pesoNfPesado.toFixed(2)),
        peso_nf_fila_t: Number(pesoNfFila.toFixed(2)),
        peso_balanca_t: pesoBalancaCalculado,
        peso_balanca_manual: !!n.peso_balanca_manual,
        peso_arqueado_t: Number(n.peso_arqueado_t || 0),
        peso_nomeado_t: Number(n.peso_nomeado_t || 0),
        peso_carregado_t: Number(n.peso_carregado_t || 0),
        lay_day_inicio: n.lay_day_inicio,
        lay_day_fim: n.lay_day_fim,
        compartilhado_com: comparilhadoPorNavio[n.id] || []
      }],
      peso_total_liquido: Number(pesoTotal.toFixed(2)),
      // Pesagens com horário fora de todos os períodos de descarga conhecidos
      // do navio — não entram em peso_total_liquido/peso_balanca_t acima,
      // ficam separadas aqui pra alguém revisar (navio errado? data errada?
      // trem que ainda não tem lote cadastrado?).
      pesagem_a_apurar_qtd: pesagensAApurar.length,
      pesagem_a_apurar_t: Number(pesoAApurarT.toFixed(2)),
      // prefixo_efetivo já foi calculado (e gravado por referência) no topo
      // desta função, antes de somar pesadoPorPrefixo — aqui só devolve como
      // veio, sem reprocessar. O campo "prefixo" original continua intacto,
      // só usado pra edição/consulta da pesagem, nunca sobrescrito.
      pesagens: minhasPesagensDoNavio,
      lotesNf: (lotesNfPorNavio[n.id] || []).map(l => ({
        prefixo: l.prefixo,
        cor: l.cor,
        peso_nf_t: Number(l.peso_nf_t || 0),
        peso_balanca_t: l.peso_balanca_t != null ? Number(l.peso_balanca_t) : null,
        peso_ferrovia_t: l.peso_ferrovia_t != null ? Number(l.peso_ferrovia_t) : null,
        inicio_descarga: l.inicio_descarga,
        fim_descarga: l.fim_descarga,
        // Precisa ir junto pro front-end conseguir escolher, quando existir
        // mais de uma linha de lotes_nf pro MESMO prefixo (normalmente por
        // causa de Cor grafada diferente entre duas importações/edições — ver
        // comentário do detector de duplicados abaixo), qual delas é a mais
        // recente pra mostrar em "Detalhamento por prefixo". Sem isso, uma
        // correção de período gravada com sucesso numa linha "nova" (cor
        // diferente por acidente) ficava escondida atrás da linha antiga na
        // tela, parecendo que a correção "não salvou".
        atualizado_em: l.atualizado_em
      }))
    };
  });

  const todasPesagens = Object.values(pesagensPorNavio).flat();

  // Pesagens que a importação não conseguiu casar com nenhum navio (nome não
  // bateu, ambíguo, ou nenhum Lay Day cobria a data) não são mais descartadas
  // — ficam salvas com navio_id nulo. Não pertencem a nenhum cliente
  // específico ainda, então só aparecem no modo "Todos os clientes".
  let pesagensSemNavio = [];
  if (modoTodos) {
    const { rows } = await pool.query(
      `SELECT * FROM pesagens WHERE navio_id IS NULL ORDER BY data, hora`
    );
    pesagensSemNavio = rows;
  }

  res.json({
    cliente: clienteNome,
    clienteId,
    clienteLogo,
    tipo: req.session.tipo,
    podeEditar,
    acessoAnaliseDetalhada: req.session.tipo === 'admin' || !!req.session.acessoAnaliseDetalhada,
    navios: naviosResp,
    pesagens: todasPesagens,
    pesagens_sem_navio: pesagensSemNavio
  });
});

// ---------- Edições manuais (somente Admin) ----------

app.post('/api/admin/navios', requireAdmin, async (req, res) => {
  const { nome, ano, cliente_id, trader, agente, status, peso_nf_t, peso_balanca_t, peso_arqueado_t, peso_nomeado_t, peso_carregado_t, lay_day_inicio, lay_day_fim } = req.body || {};
  if (!nome || !ano || !cliente_id) {
    return res.status(400).json({ erro: 'Informe ao menos nome, ano e cliente.' });
  }

  const { rows: clienteRows } = await pool.query('SELECT id FROM clientes WHERE id = $1', [cliente_id]);
  if (!clienteRows[0]) return res.status(400).json({ erro: 'Cliente não encontrado.' });

  const slug = String(nome).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const id = `navio-${slug}-${ano}`;

  const { rows: existente } = await pool.query('SELECT id FROM navios WHERE id = $1', [id]);
  if (existente[0]) return res.status(409).json({ erro: `Já existe um navio com esse nome e ano (id: ${id}). Use a edição em vez de cadastrar de novo.` });

  const { rows } = await pool.query(
    `INSERT INTO navios (id, nome, ano, trader, agente, status, peso_nf_t, peso_balanca_t, peso_arqueado_t, peso_nomeado_t, peso_carregado_t, lay_day_inicio, lay_day_fim, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
     RETURNING *`,
    [
      id, nome, ano, trader || null, agente || null, status || null,
      peso_nf_t || 0, peso_balanca_t || 0, peso_arqueado_t || 0, peso_nomeado_t || 0, peso_carregado_t || 0,
      lay_day_inicio || null, lay_day_fim || null
    ]
  );
  await pool.query(
    `INSERT INTO navio_clientes (navio_id, cliente_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [id, cliente_id]
  );

  res.json({ ok: true, navio: rows[0] });
});

app.put('/api/admin/navios/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  // peso_balanca_manual entra na mesma allowlist — o front manda `true`
  // junto com peso_balanca_t sempre que o Admin edita e salva o campo Peso
  // Balança no Painel de Navios, e manda `false` sozinho quando o Admin usa
  // o botão "Voltar a calcular automaticamente". GET /api/dados usa essa
  // flag pra decidir se recalcula peso_balanca_t pela soma das pesagens ou
  // se respeita o valor gravado aqui.
  const campos = ['trader', 'agente', 'status', 'peso_nf_t', 'peso_balanca_t', 'peso_balanca_manual', 'peso_arqueado_t', 'peso_nomeado_t', 'peso_carregado_t', 'lay_day_inicio', 'lay_day_fim'];
  const updates = [];
  const valores = [];
  let i = 1;
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      updates.push(`${campo} = $${i}`);
      valores.push(req.body[campo] === '' ? null : req.body[campo]);
      i++;
    }
  }
  // vincular_cliente_id não é coluna de navios — é tratado à parte, num
  // INSERT em navio_clientes. Existe porque hoje só dá pra ligar um navio a
  // um cliente no momento do cadastro (POST /api/admin/navios); sem essa
  // válvula de escape, um navio criado sem cliente (ex: pela sincronização
  // do Relatório Analítico, quando não identifica o cliente da planilha)
  // ficava invisível pra sempre, sem nenhuma forma de corrigir pela tela.
  const vincularClienteId = req.body.vincular_cliente_id;
  if (updates.length === 0 && !vincularClienteId) {
    return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  }
  valores.push(id);
  try {
    let navio;
    if (updates.length > 0) {
      const { rows } = await pool.query(
        `UPDATE navios SET ${updates.join(', ')}, atualizado_em = now() WHERE id = $${i} RETURNING *`,
        valores
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Navio não encontrado.' });
      navio = rows[0];
    } else {
      const { rows } = await pool.query('SELECT * FROM navios WHERE id = $1', [id]);
      if (!rows[0]) return res.status(404).json({ erro: 'Navio não encontrado.' });
      navio = rows[0];
    }
    if (vincularClienteId) {
      await pool.query(
        `INSERT INTO navio_clientes (navio_id, cliente_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, vincularClienteId]
      );
    }
    res.json({ ok: true, navio });
  } catch (err) {
    // Sem esse try/catch, um erro do Postgres aqui (ex: coluna que ainda não
    // existe porque a migração não rodou) não cai no middleware de erro do
    // Express 4 pra rota async — a resposta nunca é enviada e o front só vê
    // "Erro ao salvar." genérico, sem a mensagem real por trás.
    console.error('Erro ao atualizar navio:', err);
    return res.status(500).json({ erro: err.message || 'Erro interno ao atualizar navio.' });
  }
});

// Edita (ou cria, se ainda não existir) o peso NF de um lote específico
// (navio + prefixo + cor) direto pela tela — sem precisar do token de
// importação em massa. Usada pela aba "Pesagem por Trem".
app.put('/api/admin/lotes-nf', requireAdmin, async (req, res) => {
  const { navio_id, prefixo, cor, peso_nf_t, peso_balanca_t, peso_ferrovia_t, inicio_descarga, fim_descarga } = req.body || {};
  if (!navio_id || !prefixo) {
    return res.status(400).json({ erro: 'Informe ao menos o navio e o prefixo do lote.' });
  }
  const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
  if (!navioRows[0]) return res.status(404).json({ erro: 'Navio não encontrado.' });

  // Descobre quanto esse lote JÁ TINHA de Peso NF antes desta edição (0 se o
  // lote ainda nem existe) — precisa disso pra ajustar o total do navio pelo
  // MESMO tanto (ver UPDATE em navios logo abaixo, com a explicação completa
  // do bug que isso corrige — foi o que aconteceu com o MV JOKER).
  const { rows: loteAntes } = await pool.query(
    'SELECT peso_nf_t FROM lotes_nf WHERE navio_id = $1 AND prefixo = $2 AND cor = $3',
    [navio_id, prefixo, cor || '']
  );
  const nfAntesDoLote = Number((loteAntes[0] && loteAntes[0].peso_nf_t) || 0);
  const nfNovoDoLote = Number(peso_nf_t) || 0;
  const deltaNf = nfNovoDoLote - nfAntesDoLote;

  const { rows } = await pool.query(
    `INSERT INTO lotes_nf (navio_id, prefixo, cor, peso_nf_t, peso_balanca_t, peso_ferrovia_t, inicio_descarga, fim_descarga, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (navio_id, prefixo, cor) DO UPDATE SET
       peso_nf_t = EXCLUDED.peso_nf_t,
       peso_balanca_t = COALESCE(EXCLUDED.peso_balanca_t, lotes_nf.peso_balanca_t),
       peso_ferrovia_t = COALESCE(EXCLUDED.peso_ferrovia_t, lotes_nf.peso_ferrovia_t),
       inicio_descarga = COALESCE(EXCLUDED.inicio_descarga, lotes_nf.inicio_descarga),
       fim_descarga = COALESCE(EXCLUDED.fim_descarga, lotes_nf.fim_descarga),
       atualizado_em = now()
     RETURNING *`,
    [
      navio_id, prefixo, cor || '', nfNovoDoLote,
      peso_balanca_t !== undefined && peso_balanca_t !== '' ? Number(peso_balanca_t) : null,
      peso_ferrovia_t !== undefined && peso_ferrovia_t !== '' ? Number(peso_ferrovia_t) : null,
      inicio_descarga || null, fim_descarga || null
    ]
  );

  // MANTÉM O TOTAL DO NAVIO EM SINCRONIA COM O LOTE QUE ACABOU DE SER
  // CORRIGIDO. navios.peso_nf_t é um número guardado à parte da soma dos
  // lotes — e GET /api/dados usa a diferença entre esse total e a soma dos
  // lotes já detalhados ("nfNaoItemizado") como um saldo ainda não
  // detalhado por prefixo, que é somado de volta ao total. Sem este ajuste
  // aqui, corrigir o Peso NF de UM lote não mexia nesse total: o saldo "não
  // detalhado" simplesmente crescia ou encolhia sozinho pra compensar, e o
  // número grande de cima (usado na comparação NF x Balança da aba
  // Análises) voltava pro mesmo valor de sempre assim que a página
  // recarregava — foi exatamente isso que aconteceu com o MV JOKER: a tela
  // chegou a mostrar o valor certo por um instante, mas ao fechar/recarregar
  // voltava pros ~82 mil antigos. Somando aqui o delta (novo − antigo) direto
  // no total do navio, a correção do lote passa a valer também no total.
  if (deltaNf !== 0) {
    await pool.query(
      'UPDATE navios SET peso_nf_t = GREATEST(0, COALESCE(peso_nf_t, 0) + $1), atualizado_em = now() WHERE id = $2',
      [deltaNf, navio_id]
    );
  }

  res.json({ ok: true, lote: rows[0] });
});

// Encontra grupos de lotes_nf que provavelmente são o MESMO trem/lote
// duplicado — mesmo navio + mesmo Prefixo (ignorando espaços/maiúscula), mas
// gravado mais de uma vez (normalmente porque a Cor veio grafada diferente
// entre duas importações, ex: "VERMELHO" com espaço a mais). O problema real
// disso: o cálculo de Peso NF por prefixo (ver GET /api/dados) soma o
// peso_nf_t de TODAS as linhas daquele prefixo, então um duplicado desses
// dobra o Peso NF do navio inteiro sem avisar. Devolve todas as linhas de
// cada grupo com mais de 1 linha, pra um Admin olhar e decidir qual excluir
// — não apaga nada sozinho.
app.get('/api/admin/lotes-nf/duplicados', requireAdmin, async (req, res) => {
  // Com ?navio_id=... lista TODAS as linhas daquele navio (não só grupos
  // duplicados) — necessário pra achar um outro tipo de linha ruim: quando
  // uma importação com colunas fora de ordem grava uma data/hora inteira no
  // campo Prefixo (ex: "2026-08-15 13:00:00" em vez de "FER5126"). Essa linha
  // não bate com nenhum Prefixo real existente, então nunca teria mais de 1
  // linha no mesmo grupo — o scan de duplicados (abaixo) não a encontra
  // sozinho, só olhando tudo do navio dá pra ver ela.
  const { navio_id } = req.query;
  // Duas formas de data que já apareceram em campos corrompidos:
  // ISO ("2026-08-15 13:00:00", vindo de timestamp de banco) e BR
  // ("16/08/2026 14:45", vindo de texto colado da planilha).
  const REGEX_PARECE_DATA = /^\d{4}-\d{1,2}-\d{1,2}([ T]|$)|^\d{1,2}\/\d{1,2}\/\d{2,4}([ T]|$)/;

  const { rows } = navio_id
    ? await pool.query(
        `SELECT l.navio_id, n.nome AS navio_nome, n.ano AS navio_ano, l.prefixo, l.cor,
                l.peso_nf_t, l.peso_balanca_t, l.peso_ferrovia_t, l.inicio_descarga, l.fim_descarga
         FROM lotes_nf l
         JOIN navios n ON n.id = l.navio_id
         WHERE l.navio_id = $1
         ORDER BY l.prefixo, l.cor`,
        [navio_id]
      )
    : await pool.query(
        `SELECT l.navio_id, n.nome AS navio_nome, n.ano AS navio_ano, l.prefixo, l.cor,
                l.peso_nf_t, l.peso_balanca_t, l.peso_ferrovia_t, l.inicio_descarga, l.fim_descarga
         FROM lotes_nf l
         JOIN navios n ON n.id = l.navio_id
         WHERE (l.navio_id, upper(trim(l.prefixo))) IN (
           SELECT navio_id, upper(trim(prefixo)) FROM lotes_nf GROUP BY navio_id, upper(trim(prefixo)) HAVING count(*) > 1
         )
         -- Além dos grupos duplicados acima, também traz qualquer linha cujo
         -- Prefixo ou Cor pareça uma data — isso pega o caso de uma colagem
         -- com colunas fora de ordem que gravou data/hora inteira nesses
         -- campos. Essa linha não colide com nenhuma outra (prefixo único),
         -- então nunca formaria um "grupo duplicado" — sem esta cláusula ela
         -- nunca aparece nesta ferramenta, mesmo dobrando o Peso NF do navio.
         OR l.prefixo ~ '^\\d{4}-\\d{1,2}-\\d{1,2}([ T]|$)'
         OR l.prefixo ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}([ T]|$)'
         OR l.cor ~ '^\\d{4}-\\d{1,2}-\\d{1,2}([ T]|$)'
         OR l.cor ~ '^\\d{1,2}/\\d{1,2}/\\d{2,4}([ T]|$)'
         ORDER BY n.nome, n.ano, upper(trim(l.prefixo)), l.cor`
      );

  const linhas = rows.map(r => ({
    ...r,
    prefixo_suspeito: REGEX_PARECE_DATA.test(String(r.prefixo || '')),
    cor_suspeito: REGEX_PARECE_DATA.test(String(r.cor || '')),
  }));
  res.json({ ok: true, linhas });
});

// Exclui uma linha específica de lotes_nf (chave exata navio+prefixo+cor) —
// usado pela ferramenta acima pra remover a linha duplicada errada, sem
// mexer na correta.
app.post('/api/admin/lotes-nf/excluir', requireAdmin, async (req, res) => {
  const { navio_id, prefixo, cor } = req.body || {};
  if (!navio_id || prefixo == null || prefixo === '') {
    return res.status(400).json({ erro: 'Informe navio_id e prefixo.' });
  }
  const { rowCount } = await pool.query(
    'DELETE FROM lotes_nf WHERE navio_id = $1 AND prefixo = $2 AND cor = $3',
    [navio_id, prefixo, cor || '']
  );
  if (rowCount === 0) return res.status(404).json({ erro: 'Lote não encontrado (talvez já tenha sido excluído).' });
  res.json({ ok: true });
});

// Importação em massa de dados retroativos de lotes, colados direto da aba
// "Pesagem por trem" da planilha (Navio, Prefixo, Cor, Início de Descarga,
// Fim de Descarga, Peso NF, Peso Balança Triunfo, Peso Ferrovia). Cada linha
// vira um upsert em lotes_nf — se o lote (navio+prefixo+cor) já existir,
// atualiza; senão, cria.
app.post('/api/admin/lotes-nf/importar', requireAdmin, async (req, res) => {
  const { linhas } = req.body || {};
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "linhas" com pelo menos um item.' });
  }

  // Funde linhas que se referem ao mesmo lote (navio+prefixo+cor) ANTES de
  // gravar — sem isso, quando a planilha traz duas linhas pro mesmo lote
  // (aconteceu de verdade: Pelican Island tinha duas linhas de FER0132/AZUL
  // com pesos diferentes), o upsert em lotes_nf (cuja chave primária é
  // exatamente navio+prefixo+cor) faz a segunda simplesmente sobrescrever a
  // primeira — uma das duas somas desaparece sem aviso nenhum. Fundindo aqui,
  // nenhuma tonelagem se perde: os pesos somam, e o período vira a união
  // (menor início, maior fim) das linhas fundidas.
  const porChaveLote = new Map();
  for (const l of linhas) {
    const chave = `${normalizarNomeNavio(l.navio)}::${l.prefixo || ''}::${l.cor || ''}`;
    const acc = porChaveLote.get(chave);
    if (!acc) { porChaveLote.set(chave, { ...l }); continue; }
    acc.peso_nf_t = (Number(acc.peso_nf_t) || 0) + (Number(l.peso_nf_t) || 0);
    if (l.peso_balanca_t != null && l.peso_balanca_t !== '') {
      acc.peso_balanca_t = (Number(acc.peso_balanca_t) || 0) + Number(l.peso_balanca_t);
    }
    if (l.peso_ferrovia_t != null && l.peso_ferrovia_t !== '') {
      acc.peso_ferrovia_t = (Number(acc.peso_ferrovia_t) || 0) + Number(l.peso_ferrovia_t);
    }
    if (l.inicio_descarga && (!acc.inicio_descarga || l.inicio_descarga < acc.inicio_descarga)) acc.inicio_descarga = l.inicio_descarga;
    if (l.fim_descarga && (!acc.fim_descarga || l.fim_descarga > acc.fim_descarga)) acc.fim_descarga = l.fim_descarga;
  }
  const linhasFundidas = [...porChaveLote.values()];

  const { rows: naviosCadastrados } = await pool.query('SELECT id, nome, ano FROM navios');

  let atualizados = 0;
  let criados = 0;
  const naoEncontrados = new Set();
  // Sem dados de trader/agente/cliente/lay-day aqui (essa planilha só tem
  // lote a lote) — o navio criado por essa rota sai "raso" de propósito, só
  // pra existir e receber os lotes. O resto (e o vínculo com cliente) dá pra
  // completar depois em Painel de Navios, ou via PUT .../navios/:id com
  // vincular_cliente_id.
  const criadosSemCliente = new Set();
  // Acumula, por navio, o quanto o Peso NF de cada lote SUBIU ou DESCEU
  // nesta importação — pra ajustar navios.peso_nf_t pelo mesmo tanto ao
  // final (ver comentário completo perto do UPDATE, logo abaixo do loop).
  const deltaNfPorNavio = new Map();

  for (const l of linhasFundidas) {
    if (!l.navio) { naoEncontrados.add(`${l.navio || '?'} (${l.ano || '?'})`); continue; }
    // A planilha não traz o ano do navio explicitamente — usa o ano da data
    // de início de descarga da própria linha só como sugestão pra desempate
    // (ver resolverNavioPorNome) ou pra criar um navio novo; nunca decide
    // sozinho o casamento quando o navio já existe de forma inequívoca.
    const anoSugerido = l.inicio_descarga ? new Date(l.inicio_descarga).getFullYear() : l.ano;
    const resolvido = resolverNavioPorNome(naviosCadastrados, l.navio, anoSugerido);
    let navioId = resolvido.id;

    if (!navioId) {
      if (resolvido.ambiguo) {
        naoEncontrados.add(`${l.navio} (ambíguo — existe mais de um navio com esse nome e o ano não bateu com nenhum)`);
        continue;
      }
      if (!anoSugerido) { naoEncontrados.add(`${l.navio} (?)`); continue; }
      const novoId = gerarIdNavio(l.navio, anoSugerido);
      const { rows: criado } = await pool.query(
        `INSERT INTO navios (id, nome, ano, atualizado_em) VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [novoId, String(l.navio).trim(), anoSugerido]
      );
      navioId = criado[0] ? criado[0].id : novoId;
      naviosCadastrados.push({ id: navioId, nome: String(l.navio).trim(), ano: anoSugerido });
      criados++;
      criadosSemCliente.add(`${l.navio} (${anoSugerido})`);
    }
    if (!l.prefixo) continue;

    // IMPORTANTE: inicio_descarga/fim_descarga usam COALESCE com a ORDEM
    // INVERTIDA da peso_nf_t de propósito — o valor que já está salvo no
    // banco vence, e só entra o valor novo da planilha se ainda não houver
    // nenhum. Antes era o contrário (o valor novo sempre vencia), e isso
    // apagava silenciosamente correções manuais de período feitas em
    // "Atribuir Lote por Período" toda vez que a planilha era reimportada —
    // foi exatamente isso que fez o período do FER5148 do MV LARDOS voltar
    // pro valor largo (e errado) da aba Descarga depois de uma reimportação
    // em massa feita pra outro navio. O Peso NF continua sempre vindo da
    // planilha (essa parte é propositalmente confiável); só o período que
    // agora é "travado" assim que alguém (automático ou manual) o define
    // pela primeira vez — pra corrigir um período depois, use "Atribuir
    // Lote por Período", não reimportar a planilha.
    const { rows: loteAntes } = await pool.query(
      'SELECT peso_nf_t FROM lotes_nf WHERE navio_id = $1 AND prefixo = $2 AND cor = $3',
      [navioId, l.prefixo, l.cor || '']
    );
    const nfAntesDoLote = Number((loteAntes[0] && loteAntes[0].peso_nf_t) || 0);
    const nfNovoDoLote = Number(l.peso_nf_t) || 0;
    deltaNfPorNavio.set(navioId, (deltaNfPorNavio.get(navioId) || 0) + (nfNovoDoLote - nfAntesDoLote));

    await pool.query(
      `INSERT INTO lotes_nf (navio_id, prefixo, cor, peso_nf_t, peso_balanca_t, peso_ferrovia_t, inicio_descarga, fim_descarga, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (navio_id, prefixo, cor) DO UPDATE SET
         peso_nf_t = EXCLUDED.peso_nf_t,
         peso_balanca_t = COALESCE(EXCLUDED.peso_balanca_t, lotes_nf.peso_balanca_t),
         peso_ferrovia_t = COALESCE(EXCLUDED.peso_ferrovia_t, lotes_nf.peso_ferrovia_t),
         inicio_descarga = COALESCE(lotes_nf.inicio_descarga, EXCLUDED.inicio_descarga),
         fim_descarga = COALESCE(lotes_nf.fim_descarga, EXCLUDED.fim_descarga),
         atualizado_em = now()`,
      [
        navioId, l.prefixo, l.cor || '', nfNovoDoLote,
        l.peso_balanca_t !== undefined && l.peso_balanca_t !== '' && l.peso_balanca_t != null ? Number(l.peso_balanca_t) : null,
        l.peso_ferrovia_t !== undefined && l.peso_ferrovia_t !== '' && l.peso_ferrovia_t != null ? Number(l.peso_ferrovia_t) : null,
        l.inicio_descarga || null, l.fim_descarga || null
      ]
    );
    atualizados++;
  }

  // MANTÉM O TOTAL DE CADA NAVIO EM SINCRONIA COM OS LOTES QUE ACABARAM DE
  // SER IMPORTADOS — mesmo ajuste feito em PUT /api/admin/lotes-nf (edição
  // de um lote só), aqui aplicado por navio depois do loop. Sem isso, um
  // Peso NF que muda numa reimportação (pra mais ou pra menos) não se
  // refletia no total do navio: navios.peso_nf_t ficava parado no valor
  // antigo, e GET /api/dados ("nfNaoItemizado") reabsorvia a diferença de
  // volta como um saldo "ainda não detalhado" — fazendo o total geral da
  // aba Análises voltar sozinho pro mesmo número de sempre, mesmo com os
  // lotes corretos por baixo.
  for (const [navioIdComDelta, delta] of deltaNfPorNavio) {
    if (delta === 0) continue;
    await pool.query(
      'UPDATE navios SET peso_nf_t = GREATEST(0, COALESCE(peso_nf_t, 0) + $1), atualizado_em = now() WHERE id = $2',
      [delta, navioIdComDelta]
    );
  }

  res.json({
    ok: true,
    atualizados,
    criados,
    navios_nao_encontrados: [...naoEncontrados],
    navios_criados_sem_cliente: [...criadosSemCliente]
  });
});

app.post('/api/importar-lotes-nf', requireAdminToken, async (req, res) => {
  const { lotes } = req.body || {};
  if (!Array.isArray(lotes) || lotes.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "lotes" com pelo menos um item.' });
  }

  const { rows: naviosCadastrados } = await pool.query('SELECT id, nome, ano FROM navios');

  let atualizados = 0;
  const naoEncontrados = new Set();

  for (const l of lotes) {
    const resolvido = resolverNavioPorNome(naviosCadastrados, l.navio, l.ano);
    if (!resolvido.id) {
      naoEncontrados.add(`${l.navio} (${l.ano || '?'})${resolvido.ambiguo ? ' — ambíguo' : ''}`);
      continue;
    }
    if (!l.prefixo) continue;

    await pool.query(
      `INSERT INTO lotes_nf (navio_id, prefixo, cor, peso_nf_t, atualizado_em)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (navio_id, prefixo, cor) DO UPDATE SET peso_nf_t = EXCLUDED.peso_nf_t, atualizado_em = now()`,
      [resolvido.id, l.prefixo, l.cor || '', Number(l.peso_nf_t) || 0]
    );
    atualizados++;
  }

  res.json({ ok: true, atualizados, navios_nao_encontrados: [...naoEncontrados] });
});

app.post('/api/importar-relatorio-analitico', requireAdminToken, async (req, res) => {
  const { navios: linhas } = req.body || {};
  if (!Array.isArray(linhas) || linhas.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "navios" com pelo menos um item.' });
  }

  const { rows: naviosCadastrados } = await pool.query('SELECT id, nome, ano FROM navios');
  const { rows: clientesCadastrados } = await pool.query('SELECT id, nome FROM clientes');
  const clientesPorNome = {};
  for (const c of clientesCadastrados) {
    clientesPorNome[String(c.nome).trim().toLowerCase()] = c.id;
  }

  let atualizados = 0;
  let criados = 0;
  const naoEncontrados = new Set();
  // Navios recém-criados aqui sem cliente identificado ficam invisíveis no
  // portal até alguém vincular um cliente na mão (não existe hoje uma rota
  // pra só adicionar o vínculo depois de criado) — reportado à parte pra
  // não passar batido como se tivesse dado tudo certo.
  const criadosSemCliente = new Set();

  for (const l of linhas) {
    const resolvido = resolverNavioPorNome(naviosCadastrados, l.navio, l.ano);
    let navioId = resolvido.id;

    if (!navioId) {
      if (resolvido.ambiguo) {
        naoEncontrados.add(`${l.navio} (ambíguo — existe mais de um navio com esse nome e o ano não bateu com nenhum)`);
        continue;
      }
      if (!l.navio || !l.ano) {
        naoEncontrados.add(`${l.navio || '?'} (${l.ano || '?'})`);
        continue;
      }
      // Navio não existe ainda no cadastro — cria a partir dos próprios
      // dados da planilha, em vez de só reportar "não encontrado" e pular
      // (era assim antes: se o navio fosse apagado por engano, ou fosse
      // novo, a sincronização nunca trazia ele de volta sozinha).
      const novoId = gerarIdNavio(l.navio, l.ano);
      const { rows: criado } = await pool.query(
        `INSERT INTO navios (id, nome, ano, trader, agente, peso_nf_t, peso_balanca_t, peso_arqueado_t, lay_day_inicio, lay_day_fim, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [
          novoId, String(l.navio).trim(), l.ano, l.trader || null, l.agente || null,
          l.peso_nf_t ?? 0, l.peso_balanca_t ?? 0, l.peso_arqueado_t ?? 0,
          l.lay_day_inicio || null, l.lay_day_fim || null
        ]
      );
      navioId = criado[0] ? criado[0].id : novoId;
      naviosCadastrados.push({ id: navioId, nome: String(l.navio).trim(), ano: l.ano });
      criados++;

      const clienteId = l.cliente ? clientesPorNome[String(l.cliente).trim().toLowerCase()] : null;
      if (clienteId) {
        await pool.query(
          `INSERT INTO navio_clientes (navio_id, cliente_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [navioId, clienteId]
        );
      } else {
        criadosSemCliente.add(`${l.navio} (${l.ano})`);
      }
      continue;
    }

    await pool.query(
      `UPDATE navios SET
         peso_nf_t = COALESCE($1, peso_nf_t),
         peso_balanca_t = COALESCE($2, peso_balanca_t),
         peso_arqueado_t = COALESCE($3, peso_arqueado_t),
         lay_day_inicio = COALESCE($4, lay_day_inicio),
         lay_day_fim = COALESCE($5, lay_day_fim),
         trader = COALESCE($6, trader),
         agente = COALESCE($7, agente),
         atualizado_em = now()
       WHERE id = $8`,
      [
        l.peso_nf_t ?? null, l.peso_balanca_t ?? null, l.peso_arqueado_t ?? null,
        l.lay_day_inicio || null, l.lay_day_fim || null, l.trader || null, l.agente || null,
        navioId
      ]
    );
    atualizados++;
  }

  res.json({
    ok: true,
    atualizados,
    criados,
    navios_nao_encontrados: [...naoEncontrados],
    navios_criados_sem_cliente: [...criadosSemCliente]
  });
});

app.post('/api/admin/pesagens', requireAdmin, async (req, res) => {
  const { navio_id, placa, data, hora, prefixo, cor, tara, peso_bruto, peso_liquido } = req.body || {};
  if (!navio_id || !placa || !data) {
    return res.status(400).json({ erro: 'Informe ao menos navio, placa e data.' });
  }
  const liquido = (peso_liquido !== undefined && peso_liquido !== '')
    ? peso_liquido
    : (Number(peso_bruto || 0) - Number(tara || 0));
  const { rows } = await pool.query(
    `INSERT INTO pesagens (navio_id, placa, data, hora, prefixo, cor, tara, peso_bruto, peso_liquido, atualizado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (navio_id, placa, data, hora)
     DO UPDATE SET tara = EXCLUDED.tara, peso_bruto = EXCLUDED.peso_bruto, peso_liquido = EXCLUDED.peso_liquido,
       prefixo = EXCLUDED.prefixo, cor = EXCLUDED.cor, atualizado_em = now()
     RETURNING *`,
    [navio_id, placa, data, hora || '', prefixo || null, cor || null, tara || 0, peso_bruto || 0, liquido]
  );
  res.json({ ok: true, pesagem: rows[0] });
});

// Atualiza várias pesagens de uma vez (navio_id/prefixo/cor). Usado por
// "Atribuir Lote por Período" e "Atribuir vários lotes de uma vez": antes,
// cada carreta encontrada num período disparava um PUT
// /api/admin/pesagens/:id separado, um de cada vez, esperando a resposta
// antes de mandar o próximo — com um lote de centenas de carretas isso
// significava centenas de idas-e-voltas sequenciais ao servidor (minutos
// parado na tela "Processando..."). Uma única UPDATE com WHERE id =
// ANY(...) faz o mesmo trabalho numa única ida-e-volta.
//
// IMPORTANTE: essa rota TEM que ficar cadastrada ANTES de
// '/api/admin/pesagens/:id' logo abaixo. O Express casa rotas na ordem em
// que são registradas — se '/:id' vier primeiro, uma chamada pra
// '/bulk-atribuir' cai nela com id="bulk-atribuir" (não é número), o
// Postgres rejeita e o processo inteiro derruba (foi exatamente isso que
// tirou o site do ar em produção).
app.put('/api/admin/pesagens/bulk-atribuir', requireAdmin, async (req, res) => {
  const { ids, navio_id, prefixo, cor } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ erro: 'Informe ao menos um id de pesagem.' });
  }
  const idsNum = ids.map(Number).filter(n => Number.isInteger(n));
  if (idsNum.length === 0) return res.status(400).json({ erro: 'Nenhum id de pesagem válido informado.' });

  const updates = [];
  const valores = [];
  let i = 1;
  if (navio_id) { updates.push(`navio_id = $${i}`); valores.push(navio_id); i++; }
  if (prefixo) { updates.push(`prefixo = $${i}`); valores.push(prefixo); i++; }
  if (cor) { updates.push(`cor = $${i}`); valores.push(cor); i++; }
  if (updates.length === 0) return res.status(400).json({ erro: 'Informe navio_id, prefixo ou cor.' });
  valores.push(idsNum);

  try {
    const { rowCount } = await pool.query(
      `UPDATE pesagens SET ${updates.join(', ')}, atualizado_em = now() WHERE id = ANY($${i}::int[])`,
      valores
    );
    res.json({ ok: true, atualizadas: rowCount });
  } catch (err) {
    // Sem esse try/catch, um erro do Postgres aqui (ex: a UPDATE bater na
    // UNIQUE (navio_id, placa, data, hora) porque duas carretas do lote já
    // existem com essa combinação em outro navio) derrubava a rota inteira
    // sem resposta nenhuma pro front — que aí, sem checar resp.ok, mostrava
    // "0 carretas atualizadas" como se fosse normal, sem nenhuma pista do
    // motivo real. Foi assim que sumiram atualizações de lotes do MV DSI
    // AQUILA sem explicação nenhuma na tela.
    console.error('Erro ao atribuir pesagens em lote:', err);
    const duplicada = err.code === '23505';
    res.status(500).json({
      erro: duplicada
        ? 'Não deu pra atribuir: pelo menos uma dessas carretas já existe com a mesma placa/data/hora em outro navio (colisão de duplicidade). Confira e resolva a duplicata antes de tentar de novo.'
        : (err.message || 'Erro interno ao atribuir pesagens em lote.')
    });
  }
});

app.put('/api/admin/pesagens/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const campos = ['navio_id', 'placa', 'data', 'hora', 'prefixo', 'cor', 'tara', 'peso_bruto', 'peso_liquido', 'desconsiderada'];
  const updates = [];
  const valores = [];
  let i = 1;
  for (const campo of campos) {
    if (req.body[campo] !== undefined) {
      updates.push(`${campo} = $${i}`);
      valores.push(req.body[campo] === '' ? null : req.body[campo]);
      i++;
    }
  }
  if (updates.length === 0) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });
  valores.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE pesagens SET ${updates.join(', ')}, atualizado_em = now() WHERE id = $${i} RETURNING *`,
      valores
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Pesagem não encontrada.' });
    res.json({ ok: true, pesagem: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Já existe uma pesagem igual (mesma placa, data e hora) nesse navio.' });
    }
    throw err;
  }
});

app.delete('/api/admin/pesagens/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM pesagens WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ erro: 'Pesagem não encontrada.' });
  res.json({ ok: true });
});

async function importarBalanca(pesagens) {
  const { rows: navios } = await pool.query(
    `SELECT id, nome, ano, lay_day_inicio, lay_day_fim FROM navios`
  );
  const naviosComLayDay = navios.filter(n => n.lay_day_inicio && n.lay_day_fim);

  let inseridas = 0;
  let atualizadas = 0;
  let semCorrespondencia = 0;
  let ambiguas = 0;
  const exemplosSemCorrespondencia = [];
  const exemplosAmbiguos = [];

  for (const p of pesagens) {
    if (!p.data) { semCorrespondencia++; continue; }
    const data = new Date(p.data);

    let navioId = null;

    if (p.navio) {
      // Casa só pelo nome quando é inequívoco (ver resolverNavioPorNome) —
      // o ano da própria pesagem só desempata quando o nome bate com mais
      // de um navio cadastrado. Isso evita que uma pesagem isolada com data
      // num ano diferente do resto do navio (acontece perto de virada de
      // ano) caia num cadastro-fantasma em vez do navio real.
      const anoSugerido = data.getUTCFullYear();
      const resolvido = resolverNavioPorNome(navios, p.navio, anoSugerido);
      if (!resolvido.id) {
        semCorrespondencia++;
        if (exemplosSemCorrespondencia.length < 10) {
          exemplosSemCorrespondencia.push(
            resolvido.ambiguo
              ? `${p.placa} em ${p.data} (navio "${p.navio}" ambíguo — mais de um cadastrado e o ano ${anoSugerido} não bateu)`
              : `${p.placa} em ${p.data} (navio "${p.navio}" não encontrado)`
          );
        }
        // Antes: continue (a pesagem simplesmente sumia, sem deixar rastro
        // nenhum). Agora cai pro fluxo abaixo com navioId nulo — fica
        // gravada mesmo assim, visível na aba "Sem navio/prefixo" do
        // portal, em vez de desaparecer silenciosamente.
      } else {
        navioId = resolvido.id;
      }
    } else {
      // A linha da planilha não veio com Navio (o assistente de importação
      // só marca o Navio nas carretas que o Admin efetivamente buscou/
      // atribuiu naquela sessão — reimportar a planilha inteira NÃO
      // reatribui sozinho o que já tinha sido atribuído antes). Antes de
      // cair no auto-match por Lay Day (ou virar "sem correspondência"),
      // confere se essa MESMA pesagem (placa+data+hora) já está atribuída a
      // ALGUM navio de uma importação/atribuição anterior. Sem essa
      // checagem, toda reimportação da planilha completa criava uma
      // segunda linha ÓRFÃ (navio_id NULL) pra cada carreta que já estava
      // corretamente atribuída — e essa órfã aparecia de novo em
      // "Pendências (sem tara/bruto)" com tara zerada, dando a impressão de
      // que a correção de tara "sumiu" (e inflando/duplicando os totais por
      // prefixo), quando na verdade a linha original continuava certa, só
      // que agora com um fantasma do lado.
      const { rows: jaAtribuida } = await pool.query(
        `SELECT id, tara, peso_bruto FROM pesagens
         WHERE placa = $1 AND data = $2 AND hora = $3 AND navio_id IS NOT NULL
         ORDER BY atualizado_em DESC NULLS LAST LIMIT 1`,
        [p.placa, p.data, p.hora || '']
      );
      if (jaAtribuida[0]) {
        // Mesma prioridade "o que já está gravado vence, uma vez não-zero"
        // usada nos outros dois ramos de importarBalanca — ver comentário
        // acima de `if (navioId)`.
        const taraFinal = Number(jaAtribuida[0].tara || 0) > 0 ? Number(jaAtribuida[0].tara) : Number(p.tara || 0);
        const brutoFinal = Number(jaAtribuida[0].peso_bruto || 0) > 0 ? Number(jaAtribuida[0].peso_bruto) : Number(p.peso_bruto || 0);
        const liquidoFinal = brutoFinal - taraFinal;
        await pool.query(
          `UPDATE pesagens SET tara = $1, peso_bruto = $2, peso_liquido = $3, atualizado_em = now() WHERE id = $4`,
          [taraFinal, brutoFinal, liquidoFinal, jaAtribuida[0].id]
        );
        atualizadas++;
        continue;
      }

      const candidatos = naviosComLayDay.filter(n => {
        const inicio = new Date(n.lay_day_inicio);
        const fim = new Date(n.lay_day_fim);
        return data >= inicio && data <= fim;
      });

      if (candidatos.length === 0) {
        semCorrespondencia++;
        if (exemplosSemCorrespondencia.length < 10) {
          exemplosSemCorrespondencia.push(`${p.placa} em ${p.data}`);
        }
      } else if (candidatos.length > 1) {
        ambiguas++;
        if (exemplosAmbiguos.length < 10) {
          exemplosAmbiguos.push(`${p.placa} em ${p.data} (${candidatos.map(c => c.nome).join(', ')})`);
        }
      } else {
        navioId = candidatos[0].id;
      }
    }

    // COALESCE(EXCLUDED.prefixo, pesagens.prefixo) tratava "campo não veio no
    // payload" e "campo veio vazio de propósito (pra limpar)" do mesmo jeito
    // — os dois viravam null em p.prefixo || null, e o COALESCE sempre
    // preservava o valor antigo, então não dava pra apagar um prefixo/cor já
    // gravado. O CASE abaixo usa um flag separado (se a chave existe no
    // objeto recebido) pra distinguir os dois casos: não veio -> preserva o
    // que já estava salvo; veio vazio -> grava vazio mesmo.
    const prefixoInformado = Object.prototype.hasOwnProperty.call(p, 'prefixo');
    const corInformado = Object.prototype.hasOwnProperty.call(p, 'cor');
    // Reimportar uma planilha que já foi importada antes (mesmo navio+placa+
    // data+hora) não pode apagar uma tara/peso bruto que alguém já corrigiu
    // na mão em Pendências. A planilha de origem reusa o valor de tara mais
    // recente conhecido daquele CAVALO ("Utilizado valor de tara da data
    // XX/XX HH:MM:SS", ver coluna Obs.) — esse valor é recalculado a cada
    // exportação e pode vir DIFERENTE (não só zerado) de uma planilha pra
    // outra pro MESMO trecho já pesado antes. Por isso a prioridade é o
    // valor JÁ GRAVADO no banco, não o que a incoming traz: uma vez que tara/
    // peso bruto deixam de ser zero (seja por import anterior, seja por
    // correção manual), ficam travados — só uma edição manual muda de novo.
    // A planilha só preenche quando o banco ainda está zerado (carreta nova,
    // ou peso bruto/tara que ainda não tinha chegado). Antes a prioridade era
    // a oposta (incoming não-zero sempre vencia) — isso fazia toda
    // reimportação reescrever a tara corrigida na mão em Pendências com o
    // valor (diferente) que a planilha trouxesse dessa vez, e a carreta
    // voltava a aparecer em Pendências pedindo a mesma correção de novo.
    // Líquido é sempre recalculado em cima do bruto/tara resultantes, nunca
    // copiado direto do que veio na planilha.
    if (navioId) {
      const result = await pool.query(
        `INSERT INTO pesagens (navio_id, placa, data, hora, prefixo, cor, tara, peso_bruto, peso_liquido)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (navio_id, placa, data, hora)
         DO UPDATE SET
           tara = CASE WHEN pesagens.tara > 0 THEN pesagens.tara ELSE EXCLUDED.tara END,
           peso_bruto = CASE WHEN pesagens.peso_bruto > 0 THEN pesagens.peso_bruto ELSE EXCLUDED.peso_bruto END,
           peso_liquido = (CASE WHEN pesagens.peso_bruto > 0 THEN pesagens.peso_bruto ELSE EXCLUDED.peso_bruto END)
                         - (CASE WHEN pesagens.tara > 0 THEN pesagens.tara ELSE EXCLUDED.tara END),
           prefixo = CASE WHEN $10 THEN EXCLUDED.prefixo ELSE pesagens.prefixo END,
           cor = CASE WHEN $11 THEN EXCLUDED.cor ELSE pesagens.cor END
         RETURNING (xmax = 0) AS inserida`,
        [navioId, p.placa, p.data, p.hora || '', p.prefixo || null, p.cor || null, p.tara || 0, p.peso_bruto || 0, p.peso_liquido || 0, prefixoInformado, corInformado]
      );
      if (result.rows[0].inserida) inseridas++; else atualizadas++;
    } else {
      // navio_id NULL não é pego pelo UNIQUE (navio_id, placa, data, hora) —
      // pra Postgres, cada NULL é distinto, então ON CONFLICT nunca dispara
      // aqui. Faz o dedup na mão: procura uma órfã igual já salva antes de
      // decidir entre INSERT e UPDATE, senão reimportar a mesma planilha
      // sem navio geraria uma linha nova a cada vez.
      const { rows: existentes } = await pool.query(
        `SELECT id, tara, peso_bruto FROM pesagens
         WHERE navio_id IS NULL AND placa = $1 AND data = $2 AND hora = $3`,
        [p.placa, p.data, p.hora || '']
      );
      // Mesma prioridade "o que já está gravado vence, uma vez não-zero" do
      // ramo acima — ver comentário logo antes do bloco `if (navioId)`.
      const taraFinal = Number(existentes[0]?.tara || 0) > 0 ? Number(existentes[0].tara) : Number(p.tara || 0);
      const brutoFinal = Number(existentes[0]?.peso_bruto || 0) > 0 ? Number(existentes[0].peso_bruto) : Number(p.peso_bruto || 0);
      const liquidoFinal = brutoFinal - taraFinal;
      if (existentes[0]) {
        await pool.query(
          `UPDATE pesagens SET tara = $1, peso_bruto = $2, peso_liquido = $3,
             prefixo = CASE WHEN $4 THEN $5 ELSE prefixo END,
             cor = CASE WHEN $6 THEN $7 ELSE cor END,
             atualizado_em = now()
           WHERE id = $8`,
          [taraFinal, brutoFinal, liquidoFinal, prefixoInformado, p.prefixo || null, corInformado, p.cor || null, existentes[0].id]
        );
        atualizadas++;
      } else {
        await pool.query(
          `INSERT INTO pesagens (navio_id, placa, data, hora, prefixo, cor, tara, peso_bruto, peso_liquido)
           VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8)`,
          [p.placa, p.data, p.hora || '', p.prefixo || null, p.cor || null, taraFinal, brutoFinal, liquidoFinal]
        );
        inseridas++;
      }
    }
  }

  return {
    ok: true,
    inseridas,
    atualizadas,
    sem_correspondencia: semCorrespondencia,
    ambiguas,
    exemplos_sem_correspondencia: exemplosSemCorrespondencia,
    exemplos_ambiguos: exemplosAmbiguos
  };
}

app.post('/api/importar-balanca', requireAdminToken, async (req, res) => {
  const { pesagens } = req.body || {};
  if (!Array.isArray(pesagens) || pesagens.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "pesagens" com pelo menos um item.' });
  }
  const resultado = await importarBalanca(pesagens);
  res.json(resultado);
});

app.post('/api/admin/importar-balanca', requireAdmin, async (req, res) => {
  const { pesagens } = req.body || {};
  if (!Array.isArray(pesagens) || pesagens.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "pesagens" com pelo menos um item.' });
  }
  const resultado = await importarBalanca(pesagens);
  res.json(resultado);
});

app.post('/api/importar-pesagens', requireAdminToken, async (req, res) => {
  const { pesagens } = req.body || {};
  if (!Array.isArray(pesagens) || pesagens.length === 0) {
    return res.status(400).json({ erro: 'Envie um array "pesagens" com pelo menos um item.' });
  }

  const { rows: naviosCadastrados } = await pool.query('SELECT id, nome, ano FROM navios');

  let inseridas = 0;
  let atualizadas = 0;
  const naviosNaoEncontrados = new Set();

  for (const p of pesagens) {
    const anoSugerido = p.data ? new Date(p.data).getFullYear() : null;
    const resolvido = resolverNavioPorNome(naviosCadastrados, p.navio, anoSugerido);
    const navioId = resolvido.id;

    if (!navioId) {
      naviosNaoEncontrados.add(`${p.navio} (${anoSugerido || '?'})${resolvido.ambiguo ? ' — ambíguo' : ''}`);
      continue;
    }

    // Mesma proteção do importarBalanca(): não deixa uma reimportação sem
    // tara/bruto (planilha velha, sem a correção manual feita depois) apagar
    // um valor que já foi corrigido na mão.
    const result = await pool.query(
      `INSERT INTO pesagens (navio_id, placa, data, hora, prefixo, cor, tara, peso_bruto, peso_liquido)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (navio_id, placa, data, hora)
       DO UPDATE SET
         tara = CASE WHEN EXCLUDED.tara > 0 THEN EXCLUDED.tara ELSE pesagens.tara END,
         peso_bruto = CASE WHEN EXCLUDED.peso_bruto > 0 THEN EXCLUDED.peso_bruto ELSE pesagens.peso_bruto END,
         peso_liquido = (CASE WHEN EXCLUDED.peso_bruto > 0 THEN EXCLUDED.peso_bruto ELSE pesagens.peso_bruto END)
                       - (CASE WHEN EXCLUDED.tara > 0 THEN EXCLUDED.tara ELSE pesagens.tara END)
       RETURNING (xmax = 0) AS inserida`,
      [navioId, p.placa, p.data, p.hora, p.prefixo || null, p.cor || null, p.tara || 0, p.peso_bruto || 0, p.peso_liquido || 0]
    );
    if (result.rows[0].inserida) inseridas++; else atualizadas++;
  }

  res.json({
    ok: true,
    inseridas,
    atualizadas,
    navios_nao_encontrados: [...naviosNaoEncontrados]
  });
});

app.get('/manifest.json', (req, res) => {
  res.type('application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/trocar-senha.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'trocar-senha.html'));
});

app.get('/menu.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'menu.html'));
});

app.get('/admin-usuarios.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-usuarios.html'));
});

app.get('/portal.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'portal.html'));
});

app.get('/admin-pesagem.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-pesagem.html'));
});

app.get('/gusa.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'gusa.html'));
});

// ---------- Descarga de Gusa — lançamento vagão a vagão em tempo real ----------
// Página própria (gusa.html), de propósito FORA do portal.html: assim um
// bug aqui nunca derruba a tela de Pesagem/Navios que já funciona. Usa o
// MESMO login/sessão do resto do portal — só depende da permissão
// gusa_permissao de cada usuário (tela Usuários e permissões), sem token
// nem login separado. Fase 1: só o núcleo (vagão a vagão em tempo real +
// contador do turno). Paralisações, carretas do dia e os dashboards
// históricos ficam para as próximas fases.

function linhaGusaParaFrontend(r) {
  return {
    id: r.id,
    navioId: r.navio_id,
    navioNome: r.navio_nome !== undefined ? r.navio_nome : null,
    terminal: r.terminal,
    prefixo: r.prefixo,
    vagao: r.vagao,
    turno: r.turno,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data,
    inicioDescarga: r.inicio_descarga instanceof Date ? r.inicio_descarga.toISOString() : r.inicio_descarga,
    fimDescarga: r.fim_descarga instanceof Date ? r.fim_descarga.toISOString() : r.fim_descarga,
    tons: r.tons != null ? Number(r.tons) : null,
    status: r.status,
    origem: r.origem,
    criadoPor: r.criado_por
  };
}

function linhaParalisacaoParaFrontend(r) {
  return {
    id: r.id,
    navioId: r.navio_id,
    navioNome: r.navio_nome !== undefined ? r.navio_nome : null,
    terminal: r.terminal,
    prefixo: r.prefixo,
    turno: r.turno,
    data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data,
    inicio: r.inicio instanceof Date ? r.inicio.toISOString() : r.inicio,
    termino: r.termino instanceof Date ? r.termino.toISOString() : r.termino,
    tipo: r.tipo,
    ocorrencia: r.ocorrencia,
    responsavel: r.responsavel,
    observacao: r.observacao,
    status: r.status,
    origem: r.origem,
    criadoPor: r.criado_por
  };
}

// Monta a cláusula WHERE + parâmetros comuns aos filtros de Ano/Mês/Dia/
// Prefixo/Navio usados tanto no histórico de vagões quanto no de
// paralisações — evita repetir essa lógica duas vezes. `colunaData` é o
// nome da coluna de data em cada tabela (sempre "data" aqui, mas deixado
// explícito pra ficar claro o que está sendo filtrado).
// Lê um campo de uma linha de planilha (já convertida em objeto pelo
// SheetJS no navegador) tentando várias grafias possíveis do cabeçalho —
// a "Base de Pesagens" já mostrou ter espaços/acentos inconsistentes entre
// exportações. Retorna null se nenhuma bater ou vier vazio.
function pegarCampoPlanilha(linha, ...chaves) {
  for (const c of chaves) {
    const v = linha[c];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

function montarFiltroGusa(query, colunaData, alias, incluirPrefixo) {
  const cond = [];
  const valores = [];
  let i = 1;
  const a = alias ? `${alias}.` : '';
  if (query.ano) { cond.push(`EXTRACT(YEAR FROM ${a}${colunaData}) = $${i++}`); valores.push(Number(query.ano)); }
  if (query.mes) { cond.push(`EXTRACT(MONTH FROM ${a}${colunaData}) = $${i++}`); valores.push(Number(query.mes)); }
  if (query.dia) { cond.push(`EXTRACT(DAY FROM ${a}${colunaData}) = $${i++}`); valores.push(Number(query.dia)); }
  if (incluirPrefixo && query.prefixo) { cond.push(`${a}prefixo ILIKE $${i++}`); valores.push(`%${query.prefixo}%`); }
  if (query.navio_id) { cond.push(`${a}navio_id = $${i++}`); valores.push(query.navio_id); }
  return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', valores };
}

app.get('/api/gusa/navios-lista', requireGusaAcesso('visualizar'), async (req, res) => {
  const { rows } = await pool.query('SELECT id, nome, ano FROM navios ORDER BY ano DESC, nome ASC');
  res.json({ navios: rows });
});

// Painel: turno atual (janela 07-19h / 19-07h calculada em horário de
// Brasília) + vagões em descarga agora + paradas em andamento agora
// (sempre todos, não só do turno — pra nunca "sumir" algo que passou da
// virada do turno sem ser finalizado) + históricos filtráveis por
// Ano/Mês/Dia/Prefixo/Navio (query string) + carretas do turno atual.
app.get('/api/gusa/dados', requireGusaAcesso('visualizar'), async (req, res) => {
  const agora = agoraBrasil();
  const { turno, data } = turnoEDataDoTurno(agora);

  // Prefixo/Navio também filtram "em descarga agora" e "aguardando" (pra
  // achar rápido o vagão certo dentro de um prefixo específico) — Ano/Mês/Dia
  // NÃO entram aqui de propósito: um vagão "aguardando" vindo da planilha
  // ainda não tem uma data real de descarga (só ganha uma quando alguém
  // clica pra iniciar), e um vagão "em descarga agora" é sempre sobre o
  // presente. Filtrar essas duas listas por Ano/Mês/Dia já causou um bug real
  // (vagões aguardando ficavam com a data de HOJE gravada provisoriamente, e
  // ao filtrar por um mês diferente do atual a lista vinha vazia mesmo tendo
  // vagão esperando) — por isso aqui usamos só prefixo/navio_id, nunca data.
  function montarFiltroGusaSemData(query, alias) {
    const cond = [];
    const valores = [];
    let i = 1;
    const a = alias ? `${alias}.` : '';
    if (query.prefixo) { cond.push(`${a}prefixo ILIKE $${i++}`); valores.push(`%${query.prefixo}%`); }
    if (query.navio_id) { cond.push(`${a}navio_id = $${i++}`); valores.push(query.navio_id); }
    return { where: cond.length ? `WHERE ${cond.join(' AND ')}` : '', valores };
  }

  // Contagem TOTAL de "em descarga agora", sempre no sistema inteiro,
  // independente de qualquer filtro — alimenta só o KPI "Em descarga agora"
  // lá em cima, que é pra ser um número geral do turno, não da grade.
  const { rows: emDescargaTotalRows } = await pool.query(
    `SELECT count(*)::int AS total FROM gusa_descargas_vagao WHERE status = 'em_descarga'`
  );
  const emDescargaTotal = emDescargaTotalRows[0].total;

  // Já a grade de vagões (abaixo do resumo) só busca "em descarga" quando um
  // Navio específico está no filtro — mesma regra de "aguardando" e
  // "finalizados" logo abaixo. Sem isso, a grade vinha com TODOS os vagões em
  // descarga do sistema inteiro (todos os navios de uma vez), o que bagunçava
  // a tela assim que a página abria sem nenhum filtro selecionado.
  let emDescarga = [];
  if (req.query.navio_id) {
    const filtroEmDescarga = montarFiltroGusaSemData(req.query, 'g');
    const condEmDescarga = ['g.status = \'em_descarga\''].concat(
      filtroEmDescarga.where ? [filtroEmDescarga.where.replace(/^WHERE /, '')] : []
    ).join(' AND ');
    const { rows } = await pool.query(
      `SELECT g.*, n.nome AS navio_nome FROM gusa_descargas_vagao g
       LEFT JOIN navios n ON n.id = g.navio_id
       WHERE ${condEmDescarga} ORDER BY g.inicio_descarga ASC`,
      filtroEmDescarga.valores
    );
    emDescarga = rows;
  }

  // "Aguardando" (importados da planilha, ainda sem clicar pra iniciar) só
  // é buscado quando um Navio específico está no filtro — sem isso a lista
  // poderia trazer todo o histórico de todo mundo de uma vez, o que é
  // exatamente a bagunça que motivou esse redesenho.
  let aguardando = [];
  if (req.query.navio_id) {
    const filtroAguardando = montarFiltroGusaSemData(req.query, 'g');
    const condAguardando = ['g.status = \'aguardando\''].concat(
      filtroAguardando.where ? [filtroAguardando.where.replace(/^WHERE /, '')] : []
    ).join(' AND ');
    const { rows } = await pool.query(
      `SELECT g.*, n.nome AS navio_nome FROM gusa_descargas_vagao g
       LEFT JOIN navios n ON n.id = g.navio_id
       WHERE ${condAguardando} ORDER BY g.vagao ASC`,
      filtroAguardando.valores
    );
    aguardando = rows;
  }

  // Vagões já finalizados desse navio/prefixo continuam aparecendo na grade
  // (com outra cor, e opção de desfazer) em vez de sumir — pedido do
  // usuário depois de ver que finalizar um vagão o fazia desaparecer da
  // tela. Mesma regra de exigir Navio no filtro que "aguardando", pelo
  // mesmo motivo (senão traria o histórico inteiro de finalizados).
  let finalizados = [];
  if (req.query.navio_id) {
    const filtroFinalizados = montarFiltroGusaSemData(req.query, 'g');
    const condFinalizados = ['g.status = \'finalizado\''].concat(
      filtroFinalizados.where ? [filtroFinalizados.where.replace(/^WHERE /, '')] : []
    ).join(' AND ');
    const { rows } = await pool.query(
      `SELECT g.*, n.nome AS navio_nome FROM gusa_descargas_vagao g
       LEFT JOIN navios n ON n.id = g.navio_id
       WHERE ${condFinalizados} ORDER BY g.fim_descarga DESC LIMIT 1000`,
      filtroFinalizados.valores
    );
    finalizados = rows;
  }

  // Resumo do prefixo filtrado (Navio + Prefixo): total de vagões,
  // tonelagem, início/fim da descarga do lote inteiro — aparece acima da
  // grade tanto pra um trem ainda em andamento quanto pra um já totalmente
  // finalizado (por isso agrega TODOS os status, sem filtro de data).
  let resumoPrefixo = null;
  if (req.query.navio_id && req.query.prefixo) {
    const { rows: resumoRows } = await pool.query(
      `SELECT count(*) AS total_vagoes, sum(tons) AS total_toneladas,
              min(inicio_descarga) AS inicio_descarga, max(fim_descarga) AS fim_descarga,
              count(*) FILTER (WHERE status = 'aguardando') AS aguardando,
              count(*) FILTER (WHERE status = 'em_descarga') AS em_descarga,
              count(*) FILTER (WHERE status = 'finalizado') AS finalizados
       FROM gusa_descargas_vagao WHERE navio_id = $1 AND prefixo ILIKE $2`,
      [req.query.navio_id, `%${req.query.prefixo}%`]
    );
    // A "cor" do lote não vem na aba Descarga da planilha — pega emprestado
    // da mesma convenção navio+prefixo+cor já usada em pesagens/lotes_nf
    // (a cor mais frequente lançada pra esse navio+prefixo).
    const { rows: corRows } = await pool.query(
      `SELECT cor, count(*) AS qtd FROM pesagens
       WHERE navio_id = $1 AND prefixo ILIKE $2 AND cor IS NOT NULL AND cor <> ''
       GROUP BY cor ORDER BY qtd DESC LIMIT 1`,
      [req.query.navio_id, `%${req.query.prefixo}%`]
    );
    const r = resumoRows[0];
    if (Number(r.total_vagoes) > 0) {
      resumoPrefixo = {
        prefixo: req.query.prefixo,
        cor: corRows[0]?.cor || null,
        totalVagoes: Number(r.total_vagoes),
        totalToneladas: r.total_toneladas != null ? Number(r.total_toneladas) : null,
        inicioDescarga: r.inicio_descarga,
        fimDescarga: r.fim_descarga,
        aguardando: Number(r.aguardando),
        emDescarga: Number(r.em_descarga),
        finalizados: Number(r.finalizados)
      };
    }
  }

  // Conta "finalizado no turno" pelo horário REAL de fim_descarga (não pela
  // data/turno gravada em início) — assim um vagão iniciado num turno e
  // finalizado no seguinte conta no turno em que ele de fato terminou, que
  // é o que a pessoa vê na hora ao bater "Finalizar".
  const limites = limitesTurno(turno, data);
  const { rows: turnoStats } = await pool.query(
    `SELECT
       count(*) FILTER (WHERE status = 'finalizado') AS finalizados,
       avg(EXTRACT(EPOCH FROM (fim_descarga - inicio_descarga))) FILTER (WHERE status = 'finalizado') AS media_segundos,
       sum(tons) FILTER (WHERE status = 'finalizado') AS total_tons
     FROM gusa_descargas_vagao
     WHERE status = 'finalizado' AND fim_descarga >= $1::timestamp AND fim_descarga < $2::timestamp`,
    [limites.inicio, limites.fim]
  );

  const filtroVagao = montarFiltroGusa(req.query, 'data', 'g', true);
  const { rows: historico } = await pool.query(
    `SELECT g.*, n.nome AS navio_nome FROM gusa_descargas_vagao g
     LEFT JOIN navios n ON n.id = g.navio_id
     ${filtroVagao.where} ORDER BY g.criado_em DESC LIMIT 300`,
    filtroVagao.valores
  );

  const { rows: prefixosRows } = await pool.query(
    `SELECT DISTINCT prefixo FROM gusa_descargas_vagao WHERE prefixo IS NOT NULL AND prefixo <> '' ORDER BY prefixo`
  );

  // Paralisações
  const { rows: paralisacoesAbertas } = await pool.query(
    `SELECT p.*, n.nome AS navio_nome FROM gusa_paralisacoes p
     LEFT JOIN navios n ON n.id = p.navio_id
     WHERE p.status = 'em_andamento' ORDER BY p.inicio ASC`
  );
  const { rows: tempoParadoTurno } = await pool.query(
    `SELECT sum(EXTRACT(EPOCH FROM (COALESCE(termino, now()) - inicio))) AS segundos
     FROM gusa_paralisacoes WHERE data = $1 AND turno = $2`,
    [data, turno]
  );
  const filtroParalisacao = montarFiltroGusa(req.query, 'data', 'p', false);
  const { rows: paralisacoesHistorico } = await pool.query(
    `SELECT p.*, n.nome AS navio_nome FROM gusa_paralisacoes p
     LEFT JOIN navios n ON n.id = p.navio_id
     ${filtroParalisacao.where} ORDER BY p.criado_em DESC LIMIT 300`,
    filtroParalisacao.valores
  );

  // Carretas do turno atual (se já lançadas) + histórico recente
  const { rows: carretasTurno } = await pool.query(
    `SELECT * FROM gusa_carretas_turno WHERE data = $1 AND turno = $2`,
    [data, turno]
  );
  const { rows: carretasHistorico } = await pool.query(
    `SELECT * FROM gusa_carretas_turno ORDER BY data DESC, turno DESC LIMIT 60`
  );

  res.json({
    ok: true,
    permissao: gusaPermissaoEfetiva(req),
    turnoAtual: { turno, data },
    turnoStats: {
      finalizados: Number(turnoStats[0]?.finalizados || 0),
      mediaSegundos: turnoStats[0]?.media_segundos != null ? Number(turnoStats[0].media_segundos) : null,
      totalTons: turnoStats[0]?.total_tons != null ? Number(turnoStats[0].total_tons) : null,
      tempoParadoSegundos: tempoParadoTurno[0]?.segundos != null ? Number(tempoParadoTurno[0].segundos) : 0
    },
    emDescarga: emDescarga.map(linhaGusaParaFrontend),
    emDescargaTotal,
    aguardando: aguardando.map(linhaGusaParaFrontend),
    finalizadosGrade: finalizados.map(linhaGusaParaFrontend),
    resumoPrefixo: resumoPrefixo ? {
      ...resumoPrefixo,
      inicioDescarga: resumoPrefixo.inicioDescarga
        ? (resumoPrefixo.inicioDescarga instanceof Date ? resumoPrefixo.inicioDescarga.toISOString().slice(0, 16) : String(resumoPrefixo.inicioDescarga).slice(0, 16).replace(' ', 'T'))
        : null,
      fimDescarga: resumoPrefixo.fimDescarga
        ? (resumoPrefixo.fimDescarga instanceof Date ? resumoPrefixo.fimDescarga.toISOString().slice(0, 16) : String(resumoPrefixo.fimDescarga).slice(0, 16).replace(' ', 'T'))
        : null
    } : null,
    aguardandoPrecisaNavio: !req.query.navio_id,
    historico: historico.map(linhaGusaParaFrontend),
    prefixosConhecidos: prefixosRows.map(r => r.prefixo),
    paralisacoesAbertas: paralisacoesAbertas.map(linhaParalisacaoParaFrontend),
    paralisacoesHistorico: paralisacoesHistorico.map(linhaParalisacaoParaFrontend),
    carretasTurnoAtual: carretasTurno[0] || null,
    carretasHistorico: carretasHistorico.map(r => ({
      id: r.id, terminal: r.terminal, turno: r.turno,
      data: r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data,
      viagens: r.viagens, carretas: r.carretas, observacao: r.observacao
    }))
  });
});

app.post('/api/gusa/vagoes/iniciar', requireGusaAcesso('lancar'), async (req, res) => {
  const { navio_id, terminal, prefixo, vagao } = req.body || {};
  if (!navio_id || !vagao) {
    return res.status(400).json({ erro: 'Informe o navio e o número do vagão.' });
  }
  const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
  if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });

  const agora = agoraBrasil();
  const { turno, data } = turnoEDataDoTurno(agora);
  const inicioStr = agora.toISOString().slice(0, 19).replace('T', ' ');

  const { rows } = await pool.query(
    `INSERT INTO gusa_descargas_vagao (navio_id, terminal, prefixo, vagao, turno, data, inicio_descarga, status, origem, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'em_descarga', 'manual', $8)
     RETURNING *`,
    [navio_id, terminal || null, prefixo || null, String(vagao).trim(), turno, data, inicioStr, req.session.userId]
  );
  res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
});

// Inicia um vagão que já existe na tabela mas ainda está "aguardando" (veio
// da importação da planilha do navio, sem horário nenhum ainda) — clique no
// ícone do vagão na grade abre um mini-formulário com a data/hora e chama
// isso aqui. Diferente do POST /vagoes/iniciar (que CRIA a linha do zero,
// usado no lançamento avulso fora da planilha).
app.put('/api/gusa/vagoes/:id/iniciar', requireGusaAcesso('lancar'), async (req, res) => {
  const { id } = req.params;
  const { inicio_descarga } = req.body || {};
  const { rows: atual } = await pool.query('SELECT * FROM gusa_descargas_vagao WHERE id = $1', [id]);
  if (!atual[0]) return res.status(404).json({ erro: 'Vagão não encontrado.' });
  if (atual[0].status !== 'aguardando') {
    return res.status(400).json({ erro: 'Esse vagão já foi iniciado ou finalizado.' });
  }

  let inicioStr, turno, dataStr;
  if (inicio_descarga) {
    const partes = partesDataHoraLocal(inicio_descarga);
    if (!partes) return res.status(400).json({ erro: 'Início da descarga inválido.' });
    const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
    turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
    dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;
    inicioStr = inicio_descarga.replace('T', ' ');
  } else {
    const agora = agoraBrasil();
    ({ turno, data: dataStr } = turnoEDataDoTurno(agora));
    inicioStr = agora.toISOString().slice(0, 19).replace('T', ' ');
  }

  const { rows } = await pool.query(
    `UPDATE gusa_descargas_vagao SET inicio_descarga = $1, turno = $2, data = $3,
       status = 'em_descarga', atualizado_em = now() WHERE id = $4 RETURNING *`,
    [inicioStr, turno, dataStr, id]
  );
  res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
});

app.put('/api/gusa/vagoes/:id/finalizar', requireGusaAcesso('lancar'), async (req, res) => {
  const { id } = req.params;
  const { tons, fim_descarga } = req.body || {};
  const { rows: atual } = await pool.query('SELECT * FROM gusa_descargas_vagao WHERE id = $1', [id]);
  if (!atual[0]) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  if (atual[0].status === 'finalizado') return res.status(400).json({ erro: 'Esse vagão já foi finalizado.' });
  if (atual[0].status === 'aguardando') return res.status(400).json({ erro: 'Esse vagão ainda não foi iniciado.' });

  let fimStr;
  if (fim_descarga) {
    if (!partesDataHoraLocal(fim_descarga)) return res.status(400).json({ erro: 'Fim da descarga inválido.' });
    fimStr = fim_descarga.replace('T', ' ');
  } else {
    fimStr = agoraBrasil().toISOString().slice(0, 19).replace('T', ' ');
  }

  const { rows } = await pool.query(
    `UPDATE gusa_descargas_vagao SET fim_descarga = $1, status = 'finalizado',
       tons = COALESCE($2, tons), atualizado_em = now() WHERE id = $3 RETURNING *`,
    [fimStr, tons != null && tons !== '' ? Number(tons) : null, id]
  );
  res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
});

// Desfaz um passo: um vagão finalizado volta a "em_descarga" (perde o fim);
// um vagão em_descarga volta a "aguardando" (perde o início) — pra corrigir
// clique errado sem precisar excluir e relançar do zero. O vagão nunca some
// da grade nesse processo, só muda de cor.
app.put('/api/gusa/vagoes/:id/desfazer', requireGusaAcesso('lancar'), async (req, res) => {
  const { id } = req.params;
  const { rows: atual } = await pool.query('SELECT * FROM gusa_descargas_vagao WHERE id = $1', [id]);
  if (!atual[0]) return res.status(404).json({ erro: 'Vagão não encontrado.' });

  if (atual[0].status === 'finalizado') {
    const { rows } = await pool.query(
      `UPDATE gusa_descargas_vagao SET fim_descarga = NULL, status = 'em_descarga', atualizado_em = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
  }
  if (atual[0].status === 'em_descarga') {
    const { rows } = await pool.query(
      `UPDATE gusa_descargas_vagao SET inicio_descarga = NULL, turno = NULL, status = 'aguardando', atualizado_em = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    return res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
  }
  return res.status(400).json({ erro: 'Esse vagão já está aguardando — não há o que desfazer.' });
});

// Lançamento manual/retroativo — início e fim já conhecidos de uma vez
// (ex: esqueceu de bater "Iniciar" na hora, ou está lançando o que já
// aconteceu num turno anterior). fim_descarga é opcional: se vier em
// branco, cria só o início (mesmo efeito de "Iniciar", com hora escolhida
// à mão em vez de ser o instante do clique).
app.post('/api/gusa/vagoes/manual', requireGusaAcesso('lancar'), async (req, res) => {
  const { navio_id, terminal, prefixo, vagao, inicio_descarga, fim_descarga, tons } = req.body || {};
  if (!navio_id || !vagao || !inicio_descarga) {
    return res.status(400).json({ erro: 'Informe ao menos navio, vagão e início da descarga.' });
  }
  const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
  if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });

  const partes = partesDataHoraLocal(inicio_descarga);
  if (!partes) return res.status(400).json({ erro: 'Início da descarga inválido.' });
  if (fim_descarga) {
    if (!partesDataHoraLocal(fim_descarga)) return res.status(400).json({ erro: 'Fim da descarga inválido.' });
    if (String(fim_descarga) < String(inicio_descarga)) {
      return res.status(400).json({ erro: 'O fim da descarga não pode ser antes do início.' });
    }
  }
  const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
  const turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
  const dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;

  const { rows } = await pool.query(
    `INSERT INTO gusa_descargas_vagao (navio_id, terminal, prefixo, vagao, turno, data, inicio_descarga, fim_descarga, tons, status, origem, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual', $11)
     RETURNING *`,
    [
      navio_id, terminal || null, prefixo || null, String(vagao).trim(), turno, dataStr,
      inicio_descarga.replace('T', ' '), fim_descarga ? fim_descarga.replace('T', ' ') : null,
      tons != null && tons !== '' ? Number(tons) : null,
      fim_descarga ? 'finalizado' : 'em_descarga', req.session.userId
    ]
  );
  res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
});

// Edição/correção geral de um lançamento já existente — nível "editar" só
// (lançar não pode corrigir o que já foi salvo, só criar/finalizar).
app.put('/api/gusa/vagoes/:id', requireGusaAcesso('editar'), async (req, res) => {
  const { id } = req.params;
  const { navio_id, terminal, prefixo, vagao, inicio_descarga, fim_descarga, tons } = req.body || {};
  const updates = [];
  const valores = [];
  let i = 1;

  if (navio_id !== undefined) {
    if (navio_id) {
      const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
      if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });
    }
    updates.push(`navio_id = $${i++}`); valores.push(navio_id || null);
  }
  if (terminal !== undefined) { updates.push(`terminal = $${i++}`); valores.push(terminal || null); }
  if (prefixo !== undefined) { updates.push(`prefixo = $${i++}`); valores.push(prefixo || null); }
  if (vagao !== undefined) {
    if (!vagao) return res.status(400).json({ erro: 'O número do vagão não pode ficar em branco.' });
    updates.push(`vagao = $${i++}`); valores.push(String(vagao).trim());
  }
  if (inicio_descarga !== undefined) {
    const partes = partesDataHoraLocal(inicio_descarga);
    if (!partes) return res.status(400).json({ erro: 'Início da descarga inválido.' });
    const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
    const turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
    const dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;
    updates.push(`inicio_descarga = $${i++}`); valores.push(inicio_descarga.replace('T', ' '));
    updates.push(`turno = $${i++}`); valores.push(turno);
    updates.push(`data = $${i++}`); valores.push(dataStr);
  }
  if (fim_descarga !== undefined) {
    if (fim_descarga && !partesDataHoraLocal(fim_descarga)) return res.status(400).json({ erro: 'Fim da descarga inválido.' });
    updates.push(`fim_descarga = $${i++}`); valores.push(fim_descarga ? fim_descarga.replace('T', ' ') : null);
    updates.push(`status = $${i++}`); valores.push(fim_descarga ? 'finalizado' : 'em_descarga');
  }
  if (tons !== undefined) { updates.push(`tons = $${i++}`); valores.push(tons != null && tons !== '' ? Number(tons) : null); }
  if (updates.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
  updates.push(`atualizado_em = now()`);
  valores.push(id);

  const { rows } = await pool.query(
    `UPDATE gusa_descargas_vagao SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.json({ ok: true, vagao: linhaGusaParaFrontend(rows[0]) });
});

app.delete('/api/gusa/vagoes/:id', requireGusaAcesso('editar'), async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM gusa_descargas_vagao WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.json({ ok: true });
});

// Importa a lista de vagões de um navio a partir da aba "Descarga" da
// planilha de origem — o navegador já leu o arquivo com SheetJS e manda
// aqui as linhas em JSON (mesmo padrão do importador de Pesagem por Trem).
// Cada vagão sem NENHUM horário ainda vira status 'aguardando': aparece na
// grade pronto pra alguém clicar e lançar a data/hora, sem precisar digitar
// número de vagão nem tonelada de novo (isso já veio da planilha). Se a
// linha já tiver Início e/ou Fim preenchidos (histórico ou lote que começou
// direto pela planilha), entra direto como 'em_descarga'/'finalizado'.
//
// Reimportar a mesma planilha NUNCA sobrescreve um vagão que alguém já
// começou a mexer no sistema (status diferente de 'aguardando') — só atualiza
// prefixo/tonelada/terminal de quem ainda está 'aguardando'. O casamento é
// por navio + número do vagão.
// Roda `tarefa(item)` para cada item de `itens`, no máximo `limite` de cada
// vez em paralelo — evita tanto "um de cada vez" (lento demais pra planilha
// com milhares de vagões, arrisca estourar o tempo do request) quanto
// "todos de uma vez" (sobrecarrega a conexão com o banco).
async function executarEmLotes(itens, limite, tarefa) {
  let cursor = 0;
  async function worker() {
    while (cursor < itens.length) {
      const i = cursor++;
      await tarefa(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, worker));
}

app.post('/api/gusa/vagoes/importar-planilha', requireGusaAcesso('lancar'), async (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : null;
  if (!linhas || !linhas.length) return res.status(400).json({ erro: 'Nenhuma linha para importar.' });
  // A "Base Unificada" acumula vagões há muito tempo — um navio sozinho já
  // passa de mil linhas fácil. 30 mil cobre até um upload da planilha
  // inteira (todos os navios de uma vez), processado em paralelo abaixo pra
  // não estourar o tempo do request.
  if (linhas.length > 30000) return res.status(400).json({ erro: 'Planilha grande demais (máx. 30.000 linhas por vez).' });

  const { rows: naviosExistentes } = await pool.query('SELECT id, nome, ano FROM navios');

  let inseridos = 0, atualizados = 0, mantidos = 0, ignorados = 0;
  const problemasNavio = new Map(); // nome do navio -> quantidade de vagões afetados

  // Cache de vagões já cadastrados por navio, pra não fazer um SELECT por
  // linha — carregado sob demanda, um navio de cada vez. `promessa` evita
  // duas linhas do mesmo navio disparando o SELECT em paralelo e carregando
  // o cache duas vezes.
  const existentesPorNavio = new Map(); // navio_id -> Promise<Map(vagao -> {id, status})>
  function existentesDoNavio(navioId) {
    if (!existentesPorNavio.has(navioId)) {
      existentesPorNavio.set(navioId, (async () => {
        const { rows } = await pool.query('SELECT id, vagao, status FROM gusa_descargas_vagao WHERE navio_id = $1', [navioId]);
        return new Map(rows.map(r => [String(r.vagao), r]));
      })());
    }
    return existentesPorNavio.get(navioId);
  }
  // Serializa linhas que caem no MESMO navio+vagão dentro do mesmo upload
  // (planilha com linha duplicada) — sem isso, rodando em paralelo, as duas
  // poderiam achar "ainda não existe" ao mesmo tempo e inserir duas vezes.
  const filaPorChave = new Map(); // "navioId|vagao" -> Promise (última operação em andamento)
  async function comFilaPorChave(chave, fn) {
    const anterior = filaPorChave.get(chave) || Promise.resolve();
    const atual = anterior.then(fn, fn);
    filaPorChave.set(chave, atual.catch(() => {}));
    return atual;
  }

  await executarEmLotes(linhas, 15, async (linha) => {
    const vagaoRaw = pegarCampoPlanilha(linha, 'VAGÃO', 'VAGAO', 'Vagão');
    if (!vagaoRaw) { ignorados++; return; }
    const vagao = String(vagaoRaw).trim();

    const navioNome = pegarCampoPlanilha(linha, 'NAVIO', 'Navio');
    if (!navioNome) { ignorados++; return; }
    const resolvido = resolverNavioPorNome(naviosExistentes, navioNome, null);
    if (!resolvido.id) {
      const chave = String(navioNome).trim();
      problemasNavio.set(chave, (problemasNavio.get(chave) || 0) + 1);
      return;
    }
    const navioId = resolvido.id;

    const prefixo = pegarCampoPlanilha(linha, 'PREFIXO', 'Prefixo');
    const terminal = pegarCampoPlanilha(linha, 'TERMINAL', 'Terminal');
    const tonsRaw = pegarCampoPlanilha(linha, 'TONS', 'Tons', 'TONELADAS');
    const tons = tonsRaw != null ? Number(tonsRaw) : null;

    const inicioRaw = pegarCampoPlanilha(linha, 'INICIO DE DESCARGA', 'INÍCIO DE DESCARGA', 'Início de descarga');
    const fimRaw = pegarCampoPlanilha(linha, 'FIM DESCARGA', 'FIM DE DESCARGA', 'Fim descarga', 'Fim de descarga');
    // O navegador já manda essas datas como string "YYYY-MM-DDTHH:MM"
    // (formatada a partir da célula da planilha) — nunca como Date/ISO com
    // fuso, pelo mesmo motivo do resto do módulo (ver partesDataHoraLocal).
    const inicioPartes = inicioRaw ? partesDataHoraLocal(inicioRaw) : null;
    const fimPartes = fimRaw ? partesDataHoraLocal(fimRaw) : null;

    let turno = pegarCampoPlanilha(linha, 'TURNO', 'Turno');
    if (turno && !['07 - 19h', '19 - 07h'].includes(String(turno).trim())) turno = null;
    let dataStr = null;
    if (inicioPartes) {
      const dataBase = `${inicioPartes.ano}-${String(inicioPartes.mes).padStart(2, '0')}-${String(inicioPartes.dia).padStart(2, '0')}`;
      turno = (inicioPartes.hora >= 7 && inicioPartes.hora < 19) ? '07 - 19h' : '19 - 07h';
      dataStr = (turno === '19 - 07h' && inicioPartes.hora < 7) ? dataAnterior(inicioPartes.ano, inicioPartes.mes, inicioPartes.dia) : dataBase;
    } else {
      const dataPlanilha = pegarCampoPlanilha(linha, 'DATA DA DESCARGA', 'DATA', 'Data');
      const partesData = dataPlanilha ? partesDataHoraLocal(String(dataPlanilha).slice(0, 10) + 'T00:00') : null;
      if (partesData) {
        dataStr = `${partesData.ano}-${String(partesData.mes).padStart(2, '0')}-${String(partesData.dia).padStart(2, '0')}`;
      } else {
        dataStr = agoraBrasil().toISOString().slice(0, 10);
      }
      if (!turno) turno = turnoEDataDoTurno(agoraBrasil()).turno;
    }

    const status = fimPartes ? 'finalizado' : (inicioPartes ? 'em_descarga' : 'aguardando');
    const inicioStr = inicioPartes ? inicioRaw.replace('T', ' ') : null;
    const fimStr = fimPartes ? fimRaw.replace('T', ' ') : null;

    const existentes = await existentesDoNavio(navioId);

    // Serializado por navio+vagão: se a planilha tiver a mesma linha
    // duplicada, as duas passam por aqui uma de cada vez, nunca em paralelo.
    await comFilaPorChave(`${navioId}|${vagao}`, async () => {
      const existente = existentes.get(vagao);

      if (!existente) {
        const { rows } = await pool.query(
          `INSERT INTO gusa_descargas_vagao (navio_id, terminal, prefixo, vagao, turno, data, inicio_descarga, fim_descarga, tons, status, origem)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'planilha') RETURNING id, vagao, status`,
          [navioId, terminal || null, prefixo || null, vagao, turno, dataStr, inicioStr, fimStr, tons, status]
        );
        existentes.set(vagao, rows[0]);
        inseridos++;
      } else if (existente.status === 'aguardando') {
        await pool.query(
          `UPDATE gusa_descargas_vagao SET terminal = $1, prefixo = $2, turno = $3, data = $4,
             inicio_descarga = $5, fim_descarga = $6, tons = COALESCE($7, tons), status = $8,
             origem = 'planilha', atualizado_em = now() WHERE id = $9`,
          [terminal || null, prefixo || null, turno, dataStr, inicioStr, fimStr, tons, status, existente.id]
        );
        existente.status = status;
        atualizados++;
      } else {
        // Já foi iniciado/finalizado por alguém no sistema — a planilha nunca
        // sobrescreve isso.
        mantidos++;
      }
    });
  });

  res.json({
    ok: true,
    inseridos, atualizados, mantidos, ignorados,
    problemasNavio: [...problemasNavio.entries()].map(([navio, qtd]) => ({ navio, qtd }))
  });
});

// ---------- Descarga de Gusa — paralisações (fase 2) ----------
// Mesmo padrão iniciar/finalizar/manual/editar/excluir dos vagões, pra
// registrar parada direto no sistema em vez de só pela planilha.

const GUSA_RESPONSAVEIS = ['TRIUNFO', 'MRS', 'PLANO B', 'OUTROS', 'FORÇA MAIOR', 'DOCAS'];

app.post('/api/gusa/paralisacoes/iniciar', requireGusaAcesso('lancar'), async (req, res) => {
  const { navio_id, terminal, prefixo, ocorrencia, tipo, responsavel, observacao } = req.body || {};
  if (!ocorrencia) return res.status(400).json({ erro: 'Informe a ocorrência/motivo da parada.' });
  if (navio_id) {
    const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
    if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });
  }

  const agora = agoraBrasil();
  const { turno, data } = turnoEDataDoTurno(agora);
  const inicioStr = agora.toISOString().slice(0, 19).replace('T', ' ');

  const { rows } = await pool.query(
    `INSERT INTO gusa_paralisacoes (navio_id, terminal, prefixo, turno, data, inicio, tipo, ocorrencia, responsavel, observacao, status, origem, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'em_andamento', 'manual', $11)
     RETURNING *`,
    [navio_id || null, terminal || null, prefixo || null, turno, data, inicioStr, tipo || null, ocorrencia.trim(), responsavel || null, observacao || null, req.session.userId]
  );
  res.json({ ok: true, paralisacao: linhaParalisacaoParaFrontend(rows[0]) });
});

app.put('/api/gusa/paralisacoes/:id/finalizar', requireGusaAcesso('lancar'), async (req, res) => {
  const { id } = req.params;
  const { rows: atual } = await pool.query('SELECT * FROM gusa_paralisacoes WHERE id = $1', [id]);
  if (!atual[0]) return res.status(404).json({ erro: 'Parada não encontrada.' });
  if (atual[0].status === 'finalizado') return res.status(400).json({ erro: 'Essa parada já foi finalizada.' });

  const agora = agoraBrasil();
  const terminoStr = agora.toISOString().slice(0, 19).replace('T', ' ');

  const { rows } = await pool.query(
    `UPDATE gusa_paralisacoes SET termino = $1, status = 'finalizado', atualizado_em = now() WHERE id = $2 RETURNING *`,
    [terminoStr, id]
  );
  res.json({ ok: true, paralisacao: linhaParalisacaoParaFrontend(rows[0]) });
});

app.post('/api/gusa/paralisacoes/manual', requireGusaAcesso('lancar'), async (req, res) => {
  const { navio_id, terminal, prefixo, ocorrencia, tipo, responsavel, observacao, inicio, termino } = req.body || {};
  if (!ocorrencia || !inicio) {
    return res.status(400).json({ erro: 'Informe ao menos a ocorrência e o início da parada.' });
  }
  if (navio_id) {
    const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
    if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });
  }
  const partes = partesDataHoraLocal(inicio);
  if (!partes) return res.status(400).json({ erro: 'Início da parada inválido.' });
  if (termino) {
    if (!partesDataHoraLocal(termino)) return res.status(400).json({ erro: 'Término da parada inválido.' });
    if (String(termino) < String(inicio)) return res.status(400).json({ erro: 'O término não pode ser antes do início.' });
  }
  const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
  const turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
  const dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;

  const { rows } = await pool.query(
    `INSERT INTO gusa_paralisacoes (navio_id, terminal, prefixo, turno, data, inicio, termino, tipo, ocorrencia, responsavel, observacao, status, origem, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual', $13)
     RETURNING *`,
    [
      navio_id || null, terminal || null, prefixo || null, turno, dataStr,
      inicio.replace('T', ' '), termino ? termino.replace('T', ' ') : null,
      tipo || null, ocorrencia.trim(), responsavel || null, observacao || null,
      termino ? 'finalizado' : 'em_andamento', req.session.userId
    ]
  );
  res.json({ ok: true, paralisacao: linhaParalisacaoParaFrontend(rows[0]) });
});

app.put('/api/gusa/paralisacoes/:id', requireGusaAcesso('editar'), async (req, res) => {
  const { id } = req.params;
  const { navio_id, terminal, prefixo, ocorrencia, tipo, responsavel, observacao, inicio, termino } = req.body || {};
  const updates = [];
  const valores = [];
  let i = 1;

  if (navio_id !== undefined) {
    if (navio_id) {
      const { rows: navioRows } = await pool.query('SELECT id FROM navios WHERE id = $1', [navio_id]);
      if (!navioRows[0]) return res.status(400).json({ erro: 'Navio não encontrado.' });
    }
    updates.push(`navio_id = $${i++}`); valores.push(navio_id || null);
  }
  if (terminal !== undefined) { updates.push(`terminal = $${i++}`); valores.push(terminal || null); }
  if (prefixo !== undefined) { updates.push(`prefixo = $${i++}`); valores.push(prefixo || null); }
  if (tipo !== undefined) { updates.push(`tipo = $${i++}`); valores.push(tipo || null); }
  if (ocorrencia !== undefined) {
    if (!ocorrencia) return res.status(400).json({ erro: 'A ocorrência não pode ficar em branco.' });
    updates.push(`ocorrencia = $${i++}`); valores.push(ocorrencia.trim());
  }
  if (responsavel !== undefined) { updates.push(`responsavel = $${i++}`); valores.push(responsavel || null); }
  if (observacao !== undefined) { updates.push(`observacao = $${i++}`); valores.push(observacao || null); }
  if (inicio !== undefined) {
    const partes = partesDataHoraLocal(inicio);
    if (!partes) return res.status(400).json({ erro: 'Início da parada inválido.' });
    const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
    const turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
    const dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;
    updates.push(`inicio = $${i++}`); valores.push(inicio.replace('T', ' '));
    updates.push(`turno = $${i++}`); valores.push(turno);
    updates.push(`data = $${i++}`); valores.push(dataStr);
  }
  if (termino !== undefined) {
    if (termino && !partesDataHoraLocal(termino)) return res.status(400).json({ erro: 'Término da parada inválido.' });
    updates.push(`termino = $${i++}`); valores.push(termino ? termino.replace('T', ' ') : null);
    updates.push(`status = $${i++}`); valores.push(termino ? 'finalizado' : 'em_andamento');
  }
  if (updates.length === 0) return res.status(400).json({ erro: 'Nada para atualizar.' });
  updates.push(`atualizado_em = now()`);
  valores.push(id);

  const { rows } = await pool.query(
    `UPDATE gusa_paralisacoes SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Parada não encontrada.' });
  res.json({ ok: true, paralisacao: linhaParalisacaoParaFrontend(rows[0]) });
});

app.delete('/api/gusa/paralisacoes/:id', requireGusaAcesso('editar'), async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM gusa_paralisacoes WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ erro: 'Parada não encontrada.' });
  res.json({ ok: true });
});

// Importa paralisações retroativas da aba "Ocorrências" da planilha de
// origem — essa aba não traz o Navio, só o prefixo do lote (coluna
// TABELA), então a paralisação importada fica sem navio_id (o histórico já
// mostra pelo prefixo). Nunca mexe em nada lançado manualmente — só evita
// duplicar a MESMA linha se a planilha for reimportada (prefixo+data+
// início+tipo já visto antes, com origem 'planilha').
app.post('/api/gusa/paralisacoes/importar-planilha', requireGusaAcesso('lancar'), async (req, res) => {
  const linhas = Array.isArray(req.body?.linhas) ? req.body.linhas : null;
  if (!linhas || !linhas.length) return res.status(400).json({ erro: 'Nenhuma linha para importar.' });
  if (linhas.length > 30000) return res.status(400).json({ erro: 'Planilha grande demais (máx. 30.000 linhas por vez).' });

  const { rows: jaImportadas } = await pool.query(
    `SELECT prefixo, data, inicio, tipo FROM gusa_paralisacoes WHERE origem = 'planilha'`
  );
  const chaveDe = (prefixo, dataStr, inicioStr, tipo) =>
    `${prefixo || ''}|${dataStr}|${String(inicioStr).slice(0, 16)}|${tipo || ''}`;
  const chavesExistentes = new Set(jaImportadas.map(r => chaveDe(
    r.prefixo,
    r.data instanceof Date ? r.data.toISOString().slice(0, 10) : r.data,
    r.inicio instanceof Date ? r.inicio.toISOString().slice(0, 16) : String(r.inicio).replace(' ', 'T'),
    r.tipo
  )));

  let inseridos = 0, duplicadas = 0, ignorados = 0;

  await executarEmLotes(linhas, 15, async (linha) => {
    const prefixo = pegarCampoPlanilha(linha, 'TABELA', 'PREFIXO', 'Prefixo');
    const tipo = pegarCampoPlanilha(linha, 'TIPO');
    const ocorrenciaTxt = pegarCampoPlanilha(linha, 'OCORRENCIA', 'OCORRÊNCIA');
    const responsavel = pegarCampoPlanilha(linha, 'RESPONSÁVEL', 'RESPONSAVEL');
    // O navegador já manda INICIO/TERMINO combinados (data da coluna DATA +
    // hora da coluna INÍCIO/TÉRMINO) como "YYYY-MM-DDTHH:MM" — a planilha
    // guarda hora e data em colunas separadas, então essa junção acontece
    // no cliente (ver combinarDataHora no gusa.html/admin-pesagem.html).
    const inicioRaw = pegarCampoPlanilha(linha, 'INICIO', 'INÍCIO');
    const terminoRaw = pegarCampoPlanilha(linha, 'TERMINO', 'TÉRMINO');

    if (!ocorrenciaTxt || !inicioRaw) { ignorados++; return; }
    const partes = partesDataHoraLocal(inicioRaw);
    if (!partes) { ignorados++; return; }
    const terminoPartes = terminoRaw ? partesDataHoraLocal(terminoRaw) : null;

    const dataBase = `${partes.ano}-${String(partes.mes).padStart(2, '0')}-${String(partes.dia).padStart(2, '0')}`;
    const turno = (partes.hora >= 7 && partes.hora < 19) ? '07 - 19h' : '19 - 07h';
    const dataStr = (turno === '19 - 07h' && partes.hora < 7) ? dataAnterior(partes.ano, partes.mes, partes.dia) : dataBase;

    const chave = chaveDe(prefixo, dataStr, inicioRaw, tipo);
    if (chavesExistentes.has(chave)) { duplicadas++; return; }
    chavesExistentes.add(chave);

    await pool.query(
      `INSERT INTO gusa_paralisacoes (navio_id, terminal, prefixo, turno, data, inicio, termino, tipo, ocorrencia, responsavel, status, origem)
       VALUES (NULL, NULL, $1, $2, $3, $4, $5, $6, $7, $8, $9, 'planilha')`,
      [
        prefixo || null, turno, dataStr, inicioRaw.replace('T', ' '),
        terminoPartes ? terminoRaw.replace('T', ' ') : null,
        tipo || null, String(ocorrenciaTxt).trim(), responsavel || null,
        terminoPartes ? 'finalizado' : 'em_andamento'
      ]
    );
    inseridos++;
  });

  res.json({ ok: true, inseridos, duplicadas, ignorados });
});

// ---------- Descarga de Gusa — carretas por dia/turno (fase 2) ----------
// Contagem simples (não carreta por carreta — a planilha de origem também
// não tem placa nessa parte). Um lançamento por terminal+turno+data,
// corrigível a qualquer momento (upsert em vez de duplicar).
app.post('/api/gusa/carretas', requireGusaAcesso('lancar'), async (req, res) => {
  const { terminal, turno, data, viagens, carretas, observacao } = req.body || {};
  if (!turno || !data) return res.status(400).json({ erro: 'Informe o turno e a data.' });
  if (!['07 - 19h', '19 - 07h'].includes(turno)) return res.status(400).json({ erro: 'Turno inválido.' });

  const { rows } = await pool.query(
    `INSERT INTO gusa_carretas_turno (terminal, turno, data, viagens, carretas, observacao, origem, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)
     ON CONFLICT (terminal, turno, data) DO UPDATE SET
       viagens = EXCLUDED.viagens, carretas = EXCLUDED.carretas, observacao = EXCLUDED.observacao, atualizado_em = now()
     RETURNING *`,
    [terminal || '', turno, data, viagens != null && viagens !== '' ? Number(viagens) : null, carretas != null && carretas !== '' ? Number(carretas) : null, observacao || null, req.session.userId]
  );
  res.json({ ok: true, carretas: rows[0] });
});

app.delete('/api/gusa/carretas/:id', requireGusaAcesso('editar'), async (req, res) => {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM gusa_carretas_turno WHERE id = $1', [id]);
  if (rowCount === 0) return res.status(404).json({ erro: 'Lançamento não encontrado.' });
  res.json({ ok: true });
});

// Kanban de Ações da Diretoria — página independente, sem relação com o
// login/sessão do portal de pesagens (tem seu próprio login por grupo,
// nas rotas /api/kanban/* abaixo). Servida aqui pra ficar acessível dentro
// da rede da empresa (o github.io é bloqueado lá) e, desde a migração pro
// banco, também porque é aqui que os dados dela realmente vivem agora.
app.get('/kanban-diretoria.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'kanban-diretoria.html'));
});

// ---------- Kanban de Ações — API ----------
// Substituiu o modelo antigo (arquivo HTML estático publicado no GitHub,
// com "Publicar online" + token pessoal + duas cópias pra manter em sincronia).
// Agora cada ação mora numa linha da tabela kanban_cards e cada
// criação/edição/movimentação/exclusão grava direto aqui — sem publicar
// nada, sem token, sem esperar sincronizar. O login por senha de grupo
// continua igual (mesmos seis grupos de antes), só que a senha agora é
// conferida aqui no servidor (bcrypt), em vez de um hash que vinha junto
// com os dados do quadro e podia ser lido por qualquer um.

const KANBAN_VALID_COMPANIES = ['arm', 'allseas', 'tps', 'equinor', 'especialistas', 'spot', 'prime', 'diretoria', 'superintendencia'];
const KANBAN_VALID_STATUS = ['todo', 'doing', 'done'];

function kanbanIsCompanyAllowed(grupo, companyId) {
  return grupo.companies === 'ALL' || grupo.companies.includes(companyId);
}

function requireKanbanAuth(req, res, next) {
  const grupo = req.session.kanbanGrupoId && KANBAN_ACCESS_GROUPS.find(g => g.id === req.session.kanbanGrupoId);
  if (!grupo) return res.status(401).json({ erro: 'Não autenticado.' });
  req.kanbanGrupo = grupo;
  next();
}

function kanbanCardFromRow(row) {
  return {
    id: row.id,
    company: row.company,
    text: row.texto,
    sub: row.sub || '',
    responsavel: row.responsavel || '',
    due: row.due || null,
    status: row.status,
    evidence: Array.isArray(row.evidencias) ? row.evidencias : [],
    createdAt: row.criado_em instanceof Date ? row.criado_em.toISOString() : row.criado_em
  };
}

// Uma foto do quadro inteiro (todas as empresas, sem filtro de grupo) —
// alimenta o gráfico de evolução, que sempre mostrou todos os contratos e
// deixa a tela de Análises recortar só os do grupo logado.
async function recordKanbanHistorico() {
  const { rows } = await pool.query('SELECT company, status FROM kanban_cards');
  const hoje = new Date().toISOString().slice(0, 10);
  const porEmpresa = {};
  let todo = 0, doing = 0, done = 0;
  for (const r of rows) {
    if (!porEmpresa[r.company]) porEmpresa[r.company] = { total: 0, done: 0 };
    porEmpresa[r.company].total++;
    if (r.status === 'done') { porEmpresa[r.company].done++; done++; }
    else if (r.status === 'doing') doing++;
    else todo++;
  }
  await pool.query(
    `INSERT INTO kanban_historico (data, total, todo, doing, done, por_empresa)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (data) DO UPDATE SET total = EXCLUDED.total, todo = EXCLUDED.todo,
       doing = EXCLUDED.doing, done = EXCLUDED.done, por_empresa = EXCLUDED.por_empresa`,
    [hoje, rows.length, todo, doing, done, JSON.stringify(porEmpresa)]
  );
  await pool.query(`DELETE FROM kanban_historico WHERE data < (current_date - interval '366 days')`);
}

async function getKanbanHistorico() {
  const { rows } = await pool.query(
    'SELECT data::text as date, total, todo, doing, done, por_empresa FROM kanban_historico ORDER BY data ASC'
  );
  return rows.map(r => ({ date: r.date, total: r.total, todo: r.todo, doing: r.doing, done: r.done, byCompany: r.por_empresa }));
}

app.get('/api/kanban/me', (req, res) => {
  const grupo = req.session.kanbanGrupoId && KANBAN_ACCESS_GROUPS.find(g => g.id === req.session.kanbanGrupoId);
  if (!grupo) return res.status(401).json({ erro: 'Não autenticado.' });
  res.json({ ok: true, grupo });
});

const kanbanTentativasLogin = new Map(); // grupoId -> { falhas, bloqueadoAte }

app.post('/api/kanban/login', async (req, res) => {
  const { grupoId, senha } = req.body || {};
  if (!grupoId || !senha) return res.status(400).json({ erro: 'Escolha o contrato e digite a senha.' });
  const grupo = KANBAN_ACCESS_GROUPS.find(g => g.id === grupoId);
  if (!grupo) return res.status(400).json({ erro: 'Contrato inválido.' });

  const registro = kanbanTentativasLogin.get(grupoId);
  if (registro && registro.bloqueadoAte && registro.bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((registro.bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas erradas. Tente novamente em ${minutos} minuto(s).` });
  }

  const { rows } = await pool.query('SELECT senha_hash FROM kanban_access WHERE grupo_id = $1', [grupoId]);
  const hash = rows[0] && rows[0].senha_hash;
  if (!hash || !bcrypt.compareSync(senha, hash)) {
    const falhas = (registro?.falhas || 0) + 1;
    if (falhas >= 5) kanbanTentativasLogin.set(grupoId, { falhas: 0, bloqueadoAte: Date.now() + 15 * 60 * 1000 });
    else kanbanTentativasLogin.set(grupoId, { falhas, bloqueadoAte: null });
    return res.status(401).json({ erro: 'Senha inválida para esse contrato. Confira com a Diretoria de Operações.' });
  }
  kanbanTentativasLogin.delete(grupoId);
  req.session.kanbanGrupoId = grupoId;
  res.json({ ok: true, grupo });
});

app.post('/api/kanban/logout', (req, res) => {
  req.session.kanbanGrupoId = null;
  res.json({ ok: true });
});

app.post('/api/kanban/change-password', requireKanbanAuth, async (req, res) => {
  const { senhaAtual, senhaNova } = req.body || {};
  if (!senhaAtual || !senhaNova) return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
  if (senhaNova.length < 4) return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 4 caracteres.' });
  const { rows } = await pool.query('SELECT senha_hash FROM kanban_access WHERE grupo_id = $1', [req.kanbanGrupo.id]);
  const hash = rows[0] && rows[0].senha_hash;
  if (!hash || !bcrypt.compareSync(senhaAtual, hash)) return res.status(401).json({ erro: 'Senha atual incorreta.' });
  const novoHash = bcrypt.hashSync(senhaNova, 10);
  await pool.query(
    `INSERT INTO kanban_access (grupo_id, senha_hash) VALUES ($1, $2)
     ON CONFLICT (grupo_id) DO UPDATE SET senha_hash = EXCLUDED.senha_hash`,
    [req.kanbanGrupo.id, novoHash]
  );
  res.json({ ok: true });
});

app.get('/api/kanban/board', requireKanbanAuth, async (req, res) => {
  const grupo = req.kanbanGrupo;
  const sql = `SELECT id, company, texto, sub, responsavel, due::text as due, status, evidencias, criado_em, atualizado_em
               FROM kanban_cards`;
  const { rows } = grupo.companies === 'ALL'
    ? await pool.query(sql + ' ORDER BY criado_em DESC')
    : await pool.query(sql + ' WHERE company = ANY($1) ORDER BY criado_em DESC', [grupo.companies]);
  const cards = rows.map(kanbanCardFromRow);
  const history = await getKanbanHistorico();
  const { rows: ur } = await pool.query('SELECT max(atualizado_em) as ultima FROM kanban_cards');
  const updatedAt = ur[0] && ur[0].ultima ? ur[0].ultima.toISOString() : new Date().toISOString();
  res.json({ ok: true, cards, history, updatedAt });
});

// ---------- Sincroniza o Kanban de Ações com o serviço de notificações ----------
// Serviço separado no Railway (kanban-notificacoes) que guarda o cadastro de
// responsáveis (nome + e-mail + WhatsApp) e dispara notificação na criação,
// na mudança de situação e no resumo diário. "Dispara e esquece" — igual ao
// alerta de prazo acima: se a chamada falhar ou o serviço estiver fora do
// ar, o Kanban continua funcionando normalmente, só sem notificar dessa vez.
const NOTIF_API_BASE = process.env.NOTIF_API_BASE || '';
const NOTIF_API_TOKEN = process.env.NOTIF_API_TOKEN || '';

function syncKanbanCardToNotificacoes(card) {
  if (!NOTIF_API_BASE || !card) return;
  fetch(NOTIF_API_BASE + '/api/actions/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-token': NOTIF_API_TOKEN },
    body: JSON.stringify({
      external_card_id: card.id,
      company: card.company,
      title: card.texto,
      observacoes: card.sub,
      status: card.status,
      due_date: card.due || null,
      responsavel_nome: card.responsavel || null
    })
  }).catch(err => console.error('[kanban-notificacoes] falha ao sincronizar', card.id, err.message));
}

function deleteKanbanCardFromNotificacoes(id) {
  if (!NOTIF_API_BASE) return;
  fetch(NOTIF_API_BASE + '/api/actions/sync/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { 'x-api-token': NOTIF_API_TOKEN }
  }).catch(err => console.error('[kanban-notificacoes] falha ao excluir', id, err.message));
}

// Só Diretoria/Superintendência (grupos com acesso a todos os contratos)
// cuidam do cadastro de quem recebe notificação — o token do serviço de
// notificações nunca vai pro navegador, essas rotas fazem a chamada por
// aqui, usando a mesma sessão de login do Kanban.
function requireKanbanAdmin(req, res, next) {
  if (!req.kanbanGrupo || req.kanbanGrupo.companies !== 'ALL') {
    return res.status(403).json({ erro: 'Sem acesso ao cadastro de usuários.' });
  }
  next();
}

app.get('/api/kanban/notif-users', requireKanbanAuth, requireKanbanAdmin, async (req, res) => {
  if (!NOTIF_API_BASE) return res.json([]);
  try {
    const r = await fetch(NOTIF_API_BASE + '/api/users');
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(502).json({ erro: 'Serviço de notificações indisponível: ' + err.message });
  }
});

app.post('/api/kanban/notif-users', requireKanbanAuth, requireKanbanAdmin, async (req, res) => {
  if (!NOTIF_API_BASE) return res.status(503).json({ erro: 'Serviço de notificações não configurado.' });
  try {
    const r = await fetch(NOTIF_API_BASE + '/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-token': NOTIF_API_TOKEN },
      body: JSON.stringify(req.body || {})
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(502).json({ erro: 'Serviço de notificações indisponível: ' + err.message });
  }
});

app.patch('/api/kanban/notif-users/:id', requireKanbanAuth, requireKanbanAdmin, async (req, res) => {
  if (!NOTIF_API_BASE) return res.status(503).json({ erro: 'Serviço de notificações não configurado.' });
  try {
    const r = await fetch(NOTIF_API_BASE + '/api/users/' + encodeURIComponent(req.params.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-token': NOTIF_API_TOKEN },
      body: JSON.stringify(req.body || {})
    });
    res.status(r.status).json(await r.json());
  } catch (err) {
    res.status(502).json({ erro: 'Serviço de notificações indisponível: ' + err.message });
  }
});

app.delete('/api/kanban/notif-users/:id', requireKanbanAuth, requireKanbanAdmin, async (req, res) => {
  if (!NOTIF_API_BASE) return res.status(503).json({ erro: 'Serviço de notificações não configurado.' });
  try {
    const r = await fetch(NOTIF_API_BASE + '/api/users/' + encodeURIComponent(req.params.id), {
      method: 'DELETE',
      headers: { 'x-api-token': NOTIF_API_TOKEN }
    });
    res.status(r.status).end();
  } catch (err) {
    res.status(502).json({ erro: 'Serviço de notificações indisponível: ' + err.message });
  }
});

app.post('/api/kanban/cards', requireKanbanAuth, async (req, res) => {
  const { company, text, sub, responsavel, due, status } = req.body || {};
  if (!KANBAN_VALID_COMPANIES.includes(company)) return res.status(400).json({ erro: 'Empresa inválida.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, company)) return res.status(403).json({ erro: 'Sem acesso a essa empresa.' });
  if (!text || !text.trim()) return res.status(400).json({ erro: 'Descreva a ação.' });
  const st = KANBAN_VALID_STATUS.includes(status) ? status : 'todo';
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const { rows } = await pool.query(
    `INSERT INTO kanban_cards (id, company, texto, sub, responsavel, due, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, company, texto, sub, responsavel, due::text as due, status, evidencias, criado_em, atualizado_em`,
    [id, company, text.trim(), (sub || '').trim(), (responsavel || '').trim(), due || null, st]
  );
  await recordKanbanHistorico();
  const history = await getKanbanHistorico();
  syncKanbanCardToNotificacoes(rows[0]);
  res.json({ ok: true, card: kanbanCardFromRow(rows[0]), history });
});

app.put('/api/kanban/cards/:id', requireKanbanAuth, async (req, res) => {
  const { rows: existing } = await pool.query('SELECT company, texto FROM kanban_cards WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, existing[0].company)) return res.status(403).json({ erro: 'Sem acesso a essa ação.' });
  const { text, sub, due, responsavel } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE kanban_cards SET texto = $1, sub = $2, due = $3, responsavel = $4, atualizado_em = now()
     WHERE id = $5
     RETURNING id, company, texto, sub, responsavel, due::text as due, status, evidencias, criado_em, atualizado_em`,
    [(text || '').trim() || existing[0].texto, (sub || '').trim(), due || null, (responsavel || '').trim(), req.params.id]
  );
  syncKanbanCardToNotificacoes(rows[0]);
  res.json({ ok: true, card: kanbanCardFromRow(rows[0]) });
});

app.put('/api/kanban/cards/:id/status', requireKanbanAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!KANBAN_VALID_STATUS.includes(status)) return res.status(400).json({ erro: 'Situação inválida.' });
  const { rows: existing } = await pool.query('SELECT company FROM kanban_cards WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, existing[0].company)) return res.status(403).json({ erro: 'Sem acesso a essa ação.' });
  const { rows: updated } = await pool.query(
    `UPDATE kanban_cards SET status = $1, atualizado_em = now() WHERE id = $2
     RETURNING id, company, texto, sub, responsavel, due::text as due, status`,
    [status, req.params.id]
  );
  await recordKanbanHistorico();
  const history = await getKanbanHistorico();
  syncKanbanCardToNotificacoes(updated[0]);
  res.json({ ok: true, history });
});

app.delete('/api/kanban/cards/:id', requireKanbanAuth, async (req, res) => {
  const { rows: existing } = await pool.query('SELECT company FROM kanban_cards WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, existing[0].company)) return res.status(403).json({ erro: 'Sem acesso a essa ação.' });
  await pool.query('DELETE FROM kanban_cards WHERE id = $1', [req.params.id]);
  deleteKanbanCardFromNotificacoes(req.params.id);
  await recordKanbanHistorico();
  const history = await getKanbanHistorico();
  res.json({ ok: true, history });
});

app.post('/api/kanban/cards/:id/evidence', requireKanbanAuth, async (req, res) => {
  const { name, type, size, dataUrl } = req.body || {};
  if (!name || !dataUrl) return res.status(400).json({ erro: 'Arquivo inválido.' });
  if (typeof size === 'number' && size > 8 * 1024 * 1024) return res.status(400).json({ erro: 'Arquivo muito grande (máx. 8 MB).' });
  const { rows: existing } = await pool.query('SELECT company, evidencias FROM kanban_cards WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, existing[0].company)) return res.status(403).json({ erro: 'Sem acesso a essa ação.' });
  const evidencia = {
    id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10),
    name: String(name).slice(0, 255),
    type: type || 'application/octet-stream',
    size: size || 0,
    dataUrl: dataUrl,
    addedAt: new Date().toISOString()
  };
  const lista = Array.isArray(existing[0].evidencias) ? existing[0].evidencias.slice() : [];
  lista.push(evidencia);
  await pool.query('UPDATE kanban_cards SET evidencias = $1, atualizado_em = now() WHERE id = $2', [JSON.stringify(lista), req.params.id]);
  res.json({ ok: true, evidencia });
});

app.delete('/api/kanban/cards/:id/evidence/:evId', requireKanbanAuth, async (req, res) => {
  const { rows: existing } = await pool.query('SELECT company, evidencias FROM kanban_cards WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ erro: 'Ação não encontrada.' });
  if (!kanbanIsCompanyAllowed(req.kanbanGrupo, existing[0].company)) return res.status(403).json({ erro: 'Sem acesso a essa ação.' });
  const lista = (Array.isArray(existing[0].evidencias) ? existing[0].evidencias : []).filter(e => e.id !== req.params.evId);
  await pool.query('UPDATE kanban_cards SET evidencias = $1, atualizado_em = now() WHERE id = $2', [JSON.stringify(lista), req.params.id]);
  res.json({ ok: true });
});

app.use('/logos', express.static(path.join(__dirname, 'logos')));

app.get('/logos/:arquivo', (req, res, next) => {
  const arquivo = req.params.arquivo;
  if (!/^[\w-]+\.png$/.test(arquivo)) return next();
  res.sendFile(path.join(__dirname, arquivo), err => { if (err) next(); });
});

app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/menu.html' : '/login.html');
});

// Rede de segurança: qualquer erro não tratado numa rota /api/* cai aqui e
// ---------- Alerta de prazos do Kanban de Ações ----------
// Roda uma vez por dia: busca as ações direto do banco (fonte da verdade
// desde a migração — antes vinha de um arquivo publicado no GitHub, que
// exigia "Publicar online" + token e podia ficar desatualizado), acha
// ações com prazo vencido ou a ≤3 dias que ainda não estão "Concluído", e
// manda e-mail pro responsável do contrato + pra Diretoria/Superintendência.
// Cada ação só dispara e-mail de novo quando MUDA de nível (passa a "perto
// do prazo" e depois "atrasada") — não manda todo dia enquanto ficar
// parada no mesmo nível, pra não virar spam.
const KANBAN_BOARD_URL = 'https://triunfo-portal-production.up.railway.app/kanban-diretoria.html';

const KANBAN_ALERT_EMAIL = {
  arm: 'filipe.chagas@triunfologistica.com.br',
  allseas: 'washington.fernandes@triunfologistica.com.br',
  equinor: 'washington.fernandes@triunfologistica.com.br',
  spot: 'washington.fernandes@triunfologistica.com.br',
  especialistas: 'heder.rodrigues@triunfologistica.com.br',
  tps: 'romulo.carvalho@triunfologistica.com.br',
  prime: 'romulo.carvalho@triunfologistica.com.br'
};
const KANBAN_OVERSIGHT_EMAILS = [
  'rodolpho.trindade@triunfologistica.com.br', // Diretoria
  'rafael.souza@triunfologistica.com.br'       // Superintendência
];
// TEMPORÁRIO: sem domínio verificado no Resend, a conta só entrega pro
// dono da conta mesmo. Inclui ele em todo alerta pra provar que o motor
// funciona ponta a ponta enquanto o domínio não é verificado. Remover
// (ou deixar, não faz mal) assim que triunfologistica.com.br estiver
// verificado e os e-mails reais passarem a entregar de verdade.
const KANBAN_RESEND_ACCOUNT_OWNER = 'rfvmrs@gmail.com';
const KANBAN_COMPANY_LABEL = {
  arm: 'ARM Rio', allseas: 'All Seas', equinor: 'Equinor',
  spot: 'SPOT', especialistas: 'Especialistas', tps: 'TPS', prime: 'Prime',
  diretoria: 'Diretoria', superintendencia: 'Superintendência'
};

// "YYYY-MM-DD" parseado como data local (não UTC), senão o cálculo de
// dias fica errado perto da virada do dia em fusos negativos como o nosso.
function kanbanDaysUntil(dueKey) {
  var p = String(dueKey).split('-');
  var due = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  due.setHours(0, 0, 0, 0);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

async function fetchKanbanBoard() {
  const { rows } = await pool.query(
    `SELECT id, company, texto as text, sub, due::text as due, status FROM kanban_cards`
  );
  return { cards: rows };
}

async function sendKanbanAlertEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[kanban-alertas] RESEND_API_KEY não configurada — pulando envio para', to);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Kanban Diretoria <onboarding@resend.dev>',
      to: [to],
      subject: subject,
      html: html
    })
  });
  const body = await res.text().catch(() => '');
  if (!res.ok) {
    console.error('[kanban-alertas] Falha ao enviar e-mail para', to, res.status, body);
    return false;
  }
  console.log('[kanban-alertas] e-mail enviado para', to, '—', body);
  return true;
}

async function checkKanbanDeadlines() {
  let checked = 0, alerted = 0;
  try {
    const board = await fetchKanbanBoard();
    const cards = Array.isArray(board.cards) ? board.cards : [];
    for (const c of cards) {
      if (!c.due || c.status === 'done') continue;
      checked++;
      const days = kanbanDaysUntil(c.due);
      let level = null;
      if (days < 0) level = 'overdue';
      else if (days <= 3) level = 'soon';
      if (!level) continue;

      const { rows } = await pool.query(
        'SELECT nivel FROM kanban_alertas_enviados WHERE card_id = $1',
        [c.id]
      );
      if (rows[0] && rows[0].nivel === level) continue; // já avisou nesse nível

      const companyLabel = KANBAN_COMPANY_LABEL[c.company] || c.company;
      const recipients = new Set(KANBAN_OVERSIGHT_EMAILS);
      if (KANBAN_ALERT_EMAIL[c.company]) recipients.add(KANBAN_ALERT_EMAIL[c.company]);
      recipients.add(KANBAN_RESEND_ACCOUNT_OWNER);

      const subject = level === 'overdue'
        ? `[Kanban] Ação atrasada — ${companyLabel}: ${c.text}`
        : `[Kanban] Prazo próximo — ${companyLabel}: ${c.text}`;
      const daysLabel = level === 'overdue'
        ? `está atrasada há ${Math.abs(days)} dia(s)`
        : (days === 0 ? 'vence hoje' : `vence em ${days} dia(s)`);
      const html =
        `<p>A ação abaixo do contrato <b>${companyLabel}</b> ${daysLabel}:</p>` +
        `<p><b>${c.text}</b>${c.sub ? '<br>' + c.sub : ''}</p>` +
        `<p>Prazo: ${c.due}</p>` +
        `<p><a href="${KANBAN_BOARD_URL}">Abrir o Kanban</a></p>`;

      let anySent = false;
      for (const to of recipients) {
        const ok = await sendKanbanAlertEmail(to, subject, html);
        if (ok) anySent = true;
      }
      if (!anySent) {
        // Chave ausente ou Resend falhou pra todo mundo — não marca como
        // avisado, pra tentar de novo na próxima checagem em vez de
        // silenciosamente desistir dessa ação pra sempre.
        console.log('[kanban-alertas] nenhum e-mail saiu para', c.id, '— não marcando como avisado, tenta de novo depois');
        continue;
      }
      alerted++;
      await pool.query(
        `INSERT INTO kanban_alertas_enviados (card_id, nivel, enviado_em) VALUES ($1, $2, now())
         ON CONFLICT (card_id) DO UPDATE SET nivel = EXCLUDED.nivel, enviado_em = now()`,
        [c.id, level]
      );
    }
  } catch (err) {
    console.error('[kanban-alertas] Erro ao checar prazos:', err.message);
  }
  console.log(`[kanban-alertas] checagem concluída — ${checked} ação(ões) com prazo, ${alerted} alerta(s) disparado(s)`);
}

function scheduleKanbanDeadlineCheck() {
  // Roda todo dia às 11h UTC (~08h em Brasília — sem horário de verão
  // desde 2019, então esse cálculo fixo não precisa de fuso dinâmico).
  function msUntilNext11utc() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }
  function tick() {
    checkKanbanDeadlines();
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }
  setTimeout(tick, msUntilNext11utc());
}

// Disparo manual pra testar sem esperar o horário agendado — mesmo token
// de administrador que a ferramenta de sincronização já usa.
app.post('/api/kanban-alertas/testar', requireAdminToken, async (req, res) => {
  try {
    await checkKanbanDeadlines();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// volta como JSON com o motivo, em vez de travar como página em branco/HTML
// (isso é o que fazia a tela de Usuários mostrar só "Erro ao criar login."
// sem dizer o motivo real).
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: err.message || 'Erro interno no servidor.' });
});

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => seedKanbanAccess())
  .then(() => seedKanbanCards())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Portal rodando em http://localhost:${PORT}`);
    });
    scheduleKanbanDeadlineCheck();
  })
  .catch(err => {
    console.error('Erro ao inicializar o banco de dados:', err);
    process.exit(1);
  });
