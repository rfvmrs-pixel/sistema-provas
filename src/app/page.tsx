import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Sistema de Provas</h1>
        <p className="mt-2 text-sm text-slate-500">
          Provas online geradas a partir de material de treinamento, com histórico de
          desempenho por setor, funcionário e função.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/prova"
            className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
          >
            Fazer uma prova
          </Link>
          <Link
            href="/admin"
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Área do administrador
          </Link>
        </div>
      </div>
    </div>
  );
}
