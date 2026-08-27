import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) dynamically imports its worker file at runtime.
  // If Next bundles/traces it, that dynamic import path breaks in production
  // ("Cannot find module '.../pdf.worker.mjs'"). Keeping it external makes
  // Node require() it directly from node_modules, where the worker file
  // actually lives, instead of through Next's server bundle.
  // pdfkit também lê seus arquivos .afm (fontes padrão) do disco em runtime,
  // relativo à própria pasta do pacote — mesmo motivo do pdf-parse acima.
  serverExternalPackages: ["pdf-parse", "pdfkit"],
};

export default nextConfig;
