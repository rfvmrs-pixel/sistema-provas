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

export type DocumentType = "IT" | "APR";

const DOCUMENT_TYPE_GUIDANCE: Record<DocumentType, string> = {
  IT: "Este documento é uma IT (Instrução de Trabalho): descreve o passo a passo correto de como uma tarefa/processo deve ser executado. Priorize questões sobre a sequência correta das etapas, responsabilidades de quem executa, e o que fazer/não fazer em cada passo — sempre olhando para a função do colaborador que vai responder a prova.",
  APR: "Este documento é uma APR (Análise Preliminar de Risco): identifica perigos, riscos e medidas de controle/EPIs de uma atividade. Priorize questões sobre quais riscos existem em cada etapa da atividade, quais medidas de controle/EPIs são exigidos, e como agir diante de cada risco identificado.",
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
  } = {},
): Promise<GeneratedExam> {
  const numQuestions = opts.numQuestions ?? 15;
  const documentType: DocumentType = opts.documentType === "APR" ? "APR" : "IT";
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      `Você é um especialista em treinamento corporativo e elaboração de avaliações (provas) de múltipla escolha em português do Brasil, a partir de material de treinamento (manuais, procedimentos, políticas internas de empresas de logística). ${DOCUMENT_TYPE_GUIDANCE[documentType]} Gere questões claras, objetivas, que testem compreensão real do conteúdo (não só decoreba de frases soltas), com exatamente 4 alternativas plausíveis cada, apenas uma correta. Sempre classifique cada questão com um 'topic' curto (2-5 palavras) que identifique o tema/assunto dentro do documento, para permitir análise posterior de quais temas os funcionários têm mais dificuldade.${
        opts.roleName ? ` ${RESPONSIBLE_ROLE_GUIDANCE(opts.roleName)}` : ""
      }`,
    messages: [
      {
        role: "user",
        content: `Gere uma prova de múltipla escolha com exatamente ${numQuestions} questões com base no conteúdo abaixo (extraído de um PDF do tipo ${documentType}${
          opts.sourceFileName ? ` chamado "${opts.sourceFileName}"` : ""
        }${opts.roleName ? `, destinado à função "${opts.roleName}"` : ""}).${
          opts.roleName
            ? ` Lembre-se: só pergunte sobre responsabilidades de "${opts.roleName}" ou marcadas como "Todos" — nunca sobre responsabilidade exclusiva de outra função.`
            : ""
        }\n\nConteúdo:\n"""\n${sourceText}\n"""`,
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
