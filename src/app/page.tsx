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

// Contas de Diretoria/Superintendência com grupo de Contratos fixo (ver
// src/scripts/seed-directors.ts — são essas 3 contas que o boot script cria).
// Só pra mostrar um cartão específico por grupo na tela de abertura; quem
// autentica de verdade é usuário/senha, não esse rótulo.
const DIRETORIA_GROUPS = [
  { label: "Diretoria de Operações", contracts: "ARM RIO, TPS, SPOT, EQUINOR" },
  { label: "Diretoria LON1/LON2", contracts: "LON1, LON2" },
  { label: "Diretoria Prime Ocean", contracts: "PRIME OCEAN" },
];

// ---- Ícones (SVG inline, sem dependência nova) ----

function IconHamburger({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      {open ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      )}
    </svg>
  );
}

function IconSearch({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
      />
    </svg>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0" />
    </svg>
  );
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
      />
    </svg>
  );
}

function IconGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
      />
    </svg>
  );
}

function IconGear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.397-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
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
        {(branding.kind === "client" || branding.kind === "combo") && (
          <p className="text-xs text-slate-400">{branding.clientName}</p>
        )}
        <span className="mt-2 inline-block rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition group-hover:bg-slate-700">
          Acessar Gestão
        </span>
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

const NAV_LINKS = [
  { id: "painel", label: "Painel" },
  { id: "contratos", label: "Contratos" },
  { id: "acesso-administrativo", label: "Relatórios" },
  { id: "simulados", label: "Ajuda" },
];

