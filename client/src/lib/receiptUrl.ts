/** URL segura para ver un comprobante (proxy same-origin si es Blob privado). */
export function receiptViewUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(".private.blob.vercel-storage.com")) {
      return `/api/receipt?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // relative / manus paths
  }
  return url;
}

export function isLikelyPdfReceipt(url: string, fileName?: string | null): boolean {
  const name = (fileName || url).toLowerCase();
  return name.includes(".pdf") || name.endsWith("pdf");
}
