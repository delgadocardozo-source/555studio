/** Centro de control ERP — KPIs cruzados (agenda ↔ caja ↔ stock ↔ deuda). */

import { formatGs } from "./cashLedger";

export interface ErpControlInputs {
  /** Cobrado en agenda (lavados pagados) en el período */
  agendaCobradoGs: number;
  /** Ingresos registrados en caja en el período */
  cajaIngresosGs: number;
  cajaEgresosGs: number;
  cajaBalanceGs: number;
  /** Deuda abierta (falta_pagar) */
  deudaAbiertaGs: number;
  deudaAbiertaCount: number;
  deudaVencidaCount: number;
  /** Stock */
  stockValueGs: number;
  lowStockCount: number;
  /** Operación */
  lavadosPeriodo: number;
  autosLavadosPeriodo: number;
  recontactoPendiente: number;
  /** Nómina del período (pagos registrados) */
  nominaPagadaGs: number;
}

export interface ErpControlAlert {
  id: string;
  severity: "info" | "warn" | "critical";
  title: string;
  detail: string;
}

export interface ErpControlSnapshot {
  periodLabel: string;
  dateFrom?: string;
  dateTo?: string;
  /** Resultado operativo simple: cobrado agenda - egresos caja - nómina (si nómina no está en caja) */
  resultadoGs: number;
  /** Diferencia agenda cobrado vs ingresos caja (reconciliación) */
  reconDeltaGs: number;
  reconStatus: "ok" | "caja_menor" | "caja_mayor";
  margenBrutoHintGs: number;
  alerts: ErpControlAlert[];
  kpis: {
    agendaCobradoGs: number;
    cajaIngresosGs: number;
    cajaEgresosGs: number;
    cajaBalanceGs: number;
    deudaAbiertaGs: number;
    deudaAbiertaCount: number;
    deudaVencidaCount: number;
    stockValueGs: number;
    lowStockCount: number;
    lavadosPeriodo: number;
    autosLavadosPeriodo: number;
    recontactoPendiente: number;
    nominaPagadaGs: number;
  };
}

export function computeErpControlSnapshot(
  input: ErpControlInputs,
  opts?: { periodLabel?: string; dateFrom?: string; dateTo?: string }
): ErpControlSnapshot {
  const reconDeltaGs = Math.round(
    Number(input.agendaCobradoGs || 0) - Number(input.cajaIngresosGs || 0)
  );
  let reconStatus: ErpControlSnapshot["reconStatus"] = "ok";
  if (reconDeltaGs > 50_000) reconStatus = "caja_menor";
  else if (reconDeltaGs < -50_000) reconStatus = "caja_mayor";

  // Resultado: lo cobrado en operaciones menos egresos de caja.
  // (Nómina a menudo ya está dentro de egresos "Sueldos"; no la restamos dos veces.)
  const resultadoGs = Math.round(
    Number(input.agendaCobradoGs || 0) - Number(input.cajaEgresosGs || 0)
  );

  const alerts: ErpControlAlert[] = [];

  if (input.deudaAbiertaCount > 0) {
    alerts.push({
      id: "deuda",
      severity: input.deudaVencidaCount > 0 ? "critical" : "warn",
      title: `${input.deudaAbiertaCount} deudor(es) · ${formatGs(input.deudaAbiertaGs)}`,
      detail:
        input.deudaVencidaCount > 0
          ? `${input.deudaVencidaCount} con fecha vencida — cobrá desde Deudores o Agenda`
          : "Lavados finalizados como falta pagar",
    });
  }

  if (reconStatus === "caja_menor") {
    alerts.push({
      id: "recon-caja-menor",
      severity: "warn",
      title: "Caja por debajo de cobros de agenda",
      detail: `Agenda cobró ${formatGs(input.agendaCobradoGs)} y la caja registró ${formatGs(input.cajaIngresosGs)} (Δ ${formatGs(reconDeltaGs)}). Revisá ingresos o activá posteo automático al cobrar.`,
    });
  } else if (reconStatus === "caja_mayor") {
    alerts.push({
      id: "recon-caja-mayor",
      severity: "info",
      title: "Caja por encima de cobros de agenda",
      detail: `Hay ${formatGs(Math.abs(reconDeltaGs))} de ingresos en caja que no matchean cobros de lavados (aportes u otros).`,
    });
  }

  if (input.lowStockCount > 0) {
    alerts.push({
      id: "stock",
      severity: "warn",
      title: `${input.lowStockCount} insumo(s) bajo mínimo`,
      detail: `Valor de stock ${formatGs(input.stockValueGs)}. Revisá Stock → Armado de lavado.`,
    });
  }

  if (input.recontactoPendiente > 0) {
    alerts.push({
      id: "recontacto",
      severity: "info",
      title: `${input.recontactoPendiente} cliente(s) para recontacto`,
      detail: "Pasaron ~7 días del lavado sin turno futuro.",
    });
  }

  return {
    periodLabel: opts?.periodLabel || "Período",
    dateFrom: opts?.dateFrom,
    dateTo: opts?.dateTo,
    resultadoGs,
    reconDeltaGs,
    reconStatus,
    margenBrutoHintGs: resultadoGs,
    alerts,
    kpis: {
      agendaCobradoGs: Number(input.agendaCobradoGs) || 0,
      cajaIngresosGs: Number(input.cajaIngresosGs) || 0,
      cajaEgresosGs: Number(input.cajaEgresosGs) || 0,
      cajaBalanceGs: Number(input.cajaBalanceGs) || 0,
      deudaAbiertaGs: Number(input.deudaAbiertaGs) || 0,
      deudaAbiertaCount: Number(input.deudaAbiertaCount) || 0,
      deudaVencidaCount: Number(input.deudaVencidaCount) || 0,
      stockValueGs: Number(input.stockValueGs) || 0,
      lowStockCount: Number(input.lowStockCount) || 0,
      lavadosPeriodo: Number(input.lavadosPeriodo) || 0,
      autosLavadosPeriodo: Number(input.autosLavadosPeriodo) || 0,
      recontactoPendiente: Number(input.recontactoPendiente) || 0,
      nominaPagadaGs: Number(input.nominaPagadaGs) || 0,
    },
  };
}

export { formatGs };
