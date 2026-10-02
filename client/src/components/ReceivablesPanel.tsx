import React, { useMemo, useState } from "react";
import {
  Banknote,
  HandCoins,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  formatGs,
  remainingOf,
  type Receivable,
  type ReceivableStatus,
} from "@shared/receivables";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type Form = {
  clientName: string;
  clientPhone: string;
  concept: string;
  amount: string;
  amountPaid: string;
  dueDate: string;
  notes: string;
};

type PayForm = {
  id: number;
  amount: string;
  clientName: string;
  remaining: number;
};

const emptyForm = (): Form => ({
  clientName: "",
  clientPhone: "",
  concept: "",
  amount: "",
  amountPaid: "0",
  dueDate: todayIso(),
  notes: "",
});

const STATUS_LABEL: Record<ReceivableStatus, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  cobrado: "Cobrado",
  anulado: "Anulado",
};

const STATUS_CLASS: Record<ReceivableStatus, string> = {
  pendiente: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  parcial: "text-sky-300 bg-sky-500/10 border-sky-500/30",
  cobrado: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  anulado: "text-slate-400 bg-slate-500/10 border-slate-500/30",
};

export function ReceivablesPanel() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"abiertas" | "todas" | "cobradas">("abiertas");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Receivable | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [payModal, setPayModal] = useState<PayForm | null>(null);

  const { data: rows = [], isLoading } = trpc.receivables.list.useQuery();
  const { data: stats } = trpc.receivables.stats.useQuery();

  const visible = useMemo(() => {
    if (filter === "todas") return rows;
    if (filter === "cobradas") return rows.filter((r) => r.status === "cobrado");
    return rows.filter((r) => r.status === "pendiente" || r.status === "parcial");
  }, [rows, filter]);

  const createMut = trpc.receivables.create.useMutation({
    onSuccess: () => {
      toast.success("Deuda registrada");
      utils.receivables.invalidate();
      setModal(false);
      setForm(emptyForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const updateMut = trpc.receivables.update.useMutation({
    onSuccess: () => {
      toast.success("Deuda actualizada");
      utils.receivables.invalidate();
      setModal(false);
      setForm(emptyForm());
      setEditing(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo actualizar"),
  });

  const payMut = trpc.receivables.registerPayment.useMutation({
    onSuccess: () => {
      toast.success("Cobro registrado");
      utils.receivables.invalidate();
      setPayModal(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo registrar el cobro"),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setModal(true);
  };

  const openEdit = (row: Receivable) => {
    setEditing(row);
    setForm({
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      concept: row.concept,
      amount: String(row.amount),
      amountPaid: String(row.amountPaid),
      dueDate: row.dueDate,
      notes: row.notes || "",
    });
    setModal(true);
  };

  const openPay = (row: Receivable) => {
    const rem = remainingOf(row);
    if (rem <= 0 || row.status === "anulado") {
      toast.error("Nada por cobrar");
      return;
    }
    setPayModal({
      id: row.id,
      amount: String(rem),
      clientName: row.clientName,
      remaining: rem,
    });
  };

  const submit = () => {
    if (!form.clientName.trim()) {
      toast.error("Indicá el cliente");
      return;
    }
    if (!form.concept.trim()) {
      toast.error("Indicá el concepto");
      return;
    }
    const amount = Math.round(Number(form.amount));
    const amountPaid = Math.round(Number(form.amountPaid || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    const payload = {
      clientName: form.clientName.trim(),
      clientPhone: form.clientPhone.trim(),
      concept: form.concept.trim(),
      amount,
      amountPaid,
      dueDate: form.dueDate,
      notes: form.notes.trim(),
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const submitPay = () => {
    if (!payModal) return;
    const amount = Math.round(Number(payModal.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Monto inválido");
      return;
    }
    payMut.mutate({ id: payModal.id, amount });
  };

  const annul = (row: Receivable) => {
    if (!confirm(`¿Anular deuda de ${row.clientName}?`)) return;
    updateMut.mutate({ id: row.id, data: { status: "anulado" } });
  };

  const today = todayIso();

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <HandCoins className="w-4 h-4 text-amber-400" />
            Deudores
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Cuentas por cobrar — luego se conectará con cobros de la agenda.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva deuda
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Cobrado</span>
          <span className="text-sm font-extrabold text-emerald-300">
            {formatGs(stats?.collectedGs || 0)}
          </span>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-fit">
        {(
          [
            ["abiertas", "Abiertas"],
            ["cobradas", "Cobradas"],
            ["todas", "Todas"],
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
          <p className="text-sm font-bold text-slate-300">Sin deudas en este filtro</p>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-600 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar deuda
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => {
            const rem = remainingOf(row);
            const overdue =
              (row.status === "pendiente" || row.status === "parcial") &&
              row.dueDate < today;
            return (
              <div
                key={row.id}
                className={`bg-slate-900 border rounded-2xl p-3 ${
                  overdue ? "border-rose-500/40" : "border-slate-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-white truncate">{row.clientName}</p>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${STATUS_CLASS[row.status]}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                      {overdue && (
                        <span className="text-[9px] font-bold uppercase text-rose-300">
                          vencida
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {row.concept}
                      {row.clientPhone ? ` · ${row.clientPhone}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Total {formatGs(row.amount)} · cobrado {formatGs(row.amountPaid)}
                      {rem > 0 ? ` · resta ${formatGs(rem)}` : ""}
                    </p>
                    <p className="text-[10px] text-slate-500">Vence {row.dueDate}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {rem > 0 && row.status !== "anulado" && (
                      <button
                        type="button"
                        onClick={() => openPay(row)}
                        className="text-[11px] font-bold text-amber-200 px-2 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10"
                      >
                        Cobrar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {row.status !== "anulado" && row.status !== "cobrado" && (
                  <button
                    type="button"
                    onClick={() => annul(row)}
                    className="mt-2 text-[10px] text-slate-500 hover:text-rose-300"
                  >
                    Anular
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {editing ? "Editar deuda" : "Nueva deuda"}
              </h3>
              <button type="button" onClick={() => setModal(false)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Cliente</span>
              <input
                value={form.clientName}
                onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Teléfono</span>
              <input
                value={form.clientPhone}
                onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Concepto</span>
              <input
                value={form.concept}
                onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Monto (Gs.)</span>
                <input
                  type="number"
                  min={1}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] uppercase text-slate-500">Ya cobrado</span>
                <input
                  type="number"
                  min={0}
                  value={form.amountPaid}
                  onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Vencimiento</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Notas</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white resize-none"
              />
            </label>
            <button
              type="button"
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
              className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-3">
          <div className="w-full max-w-sm bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-amber-400" />
                Cobrar · {payModal.clientName}
              </h3>
              <button type="button" onClick={() => setPayModal(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Resta {formatGs(payModal.remaining)}
            </p>
            <label className="block space-y-1">
              <span className="text-[10px] uppercase text-slate-500">Monto a cobrar (Gs.)</span>
              <input
                type="number"
                min={1}
                value={payModal.amount}
                onChange={(e) => setPayModal((p) => (p ? { ...p, amount: e.target.value } : p))}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
              />
            </label>
            <button
              type="button"
              onClick={submitPay}
              disabled={payMut.isPending}
              className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50"
            >
              Registrar cobro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
