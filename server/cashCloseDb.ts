/** Cierres de caja por día. Blob, MySQL, o archivo local. */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { cashDayCloses } from "../drizzle/schema";
import { summarizeCashDay, type CashDaySummary } from "../shared/cashClose";
import { listCashMovements } from "./cashLedgerDb";
import { getDb } from "./db";

const BLOB_PATH = "555-detail-agenda/data/cash-day-closes.json";
const LOCAL_PATH = path.join(process.cwd(), "data", "cash-day-closes.json");

export interface CashDayClose extends CashDaySummary {
  counted: number | null;
  difference: number | null;
  note: string;
  updatedAt: string | null;
}

interface StoredClose {
  date: string;
  counted: number;
  note: string;
  efectivoIn: number;
  comprobanteIn: number;
  egresos: number;
  expectedDrawer: number;
  updatedAt: string;
}

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readStored(): Promise<StoredClose[]> {
  if (isBlob()) {
    const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
    if (!result?.stream) return [];
    try {
      const parsed = JSON.parse(await new Response(result.stream).text());
      return Array.isArray(parsed) ? (parsed as StoredClose[]) : [];
    } catch {
      return [];
    }
  }
  const db = await getDb();
  if (!db) {
    try {
      const parsed = JSON.parse(await readFile(LOCAL_PATH, "utf8"));
      return Array.isArray(parsed) ? (parsed as StoredClose[]) : [];
    } catch {
      return [];
    }
  }
  const rows = await db.select().from(cashDayCloses);
  return rows.map((row) => ({
    date: row.closeDate,
    counted: row.countedAmount,
    note: row.note || "",
    efectivoIn: row.efectivoIn,
    comprobanteIn: row.comprobanteIn,
    egresos: row.egresos,
    expectedDrawer: row.expectedDrawer,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  }));
}

async function writeStored(rows: StoredClose[]) {
  if (isBlob()) {
    await putBlob(BLOB_PATH, JSON.stringify(rows), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
    });
    return;
  }
  const db = await getDb();
  if (!db) {
    await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
    await writeFile(LOCAL_PATH, JSON.stringify(rows), "utf8");
  }
}

function view(summary: CashDaySummary, saved: StoredClose | undefined): CashDayClose {
  if (!saved) {
    return { ...summary, counted: null, difference: null, note: "", updatedAt: null };
  }
  return {
    ...summary,
    counted: saved.counted,
    difference: saved.counted - summary.expectedDrawer,
    note: saved.note || "",
    updatedAt: saved.updatedAt,
  };
}

export async function getCashDay(date: string): Promise<CashDayClose> {
  const movements = await listCashMovements({ dateFrom: date, dateTo: date });
  const summary = summarizeCashDay(movements, date);
  const saved = (await readStored()).find((row) => row.date === date);
  return view(summary, saved);
}

export async function saveCashDay(params: { date: string; counted: number; note?: string }): Promise<CashDayClose> {
  const counted = Math.round(Number(params.counted));
  if (!Number.isFinite(counted) || counted < 0) {
    throw new Error("El conteo tiene que ser un monto en guaraníes, cero o más");
  }
  const movements = await listCashMovements({ dateFrom: params.date, dateTo: params.date });
  const summary = summarizeCashDay(movements, params.date);
  const stored: StoredClose = {
    date: params.date,
    counted,
    note: String(params.note || "").trim(),
    efectivoIn: summary.efectivoIn,
    comprobanteIn: summary.comprobanteIn,
    egresos: summary.egresos,
    expectedDrawer: summary.expectedDrawer,
    updatedAt: new Date().toISOString(),
  };

  if (!isBlob()) {
    const db = await getDb();
    if (db) {
      const existing = await db
        .select()
        .from(cashDayCloses)
        .where(eq(cashDayCloses.closeDate, params.date))
        .limit(1);
      const payload = {
        countedAmount: counted,
        note: stored.note || null,
        efectivoIn: stored.efectivoIn,
        comprobanteIn: stored.comprobanteIn,
        egresos: stored.egresos,
        expectedDrawer: stored.expectedDrawer,
      };
      if (existing[0]) {
        await db.update(cashDayCloses).set(payload).where(eq(cashDayCloses.id, existing[0].id));
      } else {
        await db.insert(cashDayCloses).values({ closeDate: params.date, ...payload });
      }
      return view(summary, stored);
    }
  }

  const rows = await readStored();
  const index = rows.findIndex((row) => row.date === params.date);
  if (index >= 0) rows[index] = stored;
  else rows.push(stored);
  await writeStored(rows);
  return view(summary, stored);
}
