"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Sector = { id: number; name: string };

export default function HomePage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((res) => res.json())
      .then((data) => setSectors(data.sectors ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-3xl text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Sistema de Avaliação de Processo</h1>
        <p className="mt-2 text-sm text-slate-500">
          Provas de múltipla escolha geradas a partir de IT (Instrução de Trabalho) e APR (Análise
          Preliminar de Risco), organizadas por contrato e função.
        </p>

        <div className="mt-10 text-left">
          <h2 className="text-sm font-semibold text-slate-700">Contratos</h2>
          <p className="mt-1 text-xs text-slate-500">
            Acesso do gestor: gere a prova do dia e acompanhe os resultados do seu contrato.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {loading ? (
              <p className="text-sm text-slate-400">Carregando contratos...</p>
            ) : sectors.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum contrato cadastrado ainda.</p>
            ) : (
              sectors.map((s) => (
                <Link
                  key={s.id}
                  href="/admin/login"
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-100"
                >
                  {s.name}
                  <span className="text-xs font-normal text-slate-400">login do gestor →</span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Simulados</h2>
          <p className="mt-1 text-xs text-slate-500">
            Qualquer colaborador pode escolher o contrato, a função e o tipo de documento (IT ou
            APR) e realizar uma prova de treinamento. O resultado também fica registrado.
          </p>
          <Link
            href="/prova"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Fazer uma prova / simulado
          </Link>
        </div>

        <div className="mt-6">
          <Link href="/admin/login" className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
            Acesso do administrador geral
          </Link>
        </div>
      </div>
    </div>
  );
}
