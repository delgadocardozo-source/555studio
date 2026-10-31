import React, { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { MapPin, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

function asuncionToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return asuncionToday();
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${weekdays[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pendiente":
      return "Pendiente";
    case "confirmado":
      return "Confirmado";
    case "en_camino":
      return "En camino";
    case "en_proceso":
      return "En proceso";
    case "finalizado":
      return "Lavado";
    default:
      return status || "—";
  }
}

function callHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("595") ? digits : `595${digits.replace(/^0/, "")}`;
  return `tel:+${withCountry}`;
}

function initialDate(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("fecha") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(fromQuery) ? fromQuery : asuncionToday();
}

/** Ruta del día. El link es solo para el que lava: cliente, vehículo y ubicación. */
export default function WasherRoutePage() {
  const [, params] = useRoute<{ token: string }>("/lavar/:token");
  const token = params?.token || "";
  const [date, setDate] = useState(initialDate);
  const day = trpc.washer.day.useQuery(
    { token, date },
    { enabled: token.length >= 16, retry: false }
  );

  const stops = day.data?.stops ?? [];
  const title = useMemo(() => formatDateEs(date), [date]);

  const move = (days: number) => {
    const next = shiftDate(date, days);
    const url = new URL(window.location.href);
    url.searchParams.set("fecha", next);
    window.history.replaceState({}, "", url);
    setDate(next);
  };

  return (
    <div className="min-h-dvh bg-white text-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#e10600]">555 Detail Studio</p>
        <h1 className="text-xl font-extrabold">Para el que lava</h1>
        <p className="text-sm text-neutral-600">{title}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => move(-1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-300"
            aria-label="Día anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => {
              const today = asuncionToday();
              const url = new URL(window.location.href);
              url.searchParams.set("fecha", today);
              window.history.replaceState({}, "", url);
              setDate(today);
            }}
            className="h-11 flex-1 rounded-xl bg-neutral-950 text-sm font-bold text-white"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-300"
            aria-label="Día siguiente"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-col gap-3 px-4 py-4 pb-10">
        {day.isLoading ? (
          <p className="py-10 text-center text-sm text-neutral-500">Cargando la ruta…</p>
        ) : day.error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm font-semibold text-red-700">
            {day.error.message || "Este link no es de la ruta"}
          </p>
        ) : stops.length === 0 ? (
          <p className="rounded-2xl border border-neutral-200 px-4 py-8 text-center text-sm text-neutral-600">
            Este día no hay lavados.
          </p>
        ) : (
          stops.map((stop, index) => (
            <article key={`${stop.code}-${index}`} className="rounded-2xl border border-neutral-200 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-extrabold">{stop.timeSlot || "Sin horario"}</p>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                  {statusLabel(stop.status)}
                </span>
              </div>
              {stop.code ? <p className="mt-1 text-[11px] font-semibold text-neutral-400">{stop.code}</p> : null}
              <h2 className="mt-1 text-base font-bold">{stop.clientName || "Sin nombre"}</h2>
              {stop.companyName ? <p className="text-sm text-neutral-600">{stop.companyName}</p> : null}
              <p className="text-sm text-neutral-700">{stop.clientPhone || "Sin teléfono"}</p>
              <ul className="mt-2 space-y-0.5 text-sm">
                {stop.vehicles.map((vehicle, vehicleIndex) => (
                  <li key={`${vehicle.model}-${vehicleIndex}`}>
                    {vehicle.type === "camioneta" ? "Camioneta" : "Auto"}: {vehicle.model}
                    {vehicle.plate ? ` · ${vehicle.plate}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">
                <span className="font-semibold">{stop.cityZone}</span>
                {stop.address ? ` · ${stop.address}` : ""}
              </p>
              {stop.addressReference ? (
                <p className="text-sm text-neutral-600">Referencia: {stop.addressReference}</p>
              ) : null}
              {stop.notes ? <p className="mt-1 text-sm text-neutral-600">Nota: {stop.notes}</p> : null}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {stop.clientPhone ? (
                  <a
                    href={callHref(stop.clientPhone)}
                    className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-neutral-950 text-sm font-bold text-white"
                  >
                    <Phone className="h-4 w-4" />
                    Llamar
                  </a>
                ) : (
                  <span className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-100 text-sm font-bold text-neutral-400">
                    Sin teléfono
                  </span>
                )}
                <a
                  href={stop.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#e10600] text-sm font-bold text-white"
                >
                  <MapPin className="h-4 w-4" />
                  Cómo llegar
                </a>
              </div>
            </article>
          ))
        )}
      </main>
    </div>
  );
}
