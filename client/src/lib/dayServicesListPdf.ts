import { jsPDF } from "jspdf";
import {
  appointmentVehicleCount,
  isPendingWashStatus,
  normalizeTimeSlot,
  parseTimeSlot,
} from "@shared/scheduling";
import { LOGO_555_PNG_BASE64 } from "./logo555Base64";

const LOGO_DATA_URL = `data:image/png;base64,${LOGO_555_PNG_BASE64}`;

function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

function formatDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ""));
  if (!match) return isoDate || "—";
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  const day = Number(match[3]);
  const month = months[Number(match[2]) - 1] || match[2];
  return `${day} de ${month} de ${match[1]}`;
}

function formatDateFile(isoDate: string): string {
  return String(isoDate || "dia").replace(/-/g, "");
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "pendiente":
      return "Pendiente";
    case "confirmado":
      return "Confirmado";
    case "en_camino":
      return "En camino";
    case "en_proceso":
      return "En proceso";
    case "finalizado":
      return "Finalizado";
    case "cancelado":
      return "Cancelado";
    default:
      return status || "—";
  }
}

function parseVehicles(app: any): Array<{ type: string; model: string; plate?: string | null }> {
  if (app?.vehicles) {
    try {
      const parsed = typeof app.vehicles === "string" ? JSON.parse(app.vehicles) : app.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((v: any) => ({
          type: v.type === "camioneta" ? "camioneta" : "auto",
          model: v.model || "Vehículo",
          plate: v.plate || null,
        }));
      }
    } catch {
      // fallback
    }
  }
  return [
    {
      type: app.vehicleType === "camioneta" ? "camioneta" : "auto",
      model: app.vehicleModel || "Vehículo",
      plate: app.licensePlate || null,
    },
  ];
}

function displayTimeSlot(app: any): string {
  const raw = String(app?.timeSlot || "");
  if (!raw) return "—";
  return normalizeTimeSlot(raw, appointmentVehicleCount(app));
}

function vehicleLine(app: any): string {
  return parseVehicles(app)
    .map((v) => {
      const kind = v.type === "camioneta" ? "Camioneta" : "Auto";
      const plate = v.plate ? ` · ${v.plate}` : "";
      return `${kind}: ${v.model}${plate}`;
    })
    .join(" | ");
}

export function sortDayAppointments(appointments: any[]): any[] {
  return [...appointments]
    .filter((a) => a && a.status !== "cancelado")
    .sort((a, b) => {
      const aStart = parseTimeSlot(String(a.timeSlot || ""))?.start ?? 0;
      const bStart = parseTimeSlot(String(b.timeSlot || ""))?.start ?? 0;
      return aStart - bStart;
    });
}

