import Link from "next/link";
import { getAdminSession } from "@/lib/session";
import { MINUTES_PER_10_QUESTIONS } from "@/lib/examTimer";
import { AUDIT_WINDOW_DAYS } from "@/lib/audit";

// Aba "Utilização": manual de uso do Triunfo Skill para o gestor — o que cada
// tela faz, onde fica e o passo a passo. Texto estático (não depende de
// dados); só ajusta avisos conforme o perfil de quem está logado. Quando uma
// tela mudar, atualize a seção correspondente aqui.

type Secao = {
  id: string;
  titulo: string;
  onde: string;
  href?: string;
  resumo: string;
  passos?: { titulo: string; itens: string[] }[];
  dicas?: string[];
  soAdmin?: boolean;
};

const SECOES: Secao[] = [
  {
    id: "painel",
    titulo: "Painel",
    onde: "Menu › Painel",
    href: "/admin",
    resumo:
      "Visão geral do desempenho: quantos colaboradores foram avaliados, provas realizadas, média geral, quem precisa de treinamento e o tempo médio de prova.",
    passos: [
      {
        titulo: "Visão por contrato",
        itens: [
          "Cada contrato mostra o nível (🥇 Ouro acima de 95%, 🥈 Prata de 70% a 95%, 🥉 Bronze abaixo de 70%, pela nota média), o % de realização das ITs/APRs/Manuais e quantos colaboradores já fizeram prova.",
          "Clique no contrato para abrir. Aba Funções: nível e % de realização de cada função. Aba ITs e APRs: quantos colaboradores fizeram cada documento e quantos faltam. Aba Tempo de casa: o nível por faixa de tempo de empresa.",
          "Clique numa função para ver os colaboradores dela, com nível, média e quantas ITs/APRs da função cada um já fez.",
          "Clique no colaborador para abrir o painel dele: módulos feitos e pendentes (com a melhor nota e a data), tempo de casa, temas em que mais acerta e mais erra e a lista de provas.",
          "Clique numa prova da lista para ver cada questão, a alternativa que o colaborador marcou, a correta e se acertou.",
        ],
      },
      {
        titulo: "Outros quadros",
        itens: [
          "Provas aplicadas por mês e Simulados avulsos por mês (ano corrente).",
          "IT x APR x MANUAL: compara o desempenho por tipo de documento.",
          "Critérios/temas: onde a equipe mais acerta e mais erra.",
          "Top 10 colaboradores: maiores e menores notas (clique no nome para abrir o painel do colaborador).",
          "Últimas tentativas: as provas mais recentes, com filtros.",
        ],
      },
    ],
    dicas: [
      "\"ITs/APRs da função\" são os documentos que têm prova ATIVA cadastrada para aquela função no contrato. Se o % parecer baixo, confira em Provas se há provas antigas ainda ativas.",
    ],
  },
  {
    id: "biblioteca",
    titulo: "Biblioteca",
    onde: "Menu › Biblioteca",
    href: "/admin/biblioteca",
    resumo:
      "Onde ficam guardados os PDFs de IT (Instrução de Trabalho), APR (Análise Preliminar de Risco) e MANUAL de equipamento, organizados por contrato. Todo documento sobe uma vez aqui e depois vira quantas provas forem necessárias.",
    passos: [
      {
        titulo: "Enviar um documento novo",
        itens: [
          "Em Enviar PDF, deixe marcado Documento novo.",
          "Escolha o Tipo de documento (IT, APR ou MANUAL), o Contrato e, se quiser, uma Categoria (ex.: Guindastes, Empilhadeiras).",
          "Selecione um ou vários PDFs e clique em Salvar PDF.",
        ],
      },
      {
        titulo: "Atualizar um PDF que mudou (nova revisão)",
        itens: [
          "Em Enviar PDF, marque Atualização de PDF existente.",
          "Escolha o documento que vai ser substituído e o novo arquivo, e clique em Substituir PDF.",
          "As provas já geradas continuam ligadas ao documento; para as questões refletirem a nova revisão, regere a prova (veja Provas › Regerar).",
        ],
      },
      {
        titulo: "Quadrinho de segurança (opcional)",
        itens: [
          "No documento, abra o Quadrinho de segurança: são 4 imagens, uma com a forma correta de fazer a atividade e três erradas.",
          "Gere com a IA ou envie as 4 imagens, marque qual é a correta e escreva a explicação.",
          "O quadrinho aparece no resultado do Simulado; enquanto não tiver as 4 imagens, essa etapa não aparece.",
        ],
      },
    ],
    dicas: ["Use os filtros de Tipo, Contrato e Categoria para achar um documento rapidamente."],
  },
  {
    id: "provas",
    titulo: "Provas",
    onde: "Menu › Provas",
    href: "/admin/provas",
    resumo:
      "Gera provas de múltipla escolha com IA a partir de um PDF da Biblioteca, para um contrato e uma função, e já cria o link de aplicação.",
    passos: [
      {
        titulo: "Gerar uma prova",
        itens: [
          "Em Gerar prova, escolha o Tipo de documento, o PDF da biblioteca, a Função e a Quantidade de questões.",
          "Opcional: escreva um Foco/tema (ex.: \"uso de EPI\") para a prova girar só em torno desse assunto.",
          "Em Como essa prova vai ser aplicada, escolha o tipo de aplicação e o período (datas de início e fim) e clique em Gerar prova.",
          "Se já existir prova para o mesmo documento e função, aparece um aviso: clique em Gerar mesmo assim (nova versão) só se quiser outra versão.",
          "Ao terminar, o link de aplicação aparece pronto para copiar e enviar à equipe.",
        ],
      },
      {
        titulo: "Tipos de aplicação",
        itens: [
          "Prova Geral: qualquer colaborador do contrato/função responde pelo link, fazendo o autocadastro (nome, matrícula e tempo de empresa).",
          "Prova Direcionada: só a pessoa indicada (nome + matrícula) consegue responder pelo link.",
          "Prova de Curso: igual à Geral, usada para provas de curso/formação.",
          "Simulado específico: igual à Geral, usada para um simulado oficial.",
          "Período: depois da data final a prova fecha sozinha (fica em apuração de notas). Para liberar fora do período, abra a prova e autorize com um comentário obrigatório.",
        ],
      },
      {
        titulo: "Na página de uma prova (clique no nome dela)",
        itens: [
          "Contrato e Função: muda para quem a prova vale (só funcionários desse contrato e função a enxergam).",
          "Regerar a partir da biblioteca: gera novas questões (por exemplo, depois de atualizar o PDF ou para mudar a quantidade). O histórico de tentativas é mantido.",
          "Prova do dia: marque os colaboradores e clique em Gerar código. Cada um recebe um código de 6 dígitos de uso único para entrar em /prova com nome + contrato. Os códigos só aparecem nessa hora: anote e envie.",
          "Links de aplicação: gere links Gerais ou Direcionados extras, veja o período e autorize respostas fora do prazo.",
          "Baixar prova em branco: PDF para aplicar no papel.",
          "Questões e Tentativas: veja as perguntas, quem fez, a nota e exporte o resultado em PDF.",
        ],
      },
    ],
    dicas: [
      `Tempo de prova: ${MINUTES_PER_10_QUESTIONS} minutos a cada 10 perguntas (ex.: 15 perguntas = 23 minutos). Ao zerar, a prova é enviada sozinha com o que foi marcado.`,
      "Depois de 3 tentativas oficiais do mesmo colaborador no mesmo conjunto de perguntas, as questões são regeradas automaticamente na próxima tentativa.",
      "Use o botão de status para desativar uma prova sem excluí-la; provas inativas não contam no % de realização do Painel.",
    ],
  },
  {
    id: "cronograma",
    titulo: "Cronograma",
    onde: "Menu › Cronograma",
    href: "/admin/cronograma",
    resumo:
      "Planejamento das provas do ano de um contrato, num calendário. O item só vira prova de verdade quando você clica em Gerar prova agora.",
    passos: [
      {
        titulo: "Programar uma prova",
        itens: [
          "Escolha o Contrato e, em Adicionar item ao cronograma, a Data, o Tipo de aplicação (Geral, Direcionada, Curso ou Simulado), o Tipo de documento, o PDF (pode decidir depois), a Função, a Quantidade de questões e uma Observação.",
          "No dia, abra o item e clique em Gerar prova agora: a prova e o link de aplicação são criados na hora.",
          "Depois de gerado, use Ver prova para ir à página da prova.",
        ],
      },
    ],
  },
  {
    id: "apresentacao",
    titulo: "Apresentação",
    onde: "Menu › Apresentação",
    href: "/admin/apresentacao",
    resumo:
      "Monta um relatório corporativo dos resultados de treinamento, pronto para apresentar em reunião.",
    passos: [
      {
        titulo: "Gerar a apresentação",
        itens: [
          "Em Filtros, escolha o período (mês), o Tipo de prova, as Funções (nenhuma marcada = todas) e os Contratos.",
          "O relatório mostra números gerais, classificação dos colaboradores, desempenho por tipo de prova, por função e por contrato, e os destaques.",
        ],
      },
    ],
  },
  {
    id: "funcionarios",
    titulo: "Funcionários",
    onde: "Menu › Funcionários",
    href: "/admin/funcionarios",
    resumo: "Cadastro dos colaboradores com contrato, função, matrícula, data de contratação e senha de acesso às provas.",
    passos: [
      {
        titulo: "Cadastrar um colaborador",
        itens: [
          "Preencha nome, matrícula, contrato (setor), função, data de contratação e senha, e clique em Adicionar funcionário.",
          "Com a data de contratação preenchida, o tempo de casa é calculado sozinho e sempre atualizado.",
        ],
      },
      {
        titulo: "Ver o painel de um colaborador",
        itens: [
          "Clique no nome do colaborador na lista: abre o painel dele com o total de ITs e APRs que tem que fazer, quantas já fez, quais faltam, o % realizado, o nível, o tempo de casa e todas as provas feitas (clique numa prova para ver o que acertou e errou).",
        ],
      },
      {
        titulo: "Cadastrar vários de uma vez (planilha)",
        itens: [
          "Em Cadastro em lote por planilha, clique em Baixar planilha modelo.",
          "Preencha uma linha por colaborador (Nome, Matrícula, Setor, Função e Tempo de empresa) e envie de volta.",
          "Quem já existe (mesma matrícula + setor) é atualizado; quem não existe é criado.",
        ],
      },
    ],
    dicas: [
      "Colaboradores também podem se autocadastrar ao abrir um link de Prova Geral; eles aparecem aqui depois.",
      "Desative quem saiu da empresa em vez de excluir, para manter o histórico de provas.",
    ],
  },
  {
    id: "funcoes",
    titulo: "Funções",
    onde: "Menu › Funções",
    href: "/admin/funcoes",
    resumo: "Lista de cargos/funções usada para organizar colaboradores, provas e relatórios.",
    passos: [
      {
        titulo: "Criar uma função",
        itens: [
          "Digite o nome e clique em Adicionar.",
          "Marque É função de Operador para funções como Operador de Guindaste ou de Empilhadeira: elas aparecem no Simulado de Operadores.",
        ],
      },
    ],
  },
  {
    id: "auditoria",
    titulo: "Auditoria",
    onde: "Menu › Auditoria",
    href: "/admin/auditoria",
    resumo: `Mostra quanto da equipe está em dia. Um colaborador está "auditado" quando concluiu todas as provas de IT/APR da própria função nos últimos ${AUDIT_WINDOW_DAYS} dias; passado esse prazo sem refazer, volta a contar como pendente.`,
    passos: [
      {
        titulo: "Como ler",
        itens: [
          "Equipe auditada e Funcionários auditados: o quanto da equipe está em dia.",
          "Já realizaram alguma prova × Nunca realizaram nenhuma prova: quem começou e quem ainda não fez nada.",
          "% da equipe auditada por Contrato: abra o contrato para ver quais IT/APR e funções têm pendentes.",
        ],
      },
    ],
  },
  {
    id: "contratos",
    titulo: "Contratos",
    onde: "Menu › Contratos (só admin geral)",
    href: "/admin/setores",
    soAdmin: true,
    resumo:
      "Cadastro dos contratos (TPS, EQUINOR, LON1...) e das contas de acesso. Um gestor logado num contrato só enxerga os dados desse contrato.",
    passos: [
      {
        titulo: "Criar contrato e gestor",
        itens: [
          "Digite o nome e clique em Adicionar contrato.",
          "No contrato, crie ou redefina a conta do gestor (usuário e senha). Marque Acesso total só para contas que precisam ver tudo, como a do SMS.",
        ],
      },
      {
        titulo: "Contas de Diretoria / Superintendência",
        itens: [
          "São somente leitura: veem Painel, Provas e relatórios, mas não criam, editam nem excluem nada.",
          "Por padrão enxergam todos os contratos; marque um grupo de contratos para restringir (ex.: Diretoria de Operações).",
        ],
      },
    ],
  },
  {
    id: "colaborador",
    titulo: "Como o colaborador faz a prova",
    onde: "Páginas públicas: /prova, link de aplicação e /simulado",
    resumo: "O que o colaborador vê do lado dele — útil para orientar a equipe.",
    passos: [
      {
        titulo: "Pelo link de aplicação (Prova Geral, Direcionada, Curso ou Simulado)",
        itens: [
          "O gestor envia o link. O colaborador abre no celular, informa nome, matrícula e tempo de empresa (contrato e função já vêm da prova) e começa.",
          "Na Prova Direcionada, só entra quem tiver a matrícula indicada.",
        ],
      },
      {
        titulo: "Pela página /prova",
        itens: [
          "Informa nome completo e contrato e escolhe como entrar: por Matrícula (sem senha: vê as provas já feitas, pratica e faz prova oficial), pelo Código da prova do dia ou pela Senha.",
          "Em Minhas provas, abre as provas já respondidas e vê onde acertou e errou.",
        ],
      },
      {
        titulo: "Simulado (treino livre)",
        itens: [
          "Em /simulado, informa nome, matrícula, contrato e função, e escolhe a IT, APR ou MANUAL para praticar.",
          "Em /simulado/operadores, a mesma coisa só para funções marcadas como Operador.",
        ],
      },
    ],
  },
];

