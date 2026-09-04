import Anthropic from "@anthropic-ai/sdk";

export type GeneratedQuestion = {
  text: string;
  options: { key: string; text: string }[];
  correctKey: string;
  topic: string;
  explanation: string;
};

export type GeneratedExam = {
  title: string;
  summary: string;
  questions: GeneratedQuestion[];
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY não configurada. Defina essa variável de ambiente para habilitar a geração automática de provas.",
    );
  }
  return new Anthropic({ apiKey });
}

const TOOL_NAME = "salvar_prova";

export type DocumentType = "IT" | "APR" | "MANUAL";

const DOCUMENT_TYPE_GUIDANCE: Record<DocumentType, string> = {
  IT: "Este documento é uma IT (Instrução de Trabalho): descreve o passo a passo correto de como uma tarefa/processo deve ser executado. Priorize questões sobre a sequência correta das etapas, responsabilidades de quem executa, e o que fazer/não fazer em cada passo — sempre olhando para a função do colaborador que vai responder a prova.",
  APR: "Este documento é uma APR (Análise Preliminar de Risco): identifica perigos, riscos e medidas de controle/EPIs de uma atividade. Priorize questões sobre quais riscos existem em cada etapa da atividade, quais medidas de controle/EPIs são exigidos, e como agir diante de cada risco identificado.",
  MANUAL:
    "Este documento é o MANUAL de um equipamento (ex.: guindaste, empilhadeira, plataforma elevatória...). O objetivo é avaliar se o operador realmente conhece o equipamento, então MESCLE dois tipos de questão ao longo da prova: (1) questões TÉCNICAS — características, componentes, capacidades/limites de carga, painéis/comandos, dispositivos de segurança, manutenção básica e o que cada indicador/alerta do equipamento significa; e (2) questões de USO/OPERAÇÃO — procedimentos corretos de partida/parada, checklist pré-operacional, como operar com segurança em cada situação descrita no manual, e o que fazer diante de falhas ou situações de risco do próprio equipamento. Evite concentrar todas as questões técnicas no início e todas as de uso no final — alterne entre os dois tipos ao longo da prova.",
};

// ITs e APRs quase sempre têm uma coluna/campo "Responsável" em cada linha
// (ex.: "Todos", "Operador de Empilhadeira", "TST / Liderança Operacional",
// "Supervisor"...) indicando quem executa aquele passo ou é dono daquele
// risco/medida de controle. Quando a prova é gerada PARA uma Função
// específica, é fundamental respeitar essa coluna: um Operador de
// Empilhadeira não deve ser cobrado sobre uma responsabilidade que no
// documento é exclusiva de outra função (ex.: TST/Liderança), mesmo que o
// trecho apareça no mesmo PDF — só cai fora dessa regra o que estiver
// marcado como "Todos"/"Todos os envolvidos" (aplica a qualquer função).
const RESPONSIBLE_ROLE_GUIDANCE = (roleName: string) =>
  `IMPORTANTE — filtro por Responsável: este documento provavelmente tem, em cada linha/etapa, um campo "Responsável" (ex.: "Todos", "Operador de Empilhadeira", "TST / Liderança Operacional", "Supervisor", etc.) indicando de quem é aquela responsabilidade. Esta prova é para a função "${roleName}". Gere questões APENAS sobre etapas, riscos ou medidas cujo Responsável seja "Todos"/"Todos os envolvidos" (vale pra qualquer função) OU corresponda à função "${roleName}" (mesmo que o nome não seja idêntico, use bom senso pra reconhecer quando é a mesma função). NÃO gere questões cobrando uma responsabilidade que no documento pertence claramente a OUTRA função específica diferente de "${roleName}" — quem faz a prova não deve ser cobrado por decisões ou ações que não são dele. Se o documento não tiver uma coluna de Responsável explícita, use o bom senso para não cobrar responsabilidades de outros cargos.`;

