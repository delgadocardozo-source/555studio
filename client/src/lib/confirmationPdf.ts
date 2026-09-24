import { jsPDF } from "jspdf";
import { appointmentVehicleCount } from "@shared/scheduling";

const LOGO_PATH = "/logo-555.jpg";

let logoDataUrlCache: string | null = null;
let logoLoadPromise: Promise<string | null> | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlCache) return logoDataUrlCache;
  if (!logoLoadPromise) {
    logoLoadPromise = (async () => {
      try {
        const response = await fetch(LOGO_PATH);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    })().then((url) => {
      logoDataUrlCache = url;
      return url;
    });
  }
  return logoLoadPromise;
}

function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

function formatDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return isoDate || "—";
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const day = Number(match[3]);
  const month = months[Number(match[2]) - 1] || match[2];
  return `${day} ${month} ${match[1]}`;
}

function vehicleLabel(count: number): string {
  return count === 1 ? "1 vehículo" : `${count} vehículos`;
}

export function buildConfirmationText(app: any): string {
  const count = appointmentVehicleCount(app);
  return [
    "555 DETAIL STUDIO",
    "Confirmación de servicio",
    "",
    `Cliente: ${app.clientName}`,
    app.clientTaxId ? `RUC: ${app.clientTaxId}` : null,
    `Fecha: ${formatDateEs(app.scheduledDate)}`,
    `Horario: ${app.timeSlot}`,
    vehicleLabel(count),
    `Total: ${formatGs(app.servicePrice)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Comprobante A5 premium minimalista:
 * logo + cliente + RUC + fecha/hora + cantidad de vehículos + monto.
 */
export async function createConfirmationPdf(app: any) {
  // A5 portrait explícito (148 × 210 mm)
  const doc = new jsPDF({ unit: "mm", format: [148, 210], orientation: "portrait" });
  const pageW = 148;
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  const count = appointmentVehicleCount(app);
  const total = formatGs(app.servicePrice);
  const logo = await loadLogoDataUrl();

  // Fondo claro premium
  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, pageW, 210, "F");

  // Acento superior en rojo marca
  doc.setFillColor(180, 25, 30);
  doc.rect(0, 0, pageW, 2.2, "F");

  let y = 16;

  if (logo) {
    const logoW = 52;
    const logoH = 38;
    doc.addImage(logo, "JPEG", (pageW - logoW) / 2, y, logoW, logoH);
    y += logoH + 8;
  } else {
    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(26);
    doc.text("555", pageW / 2, y + 10, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text("DETAIL STUDIO", pageW / 2, y + 17, { align: "center" });
    y += 26;
  }

  doc.setTextColor(130, 130, 130);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("CONFIRMACIÓN DE SERVICIO", pageW / 2, y, { align: "center" });
  y += 12;

  // Cliente — tipografía grande
  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  const nameLines = doc.splitTextToSize(String(app.clientName || "Cliente"), contentW);
  doc.text(nameLines, pageW / 2, y, { align: "center" });
  y += nameLines.length * 9 + 3;

  // RUC
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(60, 60, 60);
  doc.text(app.clientTaxId ? `RUC ${app.clientTaxId}` : "Sin RUC", pageW / 2, y, { align: "center" });
  y += 11;

  // Separador
  doc.setDrawColor(210, 205, 198);
  doc.setLineWidth(0.35);
  doc.line(marginX + 16, y, pageW - marginX - 16, y);
  y += 13;

  // Fecha
  doc.setTextColor(18, 18, 18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(formatDateEs(app.scheduledDate), pageW / 2, y, { align: "center" });
  y += 10;

  // Horario
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(45, 45, 45);
  doc.text(String(app.timeSlot || "—"), pageW / 2, y, { align: "center" });
  y += 14;

  // Vehículos
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(18, 18, 18);
  doc.text(vehicleLabel(count), pageW / 2, y, { align: "center" });
  y += 14;

  // Monto — bloque marca
  doc.setFillColor(180, 25, 30);
  doc.roundedRect(marginX, y, contentW, 24, 2.5, 2.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(total, pageW / 2, y + 15.5, { align: "center" });
  y += 36;

  // Separador inferior
  doc.setDrawColor(210, 205, 198);
  doc.setLineWidth(0.35);
  doc.line(marginX + 16, y, pageW - marginX - 16, y);
  y += 9;

  // Código discreto
  doc.setTextColor(145, 145, 145);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(String(app.code || ""), pageW / 2, y, { align: "center" });

  // Pie
  doc.setTextColor(155, 155, 155);
  doc.setFontSize(7.5);
  doc.text("Lavado a domicilio · 555 Detail Studio", pageW / 2, 200, { align: "center" });

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
