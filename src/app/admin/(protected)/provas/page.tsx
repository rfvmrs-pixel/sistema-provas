"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR";
type Document = {
  id: number;
  fileName: string;
  documentType: DocumentType;
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
  createdAt: string;
  sectorId: number;
  sectorName: string;
  roleId: number;
  roleName: string;
  questionCount: number;
  attemptCount: number;
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
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!documentId || !roleId) return;
    setGenerateError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/exams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: Number(documentId), roleId: Number(roleId), documentType, numQuestions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenerateError(data.error || "Falha ao gerar a prova.");
        return;
      }
      setDocumentId("");
      setRoleId("");
      load();
    } finally {
      setGenerating(false);
    }
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
                  {doc.fileName} ({doc.sectorName})
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
            <button
              disabled={isReadOnly || generating || !documentId || !roleId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? `Gerando prova com IA (${numQuestions} questões)...` : "Gerar prova"}
            </button>
            {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
          </div>
        </form>
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
                    {exam.sourceFileName && (
                      <p className="text-xs text-slate-400">{exam.sourceFileName}</p>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        exam.documentType === "APR"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {exam.documentType}
                    </span>
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
