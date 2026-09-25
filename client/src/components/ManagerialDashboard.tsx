import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Car,
  CheckCircle2,
  Clock,
  DollarSign,
  LayoutDashboard,
  Sparkles,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/cashLedger";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Preset = "hoy" | "7d" | "30d" | "todo" | "custom";

function formatDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function KpiCard(props: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "amber" | "emerald" | "rose" | "sky";
  icon?: React.ReactNode;
}) {
  const tone = props.tone || "default";
  const labelColor =
    tone === "amber"
      ? "text-amber-400"
      : tone === "emerald"
        ? "text-emerald-400"
        : tone === "rose"
          ? "text-rose-400"
          : tone === "sky"
            ? "text-sky-400"
            : "text-slate-400";
  const valueColor =
    tone === "amber"
      ? "text-amber-200"
      : tone === "emerald"
        ? "text-emerald-300"
        : tone === "rose"
          ? "text-rose-300"
          : tone === "sky"
            ? "text-sky-300"
            : "text-white";

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 flex flex-col justify-between min-h-[88px]">
      <div className="flex items-start justify-between gap-2">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${labelColor}`}>
          {props.label}
        </span>
        {props.icon}
      </div>
      <span className={`text-xl sm:text-2xl font-extrabold font-display tabular-nums mt-1 ${valueColor}`}>
        {props.value}
      </span>
      {props.hint ? <span className="text-[10px] text-slate-500 mt-1 leading-snug">{props.hint}</span> : null}
    </div>
  );
}

export function ManagerialDashboard() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [dateFrom, setDateFrom] = useState(daysAgoIso(29));
  const [dateTo, setDateTo] = useState(todayIso());

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "hoy") {
      const t = todayIso();
      setDateFrom(t);
      setDateTo(t);
    } else if (next === "7d") {
      setDateFrom(daysAgoIso(6));
      setDateTo(todayIso());
    } else if (next === "30d") {
      setDateFrom(daysAgoIso(29));
      setDateTo(todayIso());
    } else if (next === "todo") {
      setDateFrom("");
      setDateTo("");
    }
  };

  const range = useMemo(() => {
    if (preset === "todo") return {};
    return {
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    };
  }, [preset, dateFrom, dateTo]);

  const { data: dash, isLoading } = trpc.appointments.managerialStats.useQuery(range);
  const { data: caja } = trpc.cashLedger.stats.useQuery(range);

  const rangeLabel =
    preset === "todo"
      ? "Todo el historial"
      : dateFrom && dateTo && dateFrom === dateTo
        ? formatDateShort(dateFrom)
        : `${dateFrom ? formatDateShort(dateFrom) : "…"} → ${dateTo ? formatDateShort(dateTo) : "…"}`;

  const lavadoPct =
    dash && dash.autosAgendados > 0
      ? Math.round((dash.autosLavados / dash.autosAgendados) * 100)
      : 0;
  const cobroPct =
    dash && dash.autosLavados > 0
      ? Math.round((dash.autosCobrados / dash.autosLavados) * 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-red-400" />
            Tablero gerencial
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Vista de control (no agenda). Autos agendados, lavados y cobros · {rangeLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["hoy", "Hoy"],
              ["7d", "7 días"],
              ["30d", "30 días"],
              ["todo", "Todo"],
              ["custom", "Rango"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                preset === key
                  ? "bg-red-600 border-red-500 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(preset === "custom" || preset === "hoy" || preset === "7d" || preset === "30d") && (
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          <label className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPreset("custom");
                setDateFrom(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] text-slate-500 uppercase">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPreset("custom");
                setDateTo(e.target.value);
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
            />
          </label>
        </div>
      )}

      {isLoading || !dash ? (
        <div className="text-center text-xs text-slate-500 py-16">Cargando tablero…</div>
      ) : (
        <>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-0.5">
              Operación · autos
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <KpiCard
                label="Autos agendados"
                value={dash.autosAgendados}
                hint={`${dash.serviciosAgendados} servicio(s)`}
                icon={<Car className="w-4 h-4 text-slate-500" />}
              />
              <KpiCard
                label="Ya lavados"
                value={dash.autosLavados}
                hint={`${lavadoPct}% del agendado · ${dash.serviciosLavados} servicio(s)`}
                tone="emerald"
                icon={<Sparkles className="w-4 h-4 text-emerald-400/80" />}
              />
              <KpiCard
                label="Por lavar"
                value={dash.autosPorLavar}
                hint={`${dash.serviciosActivos} activo(s) · ${dash.pendientes + dash.enProceso} en cola`}
                tone="amber"
                icon={<Clock className="w-4 h-4 text-amber-400/80" />}
              />
              <KpiCard
                label="Cancelados"
                value={dash.serviciosCancelados}
                hint="Servicios anulados en el rango"
                icon={<AlertTriangle className="w-4 h-4 text-slate-500" />}
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-0.5">
              Cobros · servicios finalizados
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              <KpiCard
                label="Cobrados"
                value={dash.autosCobrados}
                hint={`${dash.serviciosCobrados} servicio(s) · ${cobroPct}% de lavados`}
                tone="emerald"
                icon={<CheckCircle2 className="w-4 h-4 text-emerald-400/80" />}
              />
              <KpiCard
                label="Monto cobrado"
                value={formatGs(dash.montoCobradoGs)}
                tone="emerald"
                icon={<DollarSign className="w-4 h-4 text-emerald-400/80" />}
              />
              <KpiCard
                label="Falta cobrar"
                value={dash.autosFaltaCobrar}
                hint={`${dash.serviciosFaltaCobrar} servicio(s) lavado(s) sin pago`}
                tone="rose"
                icon={<AlertTriangle className="w-4 h-4 text-rose-400/80" />}
              />
              <KpiCard
                label="Monto a cobrar"
                value={formatGs(dash.montoFaltaCobrarGs)}
                hint={
                  dash.montoEnCursoGs > 0
                    ? `+ ${formatGs(dash.montoEnCursoGs)} en curso (confirmados)`
                    : "Solo finalizados pendientes"
                }
                tone="rose"
                icon={<DollarSign className="w-4 h-4 text-rose-400/80" />}
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2 px-0.5">
              Caja operativa (módulo aparte)
            </p>
            <div className="grid grid-cols-3 gap-2.5">
              <KpiCard
                label="Ingresos caja"
                value={formatGs(caja?.totalIngresos || 0)}
                tone="emerald"
                icon={<Wallet className="w-4 h-4 text-emerald-400/80" />}
              />
              <KpiCard
                label="Egresos caja"
                value={formatGs(caja?.totalEgresos || 0)}
                tone="rose"
                icon={<Wallet className="w-4 h-4 text-rose-400/80" />}
              />
              <KpiCard
                label="Balance caja"
                value={formatGs(caja?.balance || 0)}
                tone="sky"
                hint={`${caja?.count || 0} movimiento(s)`}
              />
            </div>
          </div>

          {dash.byZone.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Por zona</p>
              <div className="space-y-1.5">
                {dash.byZone.map((z) => (
                  <div
                    key={z.zone}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-950/70 border border-slate-800"
                  >
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{z.zone}</span>
                      <span className="text-[10px] text-slate-500">
                        {z.autos} auto(s) · {z.servicios} servicio(s)
                      </span>
                    </div>
                    <div className="text-right shrink-0 text-[10px]">
                      <div className="text-emerald-400">+ {formatGs(z.cobradoGs)}</div>
                      <div className="text-rose-400">pend. {formatGs(z.pendienteGs)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {dash.byDay.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Por día (hasta 14)
              </p>
              <div className="space-y-1 max-h-64 overflow-y-auto sheet-scroll">
                {dash.byDay.slice(0, 14).map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-950/50 border border-slate-800/80"
                  >
                    <span className="text-xs font-bold text-slate-200 tabular-nums">{d.date}</span>
                    <div className="flex items-center gap-3 text-[10px] tabular-nums">
                      <span className="text-slate-400">{d.agendados} agend.</span>
                      <span className="text-emerald-400">{d.lavados} lav.</span>
                      <span className="text-emerald-300/90">{formatGs(d.cobradoGs)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
