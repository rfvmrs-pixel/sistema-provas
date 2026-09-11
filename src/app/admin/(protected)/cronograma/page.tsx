"use client";

import { useEffect, useMemo, useState } from "react";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type DocumentType = "IT" | "APR" | "MANUAL";
type Doc = { id: number; fileName: string; documentType: DocumentType; sectorId: number };

type Kind = "geral" | "direcionada" | "curso" | "simulado";
const KIND_LABEL: Record<Kind, string> = {
  geral: "Geral",
  direcionada: "Direcionada",
  curso: "Curso",
  simulado: "Simulado",
};
const KIND_BADGE: Record<Kind, string> = {
  geral: "bg-sky-100 text-sky-700",
  direcionada: "bg-indigo-100 text-indigo-700",
  curso: "bg-violet-100 text-violet-700",
  simulado: "bg-amber-100 text-amber-700",
};

type ScheduleItem = {
  id: number;
  sectorId: number;
  sectorName: string;
  documentId: number | null;
  documentLabel: string;
  scheduledDate: string;
  note: string | null;
  kind: Kind;
  roleId: number | null;
  roleName: string | null;
  numQuestions: number;
  targetEmployeeName: string | null;
  targetEmployeeMatricula: string | null;
  examId: number | null;
  examLinkId: number | null;
  linkToken: string | null;
};

