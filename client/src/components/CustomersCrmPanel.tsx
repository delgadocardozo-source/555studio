import React, { useState } from "react";
import { Link } from "wouter";
import { Car, Gift, HandCoins, Pencil, Plus, Search, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/cashLedger";
import type { CustomerVehicleType } from "@shared/customerGarage";

type ClientType = "particular" | "oficina" | "empresa_flota";

export type CustomerFormSeed = {
  clientName: string;
  clientPhone: string;
  clientType?: string | null;
  companyName?: string | null;
  clientTaxId?: string | null;
  vehicles?: Array<{
    id?: string;
    type: CustomerVehicleType;
    model: string;
    plate?: string;
  }>;
};

type VehicleDraft = {
  key: string;
  type: CustomerVehicleType;
  model: string;
  plate: string;
};

const TYPE_OPTIONS: Array<{ value: ClientType; label: string }> = [
  { value: "particular", label: "Particular" },
  { value: "oficina", label: "Oficina" },
  { value: "empresa_flota", label: "Empresa / flota" },
];

function newKey() {
  return `v_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyVehicle(): VehicleDraft {
  return { key: newKey(), type: "auto", model: "", plate: "" };
}

const fieldClass =
  "w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-600 outline-none focus:border-violet-400";

export function CustomerFormDialog({
  mode,
  seed,
  onClose,
}: {
  mode: "create" | "edit";
  seed?: CustomerFormSeed | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [clientName, setClientName] = useState(seed?.clientName || "");
  const [clientPhone, setClientPhone] = useState(seed?.clientPhone || "");
  const [clientType, setClientType] = useState<ClientType>(
    seed?.clientType === "oficina" || seed?.clientType === "empresa_flota"
      ? seed.clientType
      : "particular"
  );
  const [companyName, setCompanyName] = useState(seed?.companyName || "");
  const [clientTaxId, setClientTaxId] = useState(seed?.clientTaxId || "");
  const [vehicles, setVehicles] = useState<VehicleDraft[]>(
    seed?.vehicles && seed.vehicles.length > 0
      ? seed.vehicles.map((v) => ({
          key: v.id || newKey(),
          type: v.type === "camioneta" ? "camioneta" : "auto",
          model: v.model,
          plate: v.plate || "",
        }))
      : [emptyVehicle()]
  );

  const saveMut = trpc.customers.upsert.useMutation({
    onSuccess: () => {
      toast.success(mode === "create" ? "Cliente agregado" : "Cliente actualizado");
      utils.customers.invalidate();
      onClose();
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const submit = () => {
    if (clientName.trim().length < 2) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (clientPhone.replace(/\D/g, "").length < 6) {
      toast.error("WhatsApp inválido");
      return;
    }
    const garage = vehicles
      .map((v) => ({
        type: v.type,
        model: v.model.trim(),
        plate: v.plate.trim(),
      }))
      .filter((v) => v.model);
    saveMut.mutate({
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      clientType,
      companyName: companyName.trim() || null,
      clientTaxId: clientTaxId.trim() || null,
      vehicles: garage,
      replaceVehicles: true,
      replaceProfile: true,
      previousPhone: mode === "edit" ? seed?.clientPhone || null : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-white">
            {mode === "create" ? "Nuevo cliente" : "Editar cliente"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Nombre</span>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} className={fieldClass} />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">WhatsApp</span>
          <input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            inputMode="tel"
            placeholder="0981…"
            className={fieldClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Tipo</span>
          <select
            value={clientType}
            onChange={(e) => setClientType(e.target.value as ClientType)}
            className={fieldClass}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Empresa</span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">RUC</span>
            <input
              value={clientTaxId}
              onChange={(e) => setClientTaxId(e.target.value)}
              className={fieldClass}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Vehículos</p>
          {vehicles.map((v, idx) => (
            <div key={v.key} className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500">Vehículo {idx + 1}</span>
                {vehicles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setVehicles((prev) => prev.filter((x) => x.key !== v.key))}
                    className="text-slate-500 hover:text-rose-300 p-1"
                    aria-label="Quitar vehículo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex gap-1">
                {(["auto", "camioneta"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setVehicles((prev) =>
                        prev.map((x) => (x.key === v.key ? { ...x, type: t } : x))
                      )
                    }
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold ${
                      v.type === t
                        ? "bg-violet-600 text-white"
                        : "bg-slate-900 text-slate-400 border border-slate-800"
                    }`}
                  >
                    {t === "auto" ? "Auto" : "Camioneta"}
                  </button>
                ))}
              </div>
              <input
                value={v.model}
                onChange={(e) =>
                  setVehicles((prev) =>
                    prev.map((x) => (x.key === v.key ? { ...x, model: e.target.value } : x))
                  )
                }
                placeholder="Marca / modelo"
                className={fieldClass}
              />
              <input
                value={v.plate}
                onChange={(e) =>
                  setVehicles((prev) =>
                    prev.map((x) => (x.key === v.key ? { ...x, plate: e.target.value } : x))
                  )
                }
                placeholder="Chapa (opcional)"
                className={fieldClass}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVehicles((prev) => [...prev, emptyVehicle()])}
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-slate-700 text-[11px] font-bold text-slate-300"
          >
            <Plus className="w-3.5 h-3.5" />
            Otro vehículo
          </button>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={saveMut.isPending}
          className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold disabled:opacity-50"
        >
          {saveMut.isPending ? "Guardando…" : "Guardar cliente"}
        </button>
      </div>
    </div>
  );
}

