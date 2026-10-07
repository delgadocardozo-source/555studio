import React, { useState } from "react";
import { Ban, FileText, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/cashLedger";

function paymentLabel(status: string) {
  if (status === "pagado") return "Cobrado";
  if (status === "falta_pagar") return "Falta pagar";
  return "Sin cobro";
}

/**
 * Facturación del lavadero: un comprobante por turno finalizado.
 * El dinero sigue en la agenda; acá solo se documenta.
 */
export function BillingPanel() {
  const utils = trpc.useUtils();
  const [picking, setPicking] = useState(false);
  const [voidId, setVoidId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: rows = [], isLoading } = trpc.billing.list.useQuery();
  const { data: stats } = trpc.billing.stats.useQuery();
  const { data: billable = [] } = trpc.billing.billable.useQuery(undefined, {
    enabled: picking,
  });

  const issueMut = trpc.billing.issue.useMutation({
    onSuccess: (inv) => {
      toast.success(`Emitido ${inv.number}`);
      utils.billing.invalidate();
      setPicking(false);
    },
    onError: (err) => toast.error(err.message || "No se pudo emitir"),
  });

  const voidMut = trpc.billing.void.useMutation({
    onSuccess: () => {
      toast.success("Comprobante anulado. El número no se reutiliza.");
      utils.billing.invalidate();
      setVoidId(null);
      setVoidReason("");
    },
    onError: (err) => toast.error(err.message || "No se pudo anular"),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-sky-300" />
            Facturación
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5 max-w-xl">
            Comprobante de servicio por lavado finalizado. IVA 10% incluido, desglosado.
            Un turno, un comprobante vigente. El cobro sigue en la agenda: si está pago, acá figura cobrado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-sky-600 text-white shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          Emitir
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Vigentes</span>
          <span className="text-sm font-extrabold text-white">{stats?.issuedCount ?? 0}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Facturado</span>
          <span className="text-sm font-extrabold text-sky-200">{formatGs(stats?.issuedTotalGs || 0)}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Por cobrar</span>
          <span className="text-sm font-extrabold text-amber-200">
            {formatGs(stats?.pendingCollectionGs || 0)}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Anulados</span>
          <span className="text-sm font-extrabold text-slate-300">{stats?.voidedCount ?? 0}</span>
        </div>
      </div>

      {picking && (
        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-3 space-y-2">
          <p className="text-[11px] font-bold text-sky-200">Lavados finalizados sin comprobante</p>
          {billable.length === 0 ? (
            <p className="text-[11px] text-slate-500">No hay turnos listos para facturar.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {billable.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  disabled={issueMut.isPending}
                  onClick={() => issueMut.mutate({ appointmentId: row.id })}
                  className="w-full text-left bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 hover:border-sky-500/40"
                >
                  <span className="text-xs font-bold text-white block">
                    {row.code} · {row.clientName}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {row.scheduledDate} · {formatGs(row.servicePrice)}
                    {row.clientTaxId ? ` · RUC ${row.clientTaxId}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Cargando comprobantes…</p>
      ) : rows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-1">
          <FileText className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">Sin comprobantes</p>
          <p className="text-[11px] text-slate-500">
            Emití uno desde un lavado ya finalizado. No se puede facturar dos veces el mismo turno.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((inv) => {
            const voiding = voidId === inv.id;
            const voided = inv.status === "anulada";
            return (
              <article
                key={inv.id}
                className={`bg-slate-900 border rounded-2xl p-3 space-y-2 ${
                  voided ? "border-slate-800 opacity-70" : "border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-white">
                      {inv.number}
                      <span className="ml-2 text-[10px] font-bold uppercase text-slate-500">
                        {voided ? "Anulado" : "Emitido"}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-300">
                      {inv.clientName} · {inv.issuedDate}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Turno {inv.appointmentCode}
                      {inv.clientTaxId ? ` · RUC ${inv.clientTaxId}` : " · sin RUC"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-extrabold text-white">{formatGs(inv.total)}</p>
                    {!voided && (
                      <p
                        className={`text-[10px] font-bold ${
                          inv.paymentStatus === "pagado" ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {paymentLabel(inv.paymentStatus)}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="text-[11px] text-slate-400 space-y-0.5">
                  {inv.lines.map((line, idx) => (
                    <li key={`${inv.id}-${idx}`} className="flex justify-between gap-2">
                      <span className="truncate">{line.description}</span>
                      <span className="shrink-0 text-slate-300">{formatGs(line.total)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-500">
                  Gravado {formatGs(inv.taxableBase)} · IVA 10% {formatGs(inv.ivaAmount)} · Total{" "}
                  {formatGs(inv.total)}
                </p>
                {voided && inv.voidReason && (
                  <p className="text-[11px] text-rose-200/90">Anulado: {inv.voidReason}</p>
                )}

                {!voided && (
                  voiding ? (
                    <div className="flex flex-col sm:flex-row gap-1.5">
                      <input
                        value={voidReason}
                        onChange={(e) => setVoidReason(e.target.value)}
                        placeholder="Motivo de anulación"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                      <button
                        type="button"
                        disabled={voidMut.isPending}
                        onClick={() => voidMut.mutate({ id: inv.id, reason: voidReason })}
                        className="text-[11px] font-bold px-3 py-2 rounded-xl bg-rose-600 text-white"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVoidId(null);
                          setVoidReason("");
                        }}
                        className="text-[11px] font-bold px-3 py-2 rounded-xl border border-slate-700 text-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setVoidId(inv.id);
                        setVoidReason("");
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-rose-300"
                    >
                      <Ban className="w-3 h-3" />
                      Anular
                    </button>
                  )
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
