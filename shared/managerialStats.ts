/** KPIs del tablero gerencial (independiente de la vista de agenda). */

import { appointmentVehicleCount } from "./scheduling";

export type ManagerialDateRange = {
  dateFrom?: string;
  dateTo?: string;
};

export type ManagerialAppointmentRow = {
  scheduledDate?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  servicePrice?: number | null;
  vehicleCount?: number | null;
  vehicles?: unknown;
  cityZone?: string | null;
};

export type ManagerialZoneStat = {
  zone: string;
  servicios: number;
  autos: number;
  cobradoGs: number;
  pendienteGs: number;
};

export type ManagerialDayStat = {
  date: string;
  agendados: number;
  lavados: number;
  cobradoGs: number;
};

export type ManagerialDashboardStats = {
  /** Rango aplicado (ISO YYYY-MM-DD). */
  dateFrom: string | null;
  dateTo: string | null;
  /** Servicios (turnos) no cancelados. */
  serviciosAgendados: number;
  serviciosLavados: number;
  serviciosActivos: number;
  serviciosCancelados: number;
  /** Autos = suma de vehículos. */
  autosAgendados: number;
  autosLavados: number;
  autosPorLavar: number;
  /** Pipeline operativo (servicios). */
  pendientes: number;
  enProceso: number;
  /** Cobros sobre servicios finalizados. */
  serviciosCobrados: number;
  serviciosFaltaCobrar: number;
  autosCobrados: number;
  autosFaltaCobrar: number;
  montoCobradoGs: number;
  montoFaltaCobrarGs: number;
  /** Confirmados aún no lavados: monto esperado. */
  montoEnCursoGs: number;
  byZone: ManagerialZoneStat[];
  byDay: ManagerialDayStat[];
};

function inRange(date: string, from?: string, to?: string): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function carsOf(row: ManagerialAppointmentRow): number {
  return appointmentVehicleCount(row);
}

/**
 * Calcula el tablero gerencial a partir de turnos.
 * No incluye movimientos de caja (van aparte).
 */
export function computeManagerialStats(
  rows: ManagerialAppointmentRow[],
  range: ManagerialDateRange = {}
): ManagerialDashboardStats {
  const filtered = rows.filter((row) =>
    inRange(String(row.scheduledDate || ""), range.dateFrom, range.dateTo)
  );

  let serviciosAgendados = 0;
  let serviciosLavados = 0;
  let serviciosActivos = 0;
  let serviciosCancelados = 0;
  let autosAgendados = 0;
  let autosLavados = 0;
  let autosPorLavar = 0;
  let pendientes = 0;
  let enProceso = 0;
  let serviciosCobrados = 0;
  let serviciosFaltaCobrar = 0;
  let autosCobrados = 0;
  let autosFaltaCobrar = 0;
  let montoCobradoGs = 0;
  let montoFaltaCobrarGs = 0;
  let montoEnCursoGs = 0;

  const zoneMap = new Map<string, ManagerialZoneStat>();
  const dayMap = new Map<string, ManagerialDayStat>();

  const bumpZone = (zone: string, patch: Partial<ManagerialZoneStat>) => {
    const key = zone || "Sin zona";
    const cur = zoneMap.get(key) || {
      zone: key,
      servicios: 0,
      autos: 0,
      cobradoGs: 0,
      pendienteGs: 0,
    };
    zoneMap.set(key, {
      zone: key,
      servicios: cur.servicios + (patch.servicios || 0),
      autos: cur.autos + (patch.autos || 0),
      cobradoGs: cur.cobradoGs + (patch.cobradoGs || 0),
      pendienteGs: cur.pendienteGs + (patch.pendienteGs || 0),
    });
  };

  const bumpDay = (date: string, patch: Partial<ManagerialDayStat>) => {
    const cur = dayMap.get(date) || { date, agendados: 0, lavados: 0, cobradoGs: 0 };
    dayMap.set(date, {
      date,
      agendados: cur.agendados + (patch.agendados || 0),
      lavados: cur.lavados + (patch.lavados || 0),
      cobradoGs: cur.cobradoGs + (patch.cobradoGs || 0),
    });
  };

  for (const row of filtered) {
    const status = String(row.status || "");
    const pay = String(row.paymentStatus || "sin_definir");
    const cars = carsOf(row);
    const price = Number(row.servicePrice) || 0;
    const date = String(row.scheduledDate || "");
    const zone = String(row.cityZone || "Sin zona");

    if (status === "cancelado") {
      serviciosCancelados += 1;
      continue;
    }

    serviciosAgendados += 1;
    autosAgendados += cars;
    bumpZone(zone, { servicios: 1, autos: cars });
    if (date) bumpDay(date, { agendados: cars });

    if (status === "pendiente" || status === "confirmado") pendientes += 1;
    if (status === "en_camino" || status === "en_proceso") enProceso += 1;

    if (status === "finalizado") {
      serviciosLavados += 1;
      autosLavados += cars;
      if (date) bumpDay(date, { lavados: cars });

      if (pay === "pagado") {
        serviciosCobrados += 1;
        autosCobrados += cars;
        montoCobradoGs += price;
        bumpZone(zone, { cobradoGs: price });
        if (date) bumpDay(date, { cobradoGs: price });
      } else {
        // falta_pagar o sin_definir tras finalizar → pendiente de cobro
        serviciosFaltaCobrar += 1;
        autosFaltaCobrar += cars;
        montoFaltaCobrarGs += price;
        bumpZone(zone, { pendienteGs: price });
      }
    } else {
      serviciosActivos += 1;
      autosPorLavar += cars;
      if (status === "confirmado") {
        montoEnCursoGs += price;
      }
    }
  }

  const byZone = Array.from(zoneMap.values()).sort(
    (a, b) => b.autos - a.autos || a.zone.localeCompare(b.zone)
  );
  const byDay = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  return {
    dateFrom: range.dateFrom || null,
    dateTo: range.dateTo || null,
    serviciosAgendados,
    serviciosLavados,
    serviciosActivos,
    serviciosCancelados,
    autosAgendados,
    autosLavados,
    autosPorLavar,
    pendientes,
    enProceso,
    serviciosCobrados,
    serviciosFaltaCobrar,
    autosCobrados,
    autosFaltaCobrar,
    montoCobradoGs,
    montoFaltaCobrarGs,
    montoEnCursoGs,
    byZone,
    byDay,
  };
}