/**
 * CRM 360 lite — clientes con LTV, deuda, fidelidad y garaje.
 * Alta y edición de ficha desde el ERP.
 */
export function CustomersCrmPanel() {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<null | { mode: "create" | "edit"; seed?: CustomerFormSeed }>(
    null
  );
  const { data: rows = [], isLoading } = trpc.customers.crmList.useQuery({
    query: query.trim() || undefined,
    limit: 80,
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-400" />
            Clientes · CRM
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Vista 360: lavados, cobrado, deuda, fidelidad y garaje. Podés agregar y editar la ficha.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="inline-flex items-center gap-1 shrink-0 text-[11px] font-bold px-3 py-2 rounded-xl bg-violet-600 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo
        </button>
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
            Agregalos acá o se crean solos al agendar.
          </p>
          <button
            type="button"
            onClick={() => setEditor({ mode: "create" })}
            className="text-[11px] font-bold text-violet-300"
          >
            Agregar cliente
          </button>
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
                    {c.companyName ? ` · ${c.companyName}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.openDebtCount > 0 && (
                    <span className="text-[10px] font-bold text-amber-200 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      Debe {formatGs(c.openDebtGs)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setEditor({
                        mode: "edit",
                        seed: {
                          clientName: c.clientName,
                          clientPhone: c.clientPhone,
                          clientType: c.clientType,
                          companyName: c.companyName,
                          clientTaxId: c.clientTaxId,
                          vehicles: c.vehicles,
                        },
                      })
                    }
                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-700 text-slate-200"
                  >
                    <Pencil className="w-3 h-3" />
                    Editar
                  </button>
                </div>
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

      {editor && (
        <CustomerFormDialog
          key={`${editor.mode}-${editor.seed?.clientPhone || "new"}`}
          mode={editor.mode}
          seed={editor.seed}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

/** Directorio de la pestaña Clientes en la agenda. */
export function AgendaCustomersDirectory({
  customers,
}: {
  customers: CustomerFormSeed[];
}) {
  const [editor, setEditor] = useState<null | { mode: "create" | "edit"; seed?: CustomerFormSeed }>(
    null
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-400 tracking-wider">
          <Users className="w-4 h-4" />
          <span>Clientes</span>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ mode: "create" })}
          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-xl bg-violet-600 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Agregar
        </button>
      </div>
      <p className="text-xs text-slate-300">
        Agregá o editá nombre, WhatsApp, empresa, RUC y vehículos. Esos datos se reutilizan al agendar.
      </p>

      {customers.length === 0 ? (
        <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
          Aún no hay clientes. Agregá el primero o se crean al cargar un servicio.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:max-h-96 sm:overflow-y-auto sm:overscroll-contain">
          {customers.map((cust) => (
            <div
              key={cust.clientPhone}
              className="bg-slate-950 border border-slate-800 p-3 rounded-2xl space-y-1"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-xs text-white">{cust.clientName}</div>
                <button
                  type="button"
                  onClick={() => setEditor({ mode: "edit", seed: cust })}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-300"
                >
                  <Pencil className="w-3 h-3" />
                  Editar
                </button>
              </div>
              <div className="text-[11px] text-slate-400">{cust.clientPhone}</div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                <span className="text-slate-500">RUC</span>
                <span className="font-mono font-bold text-amber-300">
                  {cust.clientTaxId || "Sin RUC"}
                </span>
              </div>
              {cust.vehicles && cust.vehicles.length > 0 && (
                <p className="text-[10px] text-slate-500 truncate">
                  {cust.vehicles.map((v) => v.model).join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editor && (
        <CustomerFormDialog
          key={`${editor.mode}-${editor.seed?.clientPhone || "new"}`}
          mode={editor.mode}
          seed={editor.seed}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
