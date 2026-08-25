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

// ---------- Admins ----------
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ---------- Setores ----------
export const sectors = pgTable("sectors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull().unique(),
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // mesmo nome pode existir em setores diferentes, mas não duplicado dentro do setor
    uniqueIndex("employees_name_sector_unique").on(t.name, t.sectorId),
    index("employees_sector_idx").on(t.sectorId),
    index("employees_role_idx").on(t.roleId),
  ],
);

// ---------- Provas ----------
export const exams = pgTable("exams", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 250 }).notNull(),
  sourceFileName: varchar("source_file_name", { length: 300 }),
  summary: text("summary"),
  active: boolean("active").default(true).notNull(),
  passingScore: integer("passing_score").default(70).notNull(), // % mínimo p/ considerar aprovado
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  employees: many(employees),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  sector: one(sectors, { fields: [employees.sectorId], references: [sectors.id] }),
  role: one(roles, { fields: [employees.roleId], references: [roles.id] }),
  attempts: many(attempts),
}));

export const examsRelations = relations(exams, ({ many }) => ({
  questions: many(questions),
  attempts: many(attempts),
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
