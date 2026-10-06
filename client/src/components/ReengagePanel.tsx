import React from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { buildReengageWhatsAppText } from "@shared/reengage";

function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("595") ? digits : `595${digits.replace(/^0/, "")}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

/** Cola de recontacto: 7 días después del lavado. */
export function ReengagePanel() {
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading, refetch, isFetching } = trpc.reengage.list.useQuery();
  const markMut = trpc.reengage.markSent.useMutation({
    onSuccess: () => {
      toast.success("Marcado como enviado");
      utils.reengage.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-400" />
            Recontacto · 7 días
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Clientes con lavado hace ~1 semana, sin turno futuro. El mensaje incluye el link a{" "}
            <span className="text-emerald-400/90">/agendar</span>; vos lo mandás por WhatsApp.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500 py-6 text-center">Buscando candidatos…</p>
      ) : rows.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
          <p className="text-sm font-bold text-slate-300">Nadie pendiente hoy</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Cuando pasen 7 días de un lavado finalizado, aparecen acá.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const text = buildReengageWhatsAppText({
              clientName: row.clientName,
              lastWashDate: row.lastWashDate,
            });
            return (
              <div
                key={row.phoneKey}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{row.clientName}</p>
                    <p className="text-[11px] text-slate-400">
                      {row.clientPhone} · lavó {row.lastWashDate} · hace {row.daysSinceWash}d
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a
                    href={waLink(row.clientPhone, text)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => markMut.mutate({ phone: row.clientPhone })}
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp + marcar
                  </a>
                  <button
                    type="button"
                    onClick={() => markMut.mutate({ phone: row.clientPhone })}
                    className="text-[11px] font-bold px-3 py-2 rounded-xl border border-slate-700 text-slate-300"
                  >
                    Solo marcar enviado
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
