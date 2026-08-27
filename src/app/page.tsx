"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getContractBranding } from "@/lib/contractBranding";

const TRIUNFO_MARK = "/logos/triunfo_mark.png";
const TRIUNFO_FULL = "/logos/triunfo_full.png";

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
              src={TRIUNFO_MARK}
              alt="Triunfo"
              width={100}
              height={100}
              className="h-20 w-20 object-contain"
            />
            <Image
              src={branding.logoSrc}
              alt={branding.clientName}
              width={80}
              height={56}
              className="max-h-11 w-auto object-contain"
            />
          </div>
        )}
        {branding.kind === "triunfo" && (
          <Image
            src={TRIUNFO_MARK}
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
          src={TRIUNFO_MARK}
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
          src={TRIUNFO_FULL}
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

              <div className="mx-auto mt-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Login de acesso completo: cria, edita e exclui (Contratos,
                    provas, colaboradores, contas de gestor/Diretoria). */}
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-900 px-6 py-7 text-center shadow-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-7 w-7 text-white">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10 17.75H7.75v2.25H5.5v2.25H2v-3l5.408-5.408c.403-.404.526-1 .429-1.563a6 6 0 0 1 7.913-6.729Z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Admin</p>
                    <p className="text-xs text-slate-400">Gestão completa</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openLogin("Admin")}
                    className="mt-1 rounded-full bg-white px-5 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
                  >
                    Acessar Admin
                  </button>
                </div>

                {/* Diretoria / Superintendência — cartão separado do Admin
                    porque a permissão é bem diferente: essas contas só
                    VISUALIZAM todos os Contratos e resultados (não criam, não
                    editam, não excluem nada — bloqueado em requireEditor). O
                    login em si é o mesmo formulário; quem diferencia é a
                    própria conta (criada em Setores > "Contas de Diretoria /
                    Superintendência"). */}
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-7 text-center shadow-sm">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-7 w-7 text-slate-500">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                      />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Diretoria</p>
                    <p className="text-xs text-slate-500">Superintendência · somente leitura</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openLogin("Diretoria")}
                    className="mt-1 rounded-full border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    Acessar Visualização
                  </button>
                </div>
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
