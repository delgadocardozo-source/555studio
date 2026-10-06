import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Package,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  STOCK_MOVEMENT_TYPES,
  formatGs,
  type InventoryItem,
  type StockMovementType,
} from "@shared/inventory";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type ItemForm = {
  name: string;
  category: string;
  unit: string;
  stock: string;
  minStock: string;
  unitCost: string;
  notes: string;
  active: boolean;
};

type MovForm = {
  itemId: string;
  type: StockMovementType;
  quantity: string;
  movementDate: string;
  notes: string;
};

const emptyItemForm = (): ItemForm => ({
  name: "",
  category: INVENTORY_CATEGORIES[0],
  unit: "unid",
  stock: "0",
  minStock: "0",
  unitCost: "",
  notes: "",
  active: true,
});

const emptyMovForm = (): MovForm => ({
  itemId: "",
  type: "entrada",
  quantity: "",
  movementDate: todayIso(),
  notes: "",
});

export function InventoryPanel() {
  const utils = trpc.useUtils();
  const [showInactive, setShowInactive] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [movModal, setMovModal] = useState(false);
  const [movForm, setMovForm] = useState<MovForm>(emptyMovForm());

  const { data: items = [], isLoading } = trpc.inventory.listItems.useQuery({
    includeInactive: true,
  });
  const { data: stats } = trpc.inventory.stats.useQuery();
  const { data: movements = [] } = trpc.inventory.listMovements.useQuery({ limit: 30 });

  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const visible = showInactive ? items : activeItems;

  const createMut = trpc.inventory.createItem.useMutation({
    onSuccess: () => {
      toast.success("Insumo cargado");
      utils.inventory.invalidate();
      setItemModal(false);
      setItemForm(emptyItemForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const updateMut = trpc.inventory.updateItem.useMutation({
    onSuccess: () => {
      toast.success("Insumo actualizado");
      utils.inventory.invalidate();
      setItemModal(false);
      setItemForm(emptyItemForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo actualizar"),
  });

  const movMut = trpc.inventory.applyMovement.useMutation({
    onSuccess: () => {
      toast.success("Movimiento registrado");
      utils.inventory.invalidate();
      setMovModal(false);
      setMovForm(emptyMovForm());
    },
    onError: (err) => toast.error(err.message || "No se pudo registrar"),
  });

  const openNew = () => {
    setEditing(null);
    setItemForm(emptyItemForm());
    setItemModal(true);
  };

  const openEdit = (row: InventoryItem) => {
    setEditing(row);
    setItemForm({
      name: row.name,
      category: row.category,
      unit: row.unit,
      stock: String(row.stock),
      minStock: String(row.minStock),
      unitCost: row.unitCost != null ? String(row.unitCost) : "",
      notes: row.notes || "",
      active: row.active,
    });
    setItemModal(true);
  };

  const openMov = (itemId?: number) => {
    setMovForm({
      ...emptyMovForm(),
      itemId: itemId
        ? String(itemId)
        : activeItems[0]
          ? String(activeItems[0].id)
          : "",
    });
    setMovModal(true);
  };

  const submitItem = () => {
    if (!itemForm.name.trim()) {
      toast.error("Indicá el nombre");
      return;
    }
    const stock = Math.round(Number(itemForm.stock || 0));
    const minStock = Math.round(Number(itemForm.minStock || 0));
    const unitCost =
      itemForm.unitCost.trim() === ""
        ? null
        : Math.round(Number(itemForm.unitCost));
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error("Stock inválido");
      return;
    }
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      toast.error("Costo inválido");
      return;
    }
    const payload = {
      name: itemForm.name.trim(),
      category: itemForm.category,
      unit: itemForm.unit,
      stock: editing ? undefined : stock,
      minStock,
      unitCost,
      notes: itemForm.notes.trim(),
      active: itemForm.active,
    };
    if (editing) {
      updateMut.mutate({
        id: editing.id,
        data: {
          name: payload.name,
          category: payload.category,
          unit: payload.unit,
          minStock: payload.minStock,
          unitCost: payload.unitCost,
          notes: payload.notes,
          active: payload.active,
        },
      });
    } else {
      createMut.mutate({ ...payload, stock });
    }
  };

  const submitMov = () => {
    const itemId = Number(movForm.itemId);
    const quantity = Math.round(Number(movForm.quantity));
    if (!itemId) {
      toast.error("Seleccioná el insumo");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    movMut.mutate({
      itemId,
      type: movForm.type,
      quantity,
      movementDate: movForm.movementDate,
      notes: movForm.notes.trim(),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-400" />
            Inventario
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Insumos del lavadero — stock y movimientos, aparte de la agenda.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            Insumo
          </button>
          <button
            type="button"
            onClick={() => openMov()}
            disabled={activeItems.length === 0}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 disabled:opacity-50"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            Movimiento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Activos</span>
          <span className="text-sm font-extrabold text-emerald-300">{stats?.itemsActive ?? 0}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Bajo stock</span>
          <span className="text-sm font-extrabold text-amber-300 flex items-center gap-1">
            {(stats?.lowStockCount ?? 0) > 0 && <AlertTriangle className="w-3.5 h-3.5" />}
            {stats?.lowStockCount ?? 0}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 col-span-2">
          <span className="text-[10px] uppercase text-slate-500 block">Valor stock</span>
          <span className="text-sm font-extrabold text-white">{formatGs(stats?.stockValueGs || 0)}</span>
        </div>
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Insumos</p>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-600"
            />
            Ver inactivos
          </label>
        </div>

        {isLoading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Cargando inventario…</p>
        ) : visible.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
            <Package className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Sin insumos</p>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Cargar insumo
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((item) => {
              const low = item.active && item.stock <= item.minStock;
              return (
                <div
                  key={item.id}
                  className={`bg-slate-900 border rounded-2xl p-3 ${
                    low ? "border-amber-500/40" : item.active ? "border-slate-800" : "border-slate-800/60 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {item.name}
                        {!item.active && (
                          <span className="ml-1.5 text-[10px] font-semibold text-slate-500">inactivo</span>
                        )}
                        {low && (
                          <span className="ml-1.5 text-[10px] font-semibold text-amber-300">bajo stock</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {item.category} · {item.stock} {item.unit}
                        {item.minStock > 0 ? ` (mín. ${item.minStock})` : ""}
                        {item.unitCost != null ? ` · ${formatGs(item.unitCost)}/u` : ""}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {item.active && (
                        <button
                          type="button"
                          onClick={() => openMov(item.id)}
                          className="text-[11px] font-bold text-emerald-300 px-2 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10"
                        >
                          Mov.
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 px-0.5">
          Últimos movimientos
        </p>
        {movements.length === 0 ? (
          <p className="text-[11px] text-slate-500 px-1 py-3">Sin movimientos aún.</p>
        ) : (
          <div className="space-y-1.5">
            {movements.map((m) => (
              <div
                key={m.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-200 truncate">
                    {m.itemName}
                    <span
                      className={`ml-1.5 text-[10px] ${
                        m.type === "entrada"
                          ? "text-emerald-400"
                          : m.type === "salida"
                            ? "text-rose-400"
                            : "text-sky-400"
                      }`}
                    >
                      {m.type}
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {m.movementDate} · qty {m.quantity} → stock {m.stockAfter}
                    {m.notes ? ` · ${m.notes}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Editar insumo" : "Nuevo insumo"}
              </h3>
              <button type="button" onClick={() => setItemModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Nombre</span>
              <input
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Categoría</span>
                <select
                  value={itemForm.category}
                  onChange={(e) => setItemForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                >
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Unidad</span>
                <select
                  value={itemForm.unit}
                  onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                >
                  {INVENTORY_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {!editing && (
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-slate-500">Stock inicial</span>
                  <input
                    type="number"
                    min={0}
                    value={itemForm.stock}
                    onChange={(e) => setItemForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                  />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Stock mínimo</span>
                <input
                  type="number"
                  min={0}
                  value={itemForm.minStock}
                  onChange={(e) => setItemForm((f) => ({ ...f, minStock: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Costo unit. (Gs.)</span>
                <input
                  type="number"
                  min={0}
                  value={itemForm.unitCost}
                  onChange={(e) => setItemForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Notas</span>
              <textarea
                value={itemForm.notes}
                onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
              />
            </label>
            {editing && (
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={itemForm.active}
                  onChange={(e) => setItemForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Activo
              </label>
            )}
            <button
              type="button"
              onClick={submitItem}
              disabled={createMut.isPending || updateMut.isPending}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {movModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Movimiento de stock</h3>
              <button type="button" onClick={() => setMovModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Insumo</span>
              <select
                value={movForm.itemId}
                onChange={(e) => setMovForm((f) => ({ ...f, itemId: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="">Seleccionar…</option>
                {activeItems.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.stock} {i.unit})
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Tipo</span>
                <select
                  value={movForm.type}
                  onChange={(e) =>
                    setMovForm((f) => ({ ...f, type: e.target.value as StockMovementType }))
                  }
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                >
                  {STOCK_MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t === "ajuste" ? "ajuste (fijar stock)" : t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">
                  {movForm.type === "ajuste" ? "Stock resultante" : "Cantidad"}
                </span>
                <input
                  type="number"
                  min={1}
                  value={movForm.quantity}
                  onChange={(e) => setMovForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Fecha</span>
              <input
                type="date"
                value={movForm.movementDate}
                onChange={(e) => setMovForm((f) => ({ ...f, movementDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Notas</span>
              <input
                value={movForm.notes}
                onChange={(e) => setMovForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              type="button"
              onClick={submitMov}
              disabled={movMut.isPending}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
            >
              Registrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
