"use client";

import { useEffect, useState } from "react";

type Sector = { id: number; name: string };

export default function SetoresPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/sectors");
    const data = await res.json();
    setSectors(data.sectors ?? []);
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
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setName("");
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir este setor?")) return;
    const res = await fetch(`/api/admin/sectors/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Setores</h1>
        <p className="mt-1 text-sm text-slate-500">Setores usados para organizar funcionários e relatórios.</p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do setor"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          required
        />
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Adicionar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-5 text-sm text-slate-400">Carregando...</p>
        ) : sectors.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhum setor cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sectors.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-800">{s.name}</span>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  excluir
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
