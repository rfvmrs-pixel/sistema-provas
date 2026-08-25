import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import LogoutButton from "./logout-button";

const BASE_NAV_ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/provas", label: "Provas" },
  { href: "/admin/funcionarios", label: "Funcionários" },
  { href: "/admin/funcoes", label: "Funções" },
];

// "Contratos" (Setores) e criação de gestores só aparecem para o admin geral.
const SUPER_ADMIN_NAV_ITEM = { href: "/admin/setores", label: "Contratos" };

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/admin/login");
  }

  const navItems =
    admin.sectorId === null ? [...BASE_NAV_ITEMS, SUPER_ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <span className="text-sm font-semibold text-slate-900">
              Sistema de Avaliação de Processo
              {admin.sectorName && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {admin.sectorName}
                </span>
              )}
            </span>
            <nav className="flex gap-1">
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
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {admin.username}
              {admin.sectorId === null && (
                <span className="ml-1.5 text-xs text-slate-400">(admin geral)</span>
              )}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
