"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR";
type Document = {
  id: number;
  fileName: string;
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

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProvasPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload pra biblioteca — aceita vários PDFs de uma vez, todos pro mesmo
  // Contrato, enviados um por um em sequência pro endpoint (que só recebe 1
  // arquivo por chamada).
  const [files, setFiles] = useState<File[]>([]);
  const [uploadSectorId, setUploadSectorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  // Gerar prova a partir de um PDF já salvo
  const [documentId, setDocumentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("IT");
  const [numQuestions, setNumQuestions] = useState(15);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Filtro por Contrato (biblioteca + tabela de provas), útil quando há
  // vários Contratos cadastrados. "" = Todos.
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
    const sectorList: Sector[] = secData.sectors ?? [];
    setSectors(sectorList);
    // Gestor de contrato só recebe o próprio setor aqui — pré-seleciona e o
    // <select> vira apenas informativo (disabled) mais abaixo.
    if (sectorList.length === 1) setUploadSectorId(String(sectorList[0].id));
    setRoles(roleData.roles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0 || !uploadSectorId) return;
    setUploadError(null);
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    const failed: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const form = new FormData();
          form.append("file", f);
          form.append("sectorId", uploadSectorId);
          const res = await fetch("/api/admin/documents", { method: "POST", body: form });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}) as { error?: string });
            failed.push(`${f.name}: ${data.error || "falha ao enviar"}`);
          }
        } catch {
          failed.push(`${f.name}: erro de rede`);
        }
        setUploadProgress({ done: i + 1, total: files.length });
      }
      if (failed.length > 0) {
        setUploadError(`Falha em ${failed.length} de ${files.length} arquivo(s):\n${failed.join("\n")}`);
      }
      setFiles([]);
      (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
      load();
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function handleDeleteDocument(doc: Document) {
    if (
      !confirm(
        `Excluir "${doc.fileName}" da biblioteca? As provas já geradas a partir dele continuam existindo.`,
      )
    )
      return;
    await fetch(`/api/admin/documents/${doc.id}`, { method: "DELETE" });
    load();
  }

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

  const filteredDocuments = contractFilter
    ? documents.filter((d) => String(d.sectorId) === contractFilter)
    : documents;
  const filteredExams = contractFilter
    ? exams.filter((e) => String(e.sectorId) === contractFilter)
    : exams;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Provas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie o PDF de uma IT ou APR uma vez só — ele fica salvo na biblioteca do Contrato. Depois
          é só escolher o PDF já salvo, a Função, o Tipo e a quantidade de questões pra gerar (ou
          regerar) quantas provas quiser a partir dele.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">1. Biblioteca de PDFs</h2>
          <p className="mt-1 text-xs text-slate-500">
            Suba um ou vários PDFs de IT/APR de uma vez e identifique só o Contrato (o mesmo pra
            todos). Os arquivos ficam salvos e disponíveis pra gerar provas depois.
          </p>
          <form onSubmit={handleUpload} className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">Arquivo(s) PDF</label>
              <input
                id="pdf-input"
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="mt-1 w-full text-sm"
                required
              />
              {files.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  {files.length === 1 ? "1 arquivo selecionado" : `${files.length} arquivos selecionados`}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Contrato</label>
              <select
                value={uploadSectorId}
                onChange={(e) => setUploadSectorId(e.target.value)}
                disabled={sectors.length === 1}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
                required
              >
                <option value="">Selecione...</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={uploading || files.length === 0 || !uploadSectorId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {uploading
                ? `Enviando ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? files.length}...`
                : files.length > 1
                  ? `Salvar ${files.length} PDFs na biblioteca`
                  : "Salvar PDF na biblioteca"}
            </button>
            {uploadError && <p className="whitespace-pre-line text-sm text-red-600">{uploadError}</p>}
          </form>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-700">
              PDFs salvos
              {contractFilter && ` — ${sectors.find((s) => String(s.id) === contractFilter)?.name ?? ""}`}
            </h3>
            {filteredDocuments.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                {documents.length === 0 ? "Nenhum PDF salvo ainda." : "Nenhum PDF salvo para esse Contrato."}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {filteredDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <a
                        href={`/api/admin/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium text-slate-800 hover:underline"
                        title={doc.fileName}
                      >
                        {doc.fileName}
                      </a>
                      <p className="text-slate-400">
                        {doc.sectorName} · {formatSize(doc.fileSize)} · {doc.examCount}{" "}
                        {doc.examCount === 1 ? "prova gerada" : "provas geradas"}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteDocument(doc)}
                      className="shrink-0 text-red-600 hover:underline"
                    >
                      excluir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">2. Gerar prova</h2>
          <p className="mt-1 text-xs text-slate-500">
            Escolha um PDF já salvo, a Função e o Tipo de documento. A IA gera automaticamente uma
            prova de múltipla escolha vinculada a esse Contrato e Função.
          </p>
          <form onSubmit={handleGenerate} className="mt-3 space-y-3">
            <div>
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
            <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-xs font-medium text-slate-700">Tipo de documento</label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                >
                  <option value="IT">IT (Instrução de Trabalho)</option>
                  <option value="APR">APR (Análise Preliminar de Risco)</option>
                </select>
              </div>
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
            <button
              disabled={generating || !documentId || !roleId}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {generating ? `Gerando prova com IA (${numQuestions} questões)...` : "Gerar prova"}
            </button>
            {generateError && <p className="text-sm text-red-600">{generateError}</p>}
          </form>
        </section>
      </div>

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
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        exam.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {exam.active ? "disponível" : "desativada"}
                    </button>
                  </td>
                  <td className="px-5 py-3 text-right text-xs">
                    <button onClick={() => handleDelete(exam)} className="text-red-600 hover:underline">
                      excluir
                    </button>
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
