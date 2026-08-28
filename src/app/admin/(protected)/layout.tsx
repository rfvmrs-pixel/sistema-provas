import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/session";
import { AdminRoleProvider } from "./AdminRoleContext";
import { AdminHeader } from "./AdminHeader";

const BASE_NAV_ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/biblioteca", label: "Biblioteca" },
  { href: "/admin/provas", label: "Provas" },
  { href: "/admin/funcionarios", label: "Funcionários" },
  { href: "/admin/funcoes", label: "Funções" },
  { href: "/admin/auditoria", label: "Auditoria" },
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
  const isReadOnly = admin.role === "diretoria" || admin.role === "superintendencia";
  const readOnlyLabel = admin.role === "superintendencia" ? "Superintendência" : "Diretoria";
  const badgeText =
    admin.label ||
    (admin.sectorIds && admin.sectorIds.length > 1 ? `${admin.sectorIds.length} Contratos` : admin.sectorName);

  return (
    <AdminRoleProvider role={admin.role}>
      <div className="flex min-h-full flex-1 flex-col bg-slate-50">
        <AdminHeader
          navItems={navItems}
          badgeText={badgeText}
          username={admin.username}
          isAdmin={admin.role === "admin"}
          isReadOnly={isReadOnly}
          readOnlyLabel={readOnlyLabel}
        />
        {isReadOnly && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-800 sm:px-6">
            Você está no modo {readOnlyLabel}: pode ver todos os Contratos e estatísticas, mas não
            pode criar, editar ou excluir nada.
          </div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </AdminRoleProvider>
  );
}
