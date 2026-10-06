import React, { useMemo, useState } from "react";
import { Pencil, Plus, Search, Truck, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { SUPPLIER_CATEGORIES, type Supplier } from "@shared/suppliers";

type Form = {
  name: string;
  phone: string;
  category: string;
  notes: string;
  active: boolean;
};

const emptyForm = (): Form => ({
  name: "",
  phone: "",
  category: SUPPLIER_CATEGORIES[0],
  notes: "",
  active: true,
});

export function SuppliersPanel() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());

  const { data: rows = [], isLoading } = trpc.suppliers.list.useQuery({
    includeInactive: true,
    search: search.trim() || undefined,
  });

  const visible = useMemo(
    () => (showInactive ? rows : rows.filter((r) => r.active)),
    [rows, showInactive]
  );

  const createMut = trpc.suppliers.create.useMutation({
    onSuccess: () => {
      toast.success("Proveedor guardado");
      utils.suppliers.invalidate();
      setModal(false);
      setForm(emptyForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const updateMut = trpc.suppliers.update.useMutation({
    onSuccess: () => {
      toast.success("Proveedor actualizado");
      utils.suppliers.invalidate();
      setModal(false);
      setForm(emptyForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo actualizar"),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModal(true);
  };

  const openEdit = (row: Supplier) => {
    setEditing(row);
    setForm({
      name: row.name,
      phone: row.phone,
      category: row.category,
      notes: row.notes || "",
      active: row.active,
    });
    setModal(true);
  };

  const submit = () => {
    if (!form.name.trim()) {
      toast.error("Indicá el nombre");
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      category: form.category,
      notes: form.notes.trim(),
      active: form.active,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Truck className="w-4 h-4 text-violet-400" />
            Proveedores
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Contactos de compra — químicos, herramientas, servicios.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Proveedor
        </button>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nombre, teléfono…"
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200"
          />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-400 shrink-0 px-1">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-slate-600"
          />
          Inactivos
        </label>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Cargando proveedores…</p>
      ) : visible.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
          <Truck className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Sin proveedores</p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-violet-600 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <div
              key={row.id}
              className={`bg-slate-900 border rounded-2xl p-3 ${
                row.active ? "border-slate-800" : "border-slate-800/60 opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">
                    {row.name}
                    {!row.active && (
                      <span className="ml-1.5 text-[10px] font-semibold text-slate-500">
                        inactivo
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {row.category}
                    {row.phone ? ` · ${row.phone}` : ""}
                  </p>
                  {row.notes ? (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{row.notes}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white shrink-0"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Editar proveedor" : "Nuevo proveedor"}
              </h3>
              <button type="button" onClick={() => setModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Nombre</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Teléfono</span>
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Categoría</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                >
                  {SUPPLIER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Notas</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
              />
            </label>
            {editing && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Activo
              </label>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
              className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
