import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import LogoutButton from "./logout-button";
import { AdminRoleProvider } from "./AdminRoleContext";

const BASE_NAV_ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/biblioteca", label: "Biblioteca" },
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

  // "Contratos" (criar contrato, criar/redefinir gestor) só faz sentido pra
  // quem edita — Diretoria já vê todos os Contratos no Painel/Provas/
  // Funcionários (sectorId null), não precisa dessa tela de gerenciamento.
  const navItems = admin.role === "admin" ? [...BASE_NAV_ITEMS, SUPER_ADMIN_NAV_ITEM] : BASE_NAV_ITEMS;
  const isReadOnly = admin.role === "diretoria";

  return (
    <AdminRoleProvider role={admin.role}>
      <div className="flex min-h-full flex-1 flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-8">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Image src="/logos/triunfo_mark.png" alt="" width={22} height={22} className="shrink-0" />
                Triunfo Skill
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
                {admin.role === "admin" && (
                  <span className="ml-1.5 text-xs text-slate-400">(admin geral)</span>
                )}
                {admin.role === "diretoria" && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Diretoria · somente leitura
                  </span>
                )}
              </span>
              <LogoutButton />
            </div>
          </div>
        </header>
        {isReadOnly && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-xs font-medium text-amber-800">
            Você está no modo Diretoria: pode ver todos os Contratos e estatísticas, mas não pode
            criar, editar ou excluir nada.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
      </div>
    </AdminRoleProvider>
  );
}
