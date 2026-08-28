import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { roles } from "@/db/schema";

// Rota pública (sem login) — usada na tela de Simulado (autosserviço) pra
// preencher o campo Função. Função é só um dado do cadastro do colaborador
// (e do indicador de auditoria pelas provas oficiais role-scoped criadas
// pelo admin) — não filtra mais quais IT/APR aparecem pra praticar: o
// Simulado gera a prova na hora, via IA, direto do IT/APR escolhido, e vale
// pra qualquer Função. Por isso aqui devolvemos todas as Funções cadastradas,
// sem depender de existir prova pra elas em nenhum Contrato.
export async function GET() {
  const rows = await db.select({ id: roles.id, name: roles.name }).from(roles).orderBy(asc(roles.name));
  return NextResponse.json({ roles: rows });
}
