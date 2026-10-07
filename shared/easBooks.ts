/**
 * Libros de una EAS (Ley 6480/2020, art. 31) y posición de IVA.
 * El diario sale de comprobantes reales. No transmite al SIFEN ni presenta la DJ.
 */

export type EasRegime = "resimple" | "simple" | "general";

export interface EasProfile {
  legalName: string;
  ruc: string;
  regime: EasRegime;
  /** Actividad declarada. */
  activity: string;
  /** Representante legal: la EAS es persona jurídica y Hechauka lo exige. */
  repName: string;
  repRuc: string;
  /** Timbrado de las facturas de venta. 8 dígitos o más. */
  timbrado: string;
  /** Establecimiento de 3 dígitos, ej. 001. */
  establecimiento: string;
  /** Punto de expedición de 3 dígitos, ej. 001. */
  puntoExpedicion: string;
  updatedAt: string;
}

export const EAS_ACCOUNTS = {
  caja: { code: "1101", name: "Caja" },
  clientes: { code: "1102", name: "Créditos por servicios" },
  ivaCredito: { code: "1103", name: "IVA crédito fiscal" },
  ivaDebito: { code: "2101", name: "IVA débito fiscal" },
  ventas: { code: "4101", name: "Ingresos por servicios" },
  gastos: { code: "5101", name: "Compras y gastos operativos" },
  sueldos: { code: "5102", name: "Sueldos y jornales" },
} as const;

export interface EasPurchaseInput {
  date: string;
  supplierName: string;
  supplierRuc?: string;
  voucherNumber: string;
  /** Timbrado del proveedor, para el libro de compras de Hechauka. */
  timbrado?: string;
  description?: string;
  /** Gravado IVA 10%, sin el impuesto. */
  taxed10?: number;
  /** Gravado IVA 5%, sin el impuesto. */
  taxed5?: number;
  exempt?: number;
}

export interface EasPurchase {
  id: number;
  date: string;
  supplierName: string;
  supplierRuc: string;
  voucherNumber: string;
  timbrado: string;
  description: string;
  taxed10: number;
  iva10: number;
  taxed5: number;
  iva5: number;
  exempt: number;
  total: number;
  createdAt: string;
}

export interface SalesBookRow {
  date: string;
  number: string;
  clientName: string;
  clientRuc: string;
  taxed10: number;
  iva10: number;
  total: number;
  collected: boolean;
}

export interface JournalLine {
  code: string;
  name: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  memo: string;
  lines: JournalLine[];
}

