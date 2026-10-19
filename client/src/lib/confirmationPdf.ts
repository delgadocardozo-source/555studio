import { jsPDF } from "jspdf";
import { appointmentVehicleCount, normalizeTimeSlot } from "@shared/scheduling";
import { LOGO_555_PNG_BASE64 } from "./logo555Base64";

const LOGO_DATA_URL = `data:image/png;base64,${LOGO_555_PNG_BASE64}`;

function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

function formatDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return isoDate || "—";
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  const day = Number(match[3]);
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const weekdays = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
  const weekday = weekdays[new Date(year, monthNum - 1, day).getDay()] || "";
  const month = months[monthNum - 1] || match[2];
  return `${weekday} ${day} ${month} ${year}`;
}

function vehicleLabel(count: number): string {
  return count === 1 ? "1 vehículo" : `${count} vehículos`;
}

export function buildConfirmationText(app: any): string {
  const count = appointmentVehicleCount(app);
  const slot = normalizeTimeSlot(String(app.timeSlot || ""), count);
  return [
    "555 DETAIL STUDIO",
    "Confirmación de servicio",
    "",
    `Cliente: ${app.clientName}`,
    app.clientTaxId ? `RUC: ${app.clientTaxId}` : null,
    `Fecha: ${formatDateEs(app.scheduledDate)}`,
    `Horario: ${slot}`,
    vehicleLabel(count),
    `Total: ${formatGs(app.servicePrice)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function drawBrandFallback(doc: jsPDF, pageW: number, y: number): number {
  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text("555", pageW / 2, y + 10, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(110, 110, 110);
  doc.text("DETAIL STUDIO", pageW / 2, y + 17, { align: "center" });
  return y + 24;
}

/**
 * Comprobante A5 premium minimalista.
 * Logo PNG embebido (sin fetch) para evitar corrupción en móviles.
 */
export async function createConfirmationPdf(app: any) {
  const doc = new jsPDF({ unit: "mm", format: "a5", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  const count = appointmentVehicleCount(app);
  const total = formatGs(app.servicePrice);

  // Fondo claro
  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, pageW, pageH, "F");

  // Acento superior
  doc.setFillColor(180, 25, 30);
  doc.rect(0, 0, pageW, 2.2, "F");

  let y = 14;

  // Logo embebido — si falla, marca tipográfica
  try {
    const logoW = 46;
    const logoH = 33;
    doc.addImage(LOGO_DATA_URL, "PNG", (pageW - logoW) / 2, y, logoW, logoH, undefined, "FAST");
    y += logoH + 8;
  } catch {
    y = drawBrandFallback(doc, pageW, y);
  }

  doc.setTextColor(130, 130, 130);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CONFIRMACIÓN DE SERVICIO", pageW / 2, y, { align: "center" });
  y += 12;

  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const nameLines = doc.splitTextToSize(String(app.clientName || "Cliente"), contentW);
  doc.text(nameLines, pageW / 2, y, { align: "center" });
  y += nameLines.length * 8.5 + 3;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(app.clientTaxId ? `RUC ${app.clientTaxId}` : "Sin RUC", pageW / 2, y, { align: "center" });
  y += 11;

  doc.setDrawColor(210, 205, 198);
  doc.setLineWidth(0.35);
  doc.line(marginX + 14, y, pageW - marginX - 14, y);
  y += 12;

  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(formatDateEs(app.scheduledDate), pageW / 2, y, { align: "center" });
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(14);
  doc.setTextColor(45, 45, 45);
  doc.text(normalizeTimeSlot(String(app.timeSlot || ""), count) || "—", pageW / 2, y, { align: "center" });
  y += 13;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(18, 18, 18);
  doc.text(vehicleLabel(count), pageW / 2, y, { align: "center" });
  y += 13;

  doc.setFillColor(180, 25, 30);
  doc.roundedRect(marginX, y, contentW, 22, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(total, pageW / 2, y + 14.5, { align: "center" });
  y += 34;

  doc.setDrawColor(210, 205, 198);
  doc.setLineWidth(0.35);
  doc.line(marginX + 14, y, pageW - marginX - 14, y);
  y += 9;

  doc.setTextColor(145, 145, 145);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(String(app.code || ""), pageW / 2, y, { align: "center" });

  doc.setTextColor(155, 155, 155);
  doc.setFontSize(7.5);
  doc.text("Lavado a domicilio · 555 Detail Studio", pageW / 2, pageH - 10, { align: "center" });

  return doc;
}

export async function buildConfirmationFile(app: any) {
  const doc = await createConfirmationPdf(app);
  const safeCode = String(app.code || "pedido").replace(/[^a-zA-Z0-9-_]/g, "_");
  const fileName = `confirmacion-${safeCode}.pdf`;
  const blob = doc.output("blob");
  return {
    doc,
    fileName,
    file: new File([blob], fileName, { type: "application/pdf" }),
  };
}
