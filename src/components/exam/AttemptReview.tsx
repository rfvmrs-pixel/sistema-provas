type Option = { key: string; text: string };
export type ReviewItem = {
  questionId: number;
  text: string;
  options: Option[];
  correctKey: string;
  selectedKey: string | null;
  correct: boolean;
  explanation: string | null;
  topic: string | null;
};

// Lista de questões com a alternativa correta destacada e a escolhida pelo
// colaborador — usada tanto na tela de resultado logo após finalizar a prova
// (ExamRunner) quanto em "Minhas provas" (revisão de uma tentativa antiga).
export function AttemptReview({ items }: { items: ReviewItem[] }) {
  return (
    <ol className="space-y-4">
      {items.map((r, idx) => (
        <li key={r.questionId} className="border-t border-slate-100 pt-3 first:border-0 first:pt-0">
          <p className="text-sm font-medium text-slate-800">
            {idx + 1}. {r.text}
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {r.options.map((opt) => {
              const isCorrect = opt.key === r.correctKey;
              const isSelected = opt.key === r.selectedKey;
              return (
                <li
                  key={opt.key}
                  className={
                    isCorrect
                      ? "font-medium text-emerald-700"
                      : isSelected
                        ? "font-medium text-red-600"
                        : "text-slate-500"
                  }
                >
                  {opt.key}) {opt.text}
                  {isCorrect && " ✓"}
                  {isSelected && !isCorrect && " (sua resposta)"}
                </li>
              );
            })}
          </ul>
          {r.explanation && <p className="mt-1 text-xs text-slate-400">{r.explanation}</p>}
        </li>
      ))}
    </ol>
  );
}
