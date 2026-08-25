"use client";

import { useEffect, useState } from "react";

type Sector = { id: number; name: string };
type Gestor = { id: number; username: string };

export default function ContratosPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [gestoresBySector, setGestoresBySector] = useState<Record<number, Gestor[]>>({});
  const [name, setName] = useState("");
  const [gestorUsername, setGestorUsername] = useState("");
  const [gestorPassword, setGestorPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGestorFor, setSavingGestorFor] = useState<number | null>(null);
  const [gestorForm, setGestorForm] = useState<Record<number, { username: string; password: string }>>({});

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/sectors");
    const data = await res.json();
    const list: Sector[] = data.sectors ?? [];
    setSectors(list);

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
    </div>
  );
}
