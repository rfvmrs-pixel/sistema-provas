import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) dynamically imports its worker file at runtime.
  // If Next bundles/traces it, that dynamic import path breaks in production
  // ("Cannot find module '.../pdf.worker.mjs'"). Keeping it external makes
  // Node require() it directly from node_modules, where the worker file
  // actually lives, instead of through Next's server bundle.
  serverExternalPackages: ["pdf-parse"],
  images: {
    // Permite "?v=..." nas logos em /public/logos (ver LOGO_VERSION em
    // contractBranding.ts) — sem isso o Next recusa otimizar a imagem. O "*"
    // no valor de "search" cobre qualquer versão, então não precisa editar
    // aqui de novo quando LOGO_VERSION mudar.
    localPatterns: [{ pathname: "/logos/**", search: "?v=*" }],
  },
};

export default nextConfig;
