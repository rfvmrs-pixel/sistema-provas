// Geração de imagem por IA (quadrinho de segurança) — provedor separado do
// Claude (que só gera texto). Escolhido com o usuário: OpenAI gpt-image-1
// (melhor aderência a instruções detalhadas, importante pra retratar
// corretamente um cenário de segurança específico). Chamada via REST direta
// (sem SDK) pra não adicionar dependência só por causa de 1 endpoint.
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurada. Defina essa variável de ambiente para habilitar a geração de imagens do quadrinho por IA.",
    );
  }
  return apiKey;
}

// Prefixo de estilo aplicado em TODAS as imagens de um quadrinho, pra manter
// o mesmo traço/paleta entre as 4 — assim a resposta certa não fica óbvia só
// pela qualidade/estilo do desenho, só pelo conteúdo da cena.
const STYLE_PREFIX =
  "Ilustração estilo cartoon educativo de segurança do trabalho, cores vivas, traço limpo tipo cartaz de treinamento corporativo brasileiro, ambiente industrial/logístico, sem nenhum texto, letra ou número na imagem. Cena: ";

export async function generateComicImage(sceneDescription: string): Promise<string> {
  const apiKey = getApiKey();
  const prompt = `${STYLE_PREFIX}${sceneDescription}`;

  const res = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      size: "1024x1024",
      quality: "medium",
      n: 1,
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`Falha ao gerar imagem via OpenAI (HTTP ${res.status}): ${bodyText.slice(0, 300)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("A OpenAI não retornou a imagem gerada no formato esperado.");
  }

  return `data:image/png;base64,${b64}`;
}
