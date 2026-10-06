import React, { useState } from "react";
import { Link } from "wouter";
import { Car, Gift, HandCoins, Search, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/cashLedger";

/**
 * CRM 360 lite — clientes con LTV, deuda, fidelidad y garaje.
 */
export function CustomersCrmPanel() {
  const [query, setQuery] = useState("");
  const { data: rows = [], isLoading } = trpc.customers.crmList.useQuery({
    query: query.trim() || undefined,
    limit: 50,
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
          <Users className="w-4 h-4 text-violet-400" />
          Clientes · CRM
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Vista 360: lavados, cobrado histórico, deuda abierta, fidelidad y garaje.
        </p>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nombre, teléfono, RUC…"
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200"
        />
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Cargando clientes…</p>
      ) : rows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Sin clientes aún</p>
          <p className="text-[11px] text-slate-500">
            Se crean solos al agendar.{" "}
            <Link href="/agendar" className="text-sky-300 underline">
              Ir a agendar
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.phoneKey}
              className={`bg-slate-900 border rounded-2xl p-3 ${
                c.openDebtCount > 0 ? "border-amber-500/35" : "border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{c.clientName}</p>
                  <p className="text-[11px] text-slate-400">
                    {c.clientPhone}
                    {c.clientTaxId ? ` · RUC ${c.clientTaxId}` : ""}
                  </p>
                </div>
                {c.openDebtCount > 0 && (
                  <span className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                    Debe {formatGs(c.openDebtGs)}
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                <div className="bg-slate-950/80 rounded-xl px-2 py-1.5 border border-slate-800/80">
                  <span className="text-slate-500 block">LTV cobrado</span>
                  <span className="font-bold text-emerald-300">{formatGs(c.lifetimePaidGs)}</span>
                </div>
                <div className="bg-slate-950/80 rounded-xl px-2 py-1.5 border border-slate-800/80">
                  <span className="text-slate-500 block">Lavados</span>
                  <span className="font-bold text-white">
                    {c.washesTotal}
                    <span className="text-slate-500 font-medium"> · mes {c.washesThisMonth}</span>
                  </span>
                </div>
                <div className="bg-slate-950/80 rounded-xl px-2 py-1.5 border border-slate-800/80">
                  <span className="text-slate-500 block flex items-center gap-1">
                    <Gift className="w-3 h-3" /> Fidelidad
                  </span>
                  <span className="font-bold text-amber-200">
                    {c.loyalty.eligibleForFreeWash
                      ? `${c.loyalty.freeWashCredits} gratis`
                      : `faltan ${c.loyalty.nextRewardIn}`}
                  </span>
                </div>
                <div className="bg-slate-950/80 rounded-xl px-2 py-1.5 border border-slate-800/80">
                  <span className="text-slate-500 block flex items-center gap-1">
                    <Car className="w-3 h-3" /> Garaje
                  </span>
                  <span className="font-bold text-slate-200">
                    {c.vehicles.length || 0}
                    {c.upcomingCount > 0 ? ` · ${c.upcomingCount} próximo` : ""}
                  </span>
                </div>
              </div>

              {c.vehicles.length > 0 && (
                <p className="text-[10px] text-slate-500 mt-2 truncate">
                  {c.vehicles
                    .map((v) => `${v.type} ${v.model}${v.plate ? ` (${v.plate})` : ""}`)
                    .join(" · ")}
                </p>
              )}

              {c.openDebtCount > 0 && (
                <Link
                  href="/erp/deudores"
                  className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-amber-300"
                >
                  <HandCoins className="w-3 h-3" />
                  Ver en deudores
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