/** Texto plano para WhatsApp / copiar al equipo móvil. */
export function buildDayServicesText(date: string, appointments: any[]): string {
  const rows = sortDayAppointments(appointments);
  const pending = rows.filter((a) => isPendingWashStatus(a.status));
  const autos = pending.reduce((sum, a) => sum + appointmentVehicleCount(a), 0);
  const lines: string[] = [
    "555 DETAIL STUDIO",
    `Servicios del día — ${formatDateEs(date)}`,
    `${pending.length} a lavar · ${autos} auto(s)`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("Sin servicios agendados.");
    return lines.join("\n");
  }

  rows.forEach((app, idx) => {
    const n = idx + 1;
    lines.push(`${n}) ${displayTimeSlot(app)} · ${statusLabel(app.status)}`);
    lines.push(`   ${app.clientName || "—"} · ${app.clientPhone || "sin tel"}`);
    lines.push(`   ${vehicleLine(app)}`);
    lines.push(`   ${app.cityZone || ""}: ${app.address || "—"}`);
    if (app.locationUrl) lines.push(`   GPS: ${app.locationUrl}`);
    if (app.notes) lines.push(`   Nota: ${app.notes}`);
    lines.push(`   ${formatGs(app.servicePrice)} · ${app.code || ""}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(String(text || "—"), maxWidth) as string[];
}

/**
 * Lista operativa A4 (hoja de ruta) para imprimir o enviar al equipo.
 */
export async function createDayServicesPdf(date: string, appointments: any[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentW = pageW - marginX * 2;
  const rows = sortDayAppointments(appointments);
  const pending = rows.filter((a) => isPendingWashStatus(a.status));
  const autos = pending.reduce((sum, a) => sum + appointmentVehicleCount(a), 0);

  const drawHeader = (pageNum: number) => {
    doc.setFillColor(252, 251, 248);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setFillColor(180, 25, 30);
    doc.rect(0, 0, pageW, 2, "F");

    let y = 8;
    try {
      doc.addImage(LOGO_DATA_URL, "PNG", marginX, y, 22, 16, undefined, "FAST");
    } catch {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(18, 18, 18);
      doc.text("555", marginX, y + 10);
    }

    doc.setTextColor(18, 18, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Lista de servicios del día", marginX + 26, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.text(formatDateEs(date), marginX + 26, y + 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(180, 25, 30);
    doc.text(`${pending.length} a lavar · ${autos} auto(s)`, pageW - marginX, y + 7, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.setFontSize(8);
    doc.text(`Pág. ${pageNum}`, pageW - marginX, y + 13, { align: "right" });

    y = 28;
    doc.setDrawColor(210, 205, 198);
    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageW - marginX, y);
    return y + 5;
  };

  let pageNum = 1;
  let y = drawHeader(pageNum);

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text("Sin servicios agendados para este día.", marginX, y + 10);
    return doc;
  }

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageH - 14) return;
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text("555 Detail Studio · hoja de ruta operativa", pageW / 2, pageH - 6, { align: "center" });
    doc.addPage();
    pageNum += 1;
    y = drawHeader(pageNum);
  };

  rows.forEach((app, idx) => {
    const vehicles = parseVehicles(app);
    const addressLines = wrapText(
      doc,
      `${app.cityZone || ""}: ${app.address || "—"}`,
      contentW - 4
    );
    const noteLines = app.notes ? wrapText(doc, `Nota: ${app.notes}`, contentW - 4) : [];
    const blockH =
      18 + vehicles.length * 4.2 + addressLines.length * 3.8 + noteLines.length * 3.6 + (app.locationUrl ? 4 : 0);

    ensureSpace(blockH + 4);

    // Card fondo
    if (idx % 2 === 0) {
      doc.setFillColor(245, 243, 239);
    } else {
      doc.setFillColor(250, 249, 246);
    }
    doc.roundedRect(marginX, y, contentW, blockH, 1.5, 1.5, "F");

    const left = marginX + 3;
    let cy = y + 5.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(180, 25, 30);
    doc.text(`${idx + 1}. ${displayTimeSlot(app)}`, left, cy);

    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(statusLabel(app.status), pageW - marginX - 3, cy, { align: "right" });
    cy += 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(18, 18, 18);
    doc.text(String(app.clientName || "—"), left, cy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text(String(app.clientPhone || ""), pageW - marginX - 3, cy, { align: "right" });
    cy += 4.5;

    vehicles.forEach((v) => {
      const kind = v.type === "camioneta" ? "Camioneta" : "Auto";
      const plate = v.plate ? `  [${v.plate}]` : "";
      doc.setFontSize(8.5);
      doc.setTextColor(35, 35, 35);
      doc.text(`• ${kind}: ${v.model}${plate}`, left, cy);
      cy += 4;
    });

    doc.setFontSize(8);
    doc.setTextColor(70, 70, 70);
    addressLines.forEach((line) => {
      doc.text(line, left, cy);
      cy += 3.6;
    });

    if (app.locationUrl) {
      doc.setTextColor(20, 120, 80);
      doc.setFontSize(7.5);
      const gps = wrapText(doc, `GPS: ${app.locationUrl}`, contentW - 4);
      doc.text(gps[0], left, cy);
      cy += 3.8;
    }

    noteLines.forEach((line) => {
      doc.setTextColor(110, 90, 40);
      doc.setFontSize(7.5);
      doc.text(line, left, cy);
      cy += 3.4;
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(180, 25, 30);
    doc.text(formatGs(app.servicePrice), left, y + blockH - 3);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.setFontSize(7);
    doc.text(String(app.code || ""), pageW - marginX - 3, y + blockH - 3, { align: "right" });

    y += blockH + 3;
  });

  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text("555 Detail Studio · hoja de ruta operativa", pageW / 2, pageH - 6, { align: "center" });

  return doc;
}

export async function buildDayServicesFile(date: string, appointments: any[]) {
  const doc = await createDayServicesPdf(date, appointments);
  const fileName = `servicios-${formatDateFile(date)}.pdf`;
  const blob = doc.output("blob");
  return {
    doc,
    fileName,
    file: new File([blob], fileName, { type: "application/pdf" }),
    text: buildDayServicesText(date, appointments),
  };
}
