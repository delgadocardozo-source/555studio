import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  Car,
  HandCoins,
  LayoutDashboard,
  Package,
  Scale,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/erpControl";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

type Preset = "hoy" | "7d" | "30d" | "todo";

function Kpi(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "emerald" | "amber" | "rose" | "sky";
  icon?: React.ReactNode;
}) {
  const tone = props.tone || "default";
  const valueColor =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
        ? "text-amber-200"
        : tone === "rose"
          ? "text-rose-300"
          : tone === "sky"
            ? "text-sky-300"
            : "text-white";
  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3.5 min-h-[92px] flex flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {props.label}
        </span>
        {props.icon}
      </div>
      <span className={`text-lg sm:text-xl font-extrabold tabular-nums mt-1 ${valueColor}`}>
        {props.value}
      </span>
      {props.hint ? (
        <span className="text-[10px] text-slate-500 mt-1 leading-snug">{props.hint}</span>
      ) : null}
    </div>
  );
}

/**
 * Centro de control — torre de mando del ERP (mejores prácticas: reconciliación,
 * alertas accionables, resultado operativo).
 */
export function ErpControlPanel() {
  const [preset, setPreset] = useState<Preset>("30d");
  const range = useMemo(() => {
    if (preset === "hoy") return { dateFrom: todayIso(), dateTo: todayIso() };
    if (preset === "7d") return { dateFrom: daysAgoIso(6), dateTo: todayIso() };
    if (preset === "30d") return { dateFrom: daysAgoIso(29), dateTo: todayIso() };
    return {};
  }, [preset]);

  const { data, isLoading } = trpc.erp.controlTower.useQuery(range);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-400" />
            Centro de control
          </h2>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
            Torre de mando: operación, caja, deuda y stock en un solo lugar. Alertas accionables,
            no vanidad.
          </p>
        </div>
        <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
          {(
            [
              ["hoy", "Hoy"],
              ["7d", "7d"],
              ["30d", "30d"],
              ["todo", "Todo"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPreset(id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                preset === id ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-xs text-slate-500 py-8 text-center">Cargando torre de control…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Kpi
              label="Resultado ops"
              value={formatGs(data.resultadoGs)}
              hint="Cobrado agenda − egresos caja"
              tone={data.resultadoGs >= 0 ? "emerald" : "rose"}
              icon={<Scale className="w-3.5 h-3.5 text-slate-500" />}
            />
            <Kpi
              label="Cobrado agenda"
              value={formatGs(data.kpis.agendaCobradoGs)}
              hint={`${data.kpis.lavadosPeriodo} lavados · ${data.kpis.autosLavadosPeriodo} autos`}
              tone="emerald"
              icon={<Car className="w-3.5 h-3.5 text-emerald-500" />}
            />
            <Kpi
              label="Deuda abierta"
              value={formatGs(data.kpis.deudaAbiertaGs)}
              hint={`${data.kpis.deudaAbiertaCount} turnos · ${data.kpis.deudaVencidaCount} venc.`}
              tone={data.kpis.deudaAbiertaCount > 0 ? "amber" : "default"}
              icon={<HandCoins className="w-3.5 h-3.5 text-amber-500" />}
            />
            <Kpi
              label="Δ Agenda ↔ Caja"
              value={formatGs(data.reconDeltaGs)}
              hint={
                data.reconStatus === "ok"
                  ? "Reconciliación OK (±50 mil)"
                  : data.reconStatus === "caja_menor"
                    ? "Caja por debajo de cobros"
                    : "Caja por encima (aportes u otros)"
              }
              tone={data.reconStatus === "ok" ? "sky" : "amber"}
              icon={<Wallet className="w-3.5 h-3.5 text-sky-500" />}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Kpi
              label="Ingresos caja"
              value={formatGs(data.kpis.cajaIngresosGs)}
              tone="emerald"
            />
            <Kpi
              label="Egresos caja"
              value={formatGs(data.kpis.cajaEgresosGs)}
              tone="rose"
            />
            <Kpi
              label="Balance caja"
              value={formatGs(data.kpis.cajaBalanceGs)}
              tone={data.kpis.cajaBalanceGs >= 0 ? "emerald" : "rose"}
            />
            <Kpi
              label="Stock"
              value={formatGs(data.kpis.stockValueGs)}
              hint={
                data.kpis.lowStockCount > 0
                  ? `${data.kpis.lowStockCount} bajo mínimo`
                  : "Sin alertas de mínimo"
              }
              tone={data.kpis.lowStockCount > 0 ? "amber" : "default"}
              icon={<Package className="w-3.5 h-3.5 text-slate-500" />}
            />
          </div>

          {data.alerts.length > 0 && (
            <section className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                Alertas accionables
              </p>
              {data.alerts.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-2xl border px-3.5 py-3 flex gap-2.5 items-start ${
                    a.severity === "critical"
                      ? "border-rose-500/40 bg-rose-500/10"
                      : a.severity === "warn"
                        ? "border-amber-500/40 bg-amber-500/10"
                        : "border-sky-500/30 bg-sky-500/10"
                  }`}
                >
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      a.severity === "critical"
                        ? "text-rose-300"
                        : a.severity === "warn"
                          ? "text-amber-300"
                          : "text-sky-300"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white">{a.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{a.detail}</p>
                  </div>
                  {a.id === "deuda" && (
                    <Link
                      href="/erp/deudores"
                      className="text-[10px] font-bold text-amber-200 shrink-0 inline-flex items-center gap-0.5"
                    >
                      Ir <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  {a.id.startsWith("recon") && (
                    <Link
                      href="/erp/caja"
                      className="text-[10px] font-bold text-sky-200 shrink-0 inline-flex items-center gap-0.5"
                    >
                      Caja <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  {a.id === "stock" && (
                    <Link
                      href="/erp/inventario"
                      className="text-[10px] font-bold text-emerald-200 shrink-0 inline-flex items-center gap-0.5"
                    >
                      Stock <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                  {a.id === "recontacto" && (
                    <Link
                      href="/erp/recontacto"
                      className="text-[10px] font-bold text-emerald-200 shrink-0 inline-flex items-center gap-0.5"
                    >
                      WA <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Accesos rápidos
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                [
                  ["/erp/tablero", "Tablero ops", LayoutDashboard, "sky"],
                  ["/erp/caja", "Caja", Wallet, "emerald"],
                  ["/erp/clientes", "Clientes", Users, "violet"],
                  ["/erp/deudores", "Deudores", HandCoins, "amber"],
                ] as const
              ).map(([href, label, Icon, tone]) => (
                <Link
                  key={href}
                  href={href}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl px-3 py-3 flex items-center gap-2 text-xs font-bold text-slate-200"
                >
                  <Icon
                    className={`w-4 h-4 ${
                      tone === "sky"
                        ? "text-sky-400"
                        : tone === "emerald"
                          ? "text-emerald-400"
                          : tone === "violet"
                            ? "text-violet-400"
                            : "text-amber-400"
                    }`}
                  />
                  {label}
                </Link>
              ))}
            </div>
          </section>

          <p className="text-[10px] text-slate-600">
            Período: {data.periodLabel}
            {data.kpis.nominaPagadaGs > 0
              ? ` · Nómina registrada ${formatGs(data.kpis.nominaPagadaGs)}`
              : ""}
            {data.kpis.recontactoPendiente > 0
              ? ` · ${data.kpis.recontactoPendiente} recontacto(s)`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
