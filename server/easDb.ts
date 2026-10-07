/**
 * Ficha de la EAS y libro de compras.
 * Ventas, diario e IVA se calculan; no se guardan aparte.
 */
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { desc, eq } from "drizzle-orm";
import { easProfiles, easPurchases } from "../drizzle/schema";
import {
  buildEasPurchase,
  buildInventoryBook,
  buildIvaPosition,
  buildJournal,
  buildLedger,
  buildSalesBook,
  ledgerTotals,
  normalizeEasProfile,
  regimeObligations,
  type EasProfile,
  type EasPurchase,
  type EasPurchaseInput,
} from "../shared/easBooks";
import { getDb } from "./db";
import { listInvoices } from "./invoicingDb";
import { listInventoryItems } from "./inventoryDb";
import { listPayments } from "./payrollDb";

const BLOB_PATH = "555-detail-agenda/data/eas-books.json";

type EasBlob = { profile: EasProfile | null; purchases: EasPurchase[] };

function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<EasBlob> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result?.stream) return { profile: null, purchases: [] };
  try {
    const parsed = JSON.parse(await new Response(result.stream).text()) as EasBlob;
    return {
      profile: parsed.profile || null,
      purchases: Array.isArray(parsed.purchases)
        ? parsed.purchases.map((row) => ({
            ...row,
            timbrado: String(row.timbrado || "").replace(/\D/g, ""),
          }))
        : [],
    };
  } catch {
    return { profile: null, purchases: [] };
  }
}

async function writeBlob(data: EasBlob) {
  await putBlob(BLOB_PATH, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

function sqlTimestamp(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
}

function purchaseFromSql(row: typeof easPurchases.$inferSelect): EasPurchase {
  return {
    id: row.id,
    date: row.purchaseDate,
    supplierName: row.supplierName,
    supplierRuc: row.supplierRuc || "",
    voucherNumber: row.voucherNumber,
    timbrado: String(row.timbrado || "").replace(/\D/g, ""),
    description: row.description || "",
    taxed10: row.taxed10,
    iva10: row.iva10,
    taxed5: row.taxed5,
    iva5: row.iva5,
    exempt: row.exempt,
    total: row.total,
    createdAt: sqlTimestamp(row.createdAt),
  };
}

export async function getEasProfile(): Promise<EasProfile> {
  if (isVercelBlobRuntime()) {
    const data = await readBlob();
    return normalizeEasProfile(data.profile);
  }
  const db = await getDb();
  if (!db) return normalizeEasProfile(null);
  const rows = await db.select().from(easProfiles).limit(1);
  const row = rows[0];
  if (!row) return normalizeEasProfile(null);
  return normalizeEasProfile({
    legalName: row.legalName,
    ruc: row.ruc,
    regime: row.regime,
    activity: row.activity,
    repName: row.repName,
    repRuc: row.repRuc,
    timbrado: row.timbrado,
    establecimiento: row.establecimiento,
    puntoExpedicion: row.puntoExpedicion,
    updatedAt: sqlTimestamp(row.updatedAt),
  });
}

export async function saveEasProfile(input: Partial<EasProfile>): Promise<EasProfile> {
  const next = normalizeEasProfile({ ...input, updatedAt: new Date().toISOString() });
  if (next.legalName.length < 2) throw new Error("Indicá la razón social de la EAS");
  if (next.ruc.length < 3) throw new Error("Indicá el RUC de la EAS");
  if (isVercelBlobRuntime()) {
    const data = await readBlob();
    data.profile = next;
    await writeBlob(data);
    return next;
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(easProfiles).limit(1);
  if (existing[0]) {
    await db
      .update(easProfiles)
      .set({
        legalName: next.legalName,
        ruc: next.ruc,
        regime: next.regime,
        activity: next.activity,
        repName: next.repName,
        repRuc: next.repRuc,
        timbrado: next.timbrado,
        establecimiento: next.establecimiento,
        puntoExpedicion: next.puntoExpedicion,
      })
      .where(eq(easProfiles.id, existing[0].id));
  } else {
    await db.insert(easProfiles).values({
      legalName: next.legalName,
      ruc: next.ruc,
      regime: next.regime,
      activity: next.activity,
      repName: next.repName,
      repRuc: next.repRuc,
      timbrado: next.timbrado,
      establecimiento: next.establecimiento,
      puntoExpedicion: next.puntoExpedicion,
    });
  }
  return next;
}

async function readPurchases(): Promise<EasPurchase[]> {
  if (isVercelBlobRuntime()) return (await readBlob()).purchases;
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(easPurchases).orderBy(desc(easPurchases.id));
  return rows.map(purchaseFromSql);
}

export async function addEasPurchase(input: EasPurchaseInput): Promise<EasPurchase> {
  const now = new Date().toISOString();
  if (isVercelBlobRuntime()) {
    const data = await readBlob();
    const id = data.purchases.reduce((max, row) => Math.max(max, row.id), 0) + 1;
    const created = buildEasPurchase(input, id, now);
    data.purchases.push(created);
    await writeBlob(data);
    return created;
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const draft = buildEasPurchase(input, 0, now);
  await db.insert(easPurchases).values({
    purchaseDate: draft.date,
    supplierName: draft.supplierName,
    supplierRuc: draft.supplierRuc || null,
    voucherNumber: draft.voucherNumber,
    timbrado: draft.timbrado,
    description: draft.description || null,
    taxed10: draft.taxed10,
    iva10: draft.iva10,
    taxed5: draft.taxed5,
    iva5: draft.iva5,
    exempt: draft.exempt,
    total: draft.total,
  });
  const saved = await db.select().from(easPurchases).orderBy(desc(easPurchases.id)).limit(1);
  return purchaseFromSql(saved[0]);
}

export async function getEasBooks(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes inválido (YYYY-MM)");
  const [profile, purchases, invoices, payments, inventory] = await Promise.all([
    getEasProfile(),
    readPurchases(),
    listInvoices(),
    listPayments({}),
    listInventoryItems({ includeInactive: false }),
  ]);
  const monthPurchases = purchases
    .filter((row) => row.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date));
  const sales = buildSalesBook(invoices, month);
  const monthPayroll = payments.filter((row) => row.paymentDate.slice(0, 7) === month);
  const journal = buildJournal({
    regime: profile.regime,
    sales,
    purchases: monthPurchases,
    payroll: monthPayroll,
  });
  const ledger = buildLedger(journal);
  const iva = buildIvaPosition(profile.regime, sales, monthPurchases);
  const stock = buildInventoryBook(inventory);
  return {
    profile,
    month,
    obligations: regimeObligations(profile.regime),
    sales,
    purchases: monthPurchases,
    iva,
    journal,
    ledger,
    ledgerTotals: ledgerTotals(ledger),
    inventory: stock,
  };
}
