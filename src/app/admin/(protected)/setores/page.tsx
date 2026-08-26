"use client";

import { useEffect, useState } from "react";

type Sector = { id: number; name: string };
type Gestor = { id: number; username: string };
type DirectorRole = "diretoria" | "superintendencia";
type Director = {
  id: number;
  username: string;
  label: string | null;
  role: DirectorRole;
  sectors: { id: number; name: string }[];
};

export default function ContratosPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [gestoresBySector, setGestoresBySector] = useState<Record<number, Gestor[]>>({});
  const [directors, setDirectors] = useState<Director[]>([]);
  const [name, setName] = useState("");
  const [gestorUsername, setGestorUsername] = useState("");
  const [gestorPassword, setGestorPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGestorFor, setSavingGestorFor] = useState<number | null>(null);
  const [gestorForm, setGestorForm] = useState<Record<number, { username: string; password: string }>>({});

  // Conta(s) de Diretoria/Superintendência: enxergam todos os Contratos e as
  // estatísticas da empresa, mas são só leitura (não editam nada). Os dois
  // roles têm exatamente o mesmo nível de acesso — só o rótulo muda.
  const [directorUsername, setDirectorUsername] = useState("");
  const [directorPassword, setDirectorPassword] = useState("");
  const [directorRole, setDirectorRole] = useState<DirectorRole>("diretoria");
  const [directorLabel, setDirectorLabel] = useState("");
  // Vazio = sem restrição (enxerga todos os Contratos). Marcando um ou mais,
  // a conta fica travada só nesse grupo (ex.: "Diretoria de Operações").
  const [directorSectorIds, setDirectorSectorIds] = useState<number[]>([]);
  const [savingDirector, setSavingDirector] = useState(false);
  const [directorError, setDirectorError] = useState<string | null>(null);

  function toggleDirectorSector(id: number) {
    setDirectorSectorIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function load() {
    setLoading(true);
    const [res, directorsRes] = await Promise.all([
      fetch("/api/admin/sectors"),
      fetch("/api/admin/directors"),
    ]);
    const data = await res.json();
    const list: Sector[] = data.sectors ?? [];
    setSectors(list);
    if (directorsRes.ok) {
      const directorsData = await directorsRes.json();
      setDirectors(directorsData.directors ?? []);
    }

    const entries = await Promise.all(
      list.map(async (s) => {
        const r = await fetch(`/api/admin/sectors/${s.id}/gestor`);
        if (!r.ok) return [s.id, []] as const;
        const d = await r.json();
        return [s.id, d.gestores ?? []] as const;
      }),
    );
    setGestoresBySector(Object.fromEntries(entries));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAddDirector(e: React.FormEvent) {
    e.preventDefault();
    if (!directorUsername || !directorPassword) return;
    setDirectorError(null);
    setSavingDirector(true);
    try {
      const res = await fetch("/api/admin/directors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: directorUsername,
          password: directorPassword,
          role: directorRole,
          label: directorLabel || undefined,
          sectorIds: directorSectorIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDirectorError(data.error || "Falha ao criar conta.");
        return;
      }
      setDirectorUsername("");
      setDirectorPassword("");
      setDirectorLabel("");
      setDirectorSectorIds([]);
      load();
    } finally {
      setSavingDirector(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/sectors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        gestorUsername: gestorUsername || undefined,
        gestorPassword: gestorPassword || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setName("");
    setGestorUsername("");
    setGestorPassword("");
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir este contrato? Isso só funciona se não houver funcionários, provas ou gestores nele.")) return;
    const res = await fetch(`/api/admin/sectors/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    load();
  }

  async function handleSaveGestor(sectorId: number) {
    const form = gestorForm[sectorId];
    if (!form?.username || !form?.password) return;
    setSavingGestorFor(sectorId);
    try {
      const res = await fetch(`/api/admin/sectors/${sectorId}/gestor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }
      setGestorForm((m) => ({ ...m, [sectorId]: { username: "", password: "" } }));
      load();
    } finally {
      setSavingGestorFor(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Contratos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cada contrato (TPS, EQUINOR, LON1...) organiza funcionários, provas e relatórios. Um
          gestor logado num contrato só enxerga os dados desse contrato.
        </p>
      </div>

      <form
        onSubmit={handleAdd}
        className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-4"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do contrato"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          required
        />
        <input
          value={gestorUsername}
          onChange={(e) => setGestorUsername(e.target.value)}
          placeholder="Usuário do gestor (opcional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <input
          type="password"
          value={gestorPassword}
          onChange={(e) => setGestorPassword(e.target.value)}
          placeholder="Senha do gestor (opcional)"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Adicionar contrato
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-5 text-sm text-slate-400">Carregando...</p>
        ) : sectors.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhum contrato cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sectors.map((s) => {
              const gestores = gestoresBySector[s.id] ?? [];
              const form = gestorForm[s.id] ?? { username: "", password: "" };
              return (
                <li key={s.id} className="px-5 py-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      excluir
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {gestores.length === 0 ? (
                      "Nenhum gestor cadastrado ainda."
                    ) : (
                      <>Gestor(es): {gestores.map((g) => g.username).join(", ")}</>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      value={form.username}
                      onChange={(e) =>
                        setGestorForm((m) => ({ ...m, [s.id]: { ...form, username: e.target.value } }))
                      }
                      placeholder="Usuário do gestor"
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
                    />
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setGestorForm((m) => ({ ...m, [s.id]: { ...form, password: e.target.value } }))
                      }
                      placeholder="Senha (nova/redefinir)"
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-slate-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleSaveGestor(s.id)}
                      disabled={savingGestorFor === s.id || !form.username || !form.password}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {savingGestorFor === s.id ? "Salvando..." : "Criar/redefinir gestor"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Contas de Diretoria / Superintendência</h2>
        <p className="mt-1 text-sm text-slate-500">
          São somente leitura: não criam, editam ou excluem nada. Por padrão enxergam todos os
          Contratos e as estatísticas da empresa como um todo, igual ao admin geral — mas você pode
          marcar abaixo um GRUPO específico de Contratos (ex.: "Diretoria de Operações" = ARM RIO +
          TPS + SPOT + EQUINOR) pra essa conta ver só aquele grupo. Sem nenhum Contrato marcado =
          sem restrição, vê tudo. Os dois tipos (Diretoria/Superintendência) têm o mesmo nível de
          acesso, só muda o rótulo mostrado pra conta.
        </p>
      </div>

      <form
        onSubmit={handleAddDirector}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            value={directorUsername}
            onChange={(e) => setDirectorUsername(e.target.value)}
            placeholder="Usuário (login)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
          <input
            type="password"
            value={directorPassword}
            onChange={(e) => setDirectorPassword(e.target.value)}
            placeholder="Senha"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            required
          />
          <input
            value={directorLabel}
            onChange={(e) => setDirectorLabel(e.target.value)}
            placeholder="Nome de exibição (ex.: Diretoria de Operações)"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          />
          <select
            value={directorRole}
            onChange={(e) => setDirectorRole(e.target.value as DirectorRole)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          >
            <option value="diretoria">Diretoria</option>
            <option value="superintendencia">Superintendência</option>
          </select>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-600">
            Contratos que essa conta enxerga (nenhum marcado = todos):
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sectors.map((s) => {
              const checked = directorSectorIds.includes(s.id);
              return (
                <label
                  key={s.id}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                    checked
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDirectorSector(s.id)}
                    className="hidden"
                  />
                  {s.name}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={savingDirector || !directorUsername || !directorPassword}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {savingDirector ? "Salvando..." : "Criar/redefinir conta"}
          </button>
          {directorError && <p className="text-sm text-red-600">{directorError}</p>}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white">
        {directors.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {directors.map((d) => (
              <li key={d.id} className="flex items-center justify-between px-5 py-3 text-sm text-slate-800">
                <div>
                  <div className="font-medium">{d.label || d.username}</div>
                  <div className="text-xs text-slate-500">
                    {d.label ? `usuário: ${d.username} · ` : ""}
                    {d.sectors.length === 0
                      ? "Todos os Contratos"
                      : d.sectors.map((s) => s.name).join(", ")}
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {d.role === "superintendencia" ? "Superintendência" : "Diretoria"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
