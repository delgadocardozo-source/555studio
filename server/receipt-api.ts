import { get as getBlob } from "@vercel/blob";

/**
 * GET /api/receipt?url=<blobUrl>
 * Sirve comprobantes privados de Vercel Blob autenticados con el token del proyecto.
 * Así el navegador no necesita abrir la URL cruda (Forbidden) ni una URL firmada larga.
 */
export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Allow", "GET");
      res.end("Method not allowed");
      return;
    }

    const rawUrl =
      typeof req.query?.url === "string"
        ? req.query.url
        : typeof req.url === "string"
          ? new URL(req.url, "http://localhost").searchParams.get("url")
          : null;

    if (!rawUrl) {
      res.statusCode = 400;
      res.end("Falta el parámetro url del comprobante");
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.statusCode = 400;
      res.end("URL de comprobante inválida");
      return;
    }

    // Rutas locales / públicas: redirigir tal cual
    if (!parsed.hostname.endsWith(".private.blob.vercel-storage.com")) {
      res.statusCode = 302;
      res.setHeader("Location", rawUrl);
      res.end();
      return;
    }

    const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!pathname.startsWith("555-detail-agenda/receipts/")) {
      res.statusCode = 400;
      res.end("URL de comprobante fuera del prefijo permitido");
      return;
    }

    const result = await getBlob(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) {
      res.statusCode = 404;
      res.end("Comprobante no encontrado. Puede que no se haya terminado de subir.");
      return;
    }

    const buf = Buffer.from(await new Response(result.stream).arrayBuffer());
    if (buf.length === 0) {
      res.statusCode = 404;
      res.end("Comprobante vacío (0 bytes)");
      return;
    }

    const contentType = result.blob.contentType || "application/octet-stream";
    res.statusCode = 200;
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
    res.statusCode = 500;
    res.end(`Error al leer el comprobante: ${err?.message || "desconocido"}`);
  }
}
