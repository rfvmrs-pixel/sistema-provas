import ExcelJS from "exceljs";
import { TENURE_OPTIONS, tenureLabel } from "@/lib/tenure";

// Colunas fixas da planilha de importação de funcionários — nessa ordem.
export const EMPLOYEE_IMPORT_HEADERS = ["Nome", "Matrícula", "Setor", "Função", "Tempo de empresa"] as const;

type SectorLite = { id: number; name: string };
type RoleLite = { id: number; name: string };

// Gera a planilha modelo: aba principal com os cabeçalhos + uma linha de
// exemplo, e uma aba "Referência" listando os Setores, Funções e opções de
// Tempo de empresa válidos hoje no sistema — pra quem for preencher saber
// exatamente o que digitar (o texto tem que bater com o nome cadastrado).
export async function generateEmployeeTemplate(sectors: SectorLite[], roles: RoleLite[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Triunfo Skill";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Funcionários");
  sheet.columns = [
    { header: "Nome", key: "name", width: 30 },
    { header: "Matrícula", key: "matricula", width: 16 },
    { header: "Setor", key: "sector", width: 20 },
    { header: "Função", key: "role", width: 22 },
    { header: "Tempo de empresa", key: "tenure", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    name: "Maria da Silva",
    matricula: "12345",
    sector: sectors[0]?.name ?? "",
    role: roles[0]?.name ?? "",
    tenure: TENURE_OPTIONS[0].label,
  });

  const ref = workbook.addWorksheet("Referência");
  ref.getCell("A1").value = "Setores válidos";
  ref.getCell("A1").font = { bold: true };
  sectors.forEach((s, i) => {
    ref.getCell(`A${i + 2}`).value = s.name;
  });

  ref.getCell("C1").value = "Funções válidas";
  ref.getCell("C1").font = { bold: true };
  roles.forEach((r, i) => {
    ref.getCell(`C${i + 2}`).value = r.name;
  });

  ref.getCell("E1").value = "Tempo de empresa válido";
  ref.getCell("E1").font = { bold: true };
  TENURE_OPTIONS.forEach((t, i) => {
    ref.getCell(`E${i + 2}`).value = t.label;
  });
  ref.columns = [{ width: 22 }, {}, { width: 22 }, {}, { width: 22 }];

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export type ParsedEmployeeRow = {
  rowNumber: number;
  name: string;
  matricula: string;
  sectorName: string;
  roleName: string;
  tenureLabelRaw: string;
};

// Lê a primeira aba da planilha enviada e devolve as linhas em bruto (ainda
// sem validar contra Setor/Função existentes — isso fica pra quem chama,
// que tem acesso ao banco). rowNumber é a linha da planilha (1-based, já
// contando o cabeçalho) pra dar erro específico se algo estiver errado.
export async function parseEmployeeImportFile(buffer: Buffer): Promise<ParsedEmployeeRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: ParsedEmployeeRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // cabeçalho
    const cellText = (v: ExcelJS.CellValue) => (v === null || v === undefined ? "" : String(v).trim());
    const name = cellText(row.getCell(1).value);
    const matricula = cellText(row.getCell(2).value);
    const sectorName = cellText(row.getCell(3).value);
    const roleName = cellText(row.getCell(4).value);
    const tenureLabelRaw = cellText(row.getCell(5).value);
    if (!name && !matricula && !sectorName && !roleName) return; // linha em branco
    rows.push({ rowNumber, name, matricula, sectorName, roleName, tenureLabelRaw });
  });
  return rows;
}

// Planilha guarda o rótulo ("1 a 3 anos"), banco guarda o código ("1-3a") —
// essa função faz a volta. Aceita também o próprio código, caso alguém
// preencha direto.
export function tenureCodeFromLabel(value: string): string | null {
  if (!value) return null;
  const found = TENURE_OPTIONS.find(
    (o) => o.label.toLowerCase() === value.toLowerCase() || o.value.toLowerCase() === value.toLowerCase(),
  );
  return found?.value ?? null;
}

export { tenureLabel };