export async function generateExamFromText(
  sourceText: string,
  opts: {
    numQuestions?: number;
    sourceFileName?: string;
    documentType?: DocumentType;
    roleName?: string;
    focus?: string;
  } = {},
): Promise<GeneratedExam> {
  const numQuestions = opts.numQuestions ?? 15;
  const documentType: DocumentType =
    opts.documentType === "APR" ? "APR" : opts.documentType === "MANUAL" ? "MANUAL" : "IT";
  const client = getClient();

  // Foco/tema específico escrito pelo professor antes de gerar (opcional) —
  // ex.: "só sobre uso de EPI" ou "procedimentos de emergência". Quando
  // informado, a prova inteira deve girar em torno disso, mesmo que o
  // documento aborde outros assuntos também.
  const focus = opts.focus?.trim();
  const focusGuidance = focus
    ? ` FOCO OBRIGATÓRIO desta prova: o professor pediu que ela seja voltada especificamente para "${focus}". Gere as ${numQuestions} questões girando em torno desse foco — use o restante do documento só como contexto de apoio, não para gerar questões fora desse tema. Se o documento não tiver conteúdo suficiente sobre esse foco específico para todas as questões, aproveite ao máximo o que existir sobre o tema e complete com questões o mais próximas possível desse foco.`
    : "";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      `Você é um especialista em treinamento corporativo e elaboração de avaliações (provas) de múltipla escolha em português do Brasil, a partir de material de treinamento (manuais, procedimentos, políticas internas de empresas de logística). ${DOCUMENT_TYPE_GUIDANCE[documentType]} Gere questões claras, objetivas, que testem compreensão real do conteúdo (não só decoreba de frases soltas), com exatamente 4 alternativas plausíveis cada, apenas uma correta. Sempre classifique cada questão com um 'topic' curto (2-5 palavras) que identifique o tema/assunto dentro do documento, para permitir análise posterior de quais temas os funcionários têm mais dificuldade.${
        opts.roleName ? ` ${RESPONSIBLE_ROLE_GUIDANCE(opts.roleName)}` : ""
      }${focusGuidance}`,
    messages: [
      {
        role: "user",
        content: `Gere uma prova de múltipla escolha com exatamente ${numQuestions} questões com base no conteúdo abaixo (extraído de um PDF do tipo ${documentType}${
          opts.sourceFileName ? ` chamado "${opts.sourceFileName}"` : ""
        }${opts.roleName ? `, destinado à função "${opts.roleName}"` : ""}).${
          opts.roleName
            ? ` Lembre-se: só pergunte sobre responsabilidades de "${opts.roleName}" ou marcadas como "Todos" — nunca sobre responsabilidade exclusiva de outra função.`
            : ""
        }${focus ? ` Lembre-se: o foco pedido pelo professor é "${focus}" — a prova inteira precisa girar em torno disso.` : ""}\n\nConteúdo:\n"""\n${sourceText}\n"""`,
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Salva a prova gerada com título, resumo e lista de questões.",
        input_schema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Título curto e descritivo para a prova, baseado no conteúdo do documento.",
            },
            summary: {
              type: "string",
              description: "Resumo de 1-2 frases sobre o que o documento aborda.",
            },
            questions: {
              type: "array",
              minItems: numQuestions,
              maxItems: numQuestions,
              items: {
                type: "object",
                properties: {
                  text: { type: "string", description: "Enunciado da questão." },
                  topic: {
                    type: "string",
                    description: "Tema/assunto curto dentro do documento ao qual essa questão pertence.",
                  },
                  options: {
                    type: "array",
                    minItems: 4,
                    maxItems: 4,
                    items: {
                      type: "object",
                      properties: {
                        key: { type: "string", enum: ["A", "B", "C", "D"] },
                        text: { type: "string" },
                      },
                      required: ["key", "text"],
                    },
                  },
                  correctKey: { type: "string", enum: ["A", "B", "C", "D"] },
                  explanation: {
                    type: "string",
                    description: "Breve explicação de por que a alternativa correta está certa.",
                  },
                },
                required: ["text", "topic", "options", "correctKey", "explanation"],
              },
            },
          },
          required: ["title", "summary", "questions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === TOOL_NAME,
  );

  if (!toolUse) {
    throw new Error("A IA não retornou a prova no formato esperado. Tente novamente.");
  }

  const parsed = toolUse.input as GeneratedExam;

  if (!parsed.questions || parsed.questions.length === 0) {
    throw new Error("A IA não gerou nenhuma questão a partir do documento enviado.");
  }

  return parsed;
}

