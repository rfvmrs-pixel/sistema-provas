import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
  date,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------- Setores (= Contratos) ----------
export const sectors = pgTable("sectors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Admins ----------
// sectorId = null  -> enxerga todos os Contratos. role decide o que pode FAZER:
//   role "admin"     -> admin geral: enxerga e gerencia (cria/edita/exclui) tudo,
//                       inclusive Contratos e contas de gestor/diretoria.
//   role "diretoria" -> mesma visão de todos os Contratos e estatísticas da
//                       empresa, mas SÓ VISUALIZA — todo endpoint de escrita
//                       (requireEditor) bloqueia esse role.
// sectorId = X, role "gestor" -> só enxerga/gerencia o próprio contrato (Setor),
//                       com permissão de escrita normal dentro dele.
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  sectorId: integer("sector_id").references(() => sectors.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).default("gestor").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Funções ----------
export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Funcionários ----------
export const employees = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "restrict" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    active: boolean("active").default(true).notNull(),
    // Matrícula: identifica o colaborador quando ele se autocadastra ao abrir
    // um link de "Prova Geral"/"Prova Direcionada" (ver examLinks). Única por
    // Contrato — funcionários antigos (cadastrados manualmente antes dessa
    // função existir) ficam com matrícula null, sem problema.
    matricula: varchar("matricula", { length: 50 }),
    // Faixa de tempo de empresa, pra alimentar as análises do painel:
    // "0-6m" | "6m-1a" | "1-3a" | "3-5a" | "5a+"
    tempoDeEmpresa: varchar("tempo_de_empresa", { length: 10 }),
    // ---- Código temporário de "prova do dia" ----
    // O gestor gera, para uma leva de colaboradores, um código de uso único
    // (login = nome + setor, senha = este código) válido só para UMA prova
    // específica. O código é apagado (tempCodeHash = null) assim que o
    // colaborador finaliza essa tentativa, então não dá pra reusar depois —
    // e o resultado só aparece nos relatórios do gestor (ver attempts.mode).
    tempCodeHash: varchar("temp_code_hash", { length: 255 }),
    tempCodeExamId: integer("temp_code_exam_id").references(() => exams.id, {
      onDelete: "set null",
    }),
    tempCodeSessionLabel: varchar("temp_code_session_label", { length: 150 }),
    tempCodeExpiresAt: timestamp("temp_code_expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // mesmo nome pode existir em setores diferentes, mas não duplicado dentro do setor
    uniqueIndex("employees_name_sector_unique").on(t.name, t.sectorId),
    // matrícula é o identificador do autocadastro (ver examLinks) — única por
    // Contrato. Postgres permite múltiplos NULL num índice único, então
    // funcionários sem matrícula (cadastro manual antigo) não conflitam.
    uniqueIndex("employees_matricula_sector_unique").on(t.matricula, t.sectorId),
    index("employees_sector_idx").on(t.sectorId),
    index("employees_role_idx").on(t.roleId),
  ],
);

// ---------- Biblioteca de documentos (PDFs de IT/APR) ----------
// O gestor sobe o PDF uma vez, identificando o Contrato e o Tipo (IT/APR) —
// isso permite filtrar a Biblioteca e, principalmente, filtrar QUAL pdf
// aparece pra escolher na hora de gerar a prova (ver Provas > Gerar prova:
// primeiro escolhe o Tipo, depois só os PDFs desse Tipo aparecem). Função
// continua sendo escolhida só na hora de gerar a prova.
export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 300 }).notNull(),
    // IT (Instrução de Trabalho) ou APR (Análise Preliminar de Risco) —
    // definido no upload, guia o filtro em Provas > Gerar prova.
    documentType: varchar("document_type", { length: 10 }).default("IT").notNull(),
    extractedText: text("extracted_text").notNull(),
    // Arquivo original em base64, pra manter o PDF de fato "salvo no sistema"
    // (não só o texto extraído) e permitir baixar/conferir depois.
    fileData: text("file_data").notNull(),
    fileSize: integer("file_size").notNull(), // bytes do PDF original
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  },
  (t) => [index("documents_sector_idx").on(t.sectorId)],
);

