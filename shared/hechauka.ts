/**
 * Presentación mensual para el contador.
 * TXT de Hechauka v3.2.1 (tabulados, sin BOM, CRLF) y CSV de los libros.
 * No transmite a la DNIT ni al SIFEN.
 */
import {
  normalizeEasProfile,
  type EasProfile,
  type EasPurchase,
  type InventoryBookLine,
  type IvaPosition,
  type JournalEntry,
  type LedgerAccountBalance,
  type SalesBookRow,
} from "./easBooks";
import { buildStoreZip, type StoreZipFile } from "./storeZip";

export interface MonthBooks {
  profile: EasProfile;
  month: string;
  sales: SalesBookRow[];
  purchases: EasPurchase[];
  journal: JournalEntry[];
  ledger: LedgerAccountBalance[];
  iva: IvaPosition;
  inventory: { lines: InventoryBookLine[]; totalValue: number };
}

export interface MonthPackage {
  zipName: string;
  files: StoreZipFile[];
  blockers: string[];
  exclusions: string[];
  hechaukaIncluded: boolean;
}

/** Dígito verificador de RUC paraguayo, módulo 11 (base máxima 11). */
export function rucCheckDigit(base: string): number {
  const digits = String(base || "").replace(/\D/g, "");
  let weight = 2;
  let total = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    if (weight > 11) weight = 2;
    total += Number(digits[i]) * weight;
    weight += 1;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

export function parseRuc(input: string): { base: string; dv: number } | null {
  const raw = String(input || "").trim().replace(/\s/g, "");
  if (!raw) return null;
  let base = "";
  let dv = -1;
  const hyphen = raw.match(/^(\d+)-(\d)$/);
  if (hyphen) {
    base = hyphen[1];
    dv = Number(hyphen[2]);
  } else if (/^\d{3,}$/.test(raw)) {
    base = raw.slice(0, -1);
    dv = Number(raw.slice(-1));
  } else {
    return null;
  }
  if (!base || rucCheckDigit(base) !== dv) return null;
  return { base, dv };
}

export function hechaukaBlockers(profile: EasProfile): string[] {
  const card = normalizeEasProfile(profile);
  const blockers: string[] = [];
  if (card.regime === "resimple") {
    blockers.push("RESIMPLE no liquida IVA, así que este mes no lleva los formularios 211 y 221.");
  }
  if (card.legalName.length < 2) blockers.push("Falta la razón social.");
  if (!parseRuc(card.ruc)) blockers.push("El RUC de la empresa no cierra con el dígito verificador.");
  if (card.repName.length < 2) blockers.push("Falta el nombre del representante legal.");
  if (!parseRuc(card.repRuc)) blockers.push("El RUC del representante legal no cierra con el dígito verificador.");
  if (!/^\d{8,}$/.test(card.timbrado)) blockers.push("Falta el timbrado del emisor (8 dígitos o más).");
  if (!/^\d{3}$/.test(card.establecimiento)) blockers.push("Falta el establecimiento de 3 dígitos.");
  if (!/^\d{3}$/.test(card.puntoExpedicion)) blockers.push("Falta el punto de expedición de 3 dígitos.");
  return blockers;
}

/** CS-000001 → 001-001-0000001. El número interno no sirve en Hechauka. */
export function hechaukaSalesNumber(internal: string, establecimiento: string, punto: string): string | null {
  const match = String(internal || "").trim().match(/^CS-(\d+)$/i);
  if (!match) return null;
  const seq = String(Number(match[1]));
  if (seq.length > 7) return null;
  return `${establecimiento}-${punto}-${seq.padStart(7, "0")}`;
}

function periodCode(month: string): string {
  return month.replace("-", "");
}

function formatHechaukaDate(iso: string, month: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.slice(0, 7) !== month) return null;
  const [year, mon, day] = iso.split("-");
  return `${day}/${mon}/${year}`;
}

function cell(value: string): string {
  return String(value || "").replace(/[\t\r\n]+/g, " ").trim();
}

function tsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map((field) => cell(String(field))).join("\t")).join("\r\n") + "\r\n";
}

