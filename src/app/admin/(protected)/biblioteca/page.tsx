"use client";

import { useEffect, useState } from "react";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";

type Sector = { id: number; name: string };
type Document = {
  id: number;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  sectorId: number;
  sectorName: string;
  examCount: number;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BibliotecaPage() {
  const isReadOnly = useIsReadOnlyAdmin();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload — aceita vários PDFs de uma vez, todos pro mesmo Contrato,
  // enviados um por um em sequência pro endpoint (que só recebe 1 arquivo
  // por chamada).
  const [files, setFiles] = useState<File[]>([]);
  const [uploadSectorId, setUploadSectorId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  // Filtro por Contrato, útil quando há vários Contratos cadastrados.
  // "" = Todos.
  const [contractFilter, setContractFilter] = useState("");

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

  const filteredDocuments = contractFilter
    ? documents.filter((d) => String(d.sectorId) === contractFilter)
    : documents;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Biblioteca de PDFs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Todas as ITs (Instrução de Trabalho) e APRs (Análise Preliminar de Risco) da empresa
          ficam guardadas aqui, num lugar só, organizadas por Contrato. Suba o PDF uma vez e depois
          gere (ou regere) quantas provas quiser a partir dele na aba Provas.
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
        <h2 className="text-sm font-semibold text-slate-900">Enviar novo(s) PDF(s)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Suba um ou vários PDFs de IT/APR de uma vez e identifique só o Contrato (o mesmo pra
          todos).
        </p>
        <form onSubmit={handleUpload} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
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
            disabled={isReadOnly || uploading || files.length === 0 || !uploadSectorId}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {uploading
              ? `Enviando ${uploadProgress?.done ?? 0}/${uploadProgress?.total ?? files.length}...`
              : files.length > 1
                ? `Salvar ${files.length} PDFs`
                : "Salvar PDF"}
          </button>
        </form>
        {uploadError && <p className="mt-2 whitespace-pre-line text-sm text-red-600">{uploadError}</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            PDFs salvos
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
            {documents.length === 0 ? "Nenhum PDF salvo ainda." : "Nenhum PDF salvo para esse Contrato."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
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
                  <p className="text-xs text-slate-400">
                    {doc.sectorName} · {formatSize(doc.fileSize)} · {doc.examCount}{" "}
                    {doc.examCount === 1 ? "prova gerada" : "provas geradas"}
                  </p>
                </div>
                {!isReadOnly && (
                  <button
                    onClick={() => handleDeleteDocument(doc)}
                    className="shrink-0 text-xs text-red-600 hover:underline"
                  >
                    excluir
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
