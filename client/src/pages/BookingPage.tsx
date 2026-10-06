import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  CalendarPlus,
  Car,
  Check,
  Gift,
  MapPin,
  Phone,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  catalogPriceForVehicle,
  applyFreeWashToVehicles,
} from "@shared/loyalty";
import { buildTimeSlot } from "@shared/scheduling";
import type { CustomerVehicleType } from "@shared/customerGarage";

const ZONES = ["Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"] as const;

type DraftVehicle = {
  key: string;
  type: CustomerVehicleType;
  model: string;
  plate: string;
  /** Start time HH:MM — vacío = mismo turno agrupado */
  startTime: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatGs(n: number) {
  return `${Number(n || 0).toLocaleString("es-PY")} Gs.`;
}

function newKey() {
  return `k_${Math.random().toString(36).slice(2, 9)}`;
}

type Step = "cliente" | "vehiculos" | "cuando" | "confirmar";

/**
 * Agendamiento limpio: cliente (portal o staff) reserva según disponibilidad.
 * Multi-vehículo: mismo turno o horarios separados.
 */
export default function BookingPage() {
  const utils = trpc.useUtils();
  const [step, setStep] = useState<Step>("cliente");
  const [mode, setMode] = useState<"interno" | "portal">("portal");

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [cityZone, setCityZone] = useState<(typeof ZONES)[number]>("Asuncion");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [vehicles, setVehicles] = useState<DraftVehicle[]>([
    { key: newKey(), type: "auto", model: "", plate: "", startTime: "" },
  ]);
  const [separateSlots, setSeparateSlots] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [sharedStart, setSharedStart] = useState("");
  const [applyLoyalty, setApplyLoyalty] = useState(false);
  const [doneCodes, setDoneCodes] = useState<string[]>([]);

  const phoneReady = clientPhone.replace(/\D/g, "").length >= 6;
  const { data: customer } = trpc.customers.findByPhone.useQuery(
    { phone: clientPhone },
    { enabled: phoneReady }
  );
  const { data: loyalty } = trpc.customers.loyalty.useQuery(
    { phone: clientPhone },
    { enabled: phoneReady }
  );

  const vehicleCountForShared = Math.max(1, vehicles.filter((v) => v.model.trim()).length);
  const { data: availability } = trpc.appointments.availability.useQuery(
    {
      date,
      vehicleCount: separateSlots ? 1 : vehicleCountForShared,
    },
    { enabled: Boolean(date) && step !== "cliente" }
  );

  const createMut = trpc.appointments.create.useMutation({
    onError: (err) => toast.error(err.message || "No se pudo agendar"),
  });

  const loadCustomer = () => {
    if (!customer) {
      toast.message("Cliente nuevo — completá los datos");
      return;
    }
    setClientName(customer.clientName || "");
    setAddress((prev) => prev || "");
    const garage = (customer as any).vehicles as Array<{
      type: CustomerVehicleType;
      model: string;
      plate?: string;
    }> | undefined;
    if (garage && garage.length > 0) {
      setVehicles(
        garage.map((v) => ({
          key: newKey(),
          type: v.type,
          model: v.model,
          plate: v.plate || "",
          startTime: "",
        }))
      );
      toast.success(`Garaje cargado · ${garage.length} vehículo(s)`);
    } else {
      toast.success("Datos del cliente cargados");
    }
    if (loyalty?.eligibleForFreeWash) setApplyLoyalty(true);
  };

  const validVehicles = vehicles.filter((v) => v.model.trim());

  const pricePreview = useMemo(() => {
    const priced = validVehicles.map((v) => ({
      type: v.type,
      price: catalogPriceForVehicle(v.type),
    }));
    if (applyLoyalty && loyalty?.eligibleForFreeWash) {
      return applyFreeWashToVehicles(priced);
    }
    return {
      vehicles: priced,
      total: priced.reduce((s, v) => s + v.price, 0),
      applied: false,
    };
  }, [validVehicles, applyLoyalty, loyalty?.eligibleForFreeWash]);

  const goVehiculos = () => {
    if (clientName.trim().length < 2 || !phoneReady) {
      toast.error("Nombre y WhatsApp son obligatorios");
      return;
    }
    if (address.trim().length < 3) {
      toast.error("Indicá la dirección");
      return;
    }
    setStep("vehiculos");
  };

  const goCuando = () => {
    if (validVehicles.length === 0) {
      toast.error("Agregá al menos un vehículo");
      return;
    }
    setStep("cuando");
  };

  const goConfirmar = () => {
    if (!separateSlots) {
      if (!sharedStart) {
        toast.error("Elegí un horario disponible");
        return;
      }
    } else {
      const missing = validVehicles.some((v) => !v.startTime);
      if (missing) {
        toast.error("Asigná un horario a cada vehículo");
        return;
      }
    }
    setStep("confirmar");
  };

  const submit = async () => {
    const source = mode === "portal" ? "portal_cliente" : "interno_manual";
    const codes: string[] = [];

    try {
      if (!separateSlots) {
        const created = await createMut.mutateAsync({
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientType: "particular",
          cityZone,
          address: address.trim(),
          scheduledDate: date,
          timeSlot: availability?.slots.find((s) => s.start === sharedStart)?.timeSlot || sharedStart,
          vehicles: validVehicles.map((v) => ({
            type: v.type,
            model: v.model.trim(),
            plate: v.plate.trim() || null,
          })),
          applyLoyaltyFree: applyLoyalty && Boolean(loyalty?.eligibleForFreeWash),
          notes: notes.trim() || null,
          source,
        });
        codes.push(String((created as any).code || created.id));
      } else {
        // Un turno por vehículo / horario (permite horarios varios).
        let loyaltyUsed = false;
        for (const v of validVehicles) {
          const useLoyalty =
            applyLoyalty && Boolean(loyalty?.eligibleForFreeWash) && !loyaltyUsed;
          const created = await createMut.mutateAsync({
            clientName: clientName.trim(),
            clientPhone: clientPhone.trim(),
            clientType: "particular",
            cityZone,
            address: address.trim(),
            scheduledDate: date,
            timeSlot: buildTimeSlot(v.startTime, 1),
            vehicles: [
              {
                type: v.type,
                model: v.model.trim(),
                plate: v.plate.trim() || null,
              },
            ],
            applyLoyaltyFree: useLoyalty,
            notes: notes.trim() || null,
            source,
          });
          if (useLoyalty) loyaltyUsed = true;
          codes.push(String((created as any).code || created.id));
        }
      }

      setDoneCodes(codes);
      utils.appointments.invalidate();
      utils.customers.invalidate();
      toast.success(
        codes.length > 1 ? `${codes.length} turnos agendados` : "Turno agendado"
      );
    } catch {
      // toast already from mutation
    }
  };

  if (doneCodes.length > 0) {
    return (
      <div className="min-h-dvh bg-[#0a0f0c] text-stone-100 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
              <Check className="w-7 h-7 text-emerald-300" />
            </div>
            <h1 className="font-display text-2xl font-bold text-white">Listo</h1>
            <p className="text-sm text-stone-400">
              {doneCodes.length === 1
                ? `Tu turno ${doneCodes[0]} quedó reservado.`
                : `Reservamos ${doneCodes.length} turnos: ${doneCodes.join(", ")}.`}
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold"
              >
                Ver agenda
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDoneCodes([]);
                  setStep("cliente");
                  setVehicles([{ key: newKey(), type: "auto", model: "", plate: "", startTime: "" }]);
                  setSharedStart("");
                  setApplyLoyalty(false);
                  setNotes("");
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-stone-700 text-sm font-bold text-stone-200"
              >
                Agendar otro
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0a0f0c] text-stone-100 flex flex-col antialiased">
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(16,185,129,0.25), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(245,158,11,0.08), transparent)",
        }}
      />

      <header className="relative z-10 border-b border-stone-800/80 bg-[#0a0f0c]/90 backdrop-blur sticky top-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white px-2 py-1 rounded shadow-sm shrink-0">
              <img src="/logo-555.png" alt="555 Detail Studio" className="h-6 w-auto" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-base font-bold text-white truncate">Agendar lavado</h1>
              <p className="text-[10px] text-stone-500 truncate">Según días y horarios libres</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-400 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Agenda
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 sm:px-6 py-5 max-w-lg mx-auto w-full space-y-4 pb-24">
        <div className="flex gap-1 p-1 rounded-2xl bg-stone-900/80 border border-stone-800">
          {(
            [
              ["cliente", "1 · Vos"],
              ["vehiculos", "2 · Autos"],
              ["cuando", "3 · Cuándo"],
              ["confirmar", "4 · Listo"],
            ] as const
          ).map(([id, label]) => (
            <div
              key={id}
              className={`flex-1 text-center text-[10px] font-bold py-1.5 rounded-xl ${
                step === id ? "bg-emerald-600 text-white" : "text-stone-500"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setMode("portal")}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
              mode === "portal"
                ? "border-emerald-500/50 text-emerald-300 bg-emerald-500/10"
                : "border-stone-800 text-stone-500"
            }`}
          >
            Cliente
          </button>
          <button
            type="button"
            onClick={() => setMode("interno")}
            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
              mode === "interno"
                ? "border-amber-500/50 text-amber-200 bg-amber-500/10"
                : "border-stone-800 text-stone-500"
            }`}
          >
            Operador
          </button>
        </div>

        {step === "cliente" && (
          <section className="space-y-3 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white">¿Quién agenda?</h2>
              <p className="text-xs text-stone-400">
                Si ya lavaste con nosotros, cargamos tu garaje y tu premio de fidelidad.
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-stone-500 flex items-center gap-1">
                <Phone className="w-3 h-3" /> WhatsApp
              </span>
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="0981…"
                className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-white"
              />
            </label>

            {customer && (
              <button
                type="button"
                onClick={loadCustomer}
                className="w-full text-left rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-1"
              >
                <p className="text-xs font-bold text-emerald-200">Cliente conocido · tocar para cargar</p>
                <p className="text-[11px] text-stone-300">{customer.clientName}</p>
                {(customer as any).vehicles?.length > 0 && (
                  <p className="text-[10px] text-stone-500">
                    {(customer as any).vehicles.length} vehículo(s) en garaje
                  </p>
                )}
              </button>
            )}

            <label className="block space-y-1">
              <span className="text-[10px] uppercase tracking-wide text-stone-500">Nombre</span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-white"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-wide text-stone-500">Zona</span>
                <select
                  value={cityZone}
                  onChange={(e) => setCityZone(e.target.value as (typeof ZONES)[number])}
                  className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-3 py-3 text-xs text-white"
                >
                  {ZONES.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 col-span-2">
                <span className="text-[10px] uppercase tracking-wide text-stone-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Dirección
                </span>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Calle, número, barrio"
                  className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-white"
                />
              </label>
            </div>

            {loyalty && phoneReady && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex gap-3 items-start">
                <Gift className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-100/90 space-y-0.5">
                  <p className="font-bold text-amber-200">Fidelidad este mes</p>
                  <p>
                    {loyalty.washesThisMonth} lavado(s) ·{" "}
                    {loyalty.eligibleForFreeWash
                      ? `${loyalty.freeWashCredits} gratis disponible(s)`
                      : `faltan ${loyalty.nextRewardIn} para el gratis`}
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={goVehiculos}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold"
            >
              Continuar
            </button>
          </section>
        )}

        {step === "vehiculos" && (
          <section className="space-y-3 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-400" />
                Vehículos
              </h2>
              <p className="text-xs text-stone-400">Podés agendar más de uno.</p>
            </div>

            {vehicles.map((v, idx) => (
              <div
                key={v.key}
                className="rounded-2xl border border-stone-800 bg-stone-950/80 p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold text-stone-400">Vehículo {idx + 1}</p>
                  {vehicles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setVehicles((prev) => prev.filter((x) => x.key !== v.key))}
                      className="text-stone-500 hover:text-rose-300 p-1"
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
                      className={`flex-1 py-2 rounded-xl text-[11px] font-bold ${
                        v.type === t
                          ? "bg-emerald-600 text-white"
                          : "bg-stone-900 text-stone-400 border border-stone-800"
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
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-white"
                />
                <input
                  value={v.plate}
                  onChange={(e) =>
                    setVehicles((prev) =>
                      prev.map((x) => (x.key === v.key ? { ...x, plate: e.target.value } : x))
                    )
                  }
                  placeholder="Chapa (opcional)"
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setVehicles((prev) => [
                  ...prev,
                  { key: newKey(), type: "auto", model: "", plate: "", startTime: "" },
                ])
              }
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border border-dashed border-stone-700 text-xs font-bold text-stone-300"
            >
              <Plus className="w-3.5 h-3.5" />
              Otro vehículo
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("cliente")}
                className="flex-1 py-3 rounded-2xl border border-stone-700 text-sm font-bold text-stone-300"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={goCuando}
                className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold"
              >
                Elegir día y hora
              </button>
            </div>
          </section>
        )}

        {step === "cuando" && (
          <section className="space-y-3 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-emerald-400" />
                Disponibilidad
              </h2>
              <p className="text-xs text-stone-400">
                Solo mostramos horarios libres · {availability?.durationLabel || "1h 20min"} por
                vehículo
              </p>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-stone-500">Día</span>
              <input
                type="date"
                value={date}
                min={todayIso()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSharedStart("");
                  setVehicles((prev) => prev.map((v) => ({ ...v, startTime: "" })));
                }}
                className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 py-3 text-sm text-white"
              />
            </label>

            {validVehicles.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-stone-300 bg-stone-900/80 border border-stone-800 rounded-2xl px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={separateSlots}
                  onChange={(e) => {
                    setSeparateSlots(e.target.checked);
                    setSharedStart("");
                  }}
                />
                Horarios separados (un turno por vehículo)
              </label>
            )}

            {!separateSlots ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase text-stone-500">Horarios libres</p>
                {!availability?.starts?.length ? (
                  <p className="text-xs text-amber-200/90 py-3">
                    No hay hueco ese día para {vehicleCountForShared} vehículo(s). Probá otra fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto">
                    {availability.starts.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSharedStart(s)}
                        className={`py-2 rounded-xl text-xs font-bold ${
                          sharedStart === s
                            ? "bg-emerald-600 text-white"
                            : "bg-stone-900 border border-stone-800 text-stone-300"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {validVehicles.map((v) => (
                  <div key={v.key} className="space-y-1.5">
                    <p className="text-[11px] font-bold text-stone-300">
                      {v.model} · {v.type}
                    </p>
                    <div className="grid grid-cols-3 gap-1.5 max-h-36 overflow-y-auto">
                      {(availability?.starts || []).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() =>
                            setVehicles((prev) =>
                              prev.map((x) => (x.key === v.key ? { ...x, startTime: s } : x))
                            )
                          }
                          className={`py-2 rounded-xl text-xs font-bold ${
                            v.startTime === s
                              ? "bg-emerald-600 text-white"
                              : "bg-stone-900 border border-stone-800 text-stone-300"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("vehiculos")}
                className="flex-1 py-3 rounded-2xl border border-stone-700 text-sm font-bold text-stone-300"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={goConfirmar}
                className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold"
              >
                Revisar
              </button>
            </div>
          </section>
        )}

        {step === "confirmar" && (
          <section className="space-y-3 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                Confirmar
              </h2>
            </div>

            <div className="rounded-2xl border border-stone-800 bg-stone-950/80 p-4 space-y-2 text-sm">
              <p className="font-bold text-white">{clientName}</p>
              <p className="text-xs text-stone-400">
                {clientPhone} · {cityZone}
              </p>
              <p className="text-xs text-stone-400">{address}</p>
              <p className="text-xs text-emerald-300 pt-1">
                {date}
                {!separateSlots
                  ? ` · desde ${sharedStart} (${validVehicles.length} veh.)`
                  : ` · ${validVehicles.length} turnos separados`}
              </p>
              <ul className="text-xs text-stone-300 space-y-1 pt-1">
                {validVehicles.map((v) => (
                  <li key={v.key}>
                    {v.type} · {v.model}
                    {v.plate ? ` · ${v.plate}` : ""}
                    {separateSlots && v.startTime ? ` · ${v.startTime}` : ""}
                  </li>
                ))}
              </ul>
              <p className="text-base font-extrabold text-white pt-2">
                {formatGs(pricePreview.total)}
                {pricePreview.applied && (
                  <span className="ml-2 text-[11px] font-bold text-amber-300">+ 1 gratis</span>
                )}
              </p>
            </div>

            {loyalty?.eligibleForFreeWash && (
              <label className="flex items-center gap-2 text-xs text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={applyLoyalty}
                  onChange={(e) => setApplyLoyalty(e.target.checked)}
                />
                Usar lavado gratis de fidelidad (5 lavados/mes)
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-stone-500">Notas (opcional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-3 py-2 text-sm text-white resize-none"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("cuando")}
                className="flex-1 py-3 rounded-2xl border border-stone-700 text-sm font-bold text-stone-300"
              >
                Atrás
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={createMut.isPending}
                className="flex-[2] py-3 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50"
              >
                {createMut.isPending ? "Agendando…" : "Confirmar agenda"}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