// ---------- Quadrinho de segurança (cenário para geração de imagem) ----------
// A IA de texto (Claude, já integrada acima) só decide O QUE cada uma das 4
// imagens deve retratar — a geração da imagem em si usa um provedor
// separado (ver src/lib/imageAi.ts, OpenAI gpt-image-1), porque o Claude não
// gera imagem. Esse desenho em duas etapas garante que as 4 descrições
// sigam o mesmo cenário-base (só uma variação correta entre elas) antes de
// virar imagem.
const COMIC_TOOL_NAME = "salvar_quadrinho";

export type ComicOption = {
  description: string;
  isCorrect: boolean;
};

export type GeneratedComic = {
  scenarioPrompt: string;
  options: ComicOption[];
  explanation: string;
};

export async function generateComicScenario(
  sourceText: string,
  opts: { documentType?: DocumentType; sourceFileName?: string } = {},
): Promise<GeneratedComic> {
  const documentType: DocumentType = opts.documentType === "APR" ? "APR" : "IT";
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system:
      `Você é um especialista em segurança do trabalho criando um "quadrinho de segurança" pra treinamento: um cenário único do dia a dia, mostrado em 4 desenhos estilo cartoon, onde SÓ UM retrata a forma correta de agir (segundo o documento) e os outros 3 mostram erros plausíveis (riscos reais que colaboradores cometem). ${DOCUMENT_TYPE_GUIDANCE[documentType]} As 4 descrições precisam ser da MESMA cena/atividade (mesmo local, mesma ação geral), variando só o comportamento/detalhe que muda entre certo e errado — pra não dar pra adivinhar a resposta só pela composição da imagem. Escreva cada descrição em português, de forma visual e objetiva (pra alimentar um gerador de imagens), sem mencionar texto ou letras na cena.`,
    messages: [
      {
        role: "user",
        content: `Com base no conteúdo abaixo (de um PDF do tipo ${documentType}${
          opts.sourceFileName ? ` chamado "${opts.sourceFileName}"` : ""
        }), crie um cenário de quadrinho de segurança: um resumo curto da cena comum às 4 imagens, e as 4 variações (só 1 correta).\n\nConteúdo:\n"""\n${sourceText}\n"""`,
      },
    ],
    tools: [
      {
        name: COMIC_TOOL_NAME,
        description: "Salva o cenário do quadrinho de segurança com as 4 variações.",
        input_schema: {
          type: "object",
          properties: {
            scenarioPrompt: {
              type: "string",
              description:
                "Descrição curta (1-2 frases) da cena/atividade em comum entre as 4 imagens (local, contexto, quem aparece), sem revelar qual variação é a correta.",
            },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  description: {
                    type: "string",
                    description:
                      "Descrição visual detalhada dessa variação específica da cena, pronta pra virar prompt de imagem (o que a pessoa está fazendo, EPIs, posição, etc.).",
                  },
                  isCorrect: {
                    type: "boolean",
                    description: "true só pra UMA das 4 variações — a que retrata a forma correta de agir.",
                  },
                },
                required: ["description", "isCorrect"],
              },
            },
            explanation: {
              type: "string",
              description: "Breve explicação (1-2 frases) de por que a variação correta está certa.",
            },
          },
          required: ["scenarioPrompt", "options", "explanation"],
        },
      },
    ],
    tool_choice: { type: "tool", name: COMIC_TOOL_NAME },
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === COMIC_TOOL_NAME,
  );
  if (!toolUse) {
    throw new Error("A IA não retornou o cenário do quadrinho no formato esperado. Tente novamente.");
  }

  const parsed = toolUse.input as GeneratedComic;
  const correctCount = parsed.options?.filter((o) => o.isCorrect).length ?? 0;
  if (!parsed.options || parsed.options.length !== 4 || correctCount !== 1) {
    throw new Error("A IA não gerou as 4 variações do quadrinho corretamente. Tente novamente.");
  }

  return parsed;
}
