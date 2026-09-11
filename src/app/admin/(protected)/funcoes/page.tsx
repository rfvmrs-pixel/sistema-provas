"use client";

import { useEffect, useState } from "react";

type Role = { id: number; name: string; isOperator: boolean };

export default function FuncoesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [isOperator, setIsOperator] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/roles");
    const data = await res.json();
    setRoles(data.roles ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isOperator }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setName("");
    setIsOperator(false);
    load();
  }

  // Alterna o marcador "Operador" de uma função já existente — usado pela
  // aba pública de Simulados de Operadores (/simulado/operadores) pra
  // decidir quais funções aparecem lá.
  async function handleToggleOperator(role: Role) {
    setTogglingId(role.id);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOperator: !role.isOperator }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error);
        return;
      }
      load();
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Excluir esta função?")) return;
    const res = await fetch(`/api/admin/roles/${id}`, { method: "DELETE" });
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
        <h1 className="text-xl font-semibold text-slate-900">Funções</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cargos/funções usados para organizar funcionários e relatórios. Marque como
          &quot;Operador&quot; as funções que devem aparecer na aba pública de{" "}
          <span className="font-medium">Simulados de Operadores</span> (ex.: Operador de
          Guindaste, Operador de Empilhadeira...).
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da função"
          className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
          required
        />
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={isOperator}
            onChange={(e) => setIsOperator(e.target.checked)}
          />
          É função de Operador
        </label>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
          Adicionar
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-5 text-sm text-slate-400">Carregando...</p>
        ) : roles.length === 0 ? (
          <p className="p-5 text-sm text-slate-400">Nenhuma função cadastrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {roles.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-800">
                  {r.name}
                  {r.isOperator && (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      Operador
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleOperator(r)}
                    disabled={togglingId === r.id}
                    className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                  >
                    {r.isOperator ? "remover marcador Operador" : "marcar como Operador"}
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    excluir
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