export interface LedgerAccountBalance {
  code: string;
  name: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface IvaPosition {
  applies: boolean;
  debitoFiscal: number;
  creditoFiscal: number;
  saldo: number;
  /** saldo > 0 se ingresa; saldo < 0 queda como crédito. */
  aPagar: number;
  creditoAFavor: number;
}

export interface InventoryBookLine {
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  value: number;
  missingCost: boolean;
}

function roundGs(n: number): number {
  return Math.max(0, Math.round(Number(n) || 0));
}

export function regimeChargesIva(regime: EasRegime): boolean {
  return regime !== "resimple";
}

export function normalizeEasProfile(input: Partial<EasProfile> | null | undefined): EasProfile {
  const regime = input?.regime === "resimple" || input?.regime === "general" ? input.regime : "simple";
  return {
    legalName: String(input?.legalName || "").trim(),
    ruc: String(input?.ruc || "").trim(),
    regime,
    activity: String(input?.activity || "Lavado y detallado de vehículos a domicilio").trim(),
    repName: String(input?.repName || "").trim(),
    repRuc: String(input?.repRuc || "").trim(),
    timbrado: String(input?.timbrado || "").replace(/\D/g, ""),
    establecimiento: String(input?.establecimiento || "001").replace(/\D/g, "").padStart(3, "0").slice(-3),
    puntoExpedicion: String(input?.puntoExpedicion || "001").replace(/\D/g, "").padStart(3, "0").slice(-3),
    updatedAt: String(input?.updatedAt || ""),
  };
}

export function buildEasPurchase(
  input: EasPurchaseInput,
  id: number,
  createdAt: string
): EasPurchase {
  const date = String(input.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha de compra inválida");
  const supplierName = String(input.supplierName || "").trim();
  if (supplierName.length < 2) throw new Error("Indicá el proveedor");
  const voucherNumber = String(input.voucherNumber || "").trim();
  if (!voucherNumber) throw new Error("Indicá el número de comprobante del proveedor");
  const taxed10 = roundGs(input.taxed10 || 0);
  const taxed5 = roundGs(input.taxed5 || 0);
  const exempt = roundGs(input.exempt || 0);
  const iva10 = Math.round(taxed10 * 0.1);
  const iva5 = Math.round(taxed5 * 0.05);
  const total = taxed10 + iva10 + taxed5 + iva5 + exempt;
  if (total <= 0) throw new Error("La compra no tiene monto");
  return {
    id,
    date,
    supplierName,
    supplierRuc: String(input.supplierRuc || "").trim(),
    voucherNumber,
    timbrado: String(input.timbrado || "").replace(/\D/g, ""),
    description: String(input.description || "").trim(),
    taxed10,
    iva10,
    taxed5,
    iva5,
    exempt,
    total,
    createdAt,
  };
}

export function inMonth(isoDate: string, month: string): boolean {
  return String(isoDate || "").slice(0, 7) === month;
}

export interface SalesInvoiceLike {
  number: string;
  status: string;
  issuedDate: string;
  clientName: string;
  clientTaxId?: string | null;
  taxableBase: number;
  ivaAmount: number;
  total: number;
  paymentStatus?: string | null;
  appointmentCode?: string;
}

export function buildSalesBook(invoices: SalesInvoiceLike[], month: string): SalesBookRow[] {
  return invoices
    .filter((inv) => inv.status === "emitida" && inMonth(inv.issuedDate, month))
    .map((inv) => ({
      date: inv.issuedDate,
      number: inv.number,
      clientName: inv.clientName,
      clientRuc: String(inv.clientTaxId || ""),
      taxed10: inv.taxableBase,
      iva10: inv.ivaAmount,
      total: inv.total,
      collected: inv.paymentStatus === "pagado",
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

export function buildIvaPosition(
  regime: EasRegime,
  sales: SalesBookRow[],
  purchases: EasPurchase[]
): IvaPosition {
  if (!regimeChargesIva(regime)) {
    return {
      applies: false,
      debitoFiscal: 0,
      creditoFiscal: 0,
      saldo: 0,
      aPagar: 0,
      creditoAFavor: 0,
    };
  }
  const debitoFiscal = sales.reduce((s, row) => s + row.iva10, 0);
  const creditoFiscal = purchases.reduce((s, row) => s + row.iva10 + row.iva5, 0);
  const saldo = debitoFiscal - creditoFiscal;
  return {
    applies: true,
    debitoFiscal,
    creditoFiscal,
    saldo,
    aPagar: Math.max(0, saldo),
    creditoAFavor: Math.max(0, -saldo),
  };
}

function line(account: { code: string; name: string }, debit: number, credit: number): JournalLine {
  return { code: account.code, name: account.name, debit, credit };
}

function assertBalanced(entry: JournalEntry) {
  const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
  const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
  if (debit !== credit) {
    throw new Error(`Asiento desbalanceado (${entry.id}): ${debit} ≠ ${credit}`);
  }
}

export function buildJournal(params: {
  regime: EasRegime;
  sales: SalesBookRow[];
  purchases: EasPurchase[];
  payroll: Array<{ id: number; paymentDate: string; staffName: string; amount: number; concept: string }>;
}): JournalEntry[] {
  const iva = regimeChargesIva(params.regime);
  const entries: JournalEntry[] = [];

  for (const sale of params.sales) {
    const lines: JournalLine[] = [line(EAS_ACCOUNTS.clientes, sale.total, 0)];
    if (iva) {
      lines.push(line(EAS_ACCOUNTS.ventas, 0, sale.taxed10));
      lines.push(line(EAS_ACCOUNTS.ivaDebito, 0, sale.iva10));
    } else {
      lines.push(line(EAS_ACCOUNTS.ventas, 0, sale.total));
    }
    const entry: JournalEntry = {
      id: `venta-${sale.number}`,
      date: sale.date,
      memo: `Servicio ${sale.number} · ${sale.clientName}`,
      lines,
    };
    assertBalanced(entry);
    entries.push(entry);

    if (sale.collected) {
      const cobro: JournalEntry = {
        id: `cobro-${sale.number}`,
        date: sale.date,
        memo: `Cobro ${sale.number}`,
        lines: [line(EAS_ACCOUNTS.caja, sale.total, 0), line(EAS_ACCOUNTS.clientes, 0, sale.total)],
      };
      assertBalanced(cobro);
      entries.push(cobro);
    }
  }

  for (const buy of params.purchases) {
    const gasto = buy.taxed10 + buy.taxed5 + buy.exempt;
    const credito = iva ? buy.iva10 + buy.iva5 : 0;
    const lines: JournalLine[] = [line(EAS_ACCOUNTS.gastos, gasto + (iva ? 0 : buy.iva10 + buy.iva5), 0)];
    if (iva && credito > 0) lines.push(line(EAS_ACCOUNTS.ivaCredito, credito, 0));
    lines.push(line(EAS_ACCOUNTS.caja, 0, buy.total));
    const entry: JournalEntry = {
      id: `compra-${buy.id}`,
      date: buy.date,
      memo: `Compra ${buy.voucherNumber} · ${buy.supplierName}`,
      lines,
    };
    assertBalanced(entry);
    entries.push(entry);
  }

  for (const pay of params.payroll) {
    const amount = roundGs(pay.amount);
    if (amount <= 0) continue;
    const entry: JournalEntry = {
      id: `sueldo-${pay.id}`,
      date: pay.paymentDate,
      memo: `Sueldo ${pay.staffName} · ${pay.concept}`,
      lines: [line(EAS_ACCOUNTS.sueldos, amount, 0), line(EAS_ACCOUNTS.caja, 0, amount)],
    };
    assertBalanced(entry);
    entries.push(entry);
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function buildLedger(entries: JournalEntry[]): LedgerAccountBalance[] {
  const map = new Map<string, LedgerAccountBalance>();
  for (const entry of entries) {
    for (const row of entry.lines) {
      const cur = map.get(row.code) || {
        code: row.code,
        name: row.name,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      cur.debit += row.debit;
      cur.credit += row.credit;
      cur.balance = cur.debit - cur.credit;
      map.set(row.code, cur);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function ledgerTotals(rows: LedgerAccountBalance[]): { debit: number; credit: number } {
  return {
    debit: rows.reduce((s, r) => s + r.debit, 0),
    credit: rows.reduce((s, r) => s + r.credit, 0),
  };
}

export function buildInventoryBook(
  items: Array<{ name: string; unit: string; stock: number; unitCost: number | null; active?: boolean }>
): { lines: InventoryBookLine[]; totalValue: number } {
  const lines = items
    .filter((item) => item.active !== false && Number(item.stock) > 0)
    .map((item) => {
      const quantity = Number(item.stock) || 0;
      const unitCost = item.unitCost == null ? 0 : Math.round(Number(item.unitCost) || 0);
      return {
        name: item.name,
        unit: item.unit,
        quantity,
        unitCost,
        value: quantity * unitCost,
        missingCost: item.unitCost == null || unitCost <= 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    lines,
    totalValue: lines.reduce((s, row) => s + row.value, 0),
  };
}

export function regimeObligations(regime: EasRegime): string[] {
  const corporate = [
    "Libro diario y libro inventario (Ley 6480, art. 31). Este módulo los arma con los comprobantes cargados.",
    "Libros societarios — actas de gobierno, registro de acciones y actas de administración — se rubrican aparte. El sistema no los sustituye.",
  ];
  if (regime === "resimple") {
    return [
      ...corporate,
      "RESIMPLE no liquida IVA. Igual hay que emitir comprobantes y presentar la declaración del régimen.",
      "La factura electrónica (SIFEN) depende del calendario de la DNIT. Este sistema no la transmite.",
    ];
  }
  if (regime === "simple") {
    return [
      ...corporate,
      "IVA mensual: débito de ventas menos crédito de compras con comprobante.",
      "IRE SIMPLE e registro de comprobantes del mes. El contador presenta la declaración.",
      "La factura electrónica (SIFEN) depende del calendario de la DNIT. Este sistema no la transmite.",
    ];
  }
  return [
    ...corporate,
    "IVA mensual y registro de comprobantes.",
    "IRE general: estados financieros y declaración jurada. El mayor de abajo es el borrador para el contador, no el balance firmado.",
    "La factura electrónica (SIFEN) depende del calendario de la DNIT. Este sistema no la transmite.",
  ];
}
