import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) dynamically imports its worker file at runtime.
  // If Next bundles/traces it, that dynamic import path breaks in production
  // ("Cannot find module '.../pdf.worker.mjs'"). Keeping it external makes
  // Node require() it directly from node_modules, where the worker file
  // actually lives, instead of through Next's server bundle.
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