// ---------- Provas ----------
export const exams = pgTable(
  "exams",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 250 }).notNull(),
    sourceFileName: varchar("source_file_name", { length: 300 }),
    summary: text("summary"),
    active: boolean("active").default(true).notNull(),
    passingScore: integer("passing_score").default(70).notNull(), // % mínimo p/ considerar aprovado
    // Tipo do documento de origem: IT (Instrução de Trabalho) ou APR (Análise
    // Preliminar de Risco). Influencia o prompt de geração das questões.
    documentType: varchar("document_type", { length: 10 }).default("IT").notNull(),
    // De qual documento da biblioteca essa prova foi gerada (se veio de lá).
    // set null: apagar o PDF da biblioteca não apaga as provas já geradas.
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    // Cada prova pertence a exatamente 1 Setor + 1 Função. Funcionário só vê
    // provas do seu próprio Setor E Função (ver /api/employee/exams).
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "restrict" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    // Incrementa toda vez que as questões são regeneradas (manual pelo admin,
    // ou automático depois de 3 tentativas "oficial" do mesmo colaborador —
    // ver src/lib/attemptLimit.ts). attempts.questionSetVersion guarda com
    // qual "geração" de perguntas aquela tentativa foi feita, então o limite
    // de 3 tentativas conta só contra o conjunto de perguntas atual.
    currentVersion: integer("current_version").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("exams_sector_role_idx").on(t.sectorId, t.roleId)],
);

// ---------- Questões ----------
// options: [{ key: "A", text: "..." }, { key: "B", text: "..." }, ...]
export const questions = pgTable(
  "questions",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    options: jsonb("options").notNull(),
    correctKey: varchar("correct_key", { length: 5 }).notNull(),
    topic: varchar("topic", { length: 200 }), // tema/assunto dentro da prova
    explanation: text("explanation"),
    order: integer("order").default(0).notNull(),
  },
  (t) => [index("questions_exam_idx").on(t.examId)],
);

// ---------- Links de aplicação de prova ----------
// O gestor gera um link público pra aplicar uma prova sem precisar
// pré-cadastrar ninguém: quem abre o link se autocadastra (nome, matrícula,
// tempo de empresa — Contrato e Função já vêm da própria prova) e cai direto
// na prova.
// - "geral"       -> qualquer colaborador do Contrato/Função da prova pode
//                    usar o link; o autocadastro cria (ou atualiza, se a
//                    matrícula já existir) o funcionário na hora.
// - "direcionada" -> o gestor já escolheu/criou um funcionário específico
//                    (targetEmployeeId); só quem digitar a matrícula desse
//                    funcionário consegue entrar por esse link.
export const examLinks = pgTable(
  "exam_links",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 40 }).notNull().unique(),
    kind: varchar("kind", { length: 20 }).default("geral").notNull(),
    targetEmployeeId: integer("target_employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    label: varchar("label", { length: 150 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("exam_links_exam_idx").on(t.examId)],
);

