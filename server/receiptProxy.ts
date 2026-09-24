import type { Express, Request, Response } from "express";
import { get as getBlob } from "@vercel/blob";

function pathnameFromBlobUrl(url: string): string {
  const { pathname } = new URL(url);
  return decodeURIComponent(pathname.replace(/^\//, ""));
}

/**
 * GET /api/receipt?url=<blobUrl>
 * Sirve comprobantes privados con el token del servidor (evita Forbidden en el navegador).
 */
export function registerReceiptProxy(app: Express) {
  app.get("/api/receipt", async (req: Request, res: Response) => {
    try {
      const rawUrl = typeof req.query.url === "string" ? req.query.url : null;
      if (!rawUrl) {
        res.status(400).send("Falta el parámetro url del comprobante");
        return;
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        res.status(400).send("URL de comprobante inválida");
        return;
      }

      if (!parsed.hostname.endsWith(".private.blob.vercel-storage.com")) {
        res.redirect(302, rawUrl);
        return;
      }

      const pathname = pathnameFromBlobUrl(rawUrl);
      if (!pathname.startsWith("555-detail-agenda/receipts/")) {
        res.status(400).send("URL de comprobante fuera del prefijo permitido");
        return;
      }

      const result = await getBlob(pathname, { access: "private", useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) {
        res.status(404).send("Comprobante no encontrado. Puede que no se haya terminado de subir.");
        return;
      }

      const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
      if (buf.length === 0) {
        res.status(404).send("Comprobante vacío (0 bytes)");
        return;
      }

      const contentType = result.blob.contentType || "application/octet-stream";
      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(buf.length));
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${pathname.split("/").pop() || "comprobante"}"`
      );
      res.end(buf);
    } catch (err: any) {
      console.error("[api/receipt]", err?.message || err);
      res.status(500).send(`Error al leer el comprobante: ${err?.message || "desconocido"}`);
    }
  });
}
