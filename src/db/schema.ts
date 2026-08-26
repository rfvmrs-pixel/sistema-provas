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
    index("employees_sector_idx").on(t.sectorId),
    index("employees_role_idx").on(t.roleId),
  ],
);

// ---------- Biblioteca de documentos (PDFs de IT/APR) ----------
// O gestor sobe o PDF uma vez, identificando só o Contrato. Fica salvo aqui
// (texto extraído + arquivo original em base64) e pode ser reaproveitado
// depois pra gerar quantas provas quiser (funções e quantidades diferentes),
// sem precisar subir o arquivo de novo. Função e Tipo (IT/APR) só são
// escolhidos na hora de gerar a prova a partir do documento.
export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    fileName: varchar("file_name", { length: 300 }).notNull(),
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
    // "oficial"   -> "prova do dia": acesso via código de uso único gerado pelo
    //                gestor para aquela aplicação. Resultado só sai nos
    //                relatórios do admin/gestor (o colaborador não tem login
    //                persistente para consultar depois).
    mode: varchar("mode", { length: 20 }).default("simulado").notNull(),
    sessionLabel: varchar("session_label", { length: 150 }), // rótulo da "prova do dia", quando mode = oficial
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
  sector: one(sectors, { fields: [exams.sectorId], references: [sectors.id] }),
  role: one(roles, { fields: [exams.roleId], references: [roles.id] }),
  document: one(documents, { fields: [exams.documentId], references: [documents.id] }),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  exam: one(exams, { fields: [questions.examId], references: [exams.id] }),
  answers: many(answers),
}));

export const attemptsRelations = relations(attempts, ({ one, many }) => ({
  exam: one(exams, { fields: [attempts.examId], references: [exams.id] }),
  employee: one(employees, { fields: [attempts.employeeId], references: [employees.id] }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, { fields: [answers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));
