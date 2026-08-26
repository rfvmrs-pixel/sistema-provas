"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getContractBranding } from "@/lib/contractBranding";

type Sector = { id: number; name: string };

// Ordem manual dos cartões de Contrato na tela de abertura — os "BR"
// (Petrobras: ARM RIO/LON1/LON2) ficam juntos, com EQUINOR e SPOT logo ao
// lado. Quem não está na lista entra depois, na ordem que vier da API.
const SECTOR_ORDER = ["ARM RIO", "LON1", "LON2", "EQUINOR", "SPOT", "MANUTENÇÃO", "PRIME OCEAN", "TPS"];

function sortSectors(sectors: Sector[]): Sector[] {
  const rank = (name: string) => {
    const idx = SECTOR_ORDER.indexOf(name.trim().toUpperCase());
    return idx === -1 ? SECTOR_ORDER.length : idx;
  };
  return [...sectors].sort((a, b) => rank(a.name) - rank(b.name));
}

function ContractTile({ sector, onClick }: { sector: Sector; onClick: (label: string) => void }) {
  const branding = getContractBranding(sector.name);

  return (
    <button
      type="button"
      onClick={() => onClick(sector.name)}
      className="group flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="flex h-24 w-full items-center justify-center">
        {branding.kind === "client" && (
          <Image
            src={branding.logoSrc}
            alt={branding.clientName}
            width={200}
            height={80}
            className="max-h-20 w-auto object-contain"
          />
        )}
        {branding.kind === "combo" && (
          <div className="flex h-24 w-full items-center justify-center gap-3">
            <Image
              src="/logos/triunfo_mark.png"
              alt="Triunfo"
              width={80}
              height={80}
              className="h-16 w-16 object-contain"
            />
            <Image
              src={branding.logoSrc}
              alt={branding.clientName}
              width={100}
              height={80}
              className="max-h-16 w-auto object-contain"
            />
          </div>
        )}
        {branding.kind === "triunfo" && (
          <Image
            src="/logos/triunfo_mark.png"
            alt="Triunfo"
            width={80}
            height={80}
            className="h-16 w-16 object-contain"
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
    </button>
  );
}

// Login inline, na própria tela de abertura — sem navegar pra uma segunda
// página (/admin/login). Clicou num cartão (Contrato, Admin ou Diretoria),
// aparece esse formulário aqui mesmo; "voltar" retorna pros cartões. Só
// depois de autenticar de verdade é que navega pra área protegida (/admin).
function InlineAdminLogin({ onBack, label }: { onBack: () => void; label: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao entrar.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-10 w-full max-w-sm text-left">
      <button
        type="button"
        onClick={onBack}
        className="text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        ← voltar
      </button>
      <form
        onSubmit={handleSubmit}
        className="mt-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <Image
          src="/logos/triunfo_mark.png"
          alt="Triunfo"
          width={40}
          height={40}
          className="mx-auto h-10 w-10"
        />
        <h1 className="mt-3 text-center text-lg font-semibold text-slate-900">Triunfo Skill</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Entre com seu usuário e senha.</p>
        {label && (
          <p className="mt-2 text-center text-xs text-slate-400">
            Acessando: <span className="font-medium text-slate-700">{label}</span>
          </p>
        )}

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Usuário</label>
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Senha</label>
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function HomePage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  // "" = mostrando os cartões; "login" = mostrando o formulário de
  // usuário/senha (mesma tela, sem navegar pra outra página).
  const [view, setView] = useState<"" | "login">("");
  // Qual cartão foi clicado — só pra mostrar "Acessando: X" no formulário;
  // quem realmente define o acesso é a conta (usuário/senha), não isso.
  const [loginLabel, setLoginLabel] = useState("");

  function openLogin(label: string) {
    setLoginLabel(label);
    setView("login");
  }

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((res) => res.json())
      .then((data) => setSectors(data.sectors ?? []))
      .finally(() => setLoading(false));
  }, []);

  const sortedSectors = sortSectors(sectors);

  return (
    <div className="flex flex-1 flex-col items-center bg-slate-50 px-6 py-14">
      <div className="w-full max-w-4xl text-center">
        <Image
          src="/logos/triunfo_full.png"
          alt="Triunfo Logística"
          width={220}
          height={184}
          className="mx-auto h-36 w-auto"
          priority
        />
        <h1 className="mt-5 text-3xl font-semibold text-slate-900">Triunfo Skill</h1>
        <p className="mt-1 text-base font-medium text-slate-600">Avaliação de Competências Operacionais</p>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500">
          Provas de múltipla escolha geradas a partir de IT (Instrução de Trabalho) e APR (Análise
          Preliminar de Risco), organizadas por Contrato e Função.
        </p>
        {view !== "login" && <div className="mx-auto mt-8 h-px w-16 bg-slate-200" />}

        {view === "login" ? (
          <div className="flex justify-center">
            <InlineAdminLogin onBack={() => setView("")} label={loginLabel} />
          </div>
        ) : (
          <>
            <div className="mt-12 text-left">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Contratos
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Acesso do gestor: gere a prova do dia e acompanhe os resultados do seu Contrato.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {loading ? (
                  <p className="text-sm text-slate-400">Carregando contratos...</p>
                ) : sectors.length === 0 ? (
                  <p className="text-sm text-slate-400">Nenhum contrato cadastrado ainda.</p>
                ) : (
                  sortedSectors.map((s) => (
                    <ContractTile key={s.id} sector={s} onClick={openLogin} />
                  ))
                )}
              </div>
            </div>

            {/* Acesso administrativo — separado do grid de Contratos de
                propósito, e depois dele: são perfis diferentes (gestão geral
                e visão só-leitura da empresa toda), não mais um Contrato. */}
            <div className="mt-10 text-left">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Acesso administrativo
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Admin gerencia tudo; Diretoria/Superintendência acompanha todos os Contratos, só
                leitura.
              </p>

              <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-3">
                {/* Login de acesso completo: cria, edita e exclui (Contratos,
                    provas, colaboradores, contas de gestor/Diretoria). */}
                <button
                  type="button"
                  onClick={() => openLogin("Admin")}
                  className="group flex flex-col items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
                >
                  <div className="flex h-16 w-full items-center justify-center">
                    <Image
                      src="/logos/triunfo_mark.png"
                      alt="Admin"
                      width={52}
                      height={52}
                      className="h-12 w-12 object-contain brightness-0 invert"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Admin</p>
                    <p className="text-xs text-slate-400">Gestão completa</p>
                    <p className="mt-1 text-xs font-medium text-slate-400 group-hover:text-white">
                      entrar →
                    </p>
                  </div>
                </button>

                {/* Diretoria / Superintendência — cartão separado do Admin
                    porque a permissão é bem diferente: essas contas só
                    VISUALIZAM todos os Contratos e resultados (não criam, não
                    editam, não excluem nada — bloqueado em requireEditor). O
                    login em si é o mesmo formulário; quem diferencia é a
                    própria conta (criada em Setores > "Contas de Diretoria /
                    Superintendência"). */}
                <button
                  type="button"
                  onClick={() => openLogin("Diretoria")}
                  className="group flex flex-col items-center gap-3 rounded-xl border-2 border-slate-300 bg-white px-4 py-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md"
                >
                  <div className="flex h-16 w-full items-center justify-center">
                    <Image
                      src="/logos/triunfo_mark.png"
                      alt="Diretoria"
                      width={52}
                      height={52}
                      className="h-12 w-12 object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Diretoria</p>
                    <p className="text-xs text-slate-400">Superintendência · somente leitura</p>
                    <p className="mt-1 text-xs font-medium text-slate-400 group-hover:text-slate-600">
                      entrar →
                    </p>
                  </div>
                </button>
              </div>
            </div>

            <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Simulados
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Qualquer colaborador pode escolher o Contrato, a Função e o tipo de documento (IT
                ou APR) e realizar uma prova de treinamento. O resultado também fica registrado.
              </p>
              <Link
                href="/prova"
                className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                Fazer uma prova / simulado
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
