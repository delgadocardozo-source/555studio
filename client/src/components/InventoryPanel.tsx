import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Beaker,
  Package,
  Pencil,
  Plus,
  Trash2,
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
import {
  WASH_VEHICLE_TYPES,
  washTypeLabel,
  type WashRecipeLine,
  type WashVehicleType,
} from "@shared/washRecipe";

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

type PanelTab = "stock" | "armado" | "movimientos";

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
  const [tab, setTab] = useState<PanelTab>("stock");
  const [showInactive, setShowInactive] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm());
  const [movModal, setMovModal] = useState(false);
  const [movForm, setMovForm] = useState<MovForm>(emptyMovForm());

  const [recipeType, setRecipeType] = useState<WashVehicleType>("auto");
  const [draftLines, setDraftLines] = useState<WashRecipeLine[]>([]);
  const [addItemId, setAddItemId] = useState("");
  const [addQty, setAddQty] = useState("1");

  const { data: items = [], isLoading } = trpc.inventory.listItems.useQuery({
    includeInactive: true,
  });
  const { data: stats } = trpc.inventory.stats.useQuery();
  const { data: movements = [] } = trpc.inventory.listMovements.useQuery({ limit: 40 });
  const { data: recipes } = trpc.inventory.getRecipes.useQuery();

  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const visible = showInactive ? items : activeItems;
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (!recipes) return;
    setDraftLines(recipes[recipeType] || []);
  }, [recipes, recipeType]);

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

  const recipeMut = trpc.inventory.setRecipeForType.useMutation({
    onSuccess: () => {
      toast.success(`Armado ${washTypeLabel(recipeType)} guardado`);
      utils.inventory.invalidate();
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar el armado"),
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

  const openMov = (itemId?: number, type: StockMovementType = "entrada") => {
    setMovForm({
      ...emptyMovForm(),
      type,
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
      minStock,
      unitCost,
      notes: itemForm.notes.trim(),
      active: itemForm.active,
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
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

  const addRecipeLine = () => {
    const itemId = Number(addItemId);
    const quantityPerVehicle = Math.round(Number(addQty));
    if (!itemId) {
      toast.error("Elegí un insumo");
      return;
    }
    if (!Number.isFinite(quantityPerVehicle) || quantityPerVehicle <= 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setDraftLines((prev) => {
      const rest = prev.filter((l) => l.itemId !== itemId);
      const existing = prev.find((l) => l.itemId === itemId);
      return [
        ...rest,
        {
          itemId,
          quantityPerVehicle: (existing?.quantityPerVehicle || 0) + quantityPerVehicle,
        },
      ];
    });
    setAddItemId("");
    setAddQty("1");
  };

  const saveRecipe = () => {
    recipeMut.mutate({ vehicleType: recipeType, lines: draftLines });
  };

  const recipeReady =
    (recipes?.auto?.length || 0) + (recipes?.camioneta?.length || 0) > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-400" />
            Stock de insumos
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Se descuenta al finalizar un lavado según el armado (receta) de auto / camioneta.
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
            onClick={() => openMov(undefined, "entrada")}
            disabled={activeItems.length === 0}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 disabled:opacity-50"
          >
            <ArrowDownUp className="w-3.5 h-3.5" />
            Entrada
          </button>
        </div>
      </div>

      {!recipeReady && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-100 flex gap-2 items-start">
          <Beaker className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
          <div>
            <p className="font-bold text-amber-200">Armado de lavado pendiente</p>
            <p className="text-amber-100/80 mt-0.5">
              Definí qué insumos consume un auto y una camioneta. Sin receta, finalizar un
              lavado no mueve stock.
            </p>
            <button
              type="button"
              onClick={() => setTab("armado")}
              className="mt-1.5 text-[11px] font-bold text-amber-200 underline"
            >
              Ir a Armado de lavado
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Ítems activos</span>
          <span className="text-lg font-extrabold text-emerald-300 tabular-nums">
            {stats?.itemsActive ?? 0}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Bajo stock</span>
          <span className="text-lg font-extrabold text-amber-300 flex items-center gap-1 tabular-nums">
            {(stats?.lowStockCount ?? 0) > 0 && <AlertTriangle className="w-4 h-4" />}
            {stats?.lowStockCount ?? 0}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 col-span-2">
          <span className="text-[10px] uppercase text-slate-500 block">Valor stock</span>
          <span className="text-lg font-extrabold text-white tabular-nums">
            {formatGs(stats?.stockValueGs || 0)}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-fit overflow-x-auto">
        {(
          [
            ["stock", "Stock"],
            ["armado", "Armado lavado"],
            ["movimientos", "Movimientos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0 ${
              tab === id ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Existencias
            </p>
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
            <p className="text-xs text-slate-500 py-6 text-center">Cargando stock…</p>
          ) : visible.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
              <Package className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Sin stock cargado</p>
              <p className="text-[11px] text-slate-500">
                Primero cargá insumos; después armá la receta de cada lavado.
              </p>
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
                      low
                        ? "border-amber-500/40"
                        : item.active
                          ? "border-slate-800"
                          : "border-slate-800/60 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">
                          {item.name}
                          {!item.active && (
                            <span className="ml-1.5 text-[10px] font-semibold text-slate-500">
                              inactivo
                            </span>
                          )}
                          {low && (
                            <span className="ml-1.5 text-[10px] font-semibold text-amber-300">
                              bajo stock
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-400">{item.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-extrabold text-emerald-300 tabular-nums leading-none">
                          {item.stock}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {item.unit}
                          {item.minStock > 0 ? ` · mín ${item.minStock}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-2">
                      {item.active && (
                        <>
                          <button
                            type="button"
                            onClick={() => openMov(item.id, "entrada")}
                            className="text-[11px] font-bold text-emerald-300 px-2 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10"
                          >
                            + Entrada
                          </button>
                          <button
                            type="button"
                            onClick={() => openMov(item.id, "salida")}
                            className="text-[11px] font-bold text-rose-300 px-2 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10"
                          >
                            Salida
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white ml-auto"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === "armado" && (
        <section className="space-y-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 space-y-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Beaker className="w-3.5 h-3.5 text-sky-400" />
              Armado previo del lavado
            </p>
            <p className="text-[11px] text-slate-400">
              Por cada vehículo del turno se descuenta esta receta al <strong className="text-slate-200">finalizar</strong> el lavado en la agenda.
            </p>
          </div>

          <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
            {WASH_VEHICLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setRecipeType(t)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                  recipeType === t ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {washTypeLabel(t)}
              </button>
            ))}
          </div>

          {activeItems.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center space-y-2">
              <p className="text-sm font-bold text-slate-300">Primero cargá insumos en Stock</p>
              <button
                type="button"
                onClick={() => {
                  setTab("stock");
                  openNew();
                }}
                className="text-xs font-bold text-emerald-300 underline"
              >
                Ir a Stock
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_auto] gap-2 items-end">
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-slate-500">Insumo</span>
                  <select
                    value={addItemId}
                    onChange={(e) => setAddItemId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                  >
                    <option value="">Seleccionar…</option>
                    {activeItems.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} (stock {i.stock} {i.unit})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] uppercase text-slate-500">Cant / vehículo</span>
                  <input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
                  />
                </label>
                <button
                  type="button"
                  onClick={addRecipeLine}
                  className="inline-flex items-center justify-center gap-1 text-xs font-bold px-3 py-2 rounded-xl bg-sky-600 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar
                </button>
              </div>

              {draftLines.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-3">
                  Sin insumos en la receta de {washTypeLabel(recipeType)}. Agregá al menos uno.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {draftLines.map((line) => {
                    const item = itemsById.get(line.itemId);
                    return (
                      <div
                        key={line.itemId}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {item?.name || `Ítem #${line.itemId}`}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {line.quantityPerVehicle} {item?.unit || "u"} por{" "}
                            {washTypeLabel(recipeType).toLowerCase()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftLines((prev) => prev.filter((l) => l.itemId !== line.itemId))
                          }
                          className="p-1.5 text-slate-500 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={saveRecipe}
                disabled={recipeMut.isPending}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold disabled:opacity-50"
              >
                Guardar armado · {washTypeLabel(recipeType)}
              </button>
            </>
          )}
        </section>
      )}

      {tab === "movimientos" && (
        <section className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 px-0.5">
            Últimos movimientos (incluye consumo de lavados)
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
      )}

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
