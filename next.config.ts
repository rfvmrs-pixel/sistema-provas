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
  // O Triunfo Skill mudou para o VPS (provas.triunfobridge.tech, 26/10/2026): o mesmo código
  // publicado na Railway só redireciona para lá (RAILWAY_ENVIRONMENT_NAME existe no build da Railway).
  async redirects() {
    if (!process.env.RAILWAY_ENVIRONMENT_NAME) return [];
    return [{ source: "/:path*", destination: "https://provas.triunfobridge.tech/:path*", permanent: false }];
  },
};

export default nextConfig;