const FLUXO = [
  { n: 1, t: "Suba os PDFs", d: "Biblioteca: ITs, APRs e Manuais do contrato.", href: "/admin/biblioteca" },
  { n: 2, t: "Cadastre a equipe", d: "Funções e Funcionários (ou deixe o autocadastro pelo link).", href: "/admin/funcionarios" },
  { n: 3, t: "Gere as provas", d: "Provas: um PDF + uma função; o link já sai pronto.", href: "/admin/provas" },
  { n: 4, t: "Aplique", d: "Envie o link ou gere os códigos da prova do dia.", href: "/admin/provas" },
  { n: 5, t: "Acompanhe", d: "Painel, Auditoria e a prova de cada colaborador.", href: "/admin" },
  { n: 6, t: "Apresente", d: "Apresentação: relatório para a reunião.", href: "/admin/apresentacao" },
];

export default async function UtilizacaoPage() {
  const admin = await getAdminSession();
  const isAdmin = admin?.role === "admin";
  const somenteLeitura = admin?.role === "diretoria" || admin?.role === "superintendencia";
  const secoes = SECOES.filter((s) => !s.soAdmin || isAdmin);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[#DA202C]">Guia do gestor</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Utilização do Triunfo Skill</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          O que cada tela faz, onde fica e como usar. Clique num item do índice para ir direto à explicação, ou no
          botão &quot;Abrir&quot; para ir à tela.
        </p>
      </div>

      {somenteLeitura && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Seu acesso é somente leitura: você consegue ver tudo o que está descrito aqui, mas as ações de criar, editar,
          gerar e excluir ficam com os gestores e o admin geral.
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Fluxo recomendado</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {FLUXO.map((f) => (
            <li key={f.n}>
              <Link href={f.href} className="block h-full rounded-lg border border-slate-200 p-3 hover:border-red-200 hover:bg-red-50/40">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#DA202C] text-xs font-bold text-white">{f.n}</span>
                <p className="mt-2 text-sm font-semibold text-slate-900">{f.t}</p>
                <p className="mt-0.5 text-xs text-slate-500">{f.d}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="h-fit rounded-xl border border-slate-200 bg-white p-4 lg:sticky lg:top-4" aria-label="Índice">
          <p className="text-xs font-semibold uppercase text-slate-500">Índice</p>
          <ul className="mt-2 space-y-1 text-sm">
            {secoes.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  {s.titulo}
                </a>
              </li>
            ))}
            <li>
              <a href="#duvidas" className="block rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                Dúvidas frequentes
              </a>
            </li>
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {secoes.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{s.titulo}</h2>
                  <p className="mt-0.5 text-xs font-medium text-slate-400">Onde: {s.onde}</p>
                </div>
                {s.href && (
                  <Link href={s.href} className="shrink-0 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700">
                    Abrir →
                  </Link>
                )}
              </div>
              <p className="mt-3 text-sm text-slate-600">{s.resumo}</p>
              {s.passos?.map((p) => (
                <div key={p.titulo} className="mt-4">
                  <h3 className="text-sm font-semibold text-slate-800">{p.titulo}</h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600 marker:font-semibold marker:text-[#DA202C]">
                    {p.itens.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ol>
                </div>
              ))}
              {s.dicas && s.dicas.length > 0 && (
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Dicas</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">
                    {s.dicas.map((d) => (
                      <li key={d}>• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}

          <section id="duvidas" className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Dúvidas frequentes</h2>
            <dl className="mt-3 space-y-4 text-sm">
              {[
                ["O colaborador não vê a prova. O que conferir?", "A prova precisa estar ativa, no mesmo contrato e na mesma função do colaborador, e dentro do período do link. Confira em Provas e em Funcionários."],
                ["O link fechou antes de todos responderem.", "Abra a prova, vá em Links de aplicação e autorize responder fora do período, com o comentário explicando o motivo."],
                ["O PDF da IT mudou. Preciso refazer tudo?", "Não: atualize o PDF na Biblioteca (Atualização de PDF existente) e depois regere a prova na página dela. As tentativas antigas continuam no histórico."],
                ["Onde vejo o que um colaborador errou?", "Painel › Visão por contrato › contrato › função › colaborador › clique na prova. Também dá para exportar o PDF da tentativa na página da prova."],
                ["Como o nível Ouro, Prata ou Bronze é calculado?", "Pela nota média das provas: Ouro acima de 95%, Prata de 70% a 95%, Bronze abaixo de 70%."],
                ["O colaborador perdeu o código da prova do dia.", "Gere um novo código para ele na página da prova (Prova do dia); o anterior deixa de valer quando a prova é finalizada."],
              ].map(([p, r]) => (
                <div key={p}>
                  <dt className="font-semibold text-slate-800">{p}</dt>
                  <dd className="mt-0.5 text-slate-600">{r}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