// ---------- Tentativas ----------
export const attempts = pgTable(
  "attempts",
  {
    id: serial("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    // "simulado"  -> colaborador logado com a própria senha, praticando livremente.
    // "oficial"   -> prova aplicada de verdade: seja pelo código de uso único
    //                da "prova do dia" ou por um link (geral/direcionada) —
    //                ver examLinkId. Resultado só sai nos relatórios do
    //                admin/gestor (o colaborador não tem login persistente
    //                pra consultar depois).
    mode: varchar("mode", { length: 20 }).default("simulado").notNull(),
    sessionLabel: varchar("session_label", { length: 150 }), // rótulo da aplicação, quando mode = oficial
    // Se essa tentativa veio de um link de aplicação (geral/direcionada) —
    // null quando veio do código de "prova do dia" antigo ou é "simulado".
    examLinkId: integer("exam_link_id").references(() => examLinks.id, { onDelete: "set null" }),
    // Snapshot de exams.currentVersion no momento em que essa tentativa foi
    // criada — usado pra contar as 3 tentativas só contra a "geração" atual
    // de perguntas (uma regeneração zera a contagem pra todo mundo).
    questionSetVersion: integer("question_set_version").default(1).notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    score: integer("score"),
    totalQuestions: integer("total_questions"),
    percentage: integer("percentage"), // 0-100
  },
  (t) => [
    index("attempts_exam_idx").on(t.examId),
    index("attempts_employee_idx").on(t.employeeId),
  ],
);

// ---------- Agenda de aplicação (heatmap do gestor) ----------
// Planejamento visual: o gestor marca "no dia X vou aplicar a prova de tal
// IT/APR" pro próprio Contrato. É só um plano/lembrete visto num calendário
// em heatmap — não dispara nada sozinho (não gera prova nem manda link
// automaticamente).
export const examSchedules = pgTable(
  "exam_schedules",
  {
    id: serial("id").primaryKey(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    documentId: integer("document_id").references(() => documents.id, { onDelete: "set null" }),
    // Guarda o nome do documento mesmo se ele for apagado da biblioteca depois.
    documentLabel: varchar("document_label", { length: 300 }).notNull(),
    scheduledDate: date("scheduled_date").notNull(),
    note: varchar("note", { length: 300 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("exam_schedules_sector_date_idx").on(t.sectorId, t.scheduledDate)],
);

// ---------- Respostas ----------
export const answers = pgTable(
  "answers",
  {
    id: serial("id").primaryKey(),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    selectedKey: varchar("selected_key", { length: 5 }),
    correct: boolean("correct").notNull(),
  },
  (t) => [
    index("answers_attempt_idx").on(t.attemptId),
    index("answers_question_idx").on(t.questionId),
  ],
);

// ---------- Relations ----------
export const sectorsRelations = relations(sectors, ({ many }) => ({
  employees: many(employees),
  exams: many(exams),
  admins: many(admins),
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  sector: one(sectors, { fields: [documents.sectorId], references: [sectors.id] }),
  exams: many(exams),
}));

export const adminsRelations = relations(admins, ({ one }) => ({
  sector: one(sectors, { fields: [admins.sectorId], references: [sectors.id] }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  employees: many(employees),
  exams: many(exams),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  sector: one(sectors, { fields: [employees.sectorId], references: [sectors.id] }),
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
  attempts: many(attempts),
  tempCodeExam: one(exams, { fields: [employees.tempCodeExamId], references: [exams.id] }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  questions: many(questions),
  attempts: many(attempts),
  links: many(examLinks),
  sector: one(sectors, { fields: [exams.sectorId], references: [sectors.id] }),
  role: one(roles, { fields: [exams.roleId], references: [roles.id] }),
  document: one(documents, { fields: [exams.documentId], references: [documents.id] }),
}));

export const examLinksRelations = relations(examLinks, ({ one, many }) => ({
  exam: one(exams, { fields: [examLinks.examId], references: [exams.id] }),
  targetEmployee: one(employees, { fields: [examLinks.targetEmployeeId], references: [employees.id] }),
  attempts: many(attempts),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  exam: one(exams, { fields: [questions.examId], references: [exams.id] }),
  answers: many(answers),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  exam: one(exams, { fields: [attempts.examId], references: [exams.id] }),
  employee: one(employees, { fields: [attempts.employeeId], references: [employees.id] }),
  examLink: one(examLinks, { fields: [attempts.examLinkId], references: [examLinks.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, { fields: [answers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));

export const examSchedulesRelations = relations(examSchedules, ({ one }) => ({
  sector: one(sectors, { fields: [examSchedules.sectorId], references: [sectors.id] }),
  document: one(documents, { fields: [examSchedules.documentId], references: [documents.id] }),
}));
