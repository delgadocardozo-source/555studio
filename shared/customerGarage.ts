/** Garaje del cliente — vehículos asociados al phoneKey. */

export type CustomerVehicleType = "auto" | "camioneta";

export interface CustomerVehicle {
  id: string;
  type: CustomerVehicleType;
  model: string;
  plate: string;
}

export interface CustomerVehicleInput {
  type: CustomerVehicleType;
  model: string;
  plate?: string;
  id?: string;
}

export function makeVehicleId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function sanitizeCustomerVehicles(
  input: CustomerVehicleInput[] | null | undefined
): CustomerVehicle[] {
  if (!Array.isArray(input)) return [];
  const out: CustomerVehicle[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const model = String(raw?.model || "").trim();
    if (!model) continue;
    const type: CustomerVehicleType = raw?.type === "camioneta" ? "camioneta" : "auto";
    const plate = String(raw?.plate || "").trim().toUpperCase();
    const key = `${type}|${model.toLowerCase()}|${plate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(raw?.id || "").trim() || makeVehicleId(),
      type,
      model,
      plate,
    });
  }
  return out;
}

export function mergeGarageVehicles(
  existing: CustomerVehicle[],
  incoming: CustomerVehicleInput[]
): CustomerVehicle[] {
  return sanitizeCustomerVehicles([...existing, ...incoming]);
}

export function parseVehiclesJson(raw: unknown): CustomerVehicle[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return sanitizeCustomerVehicles(raw as CustomerVehicleInput[]);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? sanitizeCustomerVehicles(parsed) : [];
    } catch {
      return [];
    }
  }
  return [];
}
