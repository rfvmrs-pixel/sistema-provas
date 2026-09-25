"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import LogoutButton from "./logout-button";

type NavItem = { href: string; label: string };

// Cabeçalho do painel admin. Em telas largas (sm+) mostra tudo numa linha só
// (como antes); em celular, some com o menu/usuário/sair e mostra um botão
// de hambúrguer que abre um painel dobrado com tudo empilhado — sem isso a
// barra de navegação (Painel, Biblioteca, Provas, Funcionários, Funções,
// Contratos + usuário + sair) não cabe na largura de um celular.
export function AdminHeader({
  navItems,
  badgeText,
  username,
  isAdmin,
  isReadOnly,
  readOnlyLabel,
}: {
  navItems: NavItem[];
  badgeText: string | null;
  username: string;
  isAdmin: boolean;
  isReadOnly: boolean;
  readOnlyLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-8">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            <Image src="/logos/triunfo_mark.png" alt="" width={22} height={22} className="shrink-0" />
            <span className="truncate">Triunfo Skill</span>
            {badgeText && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {badgeText}
              </span>
            )}
          </span>
        </div>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <a
            href="https://dashboard-financeiro-production-02bf.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <span aria-hidden="true">←</span> Central Triunfo
          </a>
          <span className="text-sm text-slate-500">
            {username}
            {isAdmin && <span className="ml-1.5 text-xs text-slate-400">(admin geral)</span>}
            {isReadOnly && (
              <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                {readOnlyLabel} · somente leitura
              </span>
            )}
          </span>
          <LogoutButton />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-600 lg:hidden"
        >
          {open ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Menu em linha própria no desktop: cabe mesmo com muitas abas */}
      <nav className="mx-auto hidden max-w-6xl flex-wrap gap-1 px-4 pb-2 sm:px-6 lg:flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {open && (
        <div className="border-t border-slate-200 px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">
              {username}
              {isAdmin && <span className="ml-1.5 text-xs text-slate-400">(admin geral)</span>}
            </span>
            <LogoutButton />
          </div>
          <a
            href="https://dashboard-financeiro-production-02bf.up.railway.app"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            <span aria-hidden="true">←</span> Central Triunfo
          </a>
          {isReadOnly && (
            <p className="mt-2 text-xs font-medium text-amber-700">{readOnlyLabel} · somente leitura</p>
          )}
        </div>
      )}
    </header>
  );
}
