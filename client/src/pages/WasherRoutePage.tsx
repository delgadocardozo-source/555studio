import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Camera, MapPin, Phone, Search } from "lucide-react";
import { toast } from "sonner";
import { groupWasherOrders, type WasherStop } from "@shared/washerRoute";
import { trpc } from "@/lib/trpc";

function asuncionToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return "Sin fecha";
  const weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return `${weekdays[date.getDay()]}, ${date.getDate()} de ${months[date.getMonth()]}`;
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

function focusDate(): string {
  const fromQuery = new URLSearchParams(window.location.search).get("fecha") || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(fromQuery) ? fromQuery : "";
}

function matchesQuery(order: WasherStop, query: string): boolean {
  if (!query) return true;
  const haystack = [
    order.clientName,
    order.clientPhone,
    order.companyName,
    order.cityZone,
    order.address,
    order.addressReference,
    order.code,
    order.notes,
    ...order.vehicles.flatMap((vehicle) => [vehicle.model, vehicle.plate]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

async function fileToJpeg(file: File): Promise<{ base64Data: string; contentType: string; fileName: string }> {
  if (!file.type.startsWith("image/")) throw new Error("La foto del auto tiene que ser una imagen");
  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la foto");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error("No se pudo preparar la foto"))), "image/jpeg", 0.82);
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk: number[] = [];
    const end = Math.min(bytes.length, index + 0x8000);
    for (let cursor = index; cursor < end; cursor += 1) chunk.push(bytes[cursor]);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return { base64Data: btoa(binary), contentType: "image/jpeg", fileName: "lavado.jpg" };
}

/** Todas las órdenes, sin montos. El colaborador llega al lugar y saca la foto. */
export default function WasherRoutePage() {
  const [, params] = useRoute<{ token: string }>("/lavar/:token");
  const token = params?.token || "";
  const today = asuncionToday();
  const [scope, setScope] = useState<"todas" | "por_hacer">("todas");
  const [query, setQuery] = useState("");
  const [uploadingCode, setUploadingCode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingCode = useRef("");
  const board = trpc.washer.orders.useQuery({ token }, { enabled: token.length >= 16, retry: false });
  const addPhoto = trpc.washer.addPhoto.useMutation({
    onSuccess: async () => {
      await board.refetch();
      toast.success("Foto del auto guardada");
    },
  });

  const orders = board.data?.orders ?? [];
  const needle = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return orders.filter((order) => {
      if (scope === "por_hacer" && order.status === "finalizado") return false;
      return matchesQuery(order, needle);
    });
  }, [orders, scope, needle]);
  const groups = useMemo(() => groupWasherOrders(visible, today), [visible, today]);
  const openCount = orders.filter((order) => order.status !== "finalizado").length;
  const highlighted = focusDate();

  useEffect(() => {
    document.title = "Órdenes de trabajo · 555 Detail Studio";
  }, []);

  useEffect(() => {
    const target = highlighted || today;
    if (!board.data) return;
    document.getElementById(`dia-${target}`)?.scrollIntoView({ block: "start" });
  }, [board.data, highlighted, today]);

  const pickPhoto = (code: string) => {
    pendingCode.current = code;
    fileRef.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const code = pendingCode.current;
    event.target.value = "";
    if (!file || !code) return;
    setUploadingCode(code);
    try {
      const photo = await fileToJpeg(file);
      await addPhoto.mutateAsync({ token, code, ...photo });
    } catch (error: any) {
      toast.error(error?.message || "No se pudo guardar la foto");
    } finally {
      setUploadingCode("");
    }
  };

  return (
    <div className="min-h-dvh bg-white text-neutral-950">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#e10600]">555 Detail Studio</p>
        <h1 className="text-xl font-extrabold">Órdenes de trabajo</h1>
        <p className="text-sm text-neutral-600">
          {board.isLoading ? "Cargando…" : board.error ? "Este link no abre las órdenes" : `${orders.length} en total · ${openCount} por hacer`}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setScope("todas")}
            className={`h-10 flex-1 rounded-xl text-sm font-bold ${scope === "todas" ? "bg-neutral-950 text-white" : "border border-neutral-300"}`}
          >
            Todas
          </button>
          <button
            type="button"
            onClick={() => setScope("por_hacer")}
            className={`h-10 flex-1 rounded-xl text-sm font-bold ${scope === "por_hacer" ? "bg-neutral-950 text-white" : "border border-neutral-300"}`}
          >
            Por hacer
          </button>
        </div>
        <label className="mt-2 flex h-11 items-center gap-2 rounded-xl border border-neutral-300 px-3">
          <Search className="h-4 w-4 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar orden"
            placeholder="Cliente, auto, zona o dirección"
            className="w-full bg-transparent text-sm outline-none"
          />
        </label>
      </header>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-4 pb-12">
        {token.length < 16 ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm font-semibold text-red-700">
            Este link está incompleto. Volvé a abrirlo desde la agenda.
          </p>
        ) : board.isLoading ? (
          <p className="py-10 text-center text-sm text-neutral-500">Cargando las órdenes…</p>
        ) : board.error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm font-semibold text-red-700">
            {board.error.message || "Este link no es de la ruta"}
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-2xl border border-neutral-200 px-4 py-8 text-center text-sm text-neutral-600">
            {orders.length === 0 ? "No hay órdenes." : "Ninguna orden coincide."}
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.date} id={`dia-${group.date}`} className="scroll-mt-44">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-neutral-500">
                {group.date === today ? "Hoy · " : ""}
                {formatDateEs(group.date)}
              </h2>
              <div className="flex flex-col gap-3">
                {group.orders.map((stop, index) => (
                  <article key={`${stop.code}-${index}`} className="rounded-2xl border border-neutral-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-extrabold">{stop.timeSlot || "Sin horario"}</p>
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
                        {statusLabel(stop.status)}
                      </span>
                    </div>
                    {stop.code ? <p className="mt-1 text-[11px] font-semibold text-neutral-400">{stop.code}</p> : null}
                    <h3 className="mt-1 text-base font-bold">{stop.clientName || "Sin nombre"}</h3>
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
                    {stop.addressReference ? <p className="text-sm text-neutral-600">Referencia: {stop.addressReference}</p> : null}
                    {stop.notes ? <p className="mt-1 text-sm text-neutral-600">Nota: {stop.notes}</p> : null}
                    {stop.washPhotoUrl ? (
                      <img src={stop.washPhotoUrl} alt="Auto lavado" className="mt-3 h-40 w-full rounded-xl object-cover" />
                    ) : null}
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
                    <button
                      type="button"
                      disabled={!stop.code || uploadingCode === stop.code}
                      onClick={() => pickPhoto(stop.code)}
                      className="mt-2 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-300 text-sm font-bold disabled:opacity-60"
                    >
                      <Camera className="h-4 w-4" />
                      {uploadingCode === stop.code ? "Guardando foto…" : stop.washPhotoUrl ? "Cambiar foto" : "Sacar foto"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
