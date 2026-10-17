import React from "react";
import { MessageCircle, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  buildFirstContactWhatsAppText,
  buildReengageWhatsAppText,
  whatsAppChatUrl,
} from "@shared/reengage";

function ContactBadge({ contacted }: { contacted: boolean }) {
  if (!contacted) return null;
  return (
    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1">
      Contactado
    </span>
  );
}

function WriteButton({
  phone,
  text,
  onSent,
}: {
  phone: string;
  text: string;
  onSent: () => void;
}) {
  return (
    <a
      href={whatsAppChatUrl(phone, text)}
      target="_blank"
      rel="noreferrer"
      onClick={onSent}
      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-emerald-600 text-white"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      Escribir
    </a>
  );
}

/** Cola de recontacto a 7 días y primer contacto de quien aún no lavó. */
export function ReengagePanel() {
  const utils = trpc.useUtils();
  const followups = trpc.reengage.list.useQuery();
  const firstContacts = trpc.reengage.firstContacts.useQuery();
  const markMut = trpc.reengage.markSent.useMutation({
    onSuccess: () => {
      utils.reengage.invalidate();
      utils.customers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const refreshing = followups.isFetching || firstContacts.isFetching;
  const rows = followups.data ?? [];
  const first = firstContacts.data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              Recontacto · 7 días
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Clientes con lavado hace al menos una semana y sin turno nuevo. Escribirles no los
              saca de la lista: desaparecen solo cuando reservan. El mensaje incluye el link a{" "}
              <span className="text-emerald-400/90">/agendar</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              followups.refetch();
              firstContacts.refetch();
            }}
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {followups.isLoading ? (
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
                    <ContactBadge contacted={Boolean(row.lastReminderAt)} />
                  </div>
                  <WriteButton
                    phone={row.clientPhone}
                    text={text}
                    onSent={() => markMut.mutate({ phone: row.clientPhone })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-sky-300" />
            Primer contacto
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Clientes que todavía no hicieron ningún lavado y no tienen turno próximo. Escribirles
            no los saca: salen cuando reservan. El mensaje invita al primer lavado.
          </p>
        </div>

        {firstContacts.isLoading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Buscando primer contacto…</p>
        ) : first.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-slate-300">Nadie sin lavado</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Quien se carga en CRM y todavía no lava aparece acá.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {first.map((row) => {
              const text = buildFirstContactWhatsAppText({ clientName: row.clientName });
              return (
                <div
                  key={row.phoneKey}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{row.clientName}</p>
                      <p className="text-[11px] text-slate-400">{row.clientPhone} · sin lavado</p>
                    </div>
                    <ContactBadge contacted={Boolean(row.lastReminderAt)} />
                  </div>
                  <WriteButton
                    phone={row.clientPhone}
                    text={text}
                    onSent={() => markMut.mutate({ phone: row.clientPhone })}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
