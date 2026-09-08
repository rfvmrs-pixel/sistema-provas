import { NextResponse } from "next/server";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { exams, questions, attempts } from "@/db/schema";
import { requireEditor, canAccessSector } from "@/lib/requireAdmin";
import { shuffleQuestionOptions } from "@/lib/ai";

// Reembaralha a posição das alternativas (A/B/C/D) de todas as questões de
// uma prova já gerada — corrige o viés de "a resposta certa é quase sempre
// a B" em provas geradas antes do ajuste em lib/ai.ts. SÓ é permitido se a
// prova ainda não tem nenhuma tentativa respondida: mudar a ordem depois
// que alguém já respondeu bagunçaria o que answers.selectedKey significa
// retroativamente (ex.: no PDF exportado de uma tentativa antiga). Se já
// tem tentativa, a saída é gerar uma nova versão (POST /api/admin/exams).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireEditor();
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  const examId = Number(id);

  const exam = await db.query.exams.findFirst({ where: eq(exams.id, examId) });
  if (!exam) return NextResponse.json({ error: "Prova não encontrada." }, { status: 404 });
  if (!canAccessSector(guard.admin, exam.sectorId)) {
    return NextResponse.json({ error: "Você não tem acesso a essa prova." }, { status: 403 });
  }

  const [{ value: attemptCount }] = await db
    .select({ value: count(attempts.id) })
    .from(attempts)
    .where(eq(attempts.examId, examId));

  if (Number(attemptCount) > 0) {
    return NextResponse.json(
      {
        error:
          "Essa prova já tem tentativa respondida — reembaralhar agora bagunçaria o histórico de quem já fez. Gere uma nova versão em vez disso.",
      },
      { status: 400 },
    );
  }

  const examQuestions = await db.select().from(questions).where(eq(questions.examId, examId));
  if (examQuestions.length === 0) {
    return NextResponse.json({ error: "Essa prova não tem questões." }, { status: 400 });
  }

  await Promise.all(
    examQuestions.map((q) => {
      const shuffled = shuffleQuestionOptions({
        options: q.options as { key: string; text: string }[],
        correctKey: q.correctKey,
      });
      return db
        .update(questions)
        .set({ options: shuffled.options, correctKey: shuffled.correctKey })
        .where(eq(questions.id, q.id));
    }),
  );

  return NextResponse.json({ ok: true });
}