export default function HomePage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  // "" = mostrando os cartões; "login" = mostrando o formulário de
  // usuário/senha (mesma tela, sem navegar pra outra página).
  const [view, setView] = useState<"" | "login">("");
  // Qual cartão foi clicado — só pra mostrar "Acessando: X" no formulário;
  // quem realmente define o acesso é a conta (usuário/senha), não isso.
  const [loginLabel, setLoginLabel] = useState("");
  // Busca por nome de Contrato — usada tanto na barra superior quanto na
  // seção Contratos (as duas caixas de busca compartilham o mesmo estado).
  const [search, setSearch] = useState("");
  const [navOpen, setNavOpen] = useState(false);

  function openLogin(label: string) {
    setLoginLabel(label);
    setView("login");
    setNavOpen(false);
  }

  function scrollToSection(id: string) {
    setNavOpen(false);
    if (view === "login") setView("");
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  useEffect(() => {
    fetch("/api/public/sectors")
      .then((res) => res.json())
      .then((data) => setSectors(data.sectors ?? []))
      .finally(() => setLoading(false));
  }, []);

  const sortedSectors = sortSectors(sectors);
  const filteredSectors = search.trim()
    ? sortedSectors.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : sortedSectors;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      {/* Barra superior */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-900 text-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              aria-label={navOpen ? "Fechar menu" : "Abrir menu"}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-300 hover:bg-white/10 lg:hidden"
            >
              <IconHamburger open={navOpen} className="h-5 w-5" />
            </button>
            <Image
              src={TRIUNFO_MARK}
              alt=""
              width={22}
              height={22}
              className="hidden shrink-0 brightness-0 invert sm:block"
            />
            <span className="truncate text-sm font-semibold">Triunfo Skill</span>
            <nav className="ml-4 hidden gap-1 lg:flex">
              {NAV_LINKS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white"
                >
                  {item.label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <label className="relative hidden sm:block">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca de contratos"
                className="w-40 rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-slate-500 focus:outline-none md:w-60"
              />
            </label>
            <button
              type="button"
              aria-label="Notificações"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 hover:bg-white/10"
            >
              <IconBell className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("acesso-administrativo")}
              aria-label="Acesso administrativo"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-slate-200 hover:bg-slate-600"
            >
              <IconUser className="h-4 w-4" />
            </button>
          </div>
        </div>
        {navOpen && (
          <nav className="flex flex-col gap-1 border-t border-slate-800 px-4 py-3 lg:hidden">
            {NAV_LINKS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollToSection(item.id)}
                className="rounded-md px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </button>
            ))}
            <label className="relative mt-1 block sm:hidden">
              <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca de contratos"
                className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-8 pr-3 text-xs text-white placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
              />
            </label>
          </nav>
        )}
      </header>

      <div className="flex flex-1">
        {/* Barra lateral de ícones — só desktop; no celular os mesmos atalhos
            já estão no menu hambúrguer acima. */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-14 shrink-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-4 lg:flex">
          <button
            type="button"
            onClick={() => scrollToSection("painel")}
            aria-label="Painel"
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700"
          >
            <IconHome className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("contratos")}
            aria-label="Contratos"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <IconGrid className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => scrollToSection("acesso-administrativo")}
            aria-label="Acesso administrativo"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <IconGear className="h-5 w-5" />
          </button>
        </aside>

        <main className="flex flex-1 justify-center px-4 py-8 sm:px-6 sm:py-10">
          <div id="painel" className="w-full max-w-4xl scroll-mt-20">
            {view === "login" ? (
              <div className="flex justify-center">
                <InlineAdminLogin onBack={() => setView("")} label={loginLabel} />
              </div>
            ) : (
              <>
                {/* Cartão de boas-vindas */}
                <div className="flex flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-8 sm:text-left">
                  <div>
                    <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
                      Bem-vindo ao Triunfo Skill
                    </h1>
                    <p className="mt-2 max-w-xl text-sm text-slate-500">
                      Avaliação de Competências Operacionais e Gerenciamento de Provas de Múltipla
                      Escolha, geradas a partir de IT (Instrução de Trabalho) e APR (Análise
                      Preliminar de Risco), organizadas por Contrato e Função.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <Image
                      src={TRIUNFO_FULL}
                      alt="Triunfo Logística"
                      width={160}
                      height={134}
                      className="h-24 w-auto"
                      priority
                    />
                    <span className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Versão 2.1
                    </span>
                  </div>
                </div>

                {/* Contratos */}
                <div id="contratos" className="mt-8 scroll-mt-20 text-left">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                        Contratos
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Acesso do gestor: gere a prova do dia e acompanhe os resultados do seu Contrato.
                      </p>
                    </div>
                    <label className="relative sm:w-64">
                      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Busca de contratos"
                        className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                      />
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {loading ? (
                      <p className="text-sm text-slate-400">Carregando contratos...</p>
                    ) : sectors.length === 0 ? (
                      <p className="text-sm text-slate-400">Nenhum contrato cadastrado ainda.</p>
                    ) : filteredSectors.length === 0 ? (
                      <p className="text-sm text-slate-400">
                        Nenhum contrato encontrado para &quot;{search}&quot;.
                      </p>
                    ) : (
                      filteredSectors.map((s) => (
                        <ContractTile key={s.id} sector={s} onClick={openLogin} />
                      ))
                    )}
                  </div>
                </div>

                {/* Acesso administrativo — separado do grid de Contratos de
                    propósito: são perfis diferentes (gestão geral e visão
                    só-leitura da empresa/grupo de Contratos), não um Contrato
                    em si. Um cartão de Admin + um cartão por grupo de
                    Diretoria/Superintendência (ver seed-directors.ts). */}
                <div id="acesso-administrativo" className="mt-10 scroll-mt-20 text-left">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Acesso administrativo
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Admin gerencia tudo; cada Diretoria/Superintendência acompanha o seu grupo de
                    Contratos, só leitura.
                  </p>

                  <div className="mx-auto mt-4 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Login de acesso completo: cria, edita e exclui (Contratos,
                        provas, colaboradores, contas de gestor/Diretoria). */}
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-900 px-6 py-7 text-center shadow-sm">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">
                        <Image
                          src={TRIUNFO_MARK}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 object-contain brightness-0 invert"
                        />
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
                        VISUALIZAM os Contratos do seu grupo e os resultados
                        deles (não criam, não editam, não excluem nada —
                        bloqueado em requireEditor). O login em si é o mesmo
                        formulário; quem diferencia o grupo é a própria conta
                        (usuário/senha), não o cartão clicado. */}
                    {DIRETORIA_GROUPS.map((group) => (
                      <div
                        key={group.label}
                        className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-7 text-center shadow-sm"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200">
                          <Image
                            src={TRIUNFO_MARK}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{group.label}</p>
                          <p className="text-xs text-slate-500">{group.contracts}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => openLogin(group.label)}
                          className="mt-1 rounded-full border border-slate-300 bg-white px-5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          Acessar Visualização
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  id="simulados"
                  className="mt-10 scroll-mt-20 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm"
                >
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Provas e Simulados
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Dois jeitos de acessar, cada um com seu próprio botão — cada prova tem no máximo
                    10 minutos para ser respondida.
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <h3 className="text-sm font-semibold text-slate-900">Simulado</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Sem senha. Informe nome, matrícula, Contrato e Função, e escolha livremente
                        qual IT ou APR quer praticar.
                      </p>
                      <Link
                        href="/simulado"
                        className="mt-3 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
                      >
                        Fazer um Simulado
                      </Link>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                      <h3 className="text-sm font-semibold text-slate-900">Prova oficial</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Com sua senha pessoal ou o código da prova do dia passado pelo seu gestor. O
                        resultado fica registrado nos relatórios.
                      </p>
                      <Link
                        href="/prova"
                        className="mt-3 inline-block rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Fazer prova oficial
                      </Link>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
