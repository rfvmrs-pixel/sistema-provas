import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, sectors, roles, questions } from "@/db/schema";
import { requireAdmin, canAccessSector } from "@/lib/requireAdmin";
import { generateBlankExamPdf } from "@/lib/attemptPdf";

export const maxDuration = 30;

// GET: exporta a prova em branco (sem gabarito) pra impressão/aplicação
// manual em papel — Contrato e Função no cabeçalho, campos em branco pra
// Nome/Matrícula/Data, e as questões com caixinhas de marcar.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const [sector, role, examQuestions] = await Promise.all([
    db.query.sectors.findFirst({ where: eq(sectors.id, exam.sectorId) }),
    exam.roleId ? db.query.roles.findFirst({ where: eq(roles.id, exam.roleId) }) : Promise.resolve(undefined),
    db
      .select({ id: questions.id, order: questions.order, text: questions.text, options: questions.options })
      .from(questions)
      .where(eq(questions.examId, examId))
      .orderBy(asc(questions.order)),
  ]);

  if (examQuestions.length === 0) {
    return NextResponse.json({ error: "Essa prova ainda não tem questões." }, { status: 400 });
  }

  const documentType = exam.documentType === "APR" || exam.documentType === "MANUAL" ? exam.documentType : "IT";

  const pdfBuffer = await generateBlankExamPdf({
    examTitle: exam.title,
    sectorName: sector?.name ?? "",
    roleName: role?.name ?? "",
    documentType,
    questions: examQuestions.map((q) => ({
      order: q.order,
      text: q.text,
      options: q.options as unknown as { key: string; text: string }[],
    })),
  });

  const safeTitle = exam.title.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="prova-em-branco-${safeTitle}.pdf"`,
    },
  });
}
