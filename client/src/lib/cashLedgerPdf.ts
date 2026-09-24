import { jsPDF } from "jspdf";
import {
  computeCashStats,
  formatGs,
  type CashLedgerFilters,
  type CashMovement,
} from "@shared/cashLedger";
import { LOGO_555_PNG_BASE64 } from "./logo555Base64";

const LOGO_DATA_URL = `data:image/png;base64,${LOGO_555_PNG_BASE64}`;

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
  return String(isoDate || "caja").replace(/-/g, "");
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(String(text || "—"), maxWidth) as string[];
}

function filterSummary(filters: CashLedgerFilters = {}): string {
  const parts: string[] = [];
  if (filters.type && filters.type !== "todos") {
    parts.push(filters.type === "ingreso" ? "Solo ingresos" : "Solo egresos");
  }
  if (filters.person?.trim()) parts.push(`Persona: ${filters.person.trim()}`);
  if (filters.category?.trim() && filters.category !== "Todas") {
    parts.push(`Cat.: ${filters.category}`);
  }
  if (filters.dateFrom || filters.dateTo) {
    const from = filters.dateFrom ? formatDateEs(filters.dateFrom) : "…";
    const to = filters.dateTo ? formatDateEs(filters.dateTo) : "…";
    parts.push(`${from} → ${to}`);
  }
  if (filters.search?.trim()) parts.push(`Buscar: “${filters.search.trim()}”`);
  return parts.length > 0 ? parts.join(" · ") : "Todos los movimientos";
}

