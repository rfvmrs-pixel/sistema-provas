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

// Quando um arquivo de logo em /public/logos for SUBSTITUÍDO, salve com um
// nome de arquivo NOVO (ex.: "prime_ocean_v2.png") em vez de sobrescrever o
// mesmo nome, e aponte aqui pro nome novo. Assim o navegador é obrigado a
// buscar de novo (nome de arquivo diferente = recurso diferente), sem
// precisar de "?v=" na URL — o Next.js não permite query string em imagem
// local sem configuração extra em next.config.ts, e isso já causou o site
// inteiro ficar sem nenhuma logo em produção. Não usar "?v=" de novo aqui.
const BRANDING_BY_SECTOR: Record<string, ContractBranding> = {
  "PRIME OCEAN": { kind: "client", logoSrc: "/logos/prime_ocean_v2.png", clientName: "Prime Ocean" },
  // ARM RIO, LON1, LON2 (Petrobras) e agora EQUINOR seguem o mesmo padrão:
  // marca da Triunfo em destaque (maior) + logo do cliente menor, ao lado.
  "ARM RIO": { kind: "combo", logoSrc: "/logos/petrobras.png", clientName: "Petrobras" },
  LON1: { kind: "combo", logoSrc: "/logos/petrobras.png", clientName: "Petrobras" },
  LON2: { kind: "combo", logoSrc: "/logos/petrobras.png", clientName: "Petrobras" },
  EQUINOR: { kind: "combo", logoSrc: "/logos/equinor_v2.png", clientName: "Equinor" },
};

export function getContractBranding(sectorName: string): ContractBranding {
  const key = sectorName.trim().toUpperCase();
  return BRANDING_BY_SECTOR[key] ?? { kind: "triunfo" };
}
