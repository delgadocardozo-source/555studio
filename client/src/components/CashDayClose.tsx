import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { asuncionDate } from "@shared/agendaCash";
import { formatGs } from "@shared/cashLedger";

export function CashDayClose() {
  const [date, setDate] = useState(asuncionDate());
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const day = trpc.cashClose.day.useQuery({ date });
  const save = trpc.cashClose.save.useMutation({
    onSuccess: (saved) => {
      utils.cashClose.day.setData({ date }, saved);
      const diff = saved.difference ?? 0;
      toast.success(diff === 0 ? "Caja cuadra" : "Cierre guardado");
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar el cierre"),
  });

  useEffect(() => {
    if (!day.data || day.data.date !== date) return;
    setCounted(day.data.counted == null ? "" : String(day.data.counted));
    setNote(day.data.note || "");
  }, [day.data, date]);

  const summary = day.data;
  const diff = summary?.difference;

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-white">Cierre del día</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Efectivo que debería haber en el cajón. El comprobante entra a caja y no se cuenta acá.
          </p>
        </div>
        <label className="text-[11px] font-bold text-slate-500">
          Día
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Figure label="Efectivo" value={formatGs(summary?.efectivoIn || 0)} />
        <Figure label="Comprobante" value={formatGs(summary?.comprobanteIn || 0)} />
        <Figure label="Egresos" value={formatGs(summary?.egresos || 0)} />
        <Figure label="Debería haber" value={formatGs(summary?.expectedDrawer || 0)} strong />
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-2 sm:items-end">
        <label className="text-[11px] font-bold text-slate-500 flex-1">
          Conté
          <input
            inputMode="numeric"
            value={counted}
            onChange={(event) => setCounted(event.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-[11px] font-bold text-slate-500 flex-[2]">
          Nota
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Opcional"
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="button"
          disabled={save.isPending || counted === ""}
          onClick={() => save.mutate({ date, counted: Number(counted), note })}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          Guardar cierre
        </button>
      </div>

      {diff != null && (
        <p className={`mt-3 text-sm font-bold ${diff === 0 ? "text-emerald-300" : "text-amber-300"}`}>
          {diff === 0 ? "Caja cuadra." : diff > 0 ? `Sobra ${formatGs(diff)}.` : `Falta ${formatGs(Math.abs(diff))}.`}
        </p>
      )}
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm tabular-nums ${strong ? "font-extrabold text-white" : "font-bold text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}
