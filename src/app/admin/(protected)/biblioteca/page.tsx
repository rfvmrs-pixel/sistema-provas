"use client";

import { useEffect, useState } from "react";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";

type Sector = { id: number; name: string };
type DocumentType = "IT" | "APR" | "MANUAL";
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

const DOCUMENT_TYPE_BADGE: Record<DocumentType, string> = {
  IT: "bg-sky-100 text-sky-700",
  APR: "bg-amber-100 text-amber-700",
  MANUAL: "bg-violet-100 text-violet-700",
};
const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  IT: "IT (Instrução de Trabalho)",
  APR: "APR (Análise Preliminar de Risco)",
  MANUAL: "MANUAL (manual de equipamento)",
};
type DocumentComic = { id: number; images: string[]; correctIndex: number; explanation: string | null };

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BibliotecaPage() {
  const isReadOnly = useIsReadOnlyAdmin();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload — no modo "novo" aceita vários PDFs de uma vez, todos pro mesmo
  // Contrato, enviados um por um em sequência pro endpoint (que só recebe 1
  // arquivo por chamada). No modo "atualização" é sempre 1 arquivo, que
  // substitui o PDF de um documento já existente na biblioteca (mesmo
  // registro — mantém as provas já geradas ligadas a ele).
  type UploadMode = "novo" | "atualizacao";
  const [uploadMode, setUploadMode] = useState<UploadMode>("novo");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadSectorId, setUploadSectorId] = useState("");
  const [uploadDocumentType, setUploadDocumentType] = useState<DocumentType>("IT");
  // Categoria livre (ex.: "Guindastes", "Empilhadeiras"...) — sobretudo pra
  // organizar manuais de equipamento em Treinamentos, mas disponível pra
  // qualquer Contrato/Tipo. Digitar um nome novo já "cria" a categoria, sem
  // precisar de tela de cadastro separada.
  const [uploadCategory, setUploadCategory] = useState("");
  const [updateTargetId, setUpdateTargetId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  // Filtro por Contrato, útil quando há vários Contratos cadastrados.
  // "" = Todos.
  const [contractFilter, setContractFilter] = useState("");
  // Filtro por Tipo (IT/APR/MANUAL) — combina com o de Contrato. "" = Todos.
  const [typeFilter, setTypeFilter] = useState<"" | DocumentType>("");
  // Filtro por Categoria (texto livre, ex.: "Guindastes") — combina com os
  // outros dois.
  const [categoryFilter, setCategoryFilter] = useState("");

  // ---- Quadrinho de segurança (Simulado) — 1 por documento, vale pra
  // qualquer Função, já que o Simulado gera as perguntas direto da Biblioteca. ----
  const [expandedComicDocId, setExpandedComicDocId] = useState<number | null>(null);
  const [comicLoading, setComicLoading] = useState(false);
  const [comic, setComic] = useState<DocumentComic | null>(null);
  const [comicImages, setComicImages] = useState<(string | null)[]>([null, null, null, null]);
  const [comicCorrectIndex, setComicCorrectIndex] = useState(0);
  const [comicExplanation, setComicExplanation] = useState("");
  const [savingComic, setSavingComic] = useState(false);
  const [comicError, setComicError] = useState<string | null>(null);
  const [generatingComic, setGeneratingComic] = useState(false);

  async function toggleComicPanel(docId: number) {
    if (expandedComicDocId === docId) {
      setExpandedComicDocId(null);
      return;
    }
    setExpandedComicDocId(docId);
    setComic(null);
    setComicImages([null, null, null, null]);
    setComicCorrectIndex(0);
    setComicExplanation("");
    setComicError(null);
    setComicLoading(true);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/comic`);
      const data = await res.json();
      if (data.comic) {
        setComic(data.comic);
        setComicImages(data.comic.images);
        setComicCorrectIndex(data.comic.correctIndex);
        setComicExplanation(data.comic.explanation ?? "");
      }
    } finally {
      setComicLoading(false);
    }
  }

  function handleComicFile(index: number, file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setComicImages((prev) => {
        const next = [...prev];
        next[index] = typeof reader.result === "string" ? reader.result : null;
        return next;
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveComic(e: React.FormEvent, docId: number) {
    e.preventDefault();
    if (comicImages.some((img) => !img)) {
      setComicError("Envie as 4 imagens antes de salvar.");
      return;
    }
    setSavingComic(true);
    setComicError(null);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/comic`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: comicImages, correctIndex: comicCorrectIndex, explanation: comicExplanation }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComicError(data.error || "Falha ao salvar o quadrinho.");
        return;
      }
      setComic(data.comic);
    } finally {
      setSavingComic(false);
    }
  }

  // Gera as 4 imagens por IA (Claude decide o cenário, OpenAI gera cada
  // imagem — ver /api/admin/documents/[id]/comic/generate) e só preenche o
  // formulário com o resultado; não salva sozinho — o admin revisa e clica
  // em "Salvar quadrinho" (handleSaveComic) igual a um upload manual.
  async function handleGenerateComic(docId: number) {
    setGeneratingComic(true);
    setComicError(null);
    try {
      const res = await fetch(`/api/admin/documents/${docId}/comic/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setComicError(data.error || "Falha ao gerar o quadrinho por IA.");
        return;
      }
      setComicImages(data.images);
      setComicCorrectIndex(data.correctIndex);
      setComicExplanation(data.explanation ?? "");
    } catch {
      setComicError("Erro de conexão ao gerar o quadrinho por IA.");
    } finally {
      setGeneratingComic(false);
    }
  }

  async function handleRemoveComic(docId: number) {
    if (!confirm("Remover o quadrinho de segurança desse IT/APR?")) return;
    setSavingComic(true);
    setComicError(null);
    try {
      await fetch(`/api/admin/documents/${docId}/comic`, { method: "DELETE" });
      setComic(null);
      setComicImages([null, null, null, null]);
      setComicCorrectIndex(0);
      setComicExplanation("");
    } finally {
      setSavingComic(false);
    }
  }

  async function load() {
    setLoading(true);
    const [docRes, secRes] = await Promise.all([
      fetch("/api/admin/documents"),
      fetch("/api/admin/sectors"),
    ]);
    const [docData, secData] = await Promise.all([docRes.json(), secRes.json()]);
    setDocuments(docData.documents ?? []);
    const sectorList: Sector[] = secData.sectors ?? [];
    setSectors(sectorList);
    // Gestor de contrato só recebe o próprio setor aqui — pré-seleciona e o
    // <select> vira apenas informativo (disabled) mais abaixo.
    if (sectorList.length === 1) setUploadSectorId(String(sectorList[0].id));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();

    if (uploadMode === "atualizacao") {
      if (files.length !== 1 || !updateTargetId) return;
      setUploadError(null);
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", files[0]);
        form.append("documentType", uploadDocumentType);
        form.append("category", uploadCategory);
        const res = await fetch(`/api/admin/documents/${updateTargetId}`, { method: "PUT", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}) as { error?: string });
          setUploadError(data.error || "Falha ao atualizar o documento.");
          return;
        }
        setFiles([]);
        setUpdateTargetId("");
        (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
          ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
        load();
      } catch {
        setUploadError("Erro de conexão. Tente novamente.");
      } finally {
        setUploading(false);
      }
      return;
    }

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
          form.append("documentType", uploadDocumentType);
          form.append("category", uploadCategory);
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

  // Candidatos pra "atualização": documentos já salvos, filtrados pelo
  // Contrato/Tipo escolhidos (quando informados) — evita listar centenas de
  // PDFs de outros Contratos na hora de escolher qual vai ser substituído.
  const updateCandidates = documents
    .filter((d) => !uploadSectorId || String(d.sectorId) === uploadSectorId)
    .filter((d) => d.documentType === uploadDocumentType)
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

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

  const filteredDocuments = documents
    .filter((d) => !typeFilter || d.documentType === typeFilter)
    .filter((d) => !contractFilter || String(d.sectorId) === contractFilter)
    .filter(
      (d) => !categoryFilter || (d.category ?? "").toLowerCase().includes(categoryFilter.toLowerCase()),
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Biblioteca de PDFs</h1>
        <p className="mt-1 text-sm text-slate-500">
          ITs (Instrução de Trabalho), APRs (Análise Preliminar de Risco) e MANUAIS de equipamento
          da empresa ficam guardados aqui, num lugar só, organizados por Contrato. Suba o PDF uma
          vez e depois gere (ou regere) quantas provas quiser a partir dele na aba Provas.
        </p>
      </div>

      {/* Tipo vem antes do Contrato de propósito: filtrar por Tipo primeiro
          (IT, APR ou MANUAL) é o que a maioria usa pra achar um PDF
          específico numa lista longa — e é o mesmo filtro que reaparece em
          Provas > Gerar prova, na mesma ordem. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Tipo:</span>
        {(["", "IT", "APR", "MANUAL"] as const).map((t) => (
          <button
            key={t || "todos"}
            onClick={() => setTypeFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              typeFilter === t
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t === "" ? "Todos" : DOCUMENT_TYPE_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">Categoria:</span>
        <input
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          placeholder="ex.: Guindastes, Empilhadeiras..."
          className="w-56 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
        />
        {categoryFilter && (
          <button
            onClick={() => setCategoryFilter("")}
            className="text-xs text-slate-500 hover:underline"
          >
            limpar
          </button>
        )}
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
        <h2 className="text-sm font-semibold text-slate-900">Enviar PDF</h2>
        <p className="mt-1 text-xs text-slate-500">
          Documento novo entra como um item novo na biblioteca. Atualização substitui o PDF de um
          documento já salvo (mantém as provas já geradas ligadas a ele — só o arquivo/texto muda).
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setUploadMode("novo");
              setFiles([]);
              setUpdateTargetId("");
              setUploadCategory("");
              (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
                ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              uploadMode === "novo"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Documento novo
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode("atualizacao");
              setFiles([]);
              (document.getElementById("pdf-input") as HTMLInputElement | null)?.value &&
                ((document.getElementById("pdf-input") as HTMLInputElement).value = "");
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              uploadMode === "atualizacao"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Atualização de PDF existente
          </button>
        </div>

        <form onSubmit={handleUpload} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-700">
              {uploadMode === "atualizacao" ? "Novo arquivo PDF" : "Arquivo(s) PDF"}
            </label>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              multiple={uploadMode === "novo"}
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
            <label className="block text-xs font-medium text-slate-700">Tipo de documento</label>
            <select
              value={uploadDocumentType}
              onChange={(e) => {
                setUploadDocumentType(e.target.value as DocumentType);
                setUpdateTargetId("");
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              required
            >
              <option value="IT">IT (Instrução de Trabalho)</option>
              <option value="APR">APR (Análise Preliminar de Risco)</option>
              <option value="MANUAL">MANUAL (manual de equipamento)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Categoria (opcional — ex.: Guindastes, Empilhadeiras...)
            </label>
            <input
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              placeholder="Digite pra criar uma categoria nova"
              list="categorias-existentes"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <datalist id="categorias-existentes">
              {Array.from(new Set(documents.map((d) => d.category).filter((c): c is string => !!c))).map(
                (c) => (
                  <option key={c} value={c} />
                ),
              )}
            </datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Contrato</label>
            <select
              value={uploadSectorId}
              onChange={(e) => {
                setUploadSectorId(e.target.value);
                setUpdateTargetId("");
              }}
              disabled={sectors.length === 1}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
              required={uploadMode === "novo"}
            >
              <option value="">{uploadMode === "atualizacao" ? "Todos" : "Selecione..."}</option>
              {sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {uploadMode === "atualizacao" && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">
                Documento que vai ser substituído
              </label>
              <select
                value={updateTargetId}
                onChange={(e) => {
                  setUpdateTargetId(e.target.value);
                  const doc = updateCandidates.find((d) => String(d.id) === e.target.value);
                  setUploadCategory(doc?.category ?? "");
                }}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                required
              >
                <option value="">Selecione o PDF a atualizar...</option>
                {updateCandidates.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName} — {d.sectorName} ·{" "}
                    {new Date(d.uploadedAt).toLocaleDateString("pt-BR")}
                  </option>
                ))}
              </select>
              {updateCandidates.length === 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Nenhum PDF do tipo/contrato selecionado pra atualizar ainda — ajuste os filtros
                  acima ou envie como documento novo.
                </p>
              )}
            </div>
          )}
          <div className="sm:col-span-2">
            <button
              disabled={
                isReadOnly ||
                uploading ||
                files.length === 0 ||
                (uploadMode === "novo" ? !uploadSectorId : !updateTargetId || files.length !== 1)
              }
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {uploading
                ? uploadMode === "atualizacao"
                  ? "Atualizando..."
                  : `Enviando ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? files.length}...`
                : uploadMode === "atualizacao"
                  ? "Substituir PDF"
                  : files.length > 1
                    ? `Salvar ${files.length} PDFs`
                    : "Salvar PDF"}
            </button>
          </div>
        </form>
        {uploadError && <p className="mt-2 whitespace-pre-line text-sm text-red-600">{uploadError}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            PDFs salvos
            {typeFilter && ` — ${typeFilter}`}
            {contractFilter && ` — ${sectors.find((s) => String(s.id) === contractFilter)?.name ?? ""}`}
          </h2>
          <span className="text-xs text-slate-400">
            {filteredDocuments.length} {filteredDocuments.length === 1 ? "arquivo" : "arquivos"}
          </span>
        </div>
        {loading ? (
          <p className="px-5 pb-5 text-sm text-slate-400">Carregando...</p>
        ) : filteredDocuments.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-400">
            {documents.length === 0 ? "Nenhum PDF salvo ainda." : "Nenhum PDF salvo para esse filtro."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredDocuments.map((doc) => (
              <li key={doc.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${DOCUMENT_TYPE_BADGE[doc.documentType]}`}
                      >
                        {doc.documentType}
                      </span>
                      {doc.category && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {doc.category}
                        </span>
                      )}
                      <a
                        href={`/api/admin/documents/${doc.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate font-medium text-slate-800 hover:underline"
                        title={doc.fileName}
                      >
                        {doc.fileName}
                      </a>
                    </div>
                    <p className="text-xs text-slate-400">
                      {doc.sectorName} · {formatSize(doc.fileSize)} · {doc.examCount}{" "}
                      {doc.examCount === 1 ? "prova gerada" : "provas geradas"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => toggleComicPanel(doc.id)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      {expandedComicDocId === doc.id ? "fechar quadrinho" : "quadrinho de segurança"}
                    </button>
                    {!isReadOnly && (
                      <button
                        onClick={() => handleDeleteDocument(doc)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        excluir
                      </button>
                    )}
                  </div>
                </div>

                {expandedComicDocId === doc.id && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">
                      4 imagens sobre esse IT/APR — uma mostra a forma correta de executar a
                      atividade, as outras três mostram formas erradas. No resultado do Simulado, o colaborador marca
                      qual acha que é a certa. Enquanto esse IT/APR não tiver as 4 imagens, essa
                      etapa não aparece no Simulado. Vale pra qualquer Função (não é preciso repetir por
                      Função).
                    </p>

                    {!isReadOnly && !comicLoading && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateComic(doc.id)}
                          disabled={generatingComic || savingComic}
                          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {generatingComic ? "Gerando as 4 imagens..." : "Gerar por IA"}
                        </button>
                        <span className="text-[11px] text-slate-400">
                          Preenche as 4 imagens abaixo pra você revisar — só grava ao clicar em
                          &quot;Salvar quadrinho&quot;.
                        </span>
                      </div>
                    )}

                    {comicLoading ? (
                      <p className="mt-3 text-xs text-slate-400">Carregando...</p>
                    ) : (
                      <>
                        {comicError && <p className="mt-3 text-sm text-red-600">{comicError}</p>}
                        <form
                          onSubmit={(e) => handleSaveComic(e, doc.id)}
                          className="mt-3 space-y-4"
                        >
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[0, 1, 2, 3].map((idx) => (
                              <label
                                key={idx}
                                className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border bg-white p-3 text-center ${
                                  comicCorrectIndex === idx
                                    ? "border-emerald-400 bg-emerald-50"
                                    : "border-slate-200"
                                }`}
                              >
                                <span className="text-xs font-medium text-slate-500">Imagem {idx + 1}</span>
                                {comicImages[idx] ? (
                                  <img
                                    src={comicImages[idx]!}
                                    alt=""
                                    className="h-20 w-20 rounded-md object-cover"
                                  />
                                ) : (
                                  <span className="flex h-20 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] text-slate-400">
                                    sem imagem
                                  </span>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  disabled={isReadOnly}
                                  onChange={(e) => handleComicFile(idx, e.target.files?.[0])}
                                  className="hidden"
                                />
                                <span className="flex items-center gap-1 text-[11px] text-slate-600">
                                  <input
                                    type="radio"
                                    name="comicCorrect"
                                    checked={comicCorrectIndex === idx}
                                    onChange={() => setComicCorrectIndex(idx)}
                                    disabled={isReadOnly}
                                  />
                                  correta
                                </span>
                              </label>
                            ))}
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-700">
                              Explicação (aparece depois de responder)
                            </label>
                            <textarea
                              value={comicExplanation}
                              onChange={(e) => setComicExplanation(e.target.value)}
                              disabled={isReadOnly}
                              rows={2}
                              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                              placeholder="Por que essa é a forma correta de executar a atividade..."
                            />
                          </div>

                          {!isReadOnly && (
                            <div className="flex gap-2">
                              <button
                                disabled={savingComic}
                                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                              >
                                {savingComic ? "Salvando..." : comic ? "Atualizar quadrinho" : "Salvar quadrinho"}
                              </button>
                              {comic && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveComic(doc.id)}
                                  disabled={savingComic}
                                  className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  Remover
                                </button>
                              )}
                            </div>
                          )}
                        </form>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
