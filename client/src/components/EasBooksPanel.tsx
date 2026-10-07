import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Scale } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { formatGs } from "@shared/cashLedger";
import { buildMonthPackage } from "@shared/hechauka";
import { buildStoreZip } from "@shared/storeZip";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

const fieldClass =
  "w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-400";

/**
 * Libros de la EAS. Los números salen de facturas, compras y sueldos.
 */
export function EasBooksPanel() {
  const utils = trpc.useUtils();
  const [month, setMonth] = useState(thisMonth());
  const [legalName, setLegalName] = useState("");
  const [ruc, setRuc] = useState("");
  const [regime, setRegime] = useState<"resimple" | "simple" | "general">("simple");
  const [activity, setActivity] = useState("Lavado y detallado de vehículos a domicilio");
  const [repName, setRepName] = useState("");
  const [repRuc, setRepRuc] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [establecimiento, setEstablecimiento] = useState("001");
  const [puntoExpedicion, setPuntoExpedicion] = useState("001");
  const [supplierName, setSupplierName] = useState("");
  const [supplierRuc, setSupplierRuc] = useState("");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [purchaseTimbrado, setPurchaseTimbrado] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [taxed10, setTaxed10] = useState("");
  const [taxed5, setTaxed5] = useState("");
  const [exempt, setExempt] = useState("");

  const books = trpc.eas.books.useQuery({ month });

  useEffect(() => {
    const profile = books.data?.profile;
    if (!profile) return;
    setLegalName(profile.legalName || "");
    setRuc(profile.ruc || "");
    setRegime(profile.regime);
    setActivity(profile.activity || "");
    setRepName(profile.repName || "");
    setRepRuc(profile.repRuc || "");
    setTimbrado(profile.timbrado || "");
    setEstablecimiento(profile.establecimiento || "001");
    setPuntoExpedicion(profile.puntoExpedicion || "001");
  }, [books.data?.profile]);

  const saveProfile = trpc.eas.saveProfile.useMutation({
    onSuccess: () => {
      toast.success("Ficha de la EAS guardada");
      utils.eas.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const addPurchase = trpc.eas.addPurchase.useMutation({
    onSuccess: () => {
      toast.success("Compra registrada en el libro");
      setSupplierName("");
      setVoucherNumber("");
      setPurchaseTimbrado("");
      setTaxed10("");
      setTaxed5("");
      setExempt("");
      utils.eas.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const data = books.data;
  const preview = useMemo(() => (data ? buildMonthPackage(data) : null), [data]);

  function downloadPresentation() {
    if (!preview) return;
    const bytes = buildStoreZip(preview.files);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new Blob([buffer], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = preview.zipName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(
      preview.hechaukaIncluded
        ? "Presentación del mes descargada"
        : "Presentación descargada. Los TXT de Hechauka no entraron: el aviso y el LEEME dicen por qué."
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
          <Scale className="w-4 h-4 text-sky-300" />
          Contabilidad EAS
        </h2>
        <p className="text-[11px] text-slate-400 mt-0.5 max-w-2xl">
          Libro diario, inventario y posición de IVA armados con lo que ya está en el sistema.
          La presentación del mes baja en un ZIP: CSV para revisar y, con la ficha completa, los TXT para importar en Hechauka.
          El sistema no transmite a la DNIT ni al SIFEN.
        </p>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Ficha de la empresa</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Razón social" className={fieldClass} />
          <input value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="RUC" className={fieldClass} />
          <select value={regime} onChange={(e) => setRegime(e.target.value as typeof regime)} className={fieldClass}>
            <option value="resimple">RESIMPLE — sin IVA</option>
            <option value="simple">SIMPLE — IVA + IRE simple</option>
            <option value="general">General — IVA + IRE general</option>
          </select>
          <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Actividad" className={fieldClass} />
          <input value={repName} onChange={(e) => setRepName(e.target.value)} placeholder="Representante legal" className={fieldClass} />
          <input value={repRuc} onChange={(e) => setRepRuc(e.target.value)} placeholder="RUC del representante" className={fieldClass} />
          <input value={timbrado} onChange={(e) => setTimbrado(e.target.value)} inputMode="numeric" placeholder="Timbrado de las facturas" className={fieldClass} />
          <input value={establecimiento} onChange={(e) => setEstablecimiento(e.target.value)} inputMode="numeric" placeholder="Establecimiento (001)" className={fieldClass} />
          <input value={puntoExpedicion} onChange={(e) => setPuntoExpedicion(e.target.value)} inputMode="numeric" placeholder="Punto de expedición (001)" className={fieldClass} />
        </div>
        <button
          type="button"
          disabled={saveProfile.isPending}
          onClick={() =>
            saveProfile.mutate({
              legalName,
              ruc,
              regime,
              activity,
              repName,
              repRuc,
              timbrado,
              establecimiento,
              puntoExpedicion,
            })
          }
          className="text-[11px] font-bold px-3 py-2 rounded-xl bg-sky-600 text-white"
        >
          Guardar ficha
        </button>
      </section>

      {data && (
        <ul className="text-[11px] text-slate-400 space-y-1 bg-slate-950/60 border border-slate-800 rounded-2xl p-3">
          {data.obligations.map((item) => (
            <li key={item} className="flex gap-2">
              <BookOpen className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
        <label className="flex items-center gap-2 text-[11px] text-slate-400">
          Mes
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={fieldClass + " max-w-[11rem]"} />
        </label>
        <button
          type="button"
          disabled={!preview}
          onClick={downloadPresentation}
          className="inline-flex items-center gap-2 text-[11px] font-bold px-3 py-2 rounded-xl bg-sky-600 text-white disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Descargar presentación del mes
        </button>
        <p className="text-[11px] text-slate-500">
          Usa la ficha guardada y los libros de este mes. Un solo archivo: diario, mayor, inventario, IVA, compras y ventas.
        </p>
        {preview && preview.blockers.length > 0 && (
          <div className="text-[11px] text-amber-100 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1">
            <p className="font-bold">La descarga sigue disponible con los CSV. Los TXT de Hechauka (211 y 221) no se arman por esto:</p>
            <ul className="space-y-0.5">
              {preview.blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        {preview && preview.hechaukaIncluded && (
          <p className="text-[11px] text-emerald-300">
            La ficha alcanza: el ZIP incluye hechauka-compras y hechauka-ventas para importar.
          </p>
        )}
        {preview && preview.exclusions.length > 0 && (
          <div className="text-[11px] text-amber-100/90 space-y-0.5">
            <p className="font-bold text-amber-200">Comprobantes que no entran al TXT (también están en LEEME):</p>
            {preview.exclusions.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}
      </div>

      {data?.iva.applies ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="text-[10px] uppercase text-slate-500 block">Débito fiscal</span>
            <span className="text-sm font-extrabold text-white">{formatGs(data.iva.debitoFiscal)}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="text-[10px] uppercase text-slate-500 block">Crédito fiscal</span>
            <span className="text-sm font-extrabold text-white">{formatGs(data.iva.creditoFiscal)}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="text-[10px] uppercase text-slate-500 block">IVA a ingresar</span>
            <span className="text-sm font-extrabold text-amber-200">{formatGs(data.iva.aPagar)}</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <span className="text-[10px] uppercase text-slate-500 block">Crédito a favor</span>
            <span className="text-sm font-extrabold text-emerald-300">{formatGs(data.iva.creditoAFavor)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl p-3">
          En RESIMPLE este mes no se liquida IVA. Las ventas igual quedan en el libro.
        </p>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-extrabold text-white">Libro de ventas</h3>
        {!data?.sales.length ? (
          <p className="text-[11px] text-slate-500">No hay comprobantes emitidos en el mes. Salen de Facturación.</p>
        ) : (
          <div className="space-y-1">
            {data.sales.map((row) => (
              <div key={row.number} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex justify-between gap-2 text-[11px]">
                <div>
                  <p className="font-bold text-white">{row.number} · {row.clientName}</p>
                  <p className="text-slate-500">{row.date}{row.clientRuc ? ` · RUC ${row.clientRuc}` : ""} · {row.collected ? "cobrado" : "pendiente"}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">{formatGs(row.total)}</p>
                  <p className="text-slate-500">IVA {formatGs(row.iva10)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-extrabold text-white">Libro de compras</h3>
        <p className="text-[11px] text-slate-500">
          Cargá la base sin IVA, como figura en la factura del proveedor. El sistema calcula el impuesto.
          Para Hechauka, el número va como 001-001-0000123 y el timbrado del proveedor con 8 dígitos o más.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={fieldClass} />
          <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Proveedor" className={fieldClass} />
          <input value={supplierRuc} onChange={(e) => setSupplierRuc(e.target.value)} placeholder="RUC proveedor" className={fieldClass} />
          <input value={voucherNumber} onChange={(e) => setVoucherNumber(e.target.value)} placeholder="Nº 001-001-0000123" className={fieldClass} />
          <input value={purchaseTimbrado} onChange={(e) => setPurchaseTimbrado(e.target.value)} inputMode="numeric" placeholder="Timbrado del proveedor" className={fieldClass} />
          <input value={taxed10} onChange={(e) => setTaxed10(e.target.value)} inputMode="numeric" placeholder="Gravado 10%" className={fieldClass} />
          <input value={taxed5} onChange={(e) => setTaxed5(e.target.value)} inputMode="numeric" placeholder="Gravado 5%" className={fieldClass} />
          <input value={exempt} onChange={(e) => setExempt(e.target.value)} inputMode="numeric" placeholder="Exento" className={fieldClass} />
        </div>
        <button
          type="button"
          disabled={addPurchase.isPending}
          onClick={() =>
            addPurchase.mutate({
              date: purchaseDate,
              supplierName,
              supplierRuc,
              voucherNumber,
              timbrado: purchaseTimbrado,
              taxed10: Math.round(Number(taxed10) || 0),
              taxed5: Math.round(Number(taxed5) || 0),
              exempt: Math.round(Number(exempt) || 0),
            })
          }
          className="text-[11px] font-bold px-3 py-2 rounded-xl bg-slate-100 text-slate-900"
        >
          Registrar compra
        </button>
        <div className="space-y-1">
          {(data?.purchases || []).map((row) => (
            <div key={row.id} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 flex justify-between gap-2 text-[11px]">
              <div>
                <p className="font-bold text-white">{row.supplierName} · {row.voucherNumber}</p>
                <p className="text-slate-500">{row.date}{row.supplierRuc ? ` · RUC ${row.supplierRuc}` : ""}{row.timbrado ? ` · timbrado ${row.timbrado}` : ""}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-white">{formatGs(row.total)}</p>
                <p className="text-slate-500">IVA {formatGs(row.iva10 + row.iva5)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-extrabold text-white">Libro diario y mayor</h3>
        {data && (
          <p className="text-[11px] text-slate-400">
            Sumas: debe {formatGs(data.ledgerTotals.debit)} · haber {formatGs(data.ledgerTotals.credit)}
            {data.ledgerTotals.debit === data.ledgerTotals.credit ? " · cierra" : " · no cierra"}
          </p>
        )}
        <div className="space-y-1">
          {(data?.ledger || []).map((row) => (
            <div key={row.code} className="grid grid-cols-4 gap-2 text-[11px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
              <span className="col-span-2 text-slate-200">{row.code} {row.name}</span>
              <span className="text-right text-slate-400">{formatGs(row.debit)}</span>
              <span className="text-right text-slate-400">{formatGs(row.credit)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-extrabold text-white">Libro inventario</h3>
        <p className="text-[11px] text-slate-500">
          Existencia actual del stock valorizada al costo. No es el asiento de compra: la compra ya está en el diario como gasto.
        </p>
        <p className="text-[11px] text-slate-300">Total {formatGs(data?.inventory.totalValue || 0)}</p>
        <div className="space-y-1">
          {(data?.inventory.lines || []).map((row) => (
            <div key={row.name} className="flex justify-between text-[11px] bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
              <span className="text-slate-200">
                {row.name} · {row.quantity} {row.unit}
                {row.missingCost ? " · sin costo" : ""}
              </span>
              <span className="text-white font-bold">{formatGs(row.value)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
