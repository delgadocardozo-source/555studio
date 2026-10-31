/** Guarda la foto del auto lavado. No toca el precio ni el cobro. */
import { put as putBlob } from "@vercel/blob";
import { storagePut } from "./storage";

const MAX_BYTES = 8 * 1024 * 1024;

export function decodeWashPhoto(input: { fileName: string; contentType: string; base64Data: string }): {
  buffer: Buffer;
  contentType: string;
  fileName: string;
} {
  const contentType = String(input.contentType || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error("La foto del auto tiene que ser una imagen");
  }
  const buffer = Buffer.from(String(input.base64Data || ""), "base64");
  if (buffer.length === 0) throw new Error("La foto está vacía");
  if (buffer.length > MAX_BYTES) throw new Error("La foto no debe superar los 8MB");
  const safeName = String(input.fileName || "lavado.jpg").replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80);
  return { buffer, contentType, fileName: safeName || "lavado.jpg" };
}

export async function storeWashPhoto(input: { fileName: string; contentType: string; base64Data: string }): Promise<string> {
  const photo = decodeWashPhoto(input);
  const key = `555-detail-agenda/wash-photos/${Date.now()}-${photo.fileName}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const stored = await putBlob(key, photo.buffer, {
      access: "public",
      contentType: photo.contentType || "image/jpeg",
    });
    return stored.url;
  }
  const stored = await storagePut(key, photo.buffer, photo.contentType || "image/jpeg");
  return stored.url;
}
