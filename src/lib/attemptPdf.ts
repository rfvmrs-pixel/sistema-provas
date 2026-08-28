import PDFDocument from "pdfkit";
import path from "path";

// Logo da Triunfo (marca quadrada) usada no cabeçalho do PDF — mesmo arquivo
// já usado na tela de login (public/logos/triunfo_mark.png).
const TRIUNFO_LOGO_PATH = path.join(process.cwd(), "public", "logos", "triunfo_mark.png");

// Gera o PDF de uma tentativa (prova) já respondida por um colaborador —
// pedido explícito: o cabeçalho tem que vir com Setor, Nome do Colaborador,
// Função e Data da Prova, nessa ordem, além do resultado e do detalhe de
// cada questão (o que o colaborador marcou x a resposta certa).
export type AttemptPdfQuestion = {
  order: number;
  text: string;
  options: { key: string; text: string }[];
  correctKey: string;
  selectedKey: string | null;
  correct: boolean;
};

export type AttemptPdfData = {
  employeeName: string;
  sectorName: string;
  roleName: string;
  examTitle: string;
  documentType: "IT" | "APR";
  finishedAt: Date | null;
  score: number | null;
  totalQuestions: number | null;
  percentage: number | null;
  passingScore: number;
  mode: string;
  sessionLabel: string | null;
  questions: AttemptPdfQuestion[];
};

function formatDate(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function generateAttemptPdf(data: AttemptPdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Cabeçalho: logo da Triunfo à esquerda e, ao lado, qual IT/APR é essa
  // prova — pedido explícito, pra ficar claro de cara qual documento de
  // origem gerou o comprovante.
  const headerTop = doc.y;
  const logoSize = 42;
  const textX = 50 + logoSize + 14;
  const textWidth = 495 - logoSize - 14;

  try {
    doc.image(TRIUNFO_LOGO_PATH, 50, headerTop, { width: logoSize, height: logoSize });
  } catch {
    // Se o arquivo do logo não existir nesse ambiente, segue só com o texto
    // — não pode travar a geração do comprovante por causa da imagem.
  }

  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .fillColor("#94a3b8")
    .text("TRIUNFO LOGÍSTICA", textX, headerTop, { width: textWidth });
  doc.fontSize(14).font("Helvetica-Bold").fillColor("#0f172a").text(data.examTitle, textX, doc.y, { width: textWidth });
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#64748b")
    .text(
      data.documentType === "APR" ? "APR (Análise Preliminar de Risco)" : "IT (Instrução de Trabalho)",
      textX,
      doc.y,
      { width: textWidth },
    );

  doc.y = Math.max(doc.y, headerTop + logoSize);
  doc.moveDown(1);

  // Campos pedidos: Setor; Nome do Colaborador; Função; Data da Prova
  const fields: [string, string][] = [
    ["Setor", data.sectorName],
    ["Nome do Colaborador", data.employeeName],
    ["Função", data.roleName],
    ["Data da Prova", formatDate(data.finishedAt)],
  ];
  const fieldTop = doc.y;
  const labelWidth = 150;
  for (const [label, value] of fields) {
    const rowY = doc.y;
    doc.fontSize(10).font("Helvetica-Bold").fillColor("#334155").text(`${label}:`, 50, rowY, { width: labelWidth });
    doc.fontSize(10).font("Helvetica").fillColor("#0f172a").text(value, 50 + labelWidth, rowY, {
      width: 495 - labelWidth,
    });
    doc.moveDown(0.4);
  }
  doc
    .moveTo(50, doc.y + 4)
    .lineTo(545, doc.y + 4)
    .strokeColor("#e2e8f0")
    .stroke();
  doc.moveDown(1);
  void fieldTop;

  // Resultado
  const passed = data.percentage !== null && data.percentage >= data.passingScore;
  const resultColor = passed ? "#059669" : "#dc2626";
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Resultado");
  doc.moveDown(0.3);
  doc
    .fontSize(10)
    .font("Helvetica")
    .fillColor("#334155")
    .text(
      `${data.score ?? 0} de ${data.totalQuestions ?? data.questions.length} questões corretas — ` +
        `${data.percentage ?? 0}% de acerto (meta: ${data.passingScore}%)`,
    );
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .fillColor(resultColor)
    .text(passed ? "APROVADO" : "ABAIXO DA META");
  doc
    .fontSize(9)
    .font("Helvetica")
    .fillColor("#94a3b8")
    .text(
      data.mode === "oficial" ? `Aplicação: ${data.sessionLabel || "oficial"}` : "Aplicação: simulado/treinamento",
    );
  doc.moveDown(1.2);

  // Questões
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text("Questões");
  doc.moveDown(0.5);

  data.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .forEach((q, idx) => {
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor("#0f172a")
        .text(`${idx + 1}. ${q.text}`, { width: 495 });
      doc.moveDown(0.2);

      q.options.forEach((opt) => {
        const isCorrect = opt.key === q.correctKey;
        const isSelected = opt.key === q.selectedKey;
        let prefix = "   ";
        let color = "#475569";
        if (isCorrect) {
          prefix = " ✓ ";
          color = "#059669";
        }
        if (isSelected && !isCorrect) {
          prefix = " ✗ ";
          color = "#dc2626";
        }
        doc
          .fontSize(9.5)
          .font(isCorrect || isSelected ? "Helvetica-Bold" : "Helvetica")
          .fillColor(color)
          .text(`${prefix}${opt.key}) ${opt.text}`, { width: 490, indent: 10 });
      });

      if (!q.selectedKey) {
        doc.fontSize(9).font("Helvetica-Oblique").fillColor("#94a3b8").text("   Não respondida.", { indent: 10 });
      }

      doc.moveDown(0.7);
    });

  doc.end();
  return done;
}
