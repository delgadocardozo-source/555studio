import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Car,
  Check,
  Gift,
  MapPin,
  Phone,
  Plus,
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
  startTime: string;
};

type Step = "inicio" | "cliente" | "vehiculos" | "cuando" | "confirmar";

const STEP_ORDER: Step[] = ["inicio", "cliente", "vehiculos", "cuando", "confirmar"];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatGs(n: number) {
  return `${Number(n || 0).toLocaleString("es-PY")} Gs.`;
}

function formatDateEs(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function newKey() {
  return `k_${Math.random().toString(36).slice(2, 9)}`;
}

function RisingSunBackdrop({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`booking-sun-rays absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <radialGradient id="bkSunCore" cx="72%" cy="38%" r="42%">
          <stop offset="0%" stopColor="#ff2a2a" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#e60012" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e60012" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#bkSunCore)" />
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i * 20 * Math.PI) / 180;
        const x2 = 72 + Math.cos(a) * 95;
        const y2 = 38 + Math.sin(a) * 95;
        return (
          <line
            key={i}
            x1="72"
            y1="38"
            x2={x2}
            y2={y2}
            stroke="#e60012"
            strokeOpacity={i % 2 === 0 ? 0.16 : 0.08}
            strokeWidth={i % 2 === 0 ? 3.2 : 1.4}
          />
        );
      })}
      <circle cx="72" cy="38" r="11" fill="#e60012" fillOpacity="0.9" />
    </svg>
  );
}

const fieldClass =
  "w-full bg-white border border-[var(--bk-line)] rounded-xl px-4 py-3.5 text-[15px] text-[var(--bk-ink)] placeholder:text-neutral-400 outline-none focus:border-[var(--bk-ink)] focus:ring-1 focus:ring-[var(--bk-ink)] transition-colors";

const labelClass =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--bk-muted)]";

/**
 * Portal público de agendamiento — experiencia cliente premium 555 Detail Studio.
 * Operador: ?modo=operador o toggle discreto.
 */
export default function BookingPage() {
  const search = useSearch();
  const utils = trpc.useUtils();
  const operatorFromUrl = /(?:^|[?&])modo=operador(?:&|$)/.test(search);

  const [step, setStep] = useState<Step>("inicio");
  const [mode, setMode] = useState<"portal" | "interno">(
    operatorFromUrl ? "interno" : "portal"
  );

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

  useEffect(() => {
    if (operatorFromUrl) setMode("interno");
  }, [operatorFromUrl]);

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
    { enabled: Boolean(date) && step !== "inicio" && step !== "cliente" }
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
    const garage = (customer as { vehicles?: Array<{
      type: CustomerVehicleType;
      model: string;
      plate?: string;
    }> }).vehicles;
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

  const goCliente = () => setStep("cliente");

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
      if (validVehicles.some((v) => !v.startTime)) {
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
          timeSlot:
            availability?.slots.find((s) => s.start === sharedStart)?.timeSlot || sharedStart,
          vehicles: validVehicles.map((v) => ({
            type: v.type,
            model: v.model.trim(),
            plate: v.plate.trim() || null,
          })),
          applyLoyaltyFree: applyLoyalty && Boolean(loyalty?.eligibleForFreeWash),
          notes: notes.trim() || null,
          source,
        });
        codes.push(String((created as { code?: string; id: string }).code || created.id));
      } else {
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
          codes.push(String((created as { code?: string; id: string }).code || created.id));
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

  const resetFlow = () => {
    setDoneCodes([]);
    setStep("inicio");
    setVehicles([{ key: newKey(), type: "auto", model: "", plate: "", startTime: "" }]);
    setSharedStart("");
    setApplyLoyalty(false);
    setNotes("");
    setSeparateSlots(false);
  };

  const progressSteps = STEP_ORDER.filter((s) => s !== "inicio");
  const progressIndex = progressSteps.indexOf(step as Exclude<Step, "inicio">);

  if (doneCodes.length > 0) {
    return (
      <div className="booking-portal min-h-dvh flex flex-col relative overflow-hidden">
        <RisingSunBackdrop className="opacity-70" />
        <div className="relative z-10 flex-1 flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-md w-full text-center space-y-5"
          >
            <div className="mx-auto w-16 h-16 rounded-full bg-[var(--bk-sun)] text-white flex items-center justify-center">
              <Check className="w-8 h-8" strokeWidth={2.5} />
            </div>
            <img
              src="/logo-555.png"
              alt="555 Detail Studio"
              className="h-12 w-auto mx-auto"
            />
            <div className="space-y-2">
              <h1 className="font-brand text-3xl font-extrabold tracking-tight text-[var(--bk-ink)]">
                Turno confirmado
              </h1>
              <p className="text-sm text-[var(--bk-muted)] leading-relaxed">
                {doneCodes.length === 1
                  ? `Reservamos tu lavado · código ${doneCodes[0]}.`
                  : `Reservamos ${doneCodes.length} turnos: ${doneCodes.join(", ")}.`}
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              {mode === "interno" ? (
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[var(--bk-ink)] text-white text-sm font-bold"
                >
                  Volver a la agenda
                </Link>
              ) : (
                <a
                  href={`https://wa.me/595972702000?text=${encodeURIComponent(
                    `Hola, acabo de reservar (${doneCodes.join(", ")}). ¿Todo ok?`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[var(--bk-sun)] text-white text-sm font-bold"
                >
                  Escribir por WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={resetFlow}
                className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-[var(--bk-line)] text-sm font-bold text-[var(--bk-ink)] bg-white/80"
              >
                Agendar otro
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  if (step === "inicio") {
    return (
      <div className="booking-portal min-h-dvh flex flex-col relative overflow-hidden">
        <div className="absolute inset-0 bg-[#eceef1]" />
        <RisingSunBackdrop />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(243,244,246,0.15) 0%, rgba(243,244,246,0.55) 45%, rgba(243,244,246,0.96) 100%)",
          }}
        />

        <header className="relative z-20 px-5 sm:px-8 pt-[max(1rem,env(safe-area-inset-top))] flex items-center justify-between">
          {mode === "interno" ? (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--bk-muted)] hover:text-[var(--bk-ink)]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Agenda
            </Link>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--bk-muted)]">
              Asunción · a domicilio
            </span>
          )}
          <button
            type="button"
            onClick={() =>
              setMode((m) => (m === "portal" ? "interno" : "portal"))
            }
            className="text-[10px] font-semibold uppercase tracking-wider text-[var(--bk-muted)]/70 hover:text-[var(--bk-muted)]"
          >
            {mode === "portal" ? "Operador" : "Vista cliente"}
          </button>
        </header>

        <main className="relative z-10 flex-1 flex flex-col justify-end px-5 sm:px-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 max-w-xl mx-auto w-full">
          <div className="space-y-8">
            <div className="space-y-5">
              <img
                src="/logo-555.png"
                alt="555 Detail Studio"
                className="booking-rise h-16 sm:h-20 w-auto"
              />
              <h1 className="booking-rise booking-rise-delay-1 font-brand text-[2.35rem] sm:text-5xl font-extrabold tracking-tight leading-[1.05] text-[var(--bk-ink)] max-w-[14ch]">
                Tu auto, otra vez impecable.
              </h1>
              <p className="booking-rise booking-rise-delay-2 text-base sm:text-lg text-[var(--bk-muted)] max-w-[32ch] leading-relaxed">
                Reservá tu lavado a domicilio en minutos. Elegís día, hora y listo.
              </p>
            </div>

            <div className="booking-rise booking-rise-delay-3 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={goCliente}
                className="booking-cta-live inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-[var(--bk-sun)] text-white text-sm font-extrabold tracking-wide hover:brightness-110 transition-[filter]"
              >
                Reservar turno
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="booking-portal min-h-dvh flex flex-col antialiased">
      <header className="sticky top-0 z-20 border-b border-[var(--bk-line)] bg-[var(--bk-bg)]/90 backdrop-blur-md px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              const idx = STEP_ORDER.indexOf(step);
              if (idx <= 1) setStep("inicio");
              else setStep(STEP_ORDER[idx - 1]);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--bk-muted)] hover:text-[var(--bk-ink)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Atrás
          </button>
          <img src="/logo-555.png" alt="555 Detail Studio" className="h-7 w-auto" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--bk-muted)] w-14 text-right">
            {mode === "interno" ? "Ops" : " "}
          </span>
        </div>

        <div className="max-w-lg mx-auto mt-3 flex gap-1.5">
          {progressSteps.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-sm transition-colors duration-300 ${
                i <= progressIndex ? "bg-[var(--bk-sun)]" : "bg-[var(--bk-line)]"
              }`}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 py-6 max-w-lg mx-auto w-full pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === "cliente" && (
              <section className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--bk-sun)]">
                    Paso 1
                  </p>
                  <h2 className="font-brand text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--bk-ink)]">
                    ¿Quién reserva?
                  </h2>
                  <p className="text-sm text-[var(--bk-muted)] leading-relaxed">
                    Con tu WhatsApp recuperamos garaje y premio de fidelidad si ya lavaste con nosotros.
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className={`${labelClass} flex items-center gap-1.5`}>
                    <Phone className="w-3 h-3" /> WhatsApp
                  </span>
                  <input
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="0981…"
                    inputMode="tel"
                    className={fieldClass}
                  />
                </label>

                {customer && (
                  <button
                    type="button"
                    onClick={loadCustomer}
                    className="w-full text-left rounded-xl border border-[var(--bk-sun)]/40 bg-[var(--bk-sun-soft)] px-4 py-3.5 space-y-1 transition-colors hover:bg-[rgba(230,0,18,0.16)]"
                  >
                    <p className="text-xs font-bold text-[var(--bk-sun)]">
                      Cliente conocido · tocar para cargar
                    </p>
                    <p className="text-sm font-semibold text-[var(--bk-ink)]">
                      {customer.clientName}
                    </p>
                    {(customer as { vehicles?: unknown[] }).vehicles &&
                      ((customer as { vehicles: unknown[] }).vehicles.length > 0) && (
                        <p className="text-[11px] text-[var(--bk-muted)]">
                          {(customer as { vehicles: unknown[] }).vehicles.length} vehículo(s) en
                          garaje
                        </p>
                      )}
                  </button>
                )}

                <label className="block space-y-1.5">
                  <span className={labelClass}>Nombre</span>
                  <input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Tu nombre"
                    className={fieldClass}
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className={labelClass}>Zona</span>
                    <select
                      value={cityZone}
                      onChange={(e) =>
                        setCityZone(e.target.value as (typeof ZONES)[number])
                      }
                      className={fieldClass}
                    >
                      {ZONES.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className={`${labelClass} flex items-center gap-1.5`}>
                      <MapPin className="w-3 h-3" /> Dirección
                    </span>
                    <input
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Calle, número, barrio"
                      className={fieldClass}
                    />
                  </label>
                </div>

                {loyalty && phoneReady && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-50 px-4 py-3.5 flex gap-3 items-start">
                    <Gift className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[12px] text-amber-950/90 space-y-0.5">
                      <p className="font-bold text-amber-900">Fidelidad este mes</p>
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
                  className="w-full py-4 rounded-xl bg-[var(--bk-ink)] hover:bg-neutral-800 text-white text-sm font-extrabold tracking-wide transition-colors"
                >
                  Continuar
                </button>
              </section>
            )}

            {step === "vehiculos" && (
              <section className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--bk-sun)]">
                    Paso 2
                  </p>
                  <h2 className="font-brand text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--bk-ink)] flex items-center gap-2">
                    <Car className="w-7 h-7 text-[var(--bk-sun)]" />
                    Vehículos
                  </h2>
                  <p className="text-sm text-[var(--bk-muted)]">
                    Podés agendar más de uno en el mismo turno o en horarios separados.
                  </p>
                </div>

                {vehicles.map((v, idx) => (
                  <div
                    key={v.key}
                    className="rounded-xl border border-[var(--bk-line)] bg-white p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--bk-muted)]">
                        Vehículo {idx + 1}
                      </p>
                      {vehicles.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setVehicles((prev) => prev.filter((x) => x.key !== v.key))
                          }
                          className="text-[var(--bk-muted)] hover:text-[var(--bk-sun)] p-1"
                          aria-label="Quitar vehículo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {(["auto", "camioneta"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setVehicles((prev) =>
                              prev.map((x) => (x.key === v.key ? { ...x, type: t } : x))
                            )
                          }
                          className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-colors ${
                            v.type === t
                              ? "bg-[var(--bk-ink)] text-white"
                              : "bg-[var(--bk-bg)] text-[var(--bk-muted)] border border-[var(--bk-line)]"
                          }`}
                        >
                          {t === "auto" ? "Auto · 90.000" : "Camioneta · 120.000"}
                        </button>
                      ))}
                    </div>
                    <input
                      value={v.model}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((x) =>
                            x.key === v.key ? { ...x, model: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Marca / modelo"
                      className={fieldClass}
                    />
                    <input
                      value={v.plate}
                      onChange={(e) =>
                        setVehicles((prev) =>
                          prev.map((x) =>
                            x.key === v.key ? { ...x, plate: e.target.value } : x
                          )
                        )
                      }
                      placeholder="Chapa (opcional)"
                      className={fieldClass}
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
                  className="w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-xl border border-dashed border-[var(--bk-line)] text-xs font-bold text-[var(--bk-muted)] hover:border-[var(--bk-ink)] hover:text-[var(--bk-ink)] transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Otro vehículo
                </button>

                <button
                  type="button"
                  onClick={goCuando}
                  className="w-full py-4 rounded-xl bg-[var(--bk-ink)] text-white text-sm font-extrabold tracking-wide"
                >
                  Elegir día y hora
                </button>
              </section>
            )}

            {step === "cuando" && (
              <section className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--bk-sun)]">
                    Paso 3
                  </p>
                  <h2 className="font-brand text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--bk-ink)] flex items-center gap-2">
                    <CalendarDays className="w-7 h-7 text-[var(--bk-sun)]" />
                    ¿Cuándo?
                  </h2>
                  <p className="text-sm text-[var(--bk-muted)]">
                    Solo horarios libres · {availability?.durationLabel || "1h 20min"} por
                    vehículo
                  </p>
                </div>

                <label className="block space-y-1.5">
                  <span className={labelClass}>Día</span>
                  <input
                    type="date"
                    value={date}
                    min={todayIso()}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setSharedStart("");
                      setVehicles((prev) => prev.map((v) => ({ ...v, startTime: "" })));
                    }}
                    className={fieldClass}
                  />
                  <p className="text-xs text-[var(--bk-muted)] capitalize pt-0.5">
                    {formatDateEs(date)}
                  </p>
                </label>

                {validVehicles.length > 1 && (
                  <label className="flex items-center gap-3 text-sm text-[var(--bk-ink)] bg-white border border-[var(--bk-line)] rounded-xl px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={separateSlots}
                      onChange={(e) => {
                        setSeparateSlots(e.target.checked);
                        setSharedStart("");
                      }}
                      className="accent-[var(--bk-sun)] w-4 h-4"
                    />
                    Horarios separados (un turno por vehículo)
                  </label>
                )}

                {!separateSlots ? (
                  <div className="space-y-2.5">
                    <p className={labelClass}>Horarios libres</p>
                    {!availability?.starts?.length ? (
                      <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        No hay hueco ese día para {vehicleCountForShared} vehículo(s). Probá otra
                        fecha.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto no-scrollbar">
                        {availability.starts.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSharedStart(s)}
                            className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
                              sharedStart === s
                                ? "bg-[var(--bk-sun)] text-white"
                                : "bg-white border border-[var(--bk-line)] text-[var(--bk-ink)] hover:border-[var(--bk-ink)]"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {validVehicles.map((v) => (
                      <div key={v.key} className="space-y-2">
                        <p className="text-sm font-bold text-[var(--bk-ink)]">
                          {v.model} · {v.type}
                        </p>
                        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto no-scrollbar">
                          {(availability?.starts || []).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() =>
                                setVehicles((prev) =>
                                  prev.map((x) =>
                                    x.key === v.key ? { ...x, startTime: s } : x
                                  )
                                )
                              }
                              className={`py-2.5 rounded-lg text-sm font-bold transition-colors ${
                                v.startTime === s
                                  ? "bg-[var(--bk-sun)] text-white"
                                  : "bg-white border border-[var(--bk-line)] text-[var(--bk-ink)]"
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

                <button
                  type="button"
                  onClick={goConfirmar}
                  className="w-full py-4 rounded-xl bg-[var(--bk-ink)] text-white text-sm font-extrabold tracking-wide"
                >
                  Revisar reserva
                </button>
              </section>
            )}

            {step === "confirmar" && (
              <section className="space-y-5">
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--bk-sun)]">
                    Paso 4
                  </p>
                  <h2 className="font-brand text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--bk-ink)]">
                    Confirmar
                  </h2>
                  <p className="text-sm text-[var(--bk-muted)]">
                    Revisá todo antes de bloquear el turno.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--bk-line)] bg-white p-5 space-y-3">
                  <p className="font-brand text-xl font-extrabold text-[var(--bk-ink)]">
                    {clientName}
                  </p>
                  <p className="text-sm text-[var(--bk-muted)]">
                    {clientPhone} · {cityZone}
                  </p>
                  <p className="text-sm text-[var(--bk-muted)]">{address}</p>
                  <div className="h-px bg-[var(--bk-line)]" />
                  <p className="text-sm font-semibold text-[var(--bk-ink)] capitalize">
                    {formatDateEs(date)}
                    {!separateSlots
                      ? ` · desde ${sharedStart}`
                      : ` · ${validVehicles.length} turnos`}
                  </p>
                  <ul className="text-sm text-[var(--bk-muted)] space-y-1">
                    {validVehicles.map((v) => (
                      <li key={v.key}>
                        {v.type === "auto" ? "Auto" : "Camioneta"} · {v.model}
                        {v.plate ? ` · ${v.plate}` : ""}
                        {separateSlots && v.startTime ? ` · ${v.startTime}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="font-brand text-2xl font-extrabold text-[var(--bk-ink)] pt-1">
                    {formatGs(pricePreview.total)}
                    {pricePreview.applied && (
                      <span className="ml-2 text-xs font-bold text-[var(--bk-sun)] align-middle">
                        + 1 gratis
                      </span>
                    )}
                  </p>
                </div>

                {loyalty?.eligibleForFreeWash && (
                  <label className="flex items-center gap-3 text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={applyLoyalty}
                      onChange={(e) => setApplyLoyalty(e.target.checked)}
                      className="accent-[var(--bk-sun)] w-4 h-4"
                    />
                    Usar lavado gratis de fidelidad (5 lavados/mes)
                  </label>
                )}

                <label className="block space-y-1.5">
                  <span className={labelClass}>Notas (opcional)</span>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Portón, referencia, etc."
                    className={`${fieldClass} resize-none`}
                  />
                </label>

                <button
                  type="button"
                  onClick={submit}
                  disabled={createMut.isPending}
                  className="w-full py-4 rounded-xl bg-[var(--bk-sun)] hover:brightness-110 text-white text-sm font-extrabold tracking-wide disabled:opacity-50 transition-[filter]"
                >
                  {createMut.isPending ? "Confirmando…" : "Confirmar reserva"}
                </button>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
