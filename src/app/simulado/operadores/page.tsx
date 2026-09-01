"use client";

import SimuladoForm from "@/components/simulado/SimuladoForm";

// Aba pública de Simulados direcionada só a Operadores (guindaste,
// empilhadeira...) — mesmo fluxo do /simulado padrão, mas a lista de Função
// só mostra as marcadas como "Operador" em Funções (roles.isOperator). Ver
// src/components/simulado/SimuladoForm.tsx.
export default function SimuladoOperadoresPage() {
  return <SimuladoForm operatorOnly />;
}
