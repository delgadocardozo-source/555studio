import React, { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function PinForm({
  title,
  detail,
  confirm,
  submitLabel,
  pending,
  onSubmit,
}: {
  title: string;
  detail: string;
  confirm?: boolean;
  submitLabel: string;
  pending: boolean;
  onSubmit: (pin: string, confirmPin: string) => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");

  return (
    <form
      className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11141c] p-6 shadow-2xl"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(pin, again);
      }}
    >
      <img src="/logo-555.png" alt="555 Detail Studio" className="h-10 w-auto bg-white rounded px-2 py-1" />
      <h1 className="mt-5 text-xl font-bold text-white">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
      <label className="mt-5 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
        Clave
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg tracking-[0.3em] text-white outline-none focus:border-red-500"
        />
      </label>
      {confirm && (
        <label className="mt-3 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Repetir clave
          <input
            inputMode="numeric"
            autoComplete="off"
            value={again}
            onChange={(event) => setAgain(event.target.value.replace(/\D/g, "").slice(0, 8))}
            className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-lg tracking-[0.3em] text-white outline-none focus:border-red-500"
          />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 w-full rounded-xl bg-[#e60012] py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}

/** Cubre la agenda interna y el ERP. /agendar sigue abierto. */
export function StaffGate({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const status = trpc.staffAccess.status.useQuery();
  const setup = trpc.staffAccess.setup.useMutation({
    onSuccess: async () => {
      await utils.staffAccess.status.invalidate();
    },
    onError: (err) => toast.error(err.message || "No se pudo crear la clave"),
  });
  const login = trpc.staffAccess.login.useMutation({
    onSuccess: async () => {
      await utils.staffAccess.status.invalidate();
    },
    onError: (err) => toast.error(err.message || "Clave incorrecta"),
  });

  if (status.isLoading) {
    return <div className="min-h-dvh bg-[#050811]" />;
  }

  if (!status.data?.configured) {
    return (
      <div className="min-h-dvh bg-[#050811] flex items-center justify-center px-4">
        <PinForm
          title="Clave del equipo"
          detail="La primera vez se crea acá. Después, agenda, clientes y caja piden esta clave. Reservar en /agendar sigue abierto."
          confirm
          submitLabel="Crear clave"
          pending={setup.isPending}
          onSubmit={(pin, again) => setup.mutate({ pin, confirm: again })}
        />
      </div>
    );
  }

  if (!status.data.unlocked) {
    return (
      <div className="min-h-dvh bg-[#050811] flex items-center justify-center px-4">
        <PinForm
          title="Entrar"
          detail="Clave del equipo para ver la agenda y la caja."
          submitLabel="Entrar"
          pending={login.isPending}
          onSubmit={(pin) => login.mutate({ pin })}
        />
      </div>
    );
  }

  return <>{children}</>;
}

export function StaffLogoutButton() {
  const utils = trpc.useUtils();
  const logout = trpc.staffAccess.logout.useMutation({
    onSuccess: async () => {
      await utils.staffAccess.status.invalidate();
    },
  });
  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900 px-2.5 py-2 text-[11px] font-bold text-slate-300 hover:border-red-500/50 hover:text-white active:scale-95"
    >
      Salir
    </button>
  );
}
