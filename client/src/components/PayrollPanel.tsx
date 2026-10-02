import React, { useMemo, useState } from "react";
import {
  Banknote,
  Filter,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  PAYMENT_CONCEPTS,
  STAFF_PAY_TYPES,
  STAFF_ROLES,
  formatGs,
  payTypeLabel,
  type StaffMember,
  type StaffPayType,
} from "@shared/payroll";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type StaffForm = {
  name: string;
  role: string;
  payType: StaffPayType;
  baseAmount: string;
  notes: string;
  active: boolean;
};

type PayForm = {
  staffId: string;
  amount: string;
  paymentDate: string;
  concept: string;
  notes: string;
};

const emptyStaffForm = (): StaffForm => ({
  name: "",
  role: STAFF_ROLES[0],
  payType: "quincenal",
  baseAmount: "",
  notes: "",
  active: true,
});

const emptyPayForm = (): PayForm => ({
  staffId: "",
  amount: "",
  paymentDate: todayIso(),
  concept: PAYMENT_CONCEPTS[0],
  notes: "",
});

export function PayrollPanel() {
  const utils = trpc.useUtils();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [staffFilter, setStaffFilter] = useState<number | "todos">("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [staffModal, setStaffModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [staffForm, setStaffForm] = useState<StaffForm>(emptyStaffForm());

  const [payModal, setPayModal] = useState(false);
  const [payForm, setPayForm] = useState<PayForm>(emptyPayForm());

  const filters = useMemo(
    () => ({
      staffId: staffFilter === "todos" ? undefined : staffFilter,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [staffFilter, dateFrom, dateTo]
  );

  const { data: staff = [], isLoading: staffLoading } = trpc.payroll.listStaff.useQuery({
    includeInactive: true,
  });
  const { data: payments = [], isLoading: payLoading } = trpc.payroll.listPayments.useQuery(filters);
  const { data: stats } = trpc.payroll.stats.useQuery(filters);

  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);
  const visibleStaff = showInactive ? staff : activeStaff;

  const createStaffMut = trpc.payroll.createStaff.useMutation({
    onSuccess: () => {
      toast.success("Personal registrado");
      utils.payroll.invalidate();
      setStaffModal(false);
      setStaffForm(emptyStaffForm());
      setEditingStaff(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo guardar"),
  });

  const updateStaffMut = trpc.payroll.updateStaff.useMutation({
    onSuccess: () => {
      toast.success("Personal actualizado");
      utils.payroll.invalidate();
      setStaffModal(false);
      setStaffForm(emptyStaffForm());
      setEditingStaff(null);
    },
    onError: (err) => toast.error(err.message || "No se pudo actualizar"),
  });

  const createPayMut = trpc.payroll.createPayment.useMutation({
    onSuccess: () => {
      toast.success("Pago registrado");
      utils.payroll.invalidate();
      setPayModal(false);
      setPayForm(emptyPayForm());
    },
    onError: (err) => toast.error(err.message || "No se pudo registrar el pago"),
  });

  const deletePayMut = trpc.payroll.deletePayment.useMutation({
    onSuccess: () => {
      toast.success("Pago eliminado");
      utils.payroll.invalidate();
    },
    onError: (err) => toast.error(err.message || "No se pudo eliminar"),
  });

  const openNewStaff = () => {
    setEditingStaff(null);
    setStaffForm(emptyStaffForm());
    setStaffModal(true);
  };

  const openEditStaff = (row: StaffMember) => {
    setEditingStaff(row);
    setStaffForm({
      name: row.name,
      role: row.role,
      payType: row.payType,
      baseAmount: row.baseAmount != null ? String(row.baseAmount) : "",
      notes: row.notes || "",
      active: row.active,
    });
    setStaffModal(true);
  };

  const openPay = (staffId?: number) => {
    setPayForm({
      ...emptyPayForm(),
      staffId: staffId ? String(staffId) : activeStaff[0] ? String(activeStaff[0].id) : "",
      amount:
        staffId != null
          ? String(activeStaff.find((s) => s.id === staffId)?.baseAmount || "")
          : "",
    });
    setPayModal(true);
  };

  const submitStaff = () => {
    if (!staffForm.name.trim()) {
      toast.error("Indicá el nombre");
      return;
    }
    const baseAmount =
      staffForm.baseAmount.trim() === ""
        ? null
        : Math.round(Number(staffForm.baseAmount));
    if (baseAmount != null && (!Number.isFinite(baseAmount) || baseAmount < 0)) {
      toast.error("Monto base inválido");
      return;
    }
    const payload = {
      name: staffForm.name.trim(),
      role: staffForm.role,
      payType: staffForm.payType,
      baseAmount,
      notes: staffForm.notes.trim(),
      active: staffForm.active,
    };
    if (editingStaff) {
      updateStaffMut.mutate({ id: editingStaff.id, data: payload });
    } else {
      createStaffMut.mutate(payload);
    }
  };

  const submitPay = () => {
    const staffId = Number(payForm.staffId);
    const amount = Number(payForm.amount);
    if (!staffId) {
      toast.error("Seleccioná el personal");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    createPayMut.mutate({
      staffId,
      amount,
      paymentDate: payForm.paymentDate,
      concept: payForm.concept,
      notes: payForm.notes.trim(),
    });
  };

  const activeFilters =
    (staffFilter !== "todos" ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            Personal · Pagos
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Nómina básica aparte de la agenda y de la caja de insumos.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={openNewStaff}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Personal
          </button>
          <button
            type="button"
            onClick={() => openPay()}
            disabled={activeStaff.length === 0}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white active:scale-95 disabled:opacity-50"
          >
            <Banknote className="w-3.5 h-3.5" />
            Registrar pago
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Activos</span>
          <span className="text-sm font-extrabold text-sky-300 font-display">
            {stats?.staffActive ?? 0}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Pagos</span>
          <span className="text-sm font-extrabold text-white font-display">
            {stats?.paymentsCount ?? 0}
          </span>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3">
          <span className="text-[10px] uppercase text-slate-500 block">Total pagado</span>
          <span className="text-sm font-extrabold text-amber-300 font-display">
            {formatGs(stats?.totalPaid || 0)}
          </span>
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <p className="flex-1 text-[11px] text-slate-500">
          {activeFilters > 0
            ? `Filtro activo (${activeFilters})`
            : "Sin filtro de fechas — todos los pagos"}
        </p>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`p-2 rounded-xl border touch-manipulation ${
            showFilters || activeFilters > 0
              ? "bg-sky-600/20 border-sky-500/40 text-sky-300"
              : "bg-slate-900 border-slate-800 text-slate-300"
          }`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showFilters && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Persona</span>
              <select
                value={staffFilter === "todos" ? "todos" : String(staffFilter)}
                onChange={(e) =>
                  setStaffFilter(e.target.value === "todos" ? "todos" : Number(e.target.value))
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              >
                <option value="todos">Todo el personal</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {!s.active ? " (inactivo)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-slate-500 uppercase">Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200"
              />
            </label>
          </div>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setStaffFilter("todos");
                setDateFrom("");
                setDateTo("");
              }}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Plantilla</p>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-slate-600"
            />
            Ver inactivos
          </label>
        </div>

        {staffLoading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Cargando personal…</p>
        ) : visibleStaff.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-300">Sin personal cargado</p>
            <p className="text-[11px] text-slate-500">
              Primero cargá lavadores / equipo; después registrá cada pago.
            </p>
            <button
              type="button"
              onClick={openNewStaff}
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-sky-600 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar personal
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleStaff.map((s) => {
              const summary = stats?.byStaff.find((b) => b.staffId === s.id);
              return (
                <div
                  key={s.id}
                  className={`bg-slate-900 border rounded-2xl p-3 ${
                    s.active ? "border-slate-800" : "border-slate-800/60 opacity-70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {s.name}
                        {!s.active ? (
                          <span className="ml-1.5 text-[10px] font-semibold text-slate-500">
                            inactivo
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {s.role} · {payTypeLabel(s.payType)}
                        {s.baseAmount != null ? ` · ref. ${formatGs(s.baseAmount)}` : ""}
                      </p>
                      {summary ? (
                        <p className="text-[11px] text-amber-200/90 mt-1">
                          Pagado (filtro): {formatGs(summary.totalPaid)} · {summary.payments}{" "}
                          pago(s)
                          {summary.lastPaymentDate
                            ? ` · último ${summary.lastPaymentDate}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {s.active && (
                        <button
                          type="button"
                          onClick={() => openPay(s.id)}
                          className="text-[11px] font-bold text-sky-300 px-2 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10"
                        >
                          Pagar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openEditStaff(s)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 px-0.5">
          Historial de pagos
        </p>
        {payLoading ? (
          <p className="text-xs text-slate-500 py-6 text-center">Cargando pagos…</p>
        ) : payments.length === 0 ? (
          <p className="text-[11px] text-slate-500 px-1 py-3">
            Sin pagos en este filtro. Usá <strong className="text-slate-300">Registrar pago</strong>.
          </p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div
                key={p.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex gap-3 items-start"
              >
                <div className="mt-0.5 p-2 rounded-xl shrink-0 bg-amber-500/15 text-amber-300">
                  <Banknote className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{p.staffName}</p>
                      <p className="text-[11px] text-slate-400">
                        {p.concept} · {p.paymentDate}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold font-display text-amber-300 shrink-0">
                      -{Number(p.amount).toLocaleString("es-PY")}
                    </span>
                  </div>
                  {p.notes ? (
                    <p className="text-[11px] text-slate-500 mt-0.5">{p.notes}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("¿Eliminar este pago?")) {
                        deletePayMut.mutate({ id: p.id });
                      }
                    }}
                    className="text-[11px] text-rose-400/80 hover:text-rose-300 inline-flex items-center gap-1 mt-1"
                  >
                    <Trash2 className="w-3 h-3" /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {staffModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl max-h-[min(92dvh,720px)] overflow-y-auto sheet-scroll pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-bold text-white">
                {editingStaff ? "Editar personal" : "Nuevo personal"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setStaffModal(false);
                  setEditingStaff(null);
                }}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-400">Nombre</span>
                <input
                  value={staffForm.name}
                  onChange={(e) => setStaffForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                  placeholder="Ej: Seba"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-slate-400">Rol</span>
                  <select
                    value={staffForm.role}
                    onChange={(e) => setStaffForm((p) => ({ ...p, role: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-slate-400">Esquema de pago</span>
                  <select
                    value={staffForm.payType}
                    onChange={(e) =>
                      setStaffForm((p) => ({ ...p, payType: e.target.value as StaffPayType }))
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                  >
                    {STAFF_PAY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {payTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-slate-400">Monto de referencia (Gs., opcional)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={staffForm.baseAmount}
                  onChange={(e) => setStaffForm((p) => ({ ...p, baseAmount: e.target.value }))}
                  placeholder="Ej: 1500000 quincena"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Notas</span>
                <textarea
                  value={staffForm.notes}
                  onChange={(e) => setStaffForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white resize-none"
                />
              </label>
              {editingStaff && (
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={staffForm.active}
                    onChange={(e) => setStaffForm((p) => ({ ...p, active: e.target.checked }))}
                  />
                  Activo
                </label>
              )}
              <button
                type="button"
                disabled={createStaffMut.isPending || updateStaffMut.isPending}
                onClick={submitStaff}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold py-3 rounded-2xl active:scale-95"
              >
                {editingStaff ? "Guardar cambios" : "Registrar personal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {payModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-t-3xl sm:rounded-2xl p-4 sm:p-5 shadow-2xl max-h-[min(92dvh,720px)] overflow-y-auto sheet-scroll pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <h3 className="text-sm font-bold text-white">Registrar pago a personal</h3>
              <button
                type="button"
                onClick={() => setPayModal(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-400">Personal</span>
                <select
                  value={payForm.staffId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    const ref = activeStaff.find((s) => s.id === id)?.baseAmount;
                    setPayForm((p) => ({
                      ...p,
                      staffId: e.target.value,
                      amount: ref != null && !p.amount ? String(ref) : p.amount,
                    }));
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                >
                  <option value="">Seleccionar…</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {payTypeLabel(s.payType)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-slate-400">Monto (Gs.)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={payForm.amount}
                    onChange={(e) => setPayForm((p) => ({ ...p, amount: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-sky-500"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-slate-400">Fecha</span>
                  <input
                    type="date"
                    value={payForm.paymentDate}
                    onChange={(e) => setPayForm((p) => ({ ...p, paymentDate: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="text-slate-400">Concepto</span>
                <select
                  value={payForm.concept}
                  onChange={(e) => setPayForm((p) => ({ ...p, concept: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white"
                >
                  {PAYMENT_CONCEPTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-slate-400">Nota (opcional)</span>
                <textarea
                  value={payForm.notes}
                  onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Ej: quincena 1–15 sep"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white resize-none"
                />
              </label>
              <button
                type="button"
                disabled={createPayMut.isPending}
                onClick={submitPay}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white font-bold py-3 rounded-2xl active:scale-95"
              >
                Confirmar pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
