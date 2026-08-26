import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triunfo Skill - Avaliação de Competências Operacionais",
  description:
    "Triunfo Skill: avaliação de competências operacionais por Contrato, gerada por IA a partir de IT e APR, com histórico de desempenho por Contrato e Função.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
