import React from "react";
import { Link, useRoute } from "wouter";
import {
  Calendar as CalendarIcon,
  LayoutDashboard,
  Users,
  Wallet,
} from "lucide-react";
import { CashLedgerPanel } from "@/components/CashLedgerPanel";
import { ManagerialDashboard } from "@/components/ManagerialDashboard";
import { PayrollPanel } from "@/components/PayrollPanel";

type ErpModule = "tablero" | "caja" | "personal";

const MODULES: Array<{
  id: ErpModule;
  path: string;
  label: string;
  short: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "tablero", path: "/erp", label: "Tablero", short: "Tablero", icon: LayoutDashboard },
  { id: "caja", path: "/erp/caja", label: "Caja", short: "Caja", icon: Wallet },
  { id: "personal", path: "/erp/personal", label: "Personal", short: "Personal", icon: Users },
];

function useErpModule(): ErpModule {
  const [, personalParams] = useRoute("/erp/personal");
  const [, cajaParams] = useRoute("/erp/caja");
  if (personalParams) return "personal";
  if (cajaParams) return "caja";
  return "tablero";
}

/**
 * ERP operativo del lavadero — sección aparte de la Agenda.
 * Más adelante se conectará con cobros/números del agendamiento.
 */
export default function ErpHome() {
  const module = useErpModule();

  return (
    <div className="min-h-dvh bg-[#050811] text-slate-100 flex flex-col antialiased selection:bg-sky-600 selection:text-white pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:pb-8">
      <header className="border-b border-slate-800/80 bg-[#080d1a] sticky top-0 z-30 px-3.5 sm:px-6 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white px-2 py-1 rounded shadow-sm flex items-center justify-center shrink-0">
              <img
                src="/logo-555.png"
                alt="555 Detail Studio"
                className="h-5 sm:h-7 w-auto object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                  ERP Lavadero
                </h1>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-300 border border-sky-500/30">
                  Números
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Tablero · Caja · Personal — sin mezclar con la agenda
              </p>
            </div>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 shrink-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-200 hover:border-red-500/50 hover:text-white active:scale-95"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-red-400" />
            Agenda
          </Link>
        </div>
      </header>

      <section className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full py-2.5">
        <div className="hidden sm:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
          {MODULES.map((m) => {
            const Icon = m.icon;
            const active = module === m.id;
            return (
              <Link
                key={m.id}
                href={m.path}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                  active
                    ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {m.label}
              </Link>
            );
          })}
        </div>
      </section>

      <main className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full pb-6 flex-1">
        {module === "tablero" && <ManagerialDashboard />}
        {module === "caja" && <CashLedgerPanel />}
        {module === "personal" && <PayrollPanel />}
      </main>

      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#080d1a] border-t border-slate-800/90 px-2 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-1">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = module === m.id;
          return (
            <Link
              key={m.id}
              href={m.path}
              className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-colors ${
                active ? "text-sky-300" : "text-slate-400"
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{m.short}</span>
            </Link>
          );
        })}
        <Link
          href="/"
          className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold text-slate-400"
        >
          <CalendarIcon className="w-4 h-4 mb-0.5 text-red-400" />
          <span>Agenda</span>
        </Link>
      </div>
    </div>
  );
}
