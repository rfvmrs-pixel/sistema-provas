"use client";

import { useEffect, useState } from "react";
import { useIsReadOnlyAdmin } from "../AdminRoleContext";
import { tenureLabel } from "@/lib/tenure";

type Sector = { id: number; name: string };
type Role = { id: number; name: string };
type Employee = {
  id: number;
  name: string;
  active: boolean;
  sectorId: number;
  sectorName: string;
  roleId: number;
  roleName: string;
  matricula: string | null;
  tempoDeEmpresa: string | null;
};
type EmployeeScore = { id: number; avgScore: number; attemptCount: number };
type ImportResult = { created: number; updated: number; errors: { row: number; message: string }[]; totalRows: number };

export default function FuncionariosPage() {
  const isReadOnly = useIsReadOnlyAdmin();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [scores, setScores] = useState<Record<number, EmployeeScore>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState("");

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [empRes, secRes, roleRes, repRes] = await Promise.all([
      fetch("/api/admin/employees"),
      fetch("/api/admin/sectors"),
      fetch("/api/admin/roles"),
      fetch("/api/admin/reports"),
    ]);
    const [empData, secData, roleData, repData] = await Promise.all([
      empRes.json(),
      secRes.json(),
      roleRes.json(),
      repRes.json(),
    ]);
    setEmployees(empData.employees ?? []);
    setSectors(secData.sectors ?? []);
    setRoles(roleData.roles ?? []);
    const scoreMap: Record<number, EmployeeScore> = {};
    for (const e of repData.employeeSummary ?? []) {
      scoreMap[e.id] = e;
    }
    setScores(scoreMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        sectorId: Number(sectorId),
        roleId: Number(roleId),
        password,
        matricula: matricula || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setName("");
    setMatricula("");
    setPassword("");
    load();
  }

  async function toggleActive(emp: Employee) {
    await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !emp.active }),
    });
    load();
  }

  async function resetPassword(emp: Employee) {
    const newPassword = prompt(`Nova senha para ${emp.name}:`);
    if (!newPassword) return;
    const res = await fetch(`/api/admin/employees/${emp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await res.json();
    if (!res.ok) alert(data.error);
  }

  async function handleDelete(emp: Employee) {
    if (!confirm(`Excluir ${emp.name}? Isso apaga também o histórico de provas dele(a).`)) return;
    await fetch(`/api/admin/employees/${emp.id}`, { method: "DELETE" });
    load();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois, se precisar
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    setImportBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/employees/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Falha ao importar a planilha.");
        return;
      }
      setImportResult(data);
      load();
    } catch {
      setImportError("Erro de conexão ao importar a planilha.");
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Funcionários</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre funcionários com setor, função e senha de acesso às provas.
        </p>
      </div>

      {!isReadOnly && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Cadastro em lote por planilha</h2>
          <p className="mt-1 text-xs text-slate-500">
            Baixe o modelo, preencha uma linha por funcionário (Nome, Matrícula, Setor, Função e
            Tempo de empresa) e envie de volta — quem já existe (mesma Matrícula + Setor) é
            atualizado, quem não existe é criado.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href="/api/admin/employees/template"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              Baixar planilha modelo
            </a>
            <label className="cursor-pointer rounded-md bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700">
              {importBusy ? "Importando..." : "Importar planilha preenchida"}
              <input
                type="file"
                accept=".xlsx"
                onChange={handleImportFile}
                disabled={importBusy}
                className="hidden"
              />
            </label>
          </div>

          {importError && <p className="mt-3 text-sm text-red-600">{importError}</p>}

          {importResult && (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                {importResult.created} criado(s), {importResult.updated} atualizado(s) de{" "}
                {importResult.totalRows} linha(s).
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-red-600">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>
                      Linha {err.row}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {!isReadOnly && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-6">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome completo"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none sm:col-span-2"
            required
          />
          <input
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
            placeholder="Matrícula (opcional)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <select
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          >
            <option value="">Setor...</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          >
            <option value="">Função...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 sm:col-span-6">
            Adicionar funcionário
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
              <th className="px-5 py-3">Nome</th>
              <th className="px-5 py-3">Matrícula</th>
              <th className="px-5 py-3">Setor</th>
              <th className="px-5 py-3">Função</th>
              <th className="px-5 py-3">Tempo de empresa</th>
              <th className="px-5 py-3">Média</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={8}>
                  Carregando...
                </td>
              </tr>
            ) : employees.length === 0 ? (
              <tr>
                <td className="px-5 py-4 text-slate-400" colSpan={8}>
                  Nenhum funcionário cadastrado.
                </td>
              </tr>
            ) : (
              employees.map((emp) => {
                const score = scores[emp.id];
                return (
                  <tr key={emp.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 text-slate-800">{emp.name}</td>
                    <td className="px-5 py-3 text-slate-500">{emp.matricula || "—"}</td>
                    <td className="px-5 py-3 text-slate-500">{emp.sectorName}</td>
                    <td className="px-5 py-3 text-slate-500">{emp.roleName}</td>
                    <td className="px-5 py-3 text-slate-500">{tenureLabel(emp.tempoDeEmpresa)}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {score && score.attemptCount > 0 ? `${score.avgScore}% (${score.attemptCount})` : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleActive(emp)}
                        disabled={isReadOnly}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium disabled:cursor-default ${
                          emp.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {emp.active ? "ativo" : "inativo"}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right text-xs">
                      {!isReadOnly && (
                        <>
                          <button onClick={() => resetPassword(emp)} className="mr-3 text-slate-500 hover:underline">
                            redefinir senha
                          </button>
                          <button onClick={() => handleDelete(emp)} className="text-red-600 hover:underline">
                            excluir
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
