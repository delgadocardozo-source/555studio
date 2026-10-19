import React from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function downloadBase64(fileName: string, base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Descarga un libro con una hoja por informe del ERP. */
export function ReportsExcelButton() {
  const excel = trpc.reports.excel.useQuery(undefined, { enabled: false });

  const download = async () => {
    const result = await excel.refetch();
    if (result.error || !result.data) {
      toast.error(result.error?.message || "No se pudo armar el Excel");
      return;
    }
    downloadBase64(result.data.fileName, result.data.base64);
    toast.success("Informes descargados en Excel");
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={excel.isFetching}
      title="Descargar todos los informes en Excel"
      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 text-[11px] font-bold text-emerald-200 hover:border-emerald-400 hover:text-white active:scale-95 disabled:opacity-60"
    >
      <FileSpreadsheet className="w-3.5 h-3.5" />
      {excel.isFetching ? "Armando…" : "Excel"}
    </button>
  );
}
