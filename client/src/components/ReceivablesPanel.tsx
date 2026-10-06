import React, { useMemo, useState } from "react";
import { Banknote, ExternalLink, HandCoins, Link2, X } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatGs, remainingOf, type AppointmentDebt } from "@shared/receivables";

type PayForm = {
  appointmentId: number;
  clientName: string;
  amount: number;
  code: string;
  paymentMethod: "efectivo" | "comprobante_digital";
};

/**
 * Deudores = vista automática de turnos con paymentStatus = falta_pagar.
 * Cobrar actualiza el mismo turno en la agenda (sin registro manual).
 */
export function ReceivablesPanel() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"abiertas" | "cobradas">("abiertas");
  const [payModal, setPayModal] = useState<PayForm | null>(null);

  const { data: openRows = [], isLoading: loadingOpen } = trpc.receivables.list.useQuery({
    includeCollected: false,
  });
  const { data: allRows = [], isLoading: loadingAll } = trpc.receivables.list.useQuery(
    { includeCollected: true },
    { enabled: filter === "cobradas" }
  );
  const { data: stats } = trpc.receivables.stats.useQuery();

  const visible = useMemo(() => {
    if (filter === "abiertas") return openRows;
    return (allRows as AppointmentDebt[]).filter((r) => r.status === "cobrado");
  }, [filter, openRows, allRows]);

  const isLoading = filter === "abiertas" ? loadingOpen : loadingAll;

  const payMut = trpc.receivables.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Cobro registrado en la agenda");
      utils.receivables.invalidate();
      utils.appointments.invalidate();
      setPayModal(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo cobrar"),
  });

  const openPay = (row: AppointmentDebt) => {
    setPayModal({
      appointmentId: row.appointmentId,
      clientName: row.clientName,
      amount: remainingOf(row),
      code: row.code,
      paymentMethod: "efectivo",
    });
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-amber-400" />
            Deudores
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Automático desde la agenda: turnos finalizados como <strong className="text-slate-300">falta pagar</strong>.
            No se cargan a mano.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-300 border border-sky-500/30 bg-sky-500/10 px-3 py-2 rounded-xl"
        >
          <Link2 className="w-3.5 h-3.5" />
          Ir a agenda
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Abiertas</span>
          <span className="text-sm font-extrabold text-amber-300">{stats?.openCount ?? 0}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Vencidas</span>
          <span className="text-sm font-extrabold text-rose-300">{stats?.overdueCount ?? 0}</span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Por cobrar</span>
          <span className="text-sm font-extrabold text-white">{formatGs(stats?.pendingGs || 0)}</span>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {(
          [
            ["abiertas", "Por cobrar"],
            ["cobradas", "Cobradas (recientes)"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold ${
              filter === id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Cargando deudores…</p>
      ) : visible.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
          <HandCoins className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-300">
            {filter === "abiertas" ? "Nadie debe en este momento" : "Sin cobros recientes"}
          </p>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Cuando en la agenda finalizás un lavado como <em>falta pagar</em>, aparece acá solo.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const rem = remainingOf(row);
            const overdue = row.status === "pendiente" && row.scheduledDate < today;
            return (
              <div
                key={row.appointmentId}
                className={`bg-slate-900 border rounded-2xl p-3 ${
                  overdue ? "border-rose-500/40" : "border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-white truncate">{row.clientName}</p>
                      <span className="text-[9px] font-mono text-slate-500">{row.code}</span>
                      {overdue && (
                        <span className="text-[9px] font-bold uppercase text-rose-300">vencida</span>
                      )}
                      {row.status === "cobrado" && (
                        <span className="text-[9px] font-bold uppercase text-emerald-300">cobrado</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {row.vehicleSummary}
                      {row.clientPhone ? ` · ${row.clientPhone}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      {row.status === "cobrado"
                        ? formatGs(row.amount)
                        : `Debe ${formatGs(rem)}`}
                      {" · "}
                      {row.scheduledDate}
                      {row.timeSlot ? ` · ${row.timeSlot}` : ""}
                    </p>
                  </div>
                  {row.status === "pendiente" && (
                    <button
                      type="button"
                      onClick={() => openPay(row)}
                      className="text-[11px] font-bold text-amber-200 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 shrink-0 inline-flex items-center gap-1"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      Cobrar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Cobrar · {payModal.clientName}
              </h3>
              <button type="button" onClick={() => setPayModal(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Turno {payModal.code} · {formatGs(payModal.amount)}
            </p>
            <p className="text-[11px] text-slate-500">
              Esto marca el mismo servicio en la agenda como <strong className="text-slate-300">pagado</strong>.
            </p>
            <div className="flex gap-1.5">
              {(
                [
                  ["efectivo", "Efectivo"],
                  ["comprobante_digital", "Comprobante"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPayModal((p) => (p ? { ...p, paymentMethod: id } : p))}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold ${
                    payModal.paymentMethod === id
                      ? "bg-amber-600 text-white"
                      : "bg-slate-900 border border-slate-800 text-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {payModal.paymentMethod === "comprobante_digital" && (
              <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                Para adjuntar comprobante usá el cierre de cobro en la Agenda del turno{" "}
                {payModal.code}. Acá podés marcar efectivo, o ir a la agenda.
              </p>
            )}
            <div className="flex gap-2">
              {payModal.paymentMethod === "comprobante_digital" ? (
                <Link
                  href="/"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-700 text-sm font-bold text-slate-200"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Abrir agenda
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    payMut.mutate({
                      appointmentId: payModal.appointmentId,
                      paymentMethod: "efectivo",
                    })
                  }
                  disabled={payMut.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50"
                >
                  Confirmar cobro
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
