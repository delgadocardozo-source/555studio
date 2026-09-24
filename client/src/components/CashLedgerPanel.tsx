import React, { useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Filter,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  CASH_EGRESO_CATEGORIES,
  CASH_INGRESO_CATEGORIES,
  categoriesForType,
  formatGs,
  type CashMovement,
  type CashMovementType,
} from "@shared/cashLedger";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type FormState = {
  type: CashMovementType;
  amount: string;
  movementDate: string;
  person: string;
  category: string;
  description: string;
};

const emptyForm = (): FormState => ({
  type: "egreso",
  amount: "",
  movementDate: todayIso(),
  person: "",
  category: CASH_EGRESO_CATEGORIES[0],
  description: "",
});

export function CashLedgerPanel() {
  const utils = trpc.useUtils();
  const [typeFilter, setTypeFilter] = useState<"todos" | CashMovementType>("todos");
  const [personFilter, setPersonFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("Todas");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CashMovement | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const filters = useMemo(
    () => ({
      type: typeFilter,
      person: personFilter || undefined,
      category: categoryFilter !== "Todas" ? categoryFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
    }),
    [typeFilter, personFilter, categoryFilter, dateFrom, dateTo, search]
  );

  const { data: movements = [], isLoading } = trpc.cashLedger.list.useQuery(filters);
  const { data: stats } = trpc.cashLedger.stats.useQuery(filters);
  const { data: persons = [] } = trpc.cashLedger.persons.useQuery();

  const createMutation = trpc.cashLedger.create.useMutation({
    onSuccess: () => {
      toast.success("Movimiento registrado");
      utils.cashLedger.invalidate();
      setFormOpen(false);
      setForm(emptyForm());
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const updateMutation = trpc.cashLedger.update.useMutation({
    onSuccess: () => {
      toast.success("Movimiento actualizado");
      utils.cashLedger.invalidate();
      setFormOpen(false);
      setEditing(null);
      setForm(emptyForm());
    },
    onError: (err) => toast.error(err.message || "No se pudo actualizar"),
  });

  const deleteMutation = trpc.cashLedger.delete.useMutation({
    onSuccess: () => {
      toast.success("Movimiento eliminado");
      utils.cashLedger.invalidate();
    },
    onError: (err) => toast.error(err.message || "No se pudo eliminar"),
  });

  const categoryOptions = useMemo(() => {
    const base =
      typeFilter === "ingreso"
        ? CASH_INGRESO_CATEGORIES
        : typeFilter === "egreso"
          ? CASH_EGRESO_CATEGORIES
          : [...CASH_INGRESO_CATEGORIES, ...CASH_EGRESO_CATEGORIES];
    return ["Todas", ...Array.from(new Set(base))];
  }, [typeFilter]);

  const formCategories = categoriesForType(form.type);

  const openCreate = (type: CashMovementType = "egreso") => {
    setEditing(null);
    setForm({
      ...emptyForm(),
      type,
      category: categoriesForType(type)[0],
    });
    setFormOpen(true);
  };

  const openEdit = (row: CashMovement) => {
    setEditing(row);
    setForm({
      type: row.type,
      amount: String(row.amount),
      movementDate: row.movementDate,
      person: row.person,
      category: row.category,
      description: row.description || "",
    });
    setFormOpen(true);
  };

  const submitForm = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingresá un monto válido mayor a 0");
      return;
    }
    if (!form.person.trim()) {
      toast.error("Indicá quién hizo el movimiento");
      return;
    }
    const payload = {
      type: form.type,
      amount,
      movementDate: form.movementDate,
      person: form.person.trim(),
      category: form.category.trim() || "Otros",
      description: form.description.trim(),
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activeFilters =
    (typeFilter !== "todos" ? 1 : 0) +
    (personFilter ? 1 : 0) +
    (categoryFilter !== "Todas" ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0) +
    (search ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-400" />
            Ingresos y Egresos
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Caja operativa aparte del agendamiento. Filtrá por persona para ver sus compras.
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => openCreate("ingreso")}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-600 text-white active:scale-95"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            Ingreso
          </button>
          <button
            type="button"
            onClick={() => openCreate("egreso")}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white active:scale-95"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            Egreso
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Ingresos</span>
          <span className="text-sm font-extrabold text-emerald-400 font-display">
            {formatGs(stats?.totalIngresos || 0)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Egresos</span>
          <span className="text-sm font-extrabold text-rose-400 font-display">
            {formatGs(stats?.totalEgresos || 0)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Balance</span>
          <span
            className={`text-sm font-extrabold font-display ${
              (stats?.balance || 0) >= 0 ? "text-sky-300" : "text-amber-300"
            }`}
          >
            {formatGs(stats?.balance || 0)}
          </span>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar persona, categoría o nota…"
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
        />
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`p-2 rounded-xl border touch-manipulation ${
            showFilters || activeFilters > 0
              ? "bg-red-600/20 border-red-500/40 text-red-300"
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 space-y-2.5 animate-in fade-in slide-in-from-top-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Tipo</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="todos">Todos</option>
                <option value="ingreso">Ingresos</option>
                <option value="egreso">Egresos</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Persona</span>
              <input
                list="cash-persons"
                value={personFilter}
                onChange={(e) => setPersonFilter(e.target.value)}
                placeholder="Quién gastó / cobró"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              />
              <datalist id="cash-persons">
                {persons.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Categoría</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase">Desde</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-200"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-slate-500 uppercase">Hasta</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-xs text-slate-200"
                />
              </label>
            </div>
          </div>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter("todos");
                setPersonFilter("");
                setCategoryFilter("Todas");
                setDateFrom("");
                setDateTo("");
                setSearch("");
              }}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Limpiar filtros ({activeFilters})
            </button>
          )}
        </div>
      )}

      {stats && stats.byPerson.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
            Por persona (filtro actual)
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto sheet-scroll">
            {stats.byPerson.map((p) => (
              <button
                key={p.person}
                type="button"
                onClick={() => {
                  setPersonFilter(p.person);
                  setShowFilters(true);
                }}
                className="w-full flex items-center justify-between gap-2 text-left px-2.5 py-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-600"
              >
                <div className="min-w-0">
                  <span className="text-xs font-bold text-white block truncate">{p.person}</span>
                  <span className="text-[10px] text-slate-500">{p.movements} mov.</span>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-rose-400">− {formatGs(p.egresos)}</div>
                  <div className="text-[10px] text-emerald-400">+ {formatGs(p.ingresos)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center text-xs text-slate-500 py-10">Cargando movimientos…</div>
      ) : movements.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
          <Wallet className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Sin movimientos</p>
          <p className="text-[11px] text-slate-500">
            Registrá un egreso (compra) o un ingreso para empezar.
          </p>
          <button
            type="button"
            onClick={() => openCreate("egreso")}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-red-600 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo egreso
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {movements.map((row) => (
            <div
              key={row.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex gap-3 items-start"
            >
              <div
                className={`mt-0.5 p-2 rounded-xl shrink-0 ${
                  row.type === "ingreso"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {row.type === "ingreso" ? (
                  <ArrowDownCircle className="w-4 h-4" />
                ) : (
                  <ArrowUpCircle className="w-4 h-4" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{row.person}</p>
                    <p className="text-[11px] text-slate-400">
                      {row.category} · {row.movementDate}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-extrabold font-display shrink-0 ${
                      row.type === "ingreso" ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {row.type === "ingreso" ? "+" : "−"}
                    {Number(row.amount).toLocaleString("es-PY")}
                  </span>
                </div>
                {row.description ? (
                  <p className="text-[11px] text-slate-500 leading-snug">{row.description}</p>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    className="text-[11px] text-slate-400 hover:text-white inline-flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Eliminar este movimiento?")) {
                        deleteMutation.mutate({ id: row.id });
                      }
                    }}
                    className="text-[11px] text-rose-400/80 hover:text-rose-300 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl max-h-[min(92dvh,720px)] overflow-y-auto sheet-scroll pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Editar movimiento" : form.type === "ingreso" ? "Nuevo ingreso" : "Nuevo egreso"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-1.5">
                {(["egreso", "ingreso"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        type: t,
                        category: categoriesForType(t).includes(prev.category as any)
                          ? prev.category
                          : categoriesForType(t)[0],
                      }))
                    }
                    className={`py-2.5 rounded-xl font-bold border ${
                      form.type === t
                        ? t === "ingreso"
                          ? "bg-emerald-600/20 border-emerald-500 text-emerald-200"
                          : "bg-rose-600/20 border-rose-500 text-rose-200"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    {t === "ingreso" ? "Ingreso" : "Egreso"}
                  </button>
                ))}
              </div>

              <label className="block space-y-1">
                <span className="text-slate-400">Monto (Gs.)</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="Ej: 150000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-slate-400">Persona (quién gastó / cobró)</span>
                <input
                  list="cash-form-persons"
                  value={form.person}
                  onChange={(e) => setForm((p) => ({ ...p, person: e.target.value }))}
                  placeholder="Nombre"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-red-500"
                />
                <datalist id="cash-form-persons">
                  {persons.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-slate-400">Fecha</span>
                  <input
                    type="date"
                    value={form.movementDate}
                    onChange={(e) => setForm((p) => ({ ...p, movementDate: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-red-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-slate-400">Categoría</span>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-red-500"
                  >
                    {formCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-slate-400">Detalle / compra (opcional)</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Qué se compró o de dónde viene el ingreso"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-red-500 resize-none"
                />
              </label>

              <button
                type="button"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={submitForm}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold py-3 rounded-2xl active:scale-95"
              >
                {editing ? "Guardar cambios" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