function monthLabel(dateStr: string) {
  const [y, m] = dateStr.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

export default function CronogramaPage() {
  const isReadOnly = useIsReadOnlyAdmin();

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [sectorId, setSectorId] = useState("");
  const [loading, setLoading] = useState(true);

  const [scheduledDate, setScheduledDate] = useState("");
  const [kind, setKind] = useState<Kind>("geral");
  const [documentType, setDocumentType] = useState<DocumentType>("IT");
  const [documentId, setDocumentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [numQuestions, setNumQuestions] = useState(15);
  const [note, setNote] = useState("");
  const [targetName, setTargetName] = useState("");
  const [targetMatricula, setTargetMatricula] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [secRes, roleRes, docRes] = await Promise.all([
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
      fetch("/api/admin/documents"),
    ]);
    const [secData, roleData, docData] = await Promise.all([secRes.json(), roleRes.json(), docRes.json()]);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
    setDocuments(docData.documents ?? []);
    if (!sectorId && secData.sectors?.length > 0) setSectorId(String(secData.sectors[0].id));
    setLoading(false);
  }

  async function loadSchedules() {
    if (!sectorId) return;
    const res = await fetch(`/api/admin/schedules?sectorId=${sectorId}`);
    const data = await res.json();
    setSchedules(data.schedules ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadSchedules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorId]);

  const filteredDocuments = useMemo(
    () => documents.filter((d) => d.sectorId === Number(sectorId) && d.documentType === documentType),
    [documents, sectorId, documentType],
  );

  const groupedByMonth = useMemo(() => {
    const groups: Record<string, ScheduleItem[]> = {};
    for (const s of schedules) {
      const key = s.scheduledDate.slice(0, 7);
      groups[key] = groups[key] || [];
      groups[key].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [schedules]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!sectorId || !scheduledDate) return;
    if (kind === "direcionada" && (!targetName.trim() || !targetMatricula.trim())) {
      setFormError("Informe nome e matrícula do colaborador pra um item Direcionado.");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectorId: Number(sectorId),
          scheduledDate,
          kind,
          documentId: documentId ? Number(documentId) : undefined,
          roleId: roleId ? Number(roleId) : undefined,
          numQuestions,
          note: note || undefined,
          targetEmployeeName: kind === "direcionada" ? targetName : undefined,
          targetEmployeeMatricula: kind === "direcionada" ? targetMatricula : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Falha ao adicionar ao cronograma.");
        return;
      }
      setScheduledDate("");
      setDocumentId("");
      setRoleId("");
      setNote("");
      setTargetName("");
      setTargetMatricula("");
      loadSchedules();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ScheduleItem) {
    if (!confirm("Remover esse item do cronograma?")) return;
    await fetch(`/api/admin/schedules/${item.id}`, { method: "DELETE" });
    loadSchedules();
  }

  async function handleGenerate(item: ScheduleItem) {
    setActionError(null);
    setGeneratingId(item.id);
    try {
      const res = await fetch(`/api/admin/schedules/${item.id}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Falha ao gerar a prova.");
        return;
      }
      loadSchedules();
    } finally {
      setGeneratingId(null);
    }
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/prova/link/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Cronograma de provas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deixe programadas, com data, todas as provas do ano de um Contrato — Geral, Direcionada,
          Curso ou Simulado. Cada item só vira prova de verdade quando você clicar em &quot;Gerar
          prova agora&quot;.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700">Contrato</label>
        <select
          value={sectorId}
          onChange={(e) => setSectorId(e.target.value)}
          className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        >
          {sectors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!isReadOnly && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Adicionar item ao cronograma</h2>
          <form onSubmit={handleAdd} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700">Data da prova</label>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">Tipo de aplicação</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>

            {kind === "direcionada" && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Nome do colaborador</label>
                  <input
                    value={targetName}
                    onChange={(e) => setTargetName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Matrícula</label>
                  <input
                    value={targetMatricula}
                    onChange={(e) => setTargetMatricula(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700">Tipo de documento</label>
              <select
                value={documentType}
                onChange={(e) => {
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
            <div>
              <label className="block text-xs font-medium text-slate-700">
                PDF da biblioteca (opcional agora, obrigatório pra gerar depois)
              </label>
              <select
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              >
                <option value="">Ainda não decidido</option>
                {filteredDocuments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.fileName}
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
              >
                <option value="">Ainda não decidida</option>
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
                <option value={10}>10 questões</option>
                <option value={15}>15 questões</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700">Observação (opcional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: 1º trimestre, turma da manhã..."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                disabled={saving || !sectorId || !scheduledDate}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? "Adicionando..." : "Adicionar ao cronograma"}
              </button>
              {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
            </div>
          </form>
        </section>
      )}

      {actionError && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>
      )}

      <div className="space-y-6">
        {groupedByMonth.length === 0 && (
          <p className="text-sm text-slate-400">Nenhuma prova programada pra esse Contrato ainda.</p>
        )}
        {groupedByMonth.map(([month, items]) => (
          <section key={month} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold capitalize text-slate-900">{monthLabel(month + "-01")}</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="mr-2 text-slate-500">
                      {new Date(item.scheduledDate + "T00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${KIND_BADGE[item.kind]}`}>
                      {KIND_LABEL[item.kind]}
                    </span>
                    <span className="text-slate-800">{item.documentLabel}</span>
                    {item.roleName && <span className="text-slate-500"> · {item.roleName}</span>}
                    {item.kind === "direcionada" && item.targetEmployeeName && (
                      <span className="text-slate-500"> · {item.targetEmployeeName}</span>
                    )}
                    {item.note && <p className="text-xs text-slate-400">{item.note}</p>}
                    {item.examId && (
                      <p className="text-xs text-emerald-600">
                        Gerada
                        {item.linkToken && (
                          <>
                            {" "}
                            —{" "}
                            <button
                              type="button"
                              onClick={() => copyLink(item.linkToken!)}
                              className="underline hover:no-underline"
                            >
                              {copiedToken === item.linkToken ? "link copiado!" : "copiar link"}
                            </button>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                  {!isReadOnly && (
                    <div className="flex shrink-0 items-center gap-2">
                      {!item.examId && (
                        <button
                          onClick={() => handleGenerate(item)}
                          disabled={generatingId === item.id}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                        >
                          {generatingId === item.id ? "Gerando..." : "Gerar prova agora"}
                        </button>
                      )}
                      {!item.examId && (
                        <button
                          onClick={() => handleDelete(item)}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          Remover
                        </button>
                      )}
                      {item.examId && (
                        <a
                          href={`/admin/provas/${item.examId}`}
                          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                        >
                          Ver prova
                        </a>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
