"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR" | "MANUAL";
const DOCUMENT_TYPE_BADGE: Record<DocumentType, string> = {
  IT: "bg-sky-100 text-sky-700",
  APR: "bg-amber-100 text-amber-700",
  MANUAL: "bg-violet-100 text-violet-700",
};
type Document = {
  id: number;
  fileName: string;
  documentType: DocumentType;
  category: string | null;
  fileSize: number;
  uploadedAt: string;
  sectorId: number;
  sectorName: string;
  examCount: number;
};
type Exam = {
  id: number;
  title: string;
  sourceFileName: string | null;
  active: boolean;
  passingScore: number;
  documentType: DocumentType;
  category: string | null;
  focus: string | null;
  version: number;
  createdAt: string;
  sectorId: number;
  sectorName: string;
  roleId: number;
  roleName: string;
  questionCount: number;
  attemptCount: number;
};

type ApplicationKind = "geral" | "direcionada" | "curso" | "simulado";
const APPLICATION_KIND_LABEL: Record<ApplicationKind, string> = {
  geral: "Prova Geral",
  direcionada: "Prova Direcionada",
  curso: "Prova de Curso",
  simulado: "Simulado específico",
};
const APPLICATION_KIND_HELP: Record<ApplicationKind, string> = {
  geral: "Qualquer colaborador do Contrato/Função pode responder pelo link, autocadastrando-se.",
  direcionada: "Só a pessoa que você indicar (nome + matrícula) consegue responder pelo link.",
  curso: "Mesmo autocadastro livre da Prova Geral — usado pra provas de curso/formação.",
  simulado: "Mesmo autocadastro livre da Prova Geral — usado pra um simulado oficial específico.",
};

const QUESTION_COUNT_OPTIONS = [10, 15];

