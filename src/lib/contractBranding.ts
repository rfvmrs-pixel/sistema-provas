// Identidade visual de cada Contrato na tela de abertura e no menu.
//
// - "client"  -> Contrato com logo de cliente próprio (ex: Equinor, Prime
//                Ocean). Mostra o logo do cliente em destaque.
// - "combo"   -> Sem logo próprio, mas ligado a um cliente conhecido (ex:
//                LON1/LON2 -> Petrobras, no mesmo grupo do ARM Rio). Mostra
//                a marca da Triunfo em destaque + o logo do cliente pequeno,
//                no canto.
// - "triunfo" -> Contrato "interno" (sem cliente externo com logo próprio,
//                ex: TPS, SPOT). Mostra só a marca da Triunfo.
//
// Chave = nome do Setor/Contrato em maiúsculas, como fica salvo no banco.
// Contratos que não aparecem aqui caem no fallback "triunfo" (ver
// getContractBranding) até alguém cadastrar um logo específico.
export type ContractBranding =
  | { kind: "client"; logoSrc: string; clientName: string }
  | { kind: "combo"; logoSrc: string; clientName: string }
  | { kind: "triunfo" };

// Toda vez que um arquivo de logo em /public/logos for SUBSTITUÍDO (mesmo
// nome, conteúdo novo), incrementa esse número. O navegador (e o cache de
// imagem do Next.js) trata a URL com "?v=" como um recurso novo e busca de
// novo, em vez de reaproveitar a versão antiga guardada em cache — sem isso,
// quem já visitou o site antes pode continuar vendo a logo antiga por dias.
export const LOGO_VERSION = "2";

function versioned(path: string): string {
  return `${path}?v=${LOGO_VERSION}`;
}

const BRANDING_BY_SECTOR: Record<string, ContractBranding> = {
  EQUINOR: { kind: "client", logoSrc: versioned("/logos/equinor.png"), clientName: "Equinor" },
  "PRIME OCEAN": { kind: "client", logoSrc: versioned("/logos/prime_ocean.png"), clientName: "Prime Ocean" },
  // ARM RIO, LON1 e LON2 são todos vinculados à Petrobras: mostram a marca da
  // Triunfo em destaque (maior) + o logo da Petrobras pequeno, no canto.
  "ARM RIO": { kind: "combo", logoSrc: versioned("/logos/petrobras.png"), clientName: "Petrobras" },
  LON1: { kind: "combo", logoSrc: versioned("/logos/petrobras.png"), clientName: "Petrobras" },
  LON2: { kind: "combo", logoSrc: versioned("/logos/petrobras.png"), clientName: "Petrobras" },
};

export function getContractBranding(sectorName: string): ContractBranding {
  const key = sectorName.trim().toUpperCase();
  return BRANDING_BY_SECTOR[key] ?? { kind: "triunfo" };
}
