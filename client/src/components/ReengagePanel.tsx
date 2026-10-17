import React from "react";
import { Camera, MessageCircle, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { receiptViewUrl } from "@/lib/receiptUrl";
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

function prefersFileShare() {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
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

  const sendWithPhoto = async (row: {
    clientName: string;
    clientPhone: string;
    lastWashDate: string;
    washPhotoUrl: string;
  }) => {
    const text = buildReengageWhatsAppText({
      clientName: row.clientName,
      lastWashDate: row.lastWashDate,
      washPhotoUrl: row.washPhotoUrl,
    });
    const href = whatsAppChatUrl(row.clientPhone, text);
    const openChat = () => {
      window.open(href, "_blank", "noreferrer");
      markMut.mutate({ phone: row.clientPhone });
    };
    try {
      const res = await fetch(receiptViewUrl(row.washPhotoUrl));
      if (!res.ok) {
        openChat();
        return;
      }
      const blob = await res.blob();
      const type = blob.type.startsWith("image/") ? blob.type : "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const file = new File([blob], `auto-lavado.${ext}`, { type });
      if (!navigator.canShare?.({ files: [file] })) {
        openChat();
        return;
      }
      await navigator.share({ files: [file], text, title: "555 Detail Studio" });
      markMut.mutate({ phone: row.clientPhone });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      openChat();
    }
  };

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
              saca de la lista: desaparecen solo cuando reservan. Si el lavado tiene foto, podés
              mandar el texto solo o con la imagen del auto limpio.
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
                    <div className="min-w-0 flex items-start gap-2">
                      {row.washPhotoUrl ? (
                        <img
                          src={receiptViewUrl(row.washPhotoUrl)}
                          alt="Auto lavado"
                          className="w-12 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{row.clientName}</p>
                        <p className="text-[11px] text-slate-400">
                          {row.clientPhone} · lavó {row.lastWashDate} · hace {row.daysSinceWash}d
                          {row.washPhotoUrl ? " · con foto" : ""}
                        </p>
                      </div>
                    </div>
                    <ContactBadge contacted={Boolean(row.lastReminderAt)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <WriteButton
                      phone={row.clientPhone}
                      text={text}
                      onSent={() => markMut.mutate({ phone: row.clientPhone })}
                    />
                    {row.washPhotoUrl ? (
                      prefersFileShare() ? (
                        <button
                          type="button"
                          onClick={() =>
                            void sendWithPhoto({
                              clientName: row.clientName,
                              clientPhone: row.clientPhone,
                              lastWashDate: row.lastWashDate,
                              washPhotoUrl: row.washPhotoUrl || "",
                            })
                          }
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-sky-600 text-white"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Escribir con foto
                        </button>
                      ) : (
                        <a
                          href={whatsAppChatUrl(
                            row.clientPhone,
                            buildReengageWhatsAppText({
                              clientName: row.clientName,
                              lastWashDate: row.lastWashDate,
                              washPhotoUrl: row.washPhotoUrl,
                            })
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => markMut.mutate({ phone: row.clientPhone })}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl bg-sky-600 text-white"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          Escribir con foto
                        </a>
                      )
                    ) : null}
                  </div>
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
