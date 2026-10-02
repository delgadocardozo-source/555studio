/** Inventario de insumos — módulo ERP aparte de la agenda. */

export const INVENTORY_UNITS = ["unid", "lt", "kg", "pack", "otro"] as const;
export type InventoryUnit = (typeof INVENTORY_UNITS)[number];

export const STOCK_MOVEMENT_TYPES = ["entrada", "salida", "ajuste"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
  minStock: number;
  unitCost: number | null;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemInput {
  name: string;
  category?: string;
  unit?: string;
  stock?: number;
  minStock?: number;
  unitCost?: number | null;
  notes?: string;
  active?: boolean;
}

export interface StockMovement {
  id: number;
  itemId: number;
  itemName: string;
  type: StockMovementType;
  quantity: number;
  movementDate: string;
  notes: string;
  stockAfter: number;
  createdAt: string;
}

export interface StockMovementInput {
  itemId: number;
  type: StockMovementType;
  quantity: number;
  movementDate: string;
  notes?: string;
}

export const INVENTORY_CATEGORIES = [
  "Químicos",
  "Ceras / selladores",
  "Paños / microfibra",
  "Herramientas",
  "Embalaje",
  "Otros",
] as const;

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

export function computeInventoryStats(items: InventoryItem[]) {
  const active = items.filter((i) => i.active);
  const lowStock = active.filter((i) => i.stock <= i.minStock);
  const stockValue = active.reduce((sum, i) => {
    const cost = i.unitCost != null ? i.unitCost : 0;
    return sum + cost * Math.max(0, i.stock);
  }, 0);
  return {
    itemsActive: active.length,
    itemsTotal: items.length,
    lowStockCount: lowStock.length,
    stockValueGs: stockValue,
    lowStock,
  };
}
