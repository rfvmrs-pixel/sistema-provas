import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { employees, sectors, roles } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { hashPassword } from "@/lib/password";
import { generateLinkToken } from "@/lib/token";
import { parseEmployeeImportFile, tenureCodeFromLabel } from "@/lib/employeeTemplate";

type ImportError = { row: number; message: string };

// POST multipart/form-data (campo "file"): planilha preenchida a partir do
// modelo de /api/admin/employees/template. Cada linha vira um
// criar-ou-atualizar funcionário por Matrícula+Setor (mesma regra de
// identidade usada no autocadastro por link/simulado — ver
// /api/public/exam-links/[token]/register). Funcionário novo entra com uma
// senha aleatória (ninguém vai logar por ela; quem precisar de acesso por
// senha, o gestor redefine depois na tela de Funcionários).
export async function POST(request: NextRequest) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Envie o arquivo da planilha (.xlsx)." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  let rows;
  try {
    rows = await parseEmployeeImportFile(Buffer.from(arrayBuffer));
  } catch {
    return NextResponse.json(
      { error: "Não consegui ler esse arquivo. Confira se é o .xlsx do modelo, sem estar corrompido." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "A planilha está vazia." }, { status: 400 });
  }

  const [allSectors, allRoles] = await Promise.all([db.select().from(sectors), db.select().from(roles)]);
  const sectorByName = new Map(allSectors.map((s) => [s.name.trim().toLowerCase(), s]));
  const roleByName = new Map(allRoles.map((r) => [r.name.trim().toLowerCase(), r]));

  let created = 0;
  let updated = 0;
  const errors: ImportError[] = [];

  for (const row of rows) {
    if (!row.name) {
      errors.push({ row: row.rowNumber, message: "Nome em branco." });
      continue;
    }
    if (!row.matricula) {
      errors.push({ row: row.rowNumber, message: "Matrícula em branco (obrigatória na importação)." });
      continue;
    }
    const sector = sectorByName.get(row.sectorName.trim().toLowerCase());
    if (!sector) {
      errors.push({ row: row.rowNumber, message: `Setor "${row.sectorName}" não encontrado.` });
      continue;
    }
    if (!canAccessSector(guard.admin, sector.id)) {
      errors.push({ row: row.rowNumber, message: `Você não tem permissão para cadastrar no Setor "${sector.name}".` });
      continue;
    }
    const role = roleByName.get(row.roleName.trim().toLowerCase());
    if (!role) {
      errors.push({ row: row.rowNumber, message: `Função "${row.roleName}" não encontrada.` });
      continue;
    }
    let tenureCode: string | null = null;
    if (row.tenureLabelRaw) {
      tenureCode = tenureCodeFromLabel(row.tenureLabelRaw);
      if (!tenureCode) {
        errors.push({
          row: row.rowNumber,
          message: `Tempo de empresa "${row.tenureLabelRaw}" não reconhecido (use um dos valores da aba Referência, ou deixe em branco).`,
        });
        continue;
      }
    }

    const existing = await db.query.employees.findFirst({
      where: and(eq(employees.sectorId, sector.id), eq(employees.matricula, row.matricula)),
    });

    if (existing) {
      await db
        .update(employees)
        .set({ name: row.name, roleId: role.id, tempoDeEmpresa: tenureCode, active: true })
        .where(eq(employees.id, existing.id));
      updated++;
    } else {
      const randomPasswordHash = await hashPassword(generateLinkToken());
      await db.insert(employees).values({
        name: row.name,
        matricula: row.matricula,
        sectorId: sector.id,
        roleId: role.id,
        tempoDeEmpresa: tenureCode,
        passwordHash: randomPasswordHash,
        active: true,
      });
      created++;
    }
  }

  return NextResponse.json({ created, updated, errors, totalRows: rows.length });
}
