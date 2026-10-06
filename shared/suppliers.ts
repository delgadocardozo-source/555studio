/** Proveedores — módulo ERP aparte de la agenda. */

export interface Supplier {
  id: number;
  name: string;
  phone: string;
  category: string;
  notes: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  name: string;
  phone?: string;
  category?: string;
  notes?: string;
  active?: boolean;
}

export const SUPPLIER_CATEGORIES = [
  "Químicos",
  "Herramientas",
  "Combustible",
  "Repuestos",
  "Servicios",
  "Otros",
] as const;

export function matchSupplierSearch(row: Supplier, search?: string): boolean {
  if (!search?.trim()) return true;
  const q = search.trim().toLowerCase();
  return `${row.name} ${row.phone} ${row.category} ${row.notes}`.toLowerCase().includes(q);
}