function csvEscape(value: string): string {
  if (/[;"\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function csv(rows: string[][]): string {
  const body = rows.map((row) => row.map((field) => csvEscape(field)).join(";")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function ivaIncluido10(total: number): { grav10: number; iva10: number; ingreso: number } {
  const ingreso = Math.max(0, Math.round(Number(total) || 0));
  const iva10 = Math.round((ingreso * 10) / 110);
  return { grav10: ingreso - iva10, iva10, ingreso };
}

const VOUCHER = /^\d{3}-\d{3}-\d{1,7}$/;

function purchaseProblems(row: EasPurchase, month: string): string[] {
  const problems: string[] = [];
  const timbrado = String(row.timbrado || "").replace(/\D/g, "");
  if (!/^\d{8,}$/.test(timbrado)) problems.push("falta timbrado de 8 dígitos");
  if (!VOUCHER.test(String(row.voucherNumber || "").trim())) {
    problems.push("el número no tiene el formato ###-###-#######");
  }
  if (!parseRuc(row.supplierRuc)) problems.push("el RUC del proveedor no cierra con el dígito verificador");
  if (!formatHechaukaDate(row.date, month)) problems.push("la fecha está fuera del mes");
  return problems;
}

interface ComprasBuild {
  text: string;
  exclusions: string[];
}

function buildComprasTxt(books: MonthBooks, card: EasProfile, company: { base: string; dv: number }, rep: { base: string; dv: number }): ComprasBuild {
  const exclusions: string[] = [];
  const details: Array<Array<string | number>> = [];
  let montoSinIva = 0;

  for (const row of books.purchases) {
    const problems = purchaseProblems(row, books.month);
    if (problems.length) {
      exclusions.push(`Compra ${row.voucherNumber || "sin número"} · ${row.supplierName}: ${problems.join("; ")}.`);
      continue;
    }
    const supplier = parseRuc(row.supplierRuc)!;
    const fecha = formatHechaukaDate(row.date, books.month)!;
    const tipoOp = row.taxed10 + row.taxed5 > 0 ? 8 : 11;
    montoSinIva += row.taxed10 + row.taxed5 + row.exempt;
    details.push([
      2,
      supplier.base,
      supplier.dv,
      cell(row.supplierName),
      String(row.timbrado).replace(/\D/g, ""),
      1,
      row.voucherNumber.trim(),
      fecha,
      row.taxed10,
      row.iva10,
      row.taxed5,
      row.iva5,
      row.exempt,
      tipoOp,
      1,
      0,
    ]);
  }

  const header = [
    1,
    periodCode(books.month),
    1,
    911,
    211,
    company.base,
    company.dv,
    cell(card.legalName),
    rep.base,
    rep.dv,
    cell(card.repName),
    details.length,
    montoSinIva,
    "NO",
    2,
  ];
  return { text: tsv([header, ...details]), exclusions };
}

interface VentasBuild {
  text: string;
  exclusions: string[];
}

function buildVentasTxt(books: MonthBooks, card: EasProfile, company: { base: string; dv: number }, rep: { base: string; dv: number }): VentasBuild {
  const exclusions: string[] = [];
  const details: Array<Array<string | number>> = [];
  const consumers: SalesBookRow[] = [];

  for (const sale of books.sales) {
    const raw = String(sale.clientRuc || "").trim();
    if (!raw || !/\d/.test(raw)) {
      consumers.push(sale);
      continue;
    }
    const client = parseRuc(raw);
    if (!client) {
      exclusions.push(`Venta ${sale.number} · ${sale.clientName}: el RUC del cliente no cierra con el dígito verificador.`);
      continue;
    }
    const numero = hechaukaSalesNumber(sale.number, card.establecimiento, card.puntoExpedicion);
    if (!numero) {
      exclusions.push(`Venta ${sale.number} · ${sale.clientName}: el número interno no se puede llevar al formato establecimiento-punto-secuencia.`);
      continue;
    }
    const fecha = formatHechaukaDate(sale.date, books.month);
    if (!fecha) {
      exclusions.push(`Venta ${sale.number} · ${sale.clientName}: la fecha está fuera del mes.`);
      continue;
    }
    const tax = ivaIncluido10(sale.total);
    const contado = sale.collected;
    details.push([
      2,
      client.base,
      client.dv,
      cell(sale.clientName),
      1,
      numero,
      fecha,
      tax.grav10,
      tax.iva10,
      0,
      0,
      0,
      tax.ingreso,
      contado ? 1 : 2,
      contado ? 0 : 1,
      card.timbrado,
    ]);
  }

  if (consumers.length) {
    let grav10 = 0;
    let iva10 = 0;
    let ingreso = 0;
    let allCash = true;
    let latest = consumers[0].date;
    for (const sale of consumers) {
      const tax = ivaIncluido10(sale.total);
      grav10 += tax.grav10;
      iva10 += tax.iva10;
      ingreso += tax.ingreso;
      if (!sale.collected) allCash = false;
      if (sale.date > latest) latest = sale.date;
    }
    const fecha = formatHechaukaDate(latest, books.month);
    if (!fecha) {
      exclusions.push("Ventas sin RUC: la fecha quedó fuera del mes y no se consolidaron.");
    } else {
      details.push([
        2,
        "44444401",
        7,
        "Consumidor final",
        1,
        0,
        fecha,
        grav10,
        iva10,
        0,
        0,
        0,
        ingreso,
        allCash ? 1 : 2,
        allCash ? 0 : 1,
        0,
      ]);
    }
  }

  const sumMonto = details.reduce((sum, row) => sum + Number(row[12]), 0);
  const header = [
    1,
    periodCode(books.month),
    1,
    921,
    221,
    company.base,
    company.dv,
    cell(card.legalName),
    rep.base,
    rep.dv,
    cell(card.repName),
    details.length,
    sumMonto,
    2,
  ];
  return { text: tsv([header, ...details]), exclusions };
}

function libroDiarioCsv(journal: JournalEntry[]): string {
  const rows = [["Fecha", "Asiento", "Glosa", "Cuenta", "Nombre", "Debe", "Haber"]];
  for (const entry of journal) {
    for (const line of entry.lines) {
      rows.push([entry.date, entry.id, entry.memo, line.code, line.name, String(line.debit), String(line.credit)]);
    }
  }
  return csv(rows);
}

function libroMayorCsv(ledger: LedgerAccountBalance[]): string {
  const rows = [["Cuenta", "Nombre", "Debe", "Haber", "Saldo"]];
  for (const row of ledger) {
    rows.push([row.code, row.name, String(row.debit), String(row.credit), String(row.balance)]);
  }
  return csv(rows);
}

function inventarioCsv(lines: InventoryBookLine[]): string {
  const rows = [["Insumo", "Unidad", "Cantidad", "Costo unitario", "Valor", "Nota"]];
  for (const row of lines) {
    rows.push([
      row.name,
      row.unit,
      String(row.quantity),
      String(row.unitCost),
      String(row.value),
      row.missingCost ? "Sin costo cargado" : "",
    ]);
  }
  return csv(rows);
}

function posicionIvaCsv(iva: IvaPosition): string {
  return csv([
    ["Concepto", "Monto"],
    ["Aplica IVA", iva.applies ? "Sí" : "No"],
    ["Débito fiscal", String(iva.debitoFiscal)],
    ["Crédito fiscal", String(iva.creditoFiscal)],
    ["Saldo", String(iva.saldo)],
    ["A ingresar", String(iva.aPagar)],
    ["Crédito a favor", String(iva.creditoAFavor)],
  ]);
}

function comprasCsv(rows: EasPurchase[]): string {
  const out = [["Fecha", "Proveedor", "RUC", "Timbrado", "Comprobante", "Gravado 10", "IVA 10", "Gravado 5", "IVA 5", "Exenta", "Total", "Detalle"]];
  for (const row of rows) {
    out.push([
      row.date,
      row.supplierName,
      row.supplierRuc,
      row.timbrado || "",
      row.voucherNumber,
      String(row.taxed10),
      String(row.iva10),
      String(row.taxed5),
      String(row.iva5),
      String(row.exempt),
      String(row.total),
      row.description || "",
    ]);
  }
  return csv(out);
}

function ventasCsv(rows: SalesBookRow[]): string {
  const out = [["Fecha", "Número", "Cliente", "RUC", "Gravado 10", "IVA 10", "Total", "Cobrado"]];
  for (const row of rows) {
    out.push([
      row.date,
      row.number,
      row.clientName,
      row.clientRuc,
      String(row.taxed10),
      String(row.iva10),
      String(row.total),
      row.collected ? "Sí" : "No",
    ]);
  }
  return csv(out);
}

function buildLeeme(opts: {
  books: MonthBooks;
  card: EasProfile;
  period: string;
  blockers: string[];
  exclusions: string[];
  hechauka: boolean;
}): string {
  const debit = opts.books.journal.reduce((sum, entry) => sum + entry.lines.reduce((s, line) => s + line.debit, 0), 0);
  const credit = opts.books.journal.reduce((sum, entry) => sum + entry.lines.reduce((s, line) => s + line.credit, 0), 0);
  const lines = [
    `Presentación ${opts.books.month}`,
    opts.card.legalName || "EAS sin razón social cargada",
    "",
    "Este ZIP es un borrador para que el contador lo revise e importe en Hechauka.",
    "El sistema no transmite nada a la DNIT ni al SIFEN y no presenta la declaración jurada.",
    "Tampoco reemplaza los libros societarios que se rubrican aparte: actas de gobierno, registro de acciones y actas de administración.",
    "",
    "Archivos",
    `- libro-diario-${opts.period}.csv: asientos del mes (ventas, cobros si están pagados, compras y sueldos).`,
    `- libro-mayor-${opts.period}.csv: sumas y saldos por cuenta.`,
    `- libro-inventario-${opts.period}.csv: existencia actual del stock valorizada al costo. No es el asiento de compra: la compra está en el diario como gasto.`,
    `- posicion-iva-${opts.period}.csv: débito, crédito y saldo de IVA del mes.`,
    `- compras-${opts.period}.csv: libro de compras. La base está sin IVA, como se cargó el comprobante del proveedor.`,
    `- ventas-${opts.period}.csv: libro de ventas con el número interno (CS-000001).`,
    "",
    "Los CSV usan punto y coma y llevan marca BOM para que Excel abra los acentos. Los montos van en guaraníes, sin separador de miles.",
    `Sumas del diario: debe ${debit} · haber ${credit}.${debit === credit ? " Cierra." : " No cierra: revisá antes de presentar."}`,
    "",
    "Números de venta",
    `El comprobante interno CS-000001 no es un número de Hechauka. Con la ficha actual se escribe ${opts.card.establecimiento}-${opts.card.puntoExpedicion}-0000001 (establecimiento, punto de expedición y la secuencia en 7 dígitos).`,
    "Las ventas sin RUC del cliente se juntan en una sola línea del mes: RUC 44444401-7, consumidor final, tipo de documento 1, número 0 y timbrado 0.",
    "El IVA de los servicios ya está incluido en el total: impuesto = redondeo(total × 10 / 110) y la base es el resto. En compras, el usuario carga la base sin IVA.",
    "Condición 1 es contado y 2 es crédito. En contado las cuotas van en 0; en crédito, en 1. Las compras del libro salen de caja, así que van al contado.",
    "",
  ];

  if (opts.hechauka) {
    lines.push(
      "Hechauka",
      `- hechauka-compras-${opts.period}.txt: formulario 211, texto tabulado, sin BOM, fin de línea Windows.`,
      `- hechauka-ventas-${opts.period}.txt: formulario 221, mismo formato. La sumatoria es el monto del ingreso con IVA.`,
      "Importalos desde Hechauka. Este sistema no los envía.",
      ""
    );
  } else {
    lines.push("Hechauka", "No se generaron los TXT 211 y 221.", ...opts.blockers.map((item) => `- ${item}`), "");
  }

  if (opts.exclusions.length) {
    lines.push(
      opts.hechauka ? "Quedaron afuera del TXT" : "Comprobantes que no entrarían a Hechauka",
      ...opts.exclusions.map((item) => `- ${item}`),
      "No se inventan timbrado ni número de comprobante.",
      ""
    );
  } else if (opts.hechauka) {
    lines.push("Quedaron afuera del TXT", "Ningún comprobante del mes quedó afuera.", "");
  }

  lines.push("Régimen cargado: " + (opts.card.regime === "resimple" ? "RESIMPLE" : opts.card.regime === "simple" ? "SIMPLE" : "General") + ".");
  return lines.join("\r\n") + "\r\n";
}

export function buildMonthPackage(books: MonthBooks): MonthPackage {
  const card = normalizeEasProfile(books.profile);
  const period = periodCode(books.month);
  const blockers = hechaukaBlockers(card);
  const company = parseRuc(card.ruc);
  const rep = parseRuc(card.repRuc);
  const hechauka = blockers.length === 0 && Boolean(company && rep);
  const exclusions: string[] = [];
  const files: StoreZipFile[] = [];

  if (hechauka && company && rep) {
    const compras = buildComprasTxt(books, card, company, rep);
    const ventas = buildVentasTxt(books, card, company, rep);
    exclusions.push(...compras.exclusions, ...ventas.exclusions);
    files.push(
      { name: `hechauka-compras-${period}.txt`, bytes: encode(compras.text) },
      { name: `hechauka-ventas-${period}.txt`, bytes: encode(ventas.text) }
    );
  } else if (!hechauka) {
    const compras = company && rep ? buildComprasTxt(books, card, company, rep) : null;
    const ventas = company && rep ? buildVentasTxt(books, card, company, rep) : null;
    if (compras) exclusions.push(...compras.exclusions);
    if (ventas) exclusions.push(...ventas.exclusions);
    if (!company || !rep) {
      for (const row of books.purchases) {
        const problems = purchaseProblems(row, books.month);
        if (problems.length) {
          exclusions.push(`Compra ${row.voucherNumber || "sin número"} · ${row.supplierName}: ${problems.join("; ")}.`);
        }
      }
      for (const sale of books.sales) {
        const raw = String(sale.clientRuc || "").trim();
        if (!raw || !/\d/.test(raw)) continue;
        if (!parseRuc(raw)) {
          exclusions.push(`Venta ${sale.number} · ${sale.clientName}: el RUC del cliente no cierra con el dígito verificador.`);
          continue;
        }
        if (!hechaukaSalesNumber(sale.number, card.establecimiento, card.puntoExpedicion)) {
          exclusions.push(`Venta ${sale.number} · ${sale.clientName}: el número interno no se puede llevar al formato establecimiento-punto-secuencia.`);
        }
      }
    }
  }

  files.push(
    { name: `libro-diario-${period}.csv`, bytes: encode(libroDiarioCsv(books.journal)) },
    { name: `libro-mayor-${period}.csv`, bytes: encode(libroMayorCsv(books.ledger)) },
    { name: `libro-inventario-${period}.csv`, bytes: encode(inventarioCsv(books.inventory.lines)) },
    { name: `posicion-iva-${period}.csv`, bytes: encode(posicionIvaCsv(books.iva)) },
    { name: `compras-${period}.csv`, bytes: encode(comprasCsv(books.purchases)) },
    { name: `ventas-${period}.csv`, bytes: encode(ventasCsv(books.sales)) },
    {
      name: "LEEME.txt",
      bytes: encode("\uFEFF" + buildLeeme({ books, card, period, blockers, exclusions, hechauka })),
    }
  );

  return {
    zipName: `presentacion-${period}.zip`,
    files,
    blockers,
    exclusions,
    hechaukaIncluded: hechauka,
  };
}

export function buildPresentationZip(books: MonthBooks): {
  zipName: string;
  bytes: Uint8Array;
  blockers: string[];
  exclusions: string[];
  hechaukaIncluded: boolean;
} {
  const pkg = buildMonthPackage(books);
  return {
    zipName: pkg.zipName,
    bytes: buildStoreZip(pkg.files),
    blockers: pkg.blockers,
    exclusions: pkg.exclusions,
    hechaukaIncluded: pkg.hechaukaIncluded,
  };
}
