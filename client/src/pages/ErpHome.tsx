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
  Sparkles,
  Receipt,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { CashLedgerPanel } from "@/components/CashLedgerPanel";
import { BillingPanel } from "@/components/BillingPanel";
import { ManagerialDashboard } from "@/components/ManagerialDashboard";
import { PayrollPanel } from "@/components/PayrollPanel";
import { InventoryPanel } from "@/components/InventoryPanel";
import { SuppliersPanel } from "@/components/SuppliersPanel";
import { ReceivablesPanel } from "@/components/ReceivablesPanel";
import { ReengagePanel } from "@/components/ReengagePanel";
import { ErpControlPanel } from "@/components/ErpControlPanel";
import { CustomersCrmPanel } from "@/components/CustomersCrmPanel";
import { StaffLogoutButton } from "@/components/StaffGate";

type ErpModule =
  | "control"
  | "tablero"
  | "caja"
  | "facturacion"
  | "personal"
  | "inventario"
  | "proveedores"
  | "deudores"
  | "recontacto"
  | "clientes";

type Domain = "control" | "finanzas" | "stock" | "personas" | "clientes";

const MODULES: Array<{
  id: ErpModule;
  path: string;
  label: string;
  short: string;
  blurb: string;
  domain: Domain;
  icon: typeof LayoutDashboard;
  accent: string;
}> = [
  {
    id: "control",
    path: "/erp",
    label: "Control",
    short: "Control",
    blurb: "Torre de mando · KPIs y alertas",
    domain: "control",
    icon: Sparkles,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "tablero",
    path: "/erp/tablero",
    label: "Tablero ops",
    short: "Ops",
    blurb: "Lavados, zonas y cobros de agenda",
    domain: "finanzas",
    icon: LayoutDashboard,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "caja",
    path: "/erp/caja",
    label: "Caja",
    short: "Caja",
    blurb: "Ingresos / egresos operativos",
    domain: "finanzas",
    icon: Wallet,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    id: "facturacion",
    path: "/erp/facturacion",
    label: "Facturación",
    short: "Factura",
    blurb: "Comprobante por lavado · IVA incluido",
    domain: "finanzas",
    icon: Receipt,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "deudores",
    path: "/erp/deudores",
    label: "Deudores",
    short: "Deudas",
    blurb: "Automático desde falta pagar",
    domain: "finanzas",
    icon: HandCoins,
    accent: "text-amber-300 bg-amber-500/15 border-amber-500/30",
  },
  {
    id: "inventario",
    path: "/erp/inventario",
    label: "Stock",
    short: "Stock",
    blurb: "Insumos + armado de lavado",
    domain: "stock",
    icon: Package,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    id: "proveedores",
    path: "/erp/proveedores",
    label: "Proveedores",
    short: "Prov.",
    blurb: "Contactos de compra",
    domain: "stock",
    icon: Truck,
    accent: "text-violet-300 bg-violet-500/15 border-violet-500/30",
  },
  {
    id: "personal",
    path: "/erp/personal",
    label: "Personal",
    short: "Personal",
    blurb: "Nómina y pagos al equipo",
    domain: "personas",
    icon: Users,
    accent: "text-sky-300 bg-sky-500/15 border-sky-500/30",
  },
  {
    id: "recontacto",
    path: "/erp/recontacto",
    label: "Recontacto",
    short: "WA 7d",
    blurb: "Follow-up a los 7 días",
    domain: "personas",
    icon: MessageCircle,
    accent: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
  },
  {
    id: "clientes",
    path: "/erp/clientes",
    label: "Clientes",
    short: "CRM",
    blurb: "360° · LTV, deuda, fidelidad, garaje",
    domain: "clientes",
    icon: Users,
    accent: "text-violet-300 bg-violet-500/15 border-violet-500/30",
  },
];

const DOMAIN_LABEL: Record<Domain, string> = {
  control: "Control",
  finanzas: "Finanzas",
  stock: "Stock & compras",
  personas: "Personas",
  clientes: "Clientes",
};

function useErpModule(): ErpModule {
  const [, clientes] = useRoute("/erp/clientes");
  const [, recontacto] = useRoute("/erp/recontacto");
  const [, deudores] = useRoute("/erp/deudores");
  const [, proveedores] = useRoute("/erp/proveedores");
  const [, inventario] = useRoute("/erp/inventario");
  const [, personal] = useRoute("/erp/personal");
  const [, facturacion] = useRoute("/erp/facturacion");
  const [, caja] = useRoute("/erp/caja");
  const [, tablero] = useRoute("/erp/tablero");
  if (clientes) return "clientes";
  if (recontacto) return "recontacto";
  if (deudores) return "deudores";
  if (proveedores) return "proveedores";
  if (inventario) return "inventario";
  if (personal) return "personal";
  if (facturacion) return "facturacion";
  if (caja) return "caja";
  if (tablero) return "tablero";
  return "control";
}

/**
 * ERP lavadero — dominios + centro de control (prácticas modernas).
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
                  Control
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                {current
                  ? `${DOMAIN_LABEL[current.domain]} · ${current.label}`
                  : "Centro de control · finanzas · stock · clientes"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {module !== "control" && (
              <Link
                href="/erp"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-slate-200 hover:border-sky-500/50 hover:text-white active:scale-95"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Control</span>
              </Link>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-bold text-slate-200 hover:border-red-500/50 hover:text-white active:scale-95"
            >
              <CalendarIcon className="w-3.5 h-3.5 text-red-400" />
              Agenda
            </Link>
            <StaffLogoutButton />
          </div>
        </div>
      </header>

      <section className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full py-2.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar bg-slate-900 p-1 rounded-xl border border-slate-800">
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

      <main className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full pb-6 flex-1">
        {module === "control" && (
          <div className="space-y-6">
            <ErpControlPanel />
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" />
                Módulos por dominio
              </p>
              {(["finanzas", "stock", "personas", "clientes"] as Domain[]).map((domain) => (
                <div key={domain} className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-slate-500 px-0.5">
                    {DOMAIN_LABEL[domain]}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {MODULES.filter((m) => m.domain === domain).map((m) => {
                      const Icon = m.icon;
                      return (
                        <Link
                          key={m.id}
                          href={m.path}
                          className="group bg-slate-900/90 border border-slate-800 hover:border-slate-600 rounded-2xl p-3.5 transition-colors"
                        >
                          <div
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-xl border mb-2 ${m.accent}`}
                          >
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <p className="text-sm font-bold text-white group-hover:text-sky-200">
                            {m.label}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{m.blurb}</p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {module === "tablero" && <ManagerialDashboard />}
        {module === "caja" && <CashLedgerPanel />}
        {module === "facturacion" && <BillingPanel />}
        {module === "personal" && <PayrollPanel />}
        {module === "inventario" && <InventoryPanel />}
        {module === "proveedores" && <SuppliersPanel />}
        {module === "deudores" && <ReceivablesPanel />}
        {module === "recontacto" && <ReengagePanel />}
        {module === "clientes" && <CustomersCrmPanel />}
      </main>

      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-[#080d1a] border-t border-slate-800/90 px-1.5 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-0.5 overflow-x-auto no-scrollbar">
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
