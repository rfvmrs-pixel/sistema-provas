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

export async function generateExamFromText(
  sourceText: string,
  opts: { numQuestions?: number; sourceFileName?: string } = {},
): Promise<GeneratedExam> {
  const numQuestions = opts.numQuestions ?? 15;
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system:
      "Você é um especialista em treinamento corporativo e elaboração de avaliações (provas) de múltipla escolha em português do Brasil, a partir de material de treinamento (manuais, procedimentos, políticas internas de empresas de logística). Gere questões claras, objetivas, que testem compreensão real do conteúdo (não só decoreba de frases soltas), com exatamente 4 alternativas plausíveis cada, apenas uma correta. Sempre classifique cada questão com um 'topic' curto (2-5 palavras) que identifique o tema/assunto dentro do documento, para permitir análise posterior de quais temas os funcionários têm mais dificuldade.",
    messages: [
      {
        role: "user",
        content: `Gere uma prova de múltipla escolha com exatamente ${numQuestions} questões com base no conteúdo abaixo (extraído de um PDF de treinamento${
          opts.sourceFileName ? ` chamado "${opts.sourceFileName}"` : ""
        }).\n\nConteúdo:\n"""\n${sourceText}\n"""`,
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
