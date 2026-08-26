"use client";

import { createContext, useContext } from "react";
import type { AdminRole } from "@/lib/session";

const AdminRoleContext = createContext<AdminRole>("gestor");

export function AdminRoleProvider({
  role,
  children,
}: {
  role: AdminRole;
  children: React.ReactNode;
}) {
  return <AdminRoleContext.Provider value={role}>{children}</AdminRoleContext.Provider>;
}

// true quando a conta logada é "diretoria" ou "superintendencia": enxergam
// tudo, mas não podem criar/editar/excluir nada (o servidor já bloqueia via
// requireEditor — isso aqui é só pra esconder/desabilitar os controles de
// escrita na tela).
export function useIsReadOnlyAdmin(): boolean {
  const role = useContext(AdminRoleContext);
  return role === "diretoria" || role === "superintendencia";
}
