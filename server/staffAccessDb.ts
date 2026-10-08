/** Persistencia de la clave del equipo: Blob, MySQL, o archivo local si no hay ninguno. */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { staffAccess } from "../drizzle/schema";
import { getDb } from "./db";

const BLOB_PATH = "555-detail-agenda/data/staff-access.json";
const LOCAL_PATH = path.join(process.cwd(), "data", "staff-access.json");

export interface StaffSecret {
  salt: string;
  hash: string;
  updatedAt: string;
}

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readLocal(): Promise<StaffSecret | null> {
  try {
    const text = await readFile(LOCAL_PATH, "utf8");
    const parsed = JSON.parse(text) as StaffSecret;
    if (!parsed?.salt || !parsed?.hash) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeLocal(secret: StaffSecret) {
  await mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await writeFile(LOCAL_PATH, JSON.stringify(secret), "utf8");
}

export async function readStaffSecret(): Promise<StaffSecret | null> {
  if (isBlob()) {
    const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
    if (!result?.stream) return null;
    try {
      const parsed = JSON.parse(await new Response(result.stream).text()) as StaffSecret;
      if (!parsed?.salt || !parsed?.hash) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  const db = await getDb();
  if (!db) return readLocal();
  const rows = await db.select().from(staffAccess).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    salt: row.pinSalt,
    hash: row.pinHash,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

export async function writeStaffSecret(secret: StaffSecret): Promise<void> {
  if (isBlob()) {
    await putBlob(BLOB_PATH, JSON.stringify(secret), {
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
    await writeLocal(secret);
    return;
  }
  const existing = await db.select().from(staffAccess).limit(1);
  if (existing[0]) {
    await db
      .update(staffAccess)
      .set({ pinSalt: secret.salt, pinHash: secret.hash })
      .where(eq(staffAccess.id, existing[0].id));
    return;
  }
  await db.insert(staffAccess).values({ pinSalt: secret.salt, pinHash: secret.hash });
}
