/** Receta / armado de lavado → consumo de stock por vehículo. */

export const WASH_VEHICLE_TYPES = ["auto", "camioneta"] as const;
export type WashVehicleType = (typeof WASH_VEHICLE_TYPES)[number];

export interface WashRecipeLine {
  itemId: number;
  /** Cantidad de insumo por unidad de ese tipo de vehículo. */
  quantityPerVehicle: number;
}

export type WashRecipes = Record<WashVehicleType, WashRecipeLine[]>;

export function emptyWashRecipes(): WashRecipes {
  return { auto: [], camioneta: [] };
}

export function washTypeLabel(type: WashVehicleType): string {
  return type === "auto" ? "Auto" : "Camioneta";
}

/** Agrega cantidades por ítem según vehículos del turno. */
export function expandWashConsumption(
  recipes: WashRecipes,
  vehicles: Array<{ type: string }>
): Array<{ itemId: number; quantity: number; vehicleType: WashVehicleType; vehicleCount: number }> {
  const counts: Record<WashVehicleType, number> = { auto: 0, camioneta: 0 };
  for (const v of vehicles) {
    const t = v.type === "camioneta" ? "camioneta" : v.type === "auto" ? "auto" : null;
    if (t) counts[t] += 1;
  }

  const byItem = new Map<
    number,
    { itemId: number; quantity: number; vehicleType: WashVehicleType; vehicleCount: number }
  >();

  for (const type of WASH_VEHICLE_TYPES) {
    const n = counts[type];
    if (n <= 0) continue;
    for (const line of recipes[type] || []) {
      const qty = Math.round(Number(line.quantityPerVehicle)) * n;
      if (!Number.isFinite(qty) || qty <= 0) continue;
      const prev = byItem.get(line.itemId);
      if (prev) {
        prev.quantity += qty;
        // Si el mismo ítem sale en auto y camioneta, dejamos el último tipo como etiqueta.
        prev.vehicleType = type;
        prev.vehicleCount += n;
      } else {
        byItem.set(line.itemId, {
          itemId: line.itemId,
          quantity: qty,
          vehicleType: type,
          vehicleCount: n,
        });
      }
    }
  }

  return Array.from(byItem.values());
}

export function sanitizeRecipeLines(lines: WashRecipeLine[]): WashRecipeLine[] {
  const map = new Map<number, number>();
  for (const line of lines || []) {
    const itemId = Math.round(Number(line.itemId));
    const qty = Math.round(Number(line.quantityPerVehicle));
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    map.set(itemId, (map.get(itemId) || 0) + qty);
  }
  return Array.from(map.entries()).map(([itemId, quantityPerVehicle]) => ({
    itemId,
    quantityPerVehicle,
  }));
}

export function recipeHasLines(recipes: WashRecipes): boolean {
  return WASH_VEHICLE_TYPES.some((t) => (recipes[t] || []).length > 0);
}
