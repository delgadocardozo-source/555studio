/**
 * Clave compartida del local. La sesión es una cookie firmada con el hash vigente,
 * así cambiar la clave cierra las sesiones anteriores.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";

export const STAFF_COOKIE = "staff_gate";
export const STAFF_LOCK_MESSAGE = "Clave del equipo requerida";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export function normalizePin(raw: string): string {
  const pin = String(raw || "").trim();
  if (!/^\d{4,8}$/.test(pin)) {
    throw new Error("La clave tiene que ser de 4 a 8 números");
  }
  return pin;
}

export function hashPin(pin: string, salt = randomBytes(16).toString("hex")): { salt: string; hash: string } {
  const hash = scryptSync(normalizePin(pin), salt, 32).toString("hex");
  return { salt, hash };
}

export function pinMatches(pin: string, salt: string, hash: string): boolean {
  let next: Buffer;
  try {
    next = scryptSync(normalizePin(pin), salt, 32);
  } catch {
    return false;
  }
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function signingKey(pinHash: string): string {
  const secret = process.env.JWT_SECRET || "555-detail-staff";
  return createHmac("sha256", secret).update(pinHash).digest("hex");
}

export function signStaffToken(pinHash: string, now = Date.now()): string {
  const exp = now + MAX_AGE_SEC * 1000;
  const body = `v1.${exp}`;
  const sig = createHmac("sha256", signingKey(pinHash)).update(body).digest("hex");
  return `${body}.${sig}`;
}

export function staffTokenValid(token: string | undefined, pinHash: string, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, expRaw, sig] = parts;
  if (version !== "v1") return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < now) return false;
  const body = `${version}.${expRaw}`;
  const expected = createHmac("sha256", signingKey(pinHash)).update(body).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readStaffCookie(req: Request): string | undefined {
  const parsed = parseCookieHeader(req.headers.cookie || "");
  const value = parsed[STAFF_COOKIE];
  return typeof value === "string" && value ? value : undefined;
}

function cookieFlags(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE_SEC}${secure}`;
}

export function setStaffCookie(res: Response, token: string) {
  res.setHeader("Set-Cookie", `${STAFF_COOKIE}=${token}; ${cookieFlags()}`);
}

export function clearStaffCookie(res: Response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${STAFF_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}