export default function ProvasPage() {
  const isReadOnly = useIsReadOnlyAdmin();
  const [exams, setExams] = useState<Exam[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Gerar prova a partir de um PDF já salvo na Biblioteca
  const [documentId, setDocumentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("IT");
  const [numQuestions, setNumQuestions] = useState(15);
  const [focus, setFocus] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Tipo de aplicação + período — já escolhidos aqui na tela inicial, sem
  // precisar ir pra uma segunda tela (ver /admin/provas/[id] > Links de
  // aplicação, que continua existindo pra gerar links extras depois).
  const [applicationKind, setApplicationKind] = useState<ApplicationKind>("geral");
  const [linkLabel, setLinkLabel] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [direcionadaName, setDirecionadaName] = useState("");
  const [direcionadaMatricula, setDirecionadaMatricula] = useState("");
  const [generatedLink, setGeneratedLink] = useState<{ examTitle: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Filtro por Contrato (PDFs disponíveis pra gerar + tabela de provas),
  // útil quando há vários Contratos cadastrados. "" = Todos.
  const [contractFilter, setContractFilter] = useState("");

  async function load() {
    setLoading(true);
    const [examRes, docRes, secRes, roleRes] = await Promise.all([
      fetch("/api/admin/exams"),
      fetch("/api/admin/documents"),
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
    ]);
    const [examData, docData, secData, roleData] = await Promise.all([
      examRes.json(),
      docRes.json(),
      secRes.json(),
      roleRes.json(),
    ]);
    setExams(examData.exams ?? []);
    setDocuments(docData.documents ?? []);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleGenerate(e: React.FormEvent, confirmDuplicate = false) {
    e.preventDefault();
    if (!documentId || !roleId) return;
    if (applicationKind === "direcionada" && (!direcionadaName.trim() || !direcionadaMatricula.trim())) {
      setGenerateError("Informe nome e matrícula do colaborador pra uma Prova Direcionada.");
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      setGenerateError("A data de início não pode ser depois da data de fim.");
      return;
    }
    setGenerateError(null);
    setDuplicateWarning(null);
    setGeneratedLink(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: Number(documentId),
          roleId: Number(roleId),
          documentType,
          numQuestions,
          focus: focus.trim() || undefined,
          confirmDuplicate,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicate) {
        setDuplicateWarning(data.error);
        return;
      }
      if (!res.ok) {
        setGenerateError(data.error || "Falha ao gerar a prova.");
        return;
      }

      // Já cria o link de aplicação (Geral/Direcionada/Curso/Simulado) com o
      // período escolhido, na mesma tela — evita ter que ir na prova gerada
      // pra criar o link depois.
      const linkRes = await fetch(`/api/admin/exams/${data.exam.id}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: applicationKind,
          label: linkLabel || undefined,
          periodStart: periodStart || undefined,
          periodEnd: periodEnd || undefined,
          name: applicationKind === "direcionada" ? direcionadaName.trim() : undefined,
          matricula: applicationKind === "direcionada" ? direcionadaMatricula.trim() : undefined,
        }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        setGenerateError(
          `Prova criada, mas houve um erro ao gerar o link de aplicação: ${linkData.error || "erro desconhecido"}. Você pode gerar o link manualmente na página da prova.`,
        );
      } else {
        setGeneratedLink({ examTitle: data.exam.title, token: linkData.link.token });
      }

      setDocumentId("");
      setRoleId("");
      setFocus("");
      setLinkLabel("");
      setPeriodStart("");
      setPeriodEnd("");
      setDirecionadaName("");
      setDirecionadaMatricula("");
      load();
    } finally {
      setGenerating(false);
    }
  }

  function copyGeneratedLink() {
    if (!generatedLink) return;
    const url = `${window.location.origin}/prova/link/${generatedLink.token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function toggleActive(exam: Exam) {
    await fetch(`/api/admin/exams/${exam.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !exam.active }),
    });
    load();
  }

  async function handleDelete(exam: Exam) {
    if (!confirm(`Excluir a prova "${exam.title}"? Isso apaga também os resultados dela.`)) return;
    await fetch(`/api/admin/exams/${exam.id}`, { method: "DELETE" });
    load();
  }

  // Tipo filtra primeiro (evita listar PDF de IT quando a intenção é gerar
  // uma prova de APR, e vice-versa), Contrato filtra em cima disso.
  const filteredDocuments = documents
    .filter((d) => d.documentType === documentType)
    .filter((d) => !contractFilter || String(d.sectorId) === contractFilter);
  const filteredExams = contractFilter
    ? exams.filter((e) => String(e.sectorId) === contractFilter)
    : exams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Provas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Escolha um PDF já salvo na{" "}
          <Link href="/admin/biblioteca" className="underline hover:text-slate-700">
            Biblioteca
          </Link>
          , a Função, o Tipo e a quantidade de questões pra gerar (ou regerar) quantas provas
          quiser a partir dele.
        </p>
      </div>

      {sectors.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Contrato:</span>
          <button
            onClick={() => setContractFilter("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              contractFilter === ""
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Todos
          </button>
          {sectors.map((s) => (
            <button
              key={s.id}
              onClick={() => setContractFilter(String(s.id))}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                contractFilter === String(s.id)
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Gerar prova</h2>
        <p className="mt-1 text-xs text-slate-500">
          Escolha um PDF já salvo, a Função e o Tipo de documento. A IA gera automaticamente uma
          prova de múltipla escolha vinculada a esse Contrato e Função.
        </p>
        {filteredDocuments.length === 0 && !loading && (
          <p className="mt-2 text-xs text-amber-700">
            {documents.length === 0
              ? "Nenhum PDF salvo ainda — envie um na Biblioteca primeiro."
              : "Nenhum PDF salvo para esse Contrato."}
          </p>
        )}
        <form onSubmit={handleGenerate} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">Tipo de documento</label>
            <select
              value={documentType}
              onChange={(e) => {
                // Muda o Tipo primeiro — a lista de PDF abaixo passa a
                // mostrar só os desse Tipo, então limpa a seleção anterior
                // pra não ficar um PDF de outro Tipo escondido selecionado.
                setDocumentType(e.target.value as DocumentType);
                setDocumentId("");
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              <option value="IT">IT (Instrução de Trabalho)</option>
              <option value="APR">APR (Análise Preliminar de Risco)</option>
              <option value="MANUAL">MANUAL (manual de equipamento)</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">PDF da biblioteca</label>
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            >
              <option value="">Selecione...</option>
              {filteredDocuments.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.fileName} ({doc.sectorName}
                  {doc.category ? ` · ${doc.category}` : ""})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Função</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            >
              <option value="">Selecione...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Quantidade de questões</label>
            <select
              value={numQuestions}
              onChange={(e) => setNumQuestions(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            >
              {QUESTION_COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} questões
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">
              Foco/tema específico (opcional)
            </label>
            <textarea
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Ex: focar só em uso de EPI e procedimentos de emergência, deixando de lado o resto do documento"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Escreva aqui se quiser que a prova seja direcionada pra um tema/tópico específico do
              documento, em vez de cobrir tudo. Deixe em branco pra uma prova geral do documento.
            </p>
          </div>
          <div className="sm:col-span-2">
            <button
              disabled={isReadOnly || generating || !documentId || !roleId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? `Gerando prova com IA (${numQuestions} questões)...` : "Gerar prova"}
            </button>
            {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
            {duplicateWarning && (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{duplicateWarning}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={(e) => handleGenerate(e as unknown as React.FormEvent, true)}
                    className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
                  >
                    Gerar mesmo assim (nova versão)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicateWarning(null)}
                    className="rounded-md border border-amber-300 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-xs font-semibold uppercase text-slate-500">
            Como essa prova vai ser aplicada
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Escolha aqui o tipo de aplicação e o período — o link já sai pronto assim que a prova
            for gerada, sem precisar confirmar isso numa segunda tela.
          </p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(APPLICATION_KIND_LABEL) as ApplicationKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setApplicationKind(k)}
                className={`rounded-md border px-3 py-2 text-left text-xs font-medium transition ${
                  applicationKind === k
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {APPLICATION_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">{APPLICATION_KIND_HELP[applicationKind]}</p>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {applicationKind === "direcionada" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Nome do colaborador</label>
                  <input
                    value={direcionadaName}
                    onChange={(e) => setDirecionadaName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Matrícula</label>
                  <input
                    value={direcionadaMatricula}
                    onChange={(e) => setDirecionadaMatricula(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </>
            )}
            <div className={applicationKind === "direcionada" ? "" : "sm:col-span-2"}>
              <label className="block text-xs font-medium text-slate-700">Rótulo (opcional)</label>
              <input
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder="Ex: Treinamento mensal, Turma de setembro..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Aplicar a partir de</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Até (fecha após essa data)</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Deixe em branco pra não ter data limite. Depois do período, a prova fecha sozinha
            (fica em apuração de notas) e só reabre se um gestor autorizar, com comentário, na
            página da prova.
          </p>
        </div>

        {generatedLink && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-900">
              Prova &quot;{generatedLink.examTitle}&quot; criada e link pronto:
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-white px-2 py-1 text-xs text-slate-700">
                /prova/link/{generatedLink.token}
              </code>
              <button
                type="button"
                onClick={copyGeneratedLink}
                className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                {copied ? "Copiado!" : "Copiar link"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3">Prova</th>
              <th className="px-5 py-3">Tipo</th>
              <th className="px-5 py-3">Contrato</th>
              <th className="px-5 py-3">Função</th>
              <th className="px-5 py-3">Questões</th>
              <th className="px-5 py-3">Tentativas</th>
              <th className="px-5 py-3">Criada em</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={9}>
                  Carregando...
                </td>
              </tr>
            ) : filteredExams.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={9}>
                  {exams.length === 0 ? "Nenhuma prova gerada ainda." : "Nenhuma prova para esse Contrato."}
                </td>
              </tr>
            ) : (
              filteredExams.map((exam) => (
                <tr key={exam.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3">
                    <Link href={`/admin/provas/${exam.id}`} className="text-slate-800 hover:underline">
                      {exam.title}
                    </Link>
                    <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      v{exam.version}
                    </span>
                    {exam.sourceFileName && (
                      <p className="text-xs text-slate-400">{exam.sourceFileName}</p>
                    )}
                    {exam.focus && (
                      <p className="text-xs text-indigo-600" title={exam.focus}>
                        Foco: {exam.focus}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENT_TYPE_BADGE[exam.documentType]}`}
                    >
                      {exam.documentType}
                    </span>
                    {exam.category && (
                      <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {exam.category}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{exam.sectorName}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.roleName}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.questionCount}</td>
                  <td className="px-5 py-3 text-slate-500">{exam.attemptCount}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {new Date(exam.createdAt).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleActive(exam)}
                      disabled={isReadOnly}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium disabled:cursor-default ${
                        exam.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {exam.active ? "disponível" : "desativada"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right text-xs">
                    <a
                      href={`/api/admin/exams/${exam.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="mr-3 text-slate-500 hover:underline"
                    >
                      PDF em branco
                    </a>
                    {!isReadOnly && (
                      <button onClick={() => handleDelete(exam)} className="text-red-600 hover:underline">
                        excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
