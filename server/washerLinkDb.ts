/** Link exclusivo de la ruta del lavador. Un token largo, no la clave del ERP. */
import { randomBytes, timingSafeEqual } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { washerLinks } from "../drizzle/schema";
import { getDb } from "./db";

const BLOB_PATH = "555-detail-agenda/data/washer-link.json";
const LOCAL_PATH = path.join(process.cwd(), "data", "washer-link.json");

interface StoredLink {
  token: string;
  createdAt: string;
}

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

async function readStored(): Promise<StoredLink | null> {
  if (isBlob()) {
    const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
    if (!result?.stream) return null;
    try {
      const parsed = JSON.parse(await new Response(result.stream).text()) as StoredLink;
      return parsed?.token ? parsed : null;
    } catch {
      return null;
    }
  }

  const db = await getDb();
  if (!db) {
    try {
      const parsed = JSON.parse(await readFile(LOCAL_PATH, "utf8")) as StoredLink;
      return parsed?.token ? parsed : null;
    } catch {
      return null;
    }
  }

  const rows = await db.select().from(washerLinks).limit(1);
  const row = rows[0];
  if (!row?.token) return null;
  return {
    token: row.token,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
  };
}

async function writeStored(link: StoredLink): Promise<void> {
  if (isBlob()) {
    await putBlob(BLOB_PATH, JSON.stringify(link), {
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
    await writeFile(LOCAL_PATH, JSON.stringify(link), "utf8");
    return;
  }

  const existing = await db.select().from(washerLinks).limit(1);
  if (existing[0]) return;
  await db.insert(washerLinks).values({ token: link.token });
}

export function washerTokensMatch(stored: string, given: string): boolean {
  const a = Buffer.from(String(stored || ""));
  const b = Buffer.from(String(given || ""));
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function getOrCreateWasherToken(): Promise<string> {
  const existing = await readStored();
  if (existing?.token) return existing.token;
  const created: StoredLink = { token: newToken(), createdAt: new Date().toISOString() };
  await writeStored(created);
  const saved = await readStored();
  return saved?.token || created.token;
}

export async function washerTokenValid(token: string): Promise<boolean> {
  const stored = await readStored();
  if (!stored?.token) return false;
  return washerTokensMatch(stored.token, token);
}
