import React from "react";
import { Link, useRoute } from "wouter";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  HandCoins,
  LayoutDashboard,
  LayoutGrid,
  MessageCircle,
  Package,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { CashLedgerPanel } from "@/components/CashLedgerPanel";
import { ManagerialDashboard } from "@/components/ManagerialDashboard";
import { PayrollPanel } from "@/components/PayrollPanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import { SuppliersPanel } from "@/components/SuppliersPanel";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import { ReengagePanel } from "@/components/ReengagePanel";

type ErpModule =
  | "hub"
  | "tablero"
  | "caja"
  | "personal"
  | "inventario"
  | "proveedores"
  | "deudores"
  | "recontacto";

const MODULES: Array<{
  id: Exclude<ErpModule, "hub">;
  path: string;
  label: string;
  short: string;
  blurb: string;
  icon: typeof LayoutDashboard;
  accent: string;
}> = [
  {
    id: "tablero",
    path: "/erp/tablero",
    label: "Tablero",
    short: "Tablero",
    blurb: "Resumen gerencial del lavadero",
    icon: LayoutDashboard,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "caja",
    path: "/erp/caja",
    label: "Caja",
    short: "Caja",
    blurb: "Ingresos y egresos con responsable",
    icon: Wallet,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    id: "personal",
    path: "/erp/personal",
    label: "Personal",
    short: "Personal",
    blurb: "Nómina y pagos al equipo",
    icon: Users,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "inventario",
    path: "/erp/inventario",
    label: "Stock",
    short: "Stock",
    blurb: "Existencias + armado de lavado (consumo al finalizar)",
    icon: Package,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    id: "proveedores",
    path: "/erp/proveedores",
    label: "Proveedores",
    short: "Prov.",
    blurb: "Contactos de compra y servicios",
    icon: Truck,
    accent: "text-violet-300 bg-violet-500/15 border-violet-500/30",
  },
  {
    id: "deudores",
    path: "/erp/deudores",
    label: "Deudores",
    short: "Deudas",
    blurb: "Cuentas por cobrar a clientes",
    icon: HandCoins,
    accent: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  },
  {
    id: "recontacto",
    path: "/erp/recontacto",
    label: "Recontacto",
    short: "WA 7d",
    blurb: "Avisar a los 7 días post-lavado",
    icon: MessageCircle,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
];

function useErpModule(): ErpModule {
  const [, recontacto] = useRoute("/erp/recontacto");
  const [, deudores] = useRoute("/erp/deudores");
  const [, proveedores] = useRoute("/erp/proveedores");
  const [, inventario] = useRoute("/erp/inventario");
  const [, personal] = useRoute("/erp/personal");
  const [, caja] = useRoute("/erp/caja");
  const [, tablero] = useRoute("/erp/tablero");
  if (recontacto) return "recontacto";
  if (deudores) return "deudores";
  if (proveedores) return "proveedores";
  if (inventario) return "inventario";
  if (personal) return "personal";
  if (caja) return "caja";
  if (tablero) return "tablero";
  return "hub";
}

function ErpHub() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-sky-400" />
          Módulos del ERP
        </h2>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
          Números del lavadero separados de la agenda. Más adelante se conectan cobros y
          turnos con estos módulos.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Link
              key={m.id}
              href={m.path}
              className="group bg-slate-900/90 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 transition-colors active:scale-[0.99]"
            >
              <div
                className={`inline-flex items-center justify-center w-9 h-9 rounded-xl border mb-3 ${m.accent}`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-sm font-bold text-white group-hover:text-sky-200">{m.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{m.blurb}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ERP operativo del lavadero — sección aparte de la Agenda.
 * Hub + módulos: tablero, caja, personal, inventario, proveedores, deudores.
 */
export default function ErpHome() {
  const module = useErpModule();
  const current = MODULES.find((m) => m.id === module);

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
                {current
                  ? `${current.label} — aparte de la agenda`
                  : "Hub · Stock por consumo de lavado · aparte de la agenda"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {module !== "hub" && (
              <Link
                href="/erp"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-slate-200 hover:border-sky-500/50 hover:text-white active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Menú</span>
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-200 hover:border-red-500/50 hover:text-white active:scale-95"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-red-400" />
              Agenda
            </Link>
          </div>
        </div>
      </header>

      {module !== "hub" && (
        <section className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full py-2.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-900 p-1 rounded-xl border border-slate-800">
            <Link
              href="/erp"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white shrink-0"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Menú
            </Link>
            {MODULES.map((m) => {
              const Icon = m.icon;
              const active = module === m.id;
              return (
                <Link
                  key={m.id}
                  href={m.path}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all shrink-0 ${
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
      )}

      <main className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full pb-6 flex-1">
        {module === "hub" && <ErpHub />}
        {module === "tablero" && <ManagerialDashboard />}
        {module === "caja" && <CashLedgerPanel />}
        {module === "personal" && <PayrollPanel />}
        {module === "inventario" && <InventoryPanel />}
        {module === "proveedores" && <SuppliersPanel />}
        {module === "deudores" && <ReceivablesPanel />}
        {module === "recontacto" && <ReengagePanel />}
      </main>

      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#080d1a] border-t border-slate-800/90 px-1.5 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 overflow-x-auto no-scrollbar">
        <Link
          href="/erp"
          className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold shrink-0 ${
            module === "hub" ? "text-sky-300" : "text-slate-400"
          }`}
        >
          <LayoutGrid className="w-4 h-4 mb-0.5" />
          <span>Menú</span>
        </Link>
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = module === m.id;
          return (
            <Link
              key={m.id}
              href={m.path}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold shrink-0 ${
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
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold text-slate-400 shrink-0"
        >
          <CalendarIcon className="w-4 h-4 mb-0.5 text-red-400" />
          <span>Agenda</span>
        </Link>
      </div>
    </div>
  );
}