function sortMovements(rows: CashMovement[]): CashMovement[] {
  return [...rows].sort((a, b) => {
    const byDate = String(b.movementDate).localeCompare(String(a.movementDate));
    if (byDate !== 0) return byDate;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

/** Texto plano para WhatsApp / copiar. */
export function buildCashLedgerText(
  movements: CashMovement[],
  filters: CashLedgerFilters = {}
): string {
  const rows = sortMovements(movements);
  const stats = computeCashStats(rows);
  const lines: string[] = [
    "555 DETAIL STUDIO",
    "Ingresos y Egresos (Caja)",
    filterSummary(filters),
    `Ingresos: ${formatGs(stats.totalIngresos)}`,
    `Egresos: ${formatGs(stats.totalEgresos)}`,
    `Balance: ${formatGs(stats.balance)}`,
    `${stats.count} movimiento(s)`,
    "",
  ];

  if (rows.length === 0) {
    lines.push("Sin movimientos en este filtro.");
    return lines.join("\n");
  }

  if (stats.byPerson.length > 0) {
    lines.push("Por persona:");
    for (const p of stats.byPerson.slice(0, 20)) {
      lines.push(
        `· ${p.person}: +${formatGs(p.ingresos)} / −${formatGs(p.egresos)} (${p.movements} mov.)`
      );
    }
    lines.push("");
  }

  rows.forEach((row, idx) => {
    const sign = row.type === "ingreso" ? "+" : "−";
    lines.push(
      `${idx + 1}) ${row.movementDate} · ${row.type.toUpperCase()} · ${sign}${formatGs(row.amount)}`
    );
    lines.push(`   ${row.person} · ${row.category}`);
    if (row.description?.trim()) lines.push(`   ${row.description.trim()}`);
    lines.push("");
  });

  return lines.join("\n").trim();
}

/**
 * PDF A4 de caja (totales + por persona + detalle) según el filtro actual.
 */
export async function createCashLedgerPdf(
  movements: CashMovement[],
  filters: CashLedgerFilters = {}
) {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentW = pageW - marginX * 2;
  const rows = sortMovements(movements);
  const stats = computeCashStats(rows);
  const generatedAt = new Date().toISOString().slice(0, 10);

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
    doc.text("Ingresos y Egresos", marginX + 26, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`Generado ${formatDateEs(generatedAt)}`, marginX + 26, y + 13);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(180, 25, 30);
    doc.text(`${stats.count} mov.`, pageW - marginX, y + 7, { align: "right" });
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

  const ensureSpace = (needed: number) => {
    if (y + needed <= pageH - 14) return;
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text("555 Detail Studio · caja operativa", pageW / 2, pageH - 6, { align: "center" });
    doc.addPage();
    pageNum += 1;
    y = drawHeader(pageNum);
  };

  // Filtro activo
  const filterLines = wrapText(doc, filterSummary(filters), contentW);
  ensureSpace(6 + filterLines.length * 3.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  filterLines.forEach((line) => {
    doc.text(line, marginX, y);
    y += 3.6;
  });
  y += 3;

  // Totales
  ensureSpace(22);
  const cardW = (contentW - 4) / 3;
  const cards = [
    { label: "INGRESOS", value: formatGs(stats.totalIngresos), rgb: [16, 120, 70] as const },
    { label: "EGRESOS", value: formatGs(stats.totalEgresos), rgb: [170, 40, 45] as const },
    {
      label: "BALANCE",
      value: formatGs(stats.balance),
      rgb: (stats.balance >= 0 ? [30, 100, 150] : [160, 100, 30]) as [number, number, number],
    },
  ];
  cards.forEach((card, i) => {
    const x = marginX + i * (cardW + 2);
    doc.setFillColor(245, 243, 239);
    doc.roundedRect(x, y, cardW, 16, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(card.label, x + 3, y + 5);
    doc.setFontSize(9);
    doc.setTextColor(card.rgb[0], card.rgb[1], card.rgb[2]);
    doc.text(card.value, x + 3, y + 12);
  });
  y += 20;

  // Por persona
  if (stats.byPerson.length > 0) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text("Por persona", marginX, y);
    y += 5;

    for (const p of stats.byPerson) {
      ensureSpace(8);
      doc.setFillColor(250, 249, 246);
      doc.roundedRect(marginX, y - 3.5, contentW, 7.5, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text(p.person, marginX + 2, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(`${p.movements} mov.`, marginX + contentW * 0.42, y);
      doc.setTextColor(170, 40, 45);
      doc.text(`− ${formatGs(p.egresos)}`, marginX + contentW * 0.58, y);
      doc.setTextColor(16, 120, 70);
      doc.text(`+ ${formatGs(p.ingresos)}`, pageW - marginX - 2, y, { align: "right" });
      y += 8;
    }
    y += 3;
  }

  // Detalle
  ensureSpace(10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text("Detalle de movimientos", marginX, y);
  y += 5;

  if (rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Sin movimientos en este filtro.", marginX, y + 6);
  } else {
    rows.forEach((row, idx) => {
      const descLines = row.description?.trim()
        ? wrapText(doc, row.description.trim(), contentW - 6)
        : [];
      const blockH = 12 + descLines.length * 3.4;

      ensureSpace(blockH + 3);

      if (idx % 2 === 0) {
        doc.setFillColor(245, 243, 239);
      } else {
        doc.setFillColor(250, 249, 246);
      }
      doc.roundedRect(marginX, y, contentW, blockH, 1.2, 1.2, "F");

      const left = marginX + 3;
      let cy = y + 5;

      const isIn = row.type === "ingreso";
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(18, 18, 18);
      doc.text(row.person || "—", left, cy);

      doc.setTextColor(isIn ? 16 : 170, isIn ? 120 : 40, isIn ? 70 : 45);
      doc.text(
        `${isIn ? "+" : "−"}${Number(row.amount).toLocaleString("es-PY")} Gs.`,
        pageW - marginX - 3,
        cy,
        { align: "right" }
      );
      cy += 4.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `${row.movementDate} · ${isIn ? "Ingreso" : "Egreso"} · ${row.category}`,
        left,
        cy
      );
      cy += 3.8;

      descLines.forEach((line) => {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(7);
        doc.text(line, left, cy);
        cy += 3.3;
      });

      y += blockH + 2.5;
    });
  }

  doc.setFontSize(7.5);
  doc.setTextColor(150, 150, 150);
  doc.text("555 Detail Studio · caja operativa", pageW / 2, pageH - 6, { align: "center" });

  return doc;
}

export async function buildCashLedgerFile(
  movements: CashMovement[],
  filters: CashLedgerFilters = {}
) {
  const doc = await createCashLedgerPdf(movements, filters);
  const stamp =
    filters.dateFrom && filters.dateTo && filters.dateFrom === filters.dateTo
      ? formatDateFile(filters.dateFrom)
      : filters.dateFrom || filters.dateTo
        ? `${formatDateFile(filters.dateFrom || "x")}-${formatDateFile(filters.dateTo || "x")}`
        : formatDateFile(new Date().toISOString().slice(0, 10));
  const fileName = `caja-${stamp}.pdf`;
  const blob = doc.output("blob");
  return {
    doc,
    fileName,
    file: new File([blob], fileName, { type: "application/pdf" }),
    text: buildCashLedgerText(movements, filters),
  };
}
