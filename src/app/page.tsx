"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { getContractBranding } from "@/lib/contractBranding";

type Sector = { id: number; name: string };

function ContractTile({ sector }: { sector: Sector }) {
  const branding = getContractBranding(sector.name);

  return (
    <Link
      href="/admin/login"
      className="group flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex h-16 w-full items-center justify-center">
        {branding.kind === "client" && (
          <Image
            src={branding.logoSrc}
            alt={branding.clientName}
            width={140}
            height={56}
            className="max-h-14 w-auto object-contain"
          />
        )}
        {branding.kind === "combo" && (
          <div className="relative flex h-16 w-full items-center justify-center">
            <Image
              src="/logos/triunfo_mark.png"
              alt="Triunfo"
              width={52}
              height={52}
              className="h-12 w-12 object-contain"
            />
            <Image
              src={branding.logoSrc}
              alt={branding.clientName}
              width={40}
              height={40}
              className="absolute -bottom-1 -right-1 h-6 w-auto rounded bg-white object-contain ring-2 ring-white"
            />
          </div>
        )}
        {branding.kind === "triunfo" && (
          <Image
            src="/logos/triunfo_mark.png"
            alt="Triunfo"
            width={52}
            height={52}
            className="h-12 w-12 object-contain"
          />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">{sector.name}</p>
        {branding.kind === "client" && (
          <p className="text-xs text-slate-400">{branding.clientName}</p>
        )}
        {branding.kind === "combo" && <p className="text-xs text-slate-400">{branding.clientName}</p>}
        <p className="mt-1 text-xs font-medium text-slate-400 group-hover:text-slate-600">
          login do gestor →
        </p>
      </div>
    </Link>
  );
}

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
    <div className="flex flex-1 flex-col items-center bg-slate-50 px-6 py-14">
      <div className="w-full max-w-4xl text-center">
        <Image
          src="/logos/triunfo_full.png"
          alt="Triunfo Logística"
          width={160}
          height={134}
          className="mx-auto h-24 w-auto"
          priority
        />
        <h1 className="mt-4 text-2xl font-semibold text-slate-900">Triunfo Skill</h1>
        <p className="mt-1 text-sm text-slate-500">
          Sistema de avaliação de competências operacionais — provas de múltipla escolha geradas a
          partir de IT (Instrução de Trabalho) e APR (Análise Preliminar de Risco), organizadas por
          Contrato e Função.
        </p>

        <div className="mt-10 text-left">
          <h2 className="text-sm font-semibold text-slate-700">Contratos</h2>
          <p className="mt-1 text-xs text-slate-500">
            Acesso do gestor: gere a prova do dia e acompanhe os resultados do seu Contrato.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {loading ? (
              <p className="text-sm text-slate-400">Carregando contratos...</p>
            ) : sectors.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum contrato cadastrado ainda.</p>
            ) : (
              sectors.map((s) => <ContractTile key={s.id} sector={s} />)
            )}
          </div>
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Simulados</h2>
          <p className="mt-1 text-xs text-slate-500">
            Qualquer colaborador pode escolher o Contrato, a Função e o tipo de documento (IT ou
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
