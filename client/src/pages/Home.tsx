import React, { useState, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { jsPDF } from "jspdf";
import {
  Calendar as CalendarIcon,
  Plus,
  Car,
  Truck,
  MapPin,
  Clock,
  Phone,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Layers,
  Trash2,
  ExternalLink,
  Navigation,
  Share2,
  X,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileCheck,
  Receipt,
  Banknote,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

// Zonas y opciones
const CITIES = ["Todas", "Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"] as const;
const STATUS_OPTIONS = [
  { value: "todos", label: "Todos los estados" },
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "en_camino", label: "En camino" },
  { value: "en_proceso", label: "En proceso" },
  { value: "finalizado", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

const STATUS_FLOW = [
  { value: "pendiente", label: "Pendiente" },
  { value: "confirmado", label: "Confirmado" },
  { value: "en_camino", label: "En camino" },
  { value: "en_proceso", label: "En proceso" },
  { value: "finalizado", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

const TIME_SLOTS = [
  "08:00 - 09:30",
  "09:30 - 11:00",
  "11:00 - 12:30",
  "13:30 - 15:00",
  "15:00 - 16:30",
  "16:30 - 18:00",
];

interface FormVehicleItem {
  id: string;
  type: "auto" | "camioneta";
  model: string;
  plate: string;
}

export default function Home() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estados de navegación y filtros
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("Todas");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [paymentFilter, setPaymentFilter] = useState<string>("todos");
  const [vehicleFilter, setVehicleFilter] = useState<string>("todos");
  const [clientTypeFilter, setClientTypeFilter] = useState<string>("todos");
  const [activeTab, setActiveTab] = useState<"calendario" | "ordenes" | "portal_preview">("calendario");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>(TIME_SLOTS[0]);

  // Modales
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);

  // Estado para Finalización de Servicio y Cobro
  const [finalizeData, setFinalizeData] = useState<{
    paymentStatus: "pagado" | "falta_pagar";
    paymentMethod: "efectivo" | "comprobante_digital";
    paymentReceiptUrl: string | null;
    paymentReceiptName: string | null;
    isUploading: boolean;
  }>({
    paymentStatus: "pagado",
    paymentMethod: "efectivo",
    paymentReceiptUrl: null,
    paymentReceiptName: null,
    isUploading: false,
  });

  // Form State con Location URL
  const [formData, setFormData] = useState({
    clientName: "",
    clientPhone: "",
    clientType: "particular" as "particular" | "oficina" | "empresa_flota",
    companyName: "",
    clientTaxId: "",
    cityZone: "Asuncion" as "Asuncion" | "Luque" | "Mariano Roque Alonso" | "San Lorenzo",
    address: "",
    locationUrl: "",
    addressReference: "",
    scheduledDate: selectedDate,
    timeSlot: TIME_SLOTS[0],
    notes: "",
  });

  const [formVehicles, setFormVehicles] = useState<FormVehicleItem[]>([
    { id: "v1", type: "auto", model: "", plate: "" },
  ]);

  const totalCalculatedPrice = useMemo(() => {
    return formVehicles.reduce((acc, curr) => acc + (curr.type === "auto" ? 90000 : 120000), 0);
  }, [formVehicles]);

  // Consultas tRPC
  const { data: stats } = trpc.appointments.stats.useQuery();
  const { data: customers = [] } = trpc.customers.search.useQuery(
    { query: formData.clientPhone.length >= 3 || formData.clientName.length >= 3 ? formData.clientPhone || formData.clientName : "" },
    { enabled: isModalOpen }
  );
  const { data: allCustomersList = [] } = trpc.customers.search.useQuery({}, { enabled: activeTab === "portal_preview" });

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (cityFilter !== "Todas") count++;
    if (statusFilter !== "todos") count++;
    if (paymentFilter !== "todos") count++;
    if (vehicleFilter !== "todos") count++;
    if (clientTypeFilter !== "todos") count++;
    if (searchQuery.trim() !== "") count++;
    return count;
  }, [cityFilter, statusFilter, paymentFilter, vehicleFilter, clientTypeFilter, searchQuery]);

  const queryFilters = useMemo(() => {
    return {
      date: activeTab === "calendario" ? selectedDate : undefined,
      cityZone: cityFilter !== "Todas" ? (cityFilter as any) : undefined,
      status: statusFilter !== "todos" ? (statusFilter as any) : undefined,
      paymentStatus: paymentFilter !== "todos" ? (paymentFilter as any) : undefined,
      vehicleType: vehicleFilter !== "todos" ? (vehicleFilter as any) : undefined,
      clientType: clientTypeFilter !== "todos" ? (clientTypeFilter as any) : undefined,
      search: searchQuery.trim() !== "" ? searchQuery : undefined,
    };
  }, [activeTab, selectedDate, cityFilter, statusFilter, paymentFilter, vehicleFilter, clientTypeFilter, searchQuery]);

  const { data: appointments = [], isLoading: listLoading } = trpc.appointments.list.useQuery(queryFilters);

  React.useEffect(() => {
    if (appointments.length > 0) {
      const hasCurrent = appointments.some((a) => a.timeSlot === selectedSlot);
      if (!hasCurrent) {
        setSelectedSlot(appointments[0].timeSlot);
      }
    }
  }, [appointments]);

  const selectedSlotAppointments = useMemo(
    () => appointments.filter((appointment) => appointment.timeSlot === selectedSlot),
    [appointments, selectedSlot]
  );
  const selectedSlotAppointment = selectedSlotAppointments[0] ?? null;

  // Mutaciones
  const createMutation = trpc.appointments.create.useMutation({
    onSuccess: (created) => {
      const dateLabel = created?.scheduledDate
        ? created.scheduledDate.split("-").reverse().join("/")
        : "";
      toast.success(
        dateLabel
          ? `Turno agendado para el ${dateLabel}${created?.timeSlot ? ` · ${created.timeSlot}` : ""}`
          : "Turno agendado con éxito"
      );
      if (created?.scheduledDate) {
        setSelectedDate(created.scheduledDate);
        setActiveTab("calendario");
      }
      if (created?.timeSlot) {
        setSelectedSlot(created.timeSlot);
      }
      utils.appointments.invalidate();
      setIsModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(`Error al agendar: ${err.message}`);
    },
  });

  const updateStatusMutation = trpc.appointments.updateStatus.useMutation({
    onSuccess: (updated) => {
      toast.success("Estado actualizado");
      if (updated) {
        setSelectedAppointment(updated);
      }
      utils.appointments.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "No se pudo cambiar el estado");
    },
  });

  const finalizeMutation = trpc.appointments.finalizeWithPayment.useMutation({
    onSuccess: () => {
      toast.success("Servicio finalizado y cobro registrado");
      utils.appointments.invalidate();
      setIsFinalizeModalOpen(false);
      setIsDetailOpen(false);
    },
    onError: (err) => {
      toast.error(err.message || "Error al registrar cobro");
    },
  });

  const updateMutation = trpc.appointments.update.useMutation({
    onSuccess: (updated) => {
      const dateLabel = updated?.scheduledDate
        ? updated.scheduledDate.split("-").reverse().join("/")
        : "";
      toast.success(
        dateLabel
          ? `Reserva actualizada · ${dateLabel}${updated?.timeSlot ? ` · ${updated.timeSlot}` : ""}`
          : "Reserva actualizada"
      );
      if (updated?.scheduledDate) {
        setSelectedDate(updated.scheduledDate);
        setActiveTab("calendario");
      }
      if (updated?.timeSlot) {
        setSelectedSlot(updated.timeSlot);
      }
      setSelectedAppointment(updated);
      utils.appointments.invalidate();
      setIsModalOpen(false);
      setEditingAppointmentId(null);
      resetForm();
    },
    onError: (err) => {
      toast.error(`Error al editar: ${err.message}`);
    },
  });

  const uploadReceiptMutation = trpc.appointments.uploadReceipt.useMutation();

  const deleteMutation = trpc.appointments.delete.useMutation({
    onSuccess: () => {
      toast.success("Turno eliminado");
      utils.appointments.invalidate();
      setIsDetailOpen(false);
    },
  });

  const resetForm = () => {
    setFormData({
      clientName: "",
      clientPhone: "",
      clientType: "particular",
      companyName: "",
      clientTaxId: "",
      cityZone: "Asuncion",
      address: "",
      locationUrl: "",
      addressReference: "",
      scheduledDate: selectedDate,
      timeSlot: TIME_SLOTS[0],
      notes: "",
    });
    setFormVehicles([{ id: "v1", type: "auto", model: "", plate: "" }]);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setCityFilter("Todas");
    setStatusFilter("todos");
    setPaymentFilter("todos");
    setVehicleFilter("todos");
    setClientTypeFilter("todos");
  };

  const handleOpenCreateModal = (presetDate?: string, presetSlot?: string) => {
    setEditingAppointmentId(null);
    resetForm();
    setFormData((prev) => ({
      ...prev,
      scheduledDate: presetDate || selectedDate,
      timeSlot: presetSlot || TIME_SLOTS[0],
    }));
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (app: any) => {
    let vehicles: FormVehicleItem[] = [{ id: "v1", type: "auto", model: "", plate: "" }];
    try {
      const parsed = typeof app.vehicles === "string" ? JSON.parse(app.vehicles) : app.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) {
        vehicles = parsed.map((v: any, idx: number) => ({
          id: `v${idx + 1}`,
          type: v.type === "camioneta" ? "camioneta" : "auto",
          model: v.model || "",
          plate: v.plate || "",
        }));
      } else {
        vehicles = [
          {
            id: "v1",
            type: app.vehicleType === "camioneta" ? "camioneta" : "auto",
            model: app.vehicleModel || "",
            plate: app.licensePlate || "",
          },
        ];
      }
    } catch {
      vehicles = [
        {
          id: "v1",
          type: app.vehicleType === "camioneta" ? "camioneta" : "auto",
          model: app.vehicleModel || "",
          plate: app.licensePlate || "",
        },
      ];
    }

    setEditingAppointmentId(app.id);
    setFormData({
      clientName: app.clientName || "",
      clientPhone: app.clientPhone || "",
      clientType: app.clientType || "particular",
      companyName: app.companyName || "",
      clientTaxId: app.clientTaxId || "",
      cityZone: app.cityZone || "Asuncion",
      address: app.address || "",
      locationUrl: app.locationUrl || "",
      addressReference: app.addressReference || "",
      scheduledDate: app.scheduledDate || selectedDate,
      timeSlot: app.timeSlot || TIME_SLOTS[0],
      notes: app.notes || "",
    });
    setFormVehicles(vehicles);
    setIsDetailOpen(false);
    setIsModalOpen(true);
  };

  const handleCloseFormModal = () => {
    setIsModalOpen(false);
    setEditingAppointmentId(null);
    resetForm();
  };

  const handleSelectCustomerSuggestion = (customer: any) => {
    setFormData((prev) => ({
      ...prev,
      clientName: customer.clientName || prev.clientName,
      clientPhone: customer.clientPhone || prev.clientPhone,
      clientType: customer.clientType || prev.clientType,
      companyName: customer.companyName || prev.companyName || "",
      clientTaxId: customer.clientTaxId || prev.clientTaxId || "",
    }));
    toast.success("Datos del cliente y RUC cargados");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName || !formData.clientPhone || !formData.address) {
      toast.error("Por favor completá los campos principales");
      return;
    }

    const validVehicles = formVehicles.filter((v) => v.model.trim() !== "");
    if (validVehicles.length === 0) {
      toast.error("Tenés que agregar al menos un modelo o marca de vehículo");
      return;
    }

    const payload = {
      ...formData,
      vehicles: validVehicles.map((v) => ({
        type: v.type,
        model: v.model.trim(),
        plate: v.plate.trim() || null,
      })),
      locationUrl: formData.locationUrl?.trim() || null,
      companyName: formData.clientType !== "particular" ? formData.companyName : null,
      clientTaxId: formData.clientTaxId?.trim() || null,
    };

    if (editingAppointmentId) {
      updateMutation.mutate({ id: editingAppointmentId, data: payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const handleDateShift = (days: number) => {
    const current = new Date(selectedDate + "T12:00:00");
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split("T")[0]);
  };

  const handleInitiateFinalize = (app: any) => {
    setSelectedAppointment(app);
    setFinalizeData({
      paymentStatus: app.paymentStatus === "sin_definir" ? "pagado" : app.paymentStatus,
      paymentMethod: app.paymentMethod || "efectivo",
      paymentReceiptUrl: app.paymentReceiptUrl || null,
      paymentReceiptName: app.paymentReceiptName || null,
      isUploading: false,
    });
    setIsFinalizeModalOpen(true);
  };

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      toast.error("El comprobante no debe superar los 8MB");
      return;
    }

    setFinalizeData((prev) => ({ ...prev, isUploading: true }));

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64String = (reader.result as string).split(",")[1];
        const res = await uploadReceiptMutation.mutateAsync({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          base64Data: base64String,
        });

        setFinalizeData((prev) => ({
          ...prev,
          paymentReceiptUrl: res.url,
          paymentReceiptName: file.name,
          isUploading: false,
        }));
        toast.success("Comprobante cargado correctamente");
      } catch (err: any) {
        toast.error("Error al subir archivo: " + (err.message || "desconocido"));
        setFinalizeData((prev) => ({ ...prev, isUploading: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmFinalize = () => {
    if (!selectedAppointment) return;

    if (finalizeData.paymentStatus === "pagado") {
      if (finalizeData.paymentMethod === "comprobante_digital" && !finalizeData.paymentReceiptUrl) {
        toast.error("Debes adjuntar el comprobante digital");
        return;
      }
    }

    finalizeMutation.mutate({
      id: selectedAppointment.id,
      paymentStatus: finalizeData.paymentStatus,
      paymentMethod: finalizeData.paymentStatus === "pagado" ? finalizeData.paymentMethod : undefined,
      paymentReceiptUrl: finalizeData.paymentStatus === "pagado" ? finalizeData.paymentReceiptUrl : null,
      paymentReceiptName: finalizeData.paymentStatus === "pagado" ? finalizeData.paymentReceiptName : null,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pendiente":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">Pendiente</span>;
      case "confirmado":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">Confirmado</span>;
      case "en_camino":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-300 border border-purple-500/30">En camino</span>;
      case "en_proceso":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40 animate-pulse">En proceso</span>;
      case "finalizado":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Finalizado</span>;
      case "cancelado":
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30">Cancelado</span>;
      default:
        return null;
    }
  };

  const getPaymentBadge = (paymentStatus: string, method?: string | null) => {
    switch (paymentStatus) {
      case "pagado":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            {method === "efectivo" ? <Banknote className="w-3 h-3 text-emerald-300" /> : <Receipt className="w-3 h-3 text-emerald-300" />}
            Pagado {method === "efectivo" ? "Efectivo" : "Comprobante"}
          </span>
        );
      case "falta_pagar":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertTriangle className="w-3 h-3 text-rose-300" />
            Falta pagar
          </span>
        );
      default:
        return null;
    }
  };

  const formatGs = (amount: number) => `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;

  const confirmationText = (app: any) => {
    const vehicles = parseVehicles(app);
    const vehicleLines = vehicles
      .map((vehicle: any) => `• ${vehicle.model}${vehicle.plate ? ` (${vehicle.plate})` : ""}`)
      .join("\n");

    return [
      "555 DETAIL STUDIO",
      "Confirmación de servicio a domicilio",
      "",
      `Código: ${app.code}`,
      `Cliente: ${app.clientName}`,
      app.clientTaxId ? `RUC / Facturación: ${app.clientTaxId}` : null,
      `Fecha: ${app.scheduledDate} · ${app.timeSlot}`,
      `Zona: ${app.cityZone}`,
      "",
      `Vehículos (${vehicles.length}):`,
      vehicleLines,
      "",
      `Total estimado: ${formatGs(app.servicePrice)}`,
      "",
      "Gracias por elegir 555 Detail Studio.",
    ].filter(Boolean).join("\n");
  };

  const createConfirmationPdf = (app: any) => {
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const vehicles = parseVehicles(app);
    const total = formatGs(app.servicePrice);

    doc.setFillColor(5, 8, 17);
    doc.rect(0, 0, 148, 210, "F");
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, 148, 14, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("555 DETAIL STUDIO", 12, 10);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.text("LAVADO A DOMICILIO", 102, 9.5);

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Confirmación de servicio", 12, 28);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 190, 205);
    doc.setFontSize(8);
    doc.text("Guardá este comprobante para tu registro.", 12, 34);

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(12, 41, 124, 25, 3, 3, "F");
    doc.setTextColor(180, 190, 205);
    doc.setFontSize(7);
    doc.text("CÓDIGO DE PEDIDO", 18, 49);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(app.code, 18, 58);
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(9);
    doc.text(`TOTAL · ${total}`, 88, 56);

    let y = 78;
    const addField = (label: string, value: string) => {
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(label.toUpperCase(), 12, y);
      doc.setTextColor(241, 245, 249);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(value, 12, y + 6);
      y += 18;
    };

    addField("Cliente", app.clientName);
    if (app.clientTaxId) {
      addField("RUC / Facturación", app.clientTaxId);
    }
    addField("Fecha y horario", `${app.scheduledDate} · ${app.timeSlot}`);
    addField("Zona de servicio", app.cityZone);

    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(`VEHÍCULOS INCLUIDOS (${vehicles.length})`, 12, y);
    y += 6;

    vehicles.forEach((vehicle: any) => {
      doc.setFillColor(15, 23, 42);
      doc.roundedRect(12, y, 124, 12, 2, 2, "F");
      doc.setTextColor(241, 245, 249);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(vehicle.model, 17, y + 7.5);
      doc.setTextColor(148, 163, 184);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`${vehicle.type === "auto" ? "Auto" : "Camioneta"}${vehicle.plate ? ` · ${vehicle.plate}` : ""}`, 82, y + 7.5);
      y += 15;
    });

    doc.setFillColor(220, 38, 38);
    doc.roundedRect(12, y + 4, 124, 16, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("TOTAL ESTIMADO", 18, y + 11);
    doc.setFontSize(12);
    doc.text(total, 100, y + 14);

    doc.setTextColor(148, 163, 184);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Asunción · Luque · Mariano Roque Alonso · San Lorenzo", 12, 196);
    doc.text("Gracias por elegir 555 Detail Studio.", 12, 202);

    return doc;
  };

  const getConfirmationFile = (app: any) => {
    const doc = createConfirmationPdf(app);
    const safeCode = String(app.code || "pedido").replace(/[^a-zA-Z0-9-_]/g, "_");
    const fileName = `confirmacion-${safeCode}.pdf`;
    const blob = doc.output("blob");
    return { doc, fileName, file: new File([blob], fileName, { type: "application/pdf" }) };
  };

  const handleDownloadConfirmation = (app: any) => {
    const { doc, fileName } = getConfirmationFile(app);
    doc.save(fileName);
    toast.success("PDF de confirmación descargado");
  };

  const handleShareConfirmation = async (app: any) => {
    const { doc, fileName, file } = getConfirmationFile(app);
    const shareData = {
      title: `Confirmación ${app.code}`,
      text: confirmationText(app),
      files: [file],
    };

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error: any) {
        if (error?.name === "AbortError") return;
      }
    }

    doc.save(fileName);
    toast.success("PDF descargado. Adjuntalo desde WhatsApp para enviarlo al cliente.");
  };

  const handleWhatsAppConfirmation = (app: any) => {
    const phone = String(app.clientPhone || "").replace(/\D/g, "").replace(/^0/, "");
    const phoneWithCountry = phone.startsWith("595") ? phone : `595${phone}`;
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(confirmationText(app))}`, "_blank", "noopener,noreferrer");
  };

  const parseVehicles = (app: any) => {
    if (app?.vehicles) {
      try {
        const parsed = typeof app.vehicles === "string" ? JSON.parse(app.vehicles) : app.vehicles;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {
        // fallback
      }
    }
    return [
      {
        type: app.vehicleType || "auto",
        model: app.vehicleModel || "Vehículo",
        plate: app.licensePlate || null,
        price: app.servicePrice || (app.vehicleType === "camioneta" ? 120000 : 90000),
      },
    ];
  };

  return (
    <div className="min-h-screen bg-[#050811] text-slate-100 flex flex-col antialiased selection:bg-red-600 selection:text-white pb-20 sm:pb-8">
      {/* Top Header con Logo */}
      <header className="border-b border-slate-800/80 bg-[#080d1a]/95 backdrop-blur sticky top-0 z-30 px-3.5 sm:px-6 py-2.5 sm:py-3">
        <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="bg-white px-2 py-1 rounded shadow-sm flex items-center justify-center shrink-0">
              <img
                src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663609949536/xHsmAXPzWPgOgCNL.png"
                alt="555 Detail Studio"
                className="h-5 sm:h-7 w-auto object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">
                  Agenda Operativa
                </h1>
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30">
                  A Domicilio
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Asunción · Luque · MRA · San Lorenzo
              </p>
            </div>
          </div>

          {/* Botón Desktop */}
          <button
            onClick={() => handleOpenCreateModal()}
            className="hidden sm:flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-all shadow-lg shadow-red-600/25 active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Servicio</span>
          </button>
        </div>
      </header>

      {/* Resumen Mobile: una sola franja para conservar la agenda completa visible */}
      <section className="sm:hidden px-3.5 pt-2.5">
        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 divide-x divide-slate-800">
          <div className="px-3 py-2">
            <span className="block text-[9px] uppercase font-bold text-slate-500">Agenda</span>
            <span className="text-base font-extrabold text-white">{appointments.length}</span>
          </div>
          <div className="px-3 py-2">
            <span className="block text-[9px] uppercase font-bold text-amber-500">Pend.</span>
            <span className="text-base font-extrabold text-amber-300">{(stats?.pendientes ?? 0) + (stats?.enProceso ?? 0)}</span>
          </div>
          <div className="px-3 py-2">
            <span className="block text-[9px] uppercase font-bold text-emerald-500">Cobrado</span>
            <span className="text-base font-extrabold text-emerald-300">{(stats?.ingresosCobrados ?? 0).toLocaleString("es-PY")}</span>
          </div>
        </div>
      </section>

      {/* Métricas completas de escritorio */}
      <section className="hidden sm:block px-3.5 sm:px-6 max-w-7xl mx-auto w-full pt-3 pb-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Total Registros</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold font-display text-white">{stats?.total ?? 0}</span>
              <Layers className="w-4 h-4 text-slate-500" />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-amber-400 uppercase tracking-wider">Pendientes</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl sm:text-2xl font-bold font-display text-amber-300">
                {(stats?.pendientes ?? 0) + (stats?.enProceso ?? 0)}
              </span>
              <Clock className="w-4 h-4 text-amber-400/80" />
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-emerald-400 uppercase tracking-wider">Cobrado</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold font-display text-emerald-300 truncate">
                {(stats?.ingresosCobrados ?? 0).toLocaleString("es-PY")} Gs.
              </span>
              <DollarSign className="w-4 h-4 text-emerald-400/80 shrink-0" />
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5">{stats?.pagados ?? 0} vehículo(s)</span>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
            <span className="text-[10px] sm:text-xs font-bold text-rose-400 uppercase tracking-wider">Falta Pagar</span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-lg sm:text-xl font-bold font-display text-rose-300 truncate">
                {(stats?.montoPendienteCobro ?? 0).toLocaleString("es-PY")} Gs.
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-400/80 shrink-0" />
            </div>
            <span className="text-[10px] text-slate-500 mt-0.5">{stats?.faltaPagar ?? 0} pendiente(s)</span>
          </div>
        </div>
      </section>

      {/* Navegación de Vistas y Selector de Fecha */}
      <section className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full py-2 sm:py-2.5 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          {/* Tabs */}
          <div className="hidden sm:flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 w-full sm:w-auto">
            <button
              onClick={() => setActiveTab("calendario")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                activeTab === "calendario"
                  ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Calendario
            </button>
            <button
              onClick={() => setActiveTab("ordenes")}
              className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                activeTab === "ordenes"
                  ? "bg-red-600 text-white shadow-md shadow-red-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Órdenes ({appointments.length})
            </button>
            <button
              onClick={() => setActiveTab("portal_preview")}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                activeTab === "portal_preview"
                  ? "bg-slate-800 text-white border border-slate-700"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Clientes</span>
            </button>
          </div>

          {/* Selector de Fecha */}
          {activeTab === "calendario" && (
            <div className="flex items-center justify-between sm:justify-end gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 w-full sm:w-auto">
              <button
                onClick={() => handleDateShift(-1)}
                className="p-1.5 hover:text-red-400 active:scale-95 text-slate-300 rounded-lg hover:bg-slate-800 touch-manipulation"
                aria-label="Día anterior"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1.5">
                <CalendarIcon className="w-4 h-4 text-red-500" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-100 outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={() => handleDateShift(1)}
                className="p-1.5 hover:text-red-400 active:scale-95 text-slate-300 rounded-lg hover:bg-slate-800 touch-manipulation"
                aria-label="Día siguiente"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className={`sm:hidden p-1.5 rounded-lg touch-manipulation ${
                  showMobileFilters || activeFiltersCount > 0
                    ? "bg-red-600/20 text-red-300"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
                aria-label="Abrir filtros"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                className="text-[11px] font-bold text-red-400 hover:underline px-2 py-1 rounded bg-red-600/10 ml-1 active:scale-95"
              >
                Hoy
              </button>
            </div>
          )}
        </div>

        {/* Buscador y Gatillo de Filtros para Mobile */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, chapa, modelo o zona..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Botón Filtros (Mobile + Desktop) */}
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer active:scale-95 shrink-0 ${
              activeFiltersCount > (searchQuery ? 1 : 0) || showMobileFilters
                ? "bg-red-600/20 border-red-500 text-red-300"
                : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel Desplegable de Filtros */}
        {showMobileFilters && (
          <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-red-400" />
                Filtrar Producción
              </span>
              <button
                onClick={clearFilters}
                className="text-[11px] font-semibold text-slate-400 hover:text-red-400 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Zona</label>
                <select
                  value={cityFilter}
                  onChange={(e) => setCityFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c === "Todas" ? "Todas las zonas" : c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Estado Servicio</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                >
                  {STATUS_OPTIONS.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Estado Cobro</label>
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                >
                  <option value="todos">Todos los cobros</option>
                  <option value="pagado">Pagado</option>
                  <option value="falta_pagar">Falta pagar</option>
                  <option value="sin_definir">Sin definir</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Vehículo</label>
                <select
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                >
                  <option value="todos">Todos los vehículos</option>
                  <option value="auto">Auto (90.000 Gs.)</option>
                  <option value="camioneta">Camioneta (120.000 Gs.)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Segmento</label>
                <select
                  value={clientTypeFilter}
                  onChange={(e) => setClientTypeFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-red-500"
                >
                  <option value="todos">Todos los segmentos</option>
                  <option value="particular">Particular</option>
                  <option value="oficina">Oficina</option>
                  <option value="empresa_flota">Empresa / Flota</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Contenido Principal */}
      <main className="px-3.5 sm:px-6 max-w-7xl mx-auto w-full pb-6 flex-1">
        {/* VISTA 1: CALENDARIO POR FRANJAS */}
        {activeTab === "calendario" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
              <span>Franjas horarias del día</span>
              <span className="font-semibold text-slate-200">{appointments.length} servicio(s) programados</span>
            </div>

            {/* Vista móvil: selector de seis franjas + una sola orden activa */}
            <div className="md:hidden space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {TIME_SLOTS.map((slot) => {
                  const isSelected = selectedSlot === slot;
                  const hasService = appointments.some((appointment) => appointment.timeSlot === slot);
                  return (
                    <button
                      key={slot}
                      onClick={() => setSelectedSlot(slot)}
                      className={`min-h-15 rounded-xl border px-2 py-2 text-left transition-all active:scale-95 touch-manipulation ${
                        isSelected
                          ? "bg-red-600 border-red-500 text-white shadow-md shadow-red-600/30"
                          : hasService
                            ? "bg-slate-800 border-slate-600 text-slate-100"
                            : "bg-slate-900/70 border-slate-800 text-slate-400"
                      }`}
                    >
                      <span className="block text-[11px] font-extrabold leading-tight">{slot.split(" - ")[0]}</span>
                      <span className={`block text-[9px] mt-0.5 font-semibold ${isSelected ? "text-red-100" : hasService ? "text-emerald-400" : "text-slate-500"}`}>
                        {hasService ? "Con servicio" : "Disponible"}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-slate-700 bg-slate-900/95 overflow-hidden shadow-lg">
                <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Clock className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-xs font-extrabold text-white">{selectedSlot}</span>
                  </div>
                  <button
                    onClick={() => handleOpenCreateModal(selectedDate, selectedSlot)}
                    className="inline-flex items-center gap-1 bg-red-600 active:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-xl active:scale-95 touch-manipulation"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    Agendar
                  </button>
                </div>

                {selectedSlotAppointment ? (
                  <div className="p-3.5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] font-mono text-slate-400 block">{selectedSlotAppointment.code}</span>
                        <h3 className="text-base font-extrabold text-white truncate">{selectedSlotAppointment.clientName}</h3>
                        <div className="text-xs text-slate-300 flex items-center gap-1.5 mt-1">
                          {selectedSlotAppointment.vehicleType === "auto" ? <Car className="w-4 h-4 text-blue-400" /> : <Truck className="w-4 h-4 text-purple-400" />}
                          <span className="font-bold truncate">{selectedSlotAppointment.vehicleModel}</span>
                          {selectedSlotAppointment.licensePlate && <span className="font-mono text-[10px] bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 shrink-0">{selectedSlotAppointment.licensePlate}</span>}
                        </div>
                      </div>
                      <div className="shrink-0">{getStatusBadge(selectedSlotAppointment.status)}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5">
                      {STATUS_FLOW.filter((st) => st.value !== "cancelado").map((st) => {
                        const isActive = selectedSlotAppointment.status === st.value;
                        return (
                          <button
                            key={st.value}
                            type="button"
                            disabled={updateStatusMutation.isPending || isActive}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (st.value === "finalizado") {
                                handleInitiateFinalize(selectedSlotAppointment);
                                return;
                              }
                              updateStatusMutation.mutate({
                                id: selectedSlotAppointment.id,
                                status: st.value,
                              });
                            }}
                            className={`min-h-9 px-2 py-1.5 rounded-lg text-[10px] font-bold border touch-manipulation active:scale-95 disabled:opacity-50 ${
                              isActive
                                ? "bg-red-600/25 border-red-500/50 text-red-200"
                                : "bg-slate-950 border-slate-700 text-slate-400"
                            }`}
                          >
                            {st.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 rounded-xl bg-slate-950/70 border border-slate-800 p-2">
                      <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="truncate"><strong className="text-slate-300">{selectedSlotAppointment.cityZone}</strong> · {selectedSlotAppointment.address}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {selectedSlotAppointment.locationUrl ? (
                        <a
                          href={selectedSlotAppointment.locationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold active:scale-95 touch-manipulation"
                        >
                          <Navigation className="w-4 h-4" /> GPS
                        </a>
                      ) : (
                        <button
                          onClick={() => {
                            setSelectedAppointment(selectedSlotAppointment);
                            setIsDetailOpen(true);
                          }}
                          className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold active:scale-95 touch-manipulation"
                        >
                          <Eye className="w-4 h-4" /> Detalle
                        </button>
                      )}
                      <button
                        onClick={() => handleInitiateFinalize(selectedSlotAppointment)}
                        className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 active:bg-red-700 text-white text-xs font-extrabold shadow-md shadow-red-600/30 active:scale-95 touch-manipulation"
                      >
                        <CheckCircle2 className="w-4 h-4" /> {selectedSlotAppointment.status === "finalizado" ? "Cobro" : "Finalizar"}
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-0.5">
                      <span className="text-xs font-extrabold text-red-400 font-display">{selectedSlotAppointment.servicePrice.toLocaleString("es-PY")} Gs.</span>
                      {getPaymentBadge(selectedSlotAppointment.paymentStatus, selectedSlotAppointment.paymentMethod)}
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <Clock className="w-6 h-6 text-slate-600 mx-auto mb-1.5" />
                    <p className="text-xs font-bold text-slate-400">Franja libre</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Tocá “Agendar” para cargar un servicio.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Vista extendida para tablet y escritorio */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {TIME_SLOTS.map((slot) => {
                const slotAppointments = appointments.filter((a) => a.timeSlot === slot);
                const hasAppointments = slotAppointments.length > 0;

                return (
                  <div
                    key={slot}
                    className={`rounded-2xl border p-3.5 sm:p-4 transition-all ${
                      hasAppointments
                        ? "bg-slate-900/90 border-slate-700 shadow-lg"
                        : "bg-slate-950/40 border-slate-800/80"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-800/90 pb-2.5 mb-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-100">
                        <Clock className="w-3.5 h-3.5 text-red-400" />
                        <span>{slot}</span>
                      </div>
                      <button
                        onClick={() => handleOpenCreateModal(selectedDate, slot)}
                        className="text-[11px] font-bold text-red-400 hover:text-red-300 bg-red-600/10 hover:bg-red-600/20 px-2.5 py-1 rounded-lg flex items-center gap-1 active:scale-95 transition-all touch-manipulation cursor-pointer"
                      >
                        <Plus className="w-3 h-3 stroke-[2.5]" />
                        <span>Agendar</span>
                      </button>
                    </div>

                    {hasAppointments ? (
                      <div className="space-y-3">
                        {slotAppointments.map((app) => (
                          <div
                            key={app.id}
                            className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-3.5 hover:border-red-500/80 transition-all shadow-md active:bg-slate-800"
                            onClick={() => {
                              setSelectedAppointment(app);
                              setIsDetailOpen(true);
                            }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <span className="text-[10px] font-mono text-slate-400 block">{app.code}</span>
                                <h3 className="text-sm font-bold text-white truncate">{app.clientName}</h3>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {getStatusBadge(app.status)}
                                {getPaymentBadge(app.paymentStatus, app.paymentMethod)}
                              </div>
                            </div>

                            {/* Lista de vehículos del turno */}
                            <div className="space-y-1 mb-2.5">
                              {parseVehicles(app).map((veh: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs text-slate-200 bg-slate-950/40 px-2 py-1 rounded-lg border border-slate-800/80">
                                  <div className="flex items-center gap-1.5 truncate">
                                    {veh.type === "auto" ? (
                                      <Car className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    ) : (
                                      <Truck className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                    )}
                                    <span className="font-bold text-white truncate">{veh.model}</span>
                                    {veh.plate && (
                                      <span className="text-[9px] font-mono font-bold bg-slate-900 px-1 py-0.2 rounded text-slate-300 border border-slate-700 shrink-0">
                                        {veh.plate}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-1.5">
                                    {veh.type === "auto" ? "Auto" : "Camioneta"}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="text-[11px] text-slate-400 flex items-start gap-1.5 mb-3 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                              <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                              <span className="truncate leading-tight">
                                <strong className="text-slate-300">{app.cityZone}:</strong> {app.address}
                              </span>
                            </div>

                            {/* Acciones Táctiles Mobile */}
                            <div className="flex items-center gap-2 mb-2.5">
                              {app.locationUrl ? (
                                <a
                                  href={app.locationUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 py-2 px-2.5 rounded-xl transition-all active:scale-95 touch-manipulation"
                                >
                                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Abrir GPS</span>
                                </a>
                              ) : (
                                <div className="flex-1 text-[11px] text-slate-500 text-center py-2 bg-slate-950/40 rounded-xl">
                                  Sin GPS
                                </div>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInitiateFinalize(app);
                                }}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-red-600 active:bg-red-700 py-2 px-2.5 rounded-xl border border-slate-600 transition-all active:scale-95 touch-manipulation cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{app.status === "finalizado" ? "Cobro" : "Finalizar"}</span>
                              </button>
                            </div>

                            <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs">
                              <span className="font-extrabold text-red-400 font-display text-sm">
                                {app.servicePrice.toLocaleString("es-PY")} Gs.
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                {app.clientType === "particular"
                                  ? "Particular"
                                  : app.companyName || "Empresa"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-600">
                        Franja libre disponible
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VISTA 2: LISTA DE ÓRDENES */}
        {activeTab === "ordenes" && (
          <div className="space-y-3">
            {/* Mobile: Tarjetas táctiles */}
            <div className="block lg:hidden space-y-3">
              {appointments.map((app) => (
                <div
                  key={app.id}
                  onClick={() => {
                    setSelectedAppointment(app);
                    setIsDetailOpen(true);
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2.5 cursor-pointer hover:border-slate-700 active:bg-slate-800 shadow-md"
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-mono text-slate-400">{app.code}</span>
                      <h3 className="text-sm font-bold text-white truncate">{app.clientName}</h3>
                      <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{app.clientPhone}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getStatusBadge(app.status)}
                      {getPaymentBadge(app.paymentStatus, app.paymentMethod)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 flex items-center gap-1.5">
                    {app.vehicleType === "auto" ? (
                      <Car className="w-4 h-4 text-blue-400 shrink-0" />
                    ) : (
                      <Truck className="w-4 h-4 text-purple-400 shrink-0" />
                    )}
                    <span className="font-bold text-white">{app.vehicleModel}</span>
                    {app.licensePlate && (
                      <span className="text-[10px] font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                        {app.licensePlate}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 flex items-start gap-1.5 bg-slate-950/60 p-2 rounded-xl border border-slate-800/80">
                    <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span className="truncate">
                      <strong className="text-slate-300">{app.cityZone}:</strong> {app.address}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {app.locationUrl && (
                      <a
                        href={app.locationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 py-2 rounded-xl active:scale-95 touch-manipulation"
                      >
                        <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                        <span>GPS</span>
                      </a>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInitiateFinalize(app);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-white bg-red-600 hover:bg-red-700 py-2 rounded-xl active:scale-95 shadow-md shadow-red-600/20 touch-manipulation cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{app.status === "finalizado" ? "Ver Cobro" : "Finalizar..."}</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400">{app.scheduledDate} · {app.timeSlot}</span>
                    <span className="font-extrabold text-red-400 font-display text-sm">
                      {app.servicePrice.toLocaleString("es-PY")} Gs.
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Tabla */}
            <div className="hidden lg:block overflow-x-auto border border-slate-800 rounded-2xl bg-slate-900/50">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Fecha y Hora</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Vehículo</th>
                    <th className="px-4 py-3">Ubicación y Enlace</th>
                    <th className="px-4 py-3">Precio</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Cobro</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {appointments.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-slate-300">{app.code}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{app.scheduledDate}</div>
                        <div className="text-[11px] text-slate-500">{app.timeSlot}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{app.clientName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5" /> {app.clientPhone}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{app.vehicleModel}</div>
                        <div className="text-[11px] text-slate-500 capitalize">
                          {app.vehicleType} {app.licensePlate ? `· ${app.licensePlate}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-red-400">{app.cityZone}</div>
                        <div className="text-[11px] text-slate-400 max-w-[180px] truncate">{app.address}</div>
                        {app.locationUrl && (
                          <a
                            href={app.locationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline mt-0.5"
                          >
                            <Navigation className="w-3 h-3" />
                            <span>Abrir mapa</span>
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-3 font-bold text-white font-display">
                        {app.servicePrice.toLocaleString("es-PY")} Gs.
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(app.status)}</td>
                      <td className="px-4 py-3">{getPaymentBadge(app.paymentStatus, app.paymentMethod)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleInitiateFinalize(app)}
                          className="text-xs text-red-400 hover:text-red-300 font-bold hover:underline"
                        >
                          {app.status === "finalizado" ? "Cobro" : "Finalizar..."}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VISTA 3: PREVIEW PORTAL CLIENTES */}
        {activeTab === "portal_preview" && (
          <div className="max-w-2xl mx-auto space-y-4 pt-1">
            {/* Directorio de Clientes y RUC para Facturación */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-400 tracking-wider">
                  <Receipt className="w-4 h-4" />
                  <span>Clientes y RUC de Facturación</span>
                </div>
                <span className="text-[10px] text-slate-400">Recurrentes</span>
              </div>
              <p className="text-xs text-slate-300">
                A medida que cargás servicios, el sistema recuerda los datos y RUC para autocompletar automáticamente los siguientes pedidos.
              </p>

              {allCustomersList.length === 0 ? (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500">
                  Aún no hay clientes registrados. Se guardarán automáticamente con cada servicio creado.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                  {allCustomersList.map((cust: any) => (
                    <div
                      key={cust.id || cust.phoneKey}
                      className="bg-slate-950 border border-slate-800 p-3 rounded-2xl space-y-1"
                    >
                      <div className="font-bold text-xs text-white">{cust.clientName}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{cust.clientPhone}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
                        <span className="text-slate-500">RUC:</span>
                        <span className="font-mono font-bold text-amber-300">
                          {cust.clientTaxId || "Sin RUC"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-slate-900 border border-red-500/30 rounded-3xl p-5 sm:p-6 shadow-xl">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-red-400 tracking-wider mb-2">
                <Sparkles className="w-4 h-4" />
                <span>Autoagendamiento de Clientes</span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white mb-2">
                Reserva a Domicilio 555 Detail Studio
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Tus clientes eligen fecha, franja y pegan directamente su link de Google Maps o Waze. El pedido impacta al instante en esta agenda operativa.
              </p>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-300">Tarifas Oficiales</div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="p-3 rounded-xl border border-red-600/50 bg-red-600/10">
                    <Car className="w-6 h-6 text-red-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white">Auto</div>
                    <div className="text-base font-extrabold text-red-400">90.000 Gs.</div>
                  </div>
                  <div className="p-3 rounded-xl border border-slate-800 bg-slate-900">
                    <Truck className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-white">Camioneta</div>
                    <div className="text-base font-extrabold text-slate-200">120.000 Gs.</div>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenCreateModal()}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-lg shadow-red-600/30 cursor-pointer active:scale-95 touch-manipulation"
                >
                  Probar Reserva con GPS
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Barra de Acciones Flotante Fija en Celulares */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#080d1a]/95 backdrop-blur-md border-t border-slate-800/90 px-4 py-2.5 flex items-center justify-between gap-3">
        <button
          onClick={() => setActiveTab("calendario")}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold ${
            activeTab === "calendario" ? "text-red-400" : "text-slate-400"
          }`}
        >
          <CalendarIcon className="w-4 h-4 mb-0.5" />
          <span>Agenda</span>
        </button>

        <button
          onClick={() => handleOpenCreateModal()}
          className="flex items-center justify-center gap-1.5 bg-red-600 active:bg-red-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-2xl shadow-lg shadow-red-600/40 active:scale-95 touch-manipulation cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Agendar</span>
        </button>

        <button
          onClick={() => setActiveTab("ordenes")}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold ${
            activeTab === "ordenes" ? "text-red-400" : "text-slate-400"
          }`}
        >
          <Layers className="w-4 h-4 mb-0.5" />
          <span>Órdenes</span>
        </button>
      </div>

      {/* MODAL: FINALIZAR SERVICIO Y REGISTRAR COBRO */}
      {isFinalizeModalOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl relative max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <div>
                <span className="text-[10px] font-mono text-red-400">{selectedAppointment.code}</span>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Finalizar y Cobro
                </h3>
              </div>
              <button
                onClick={() => setIsFinalizeModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-between items-center">
                <div>
                  <div className="font-bold text-white text-sm">{selectedAppointment.clientName}</div>
                  <div className="text-slate-400">{selectedAppointment.vehicleModel}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase text-slate-400 block">Total a Cobrar</span>
                  <span className="text-base font-extrabold text-emerald-400 font-display">
                    {selectedAppointment.servicePrice.toLocaleString("es-PY")} Gs.
                  </span>
                </div>
              </div>

              {/* Paso 1: Estado de Cobro */}
              <div>
                <label className="block text-[11px] font-bold text-slate-200 mb-1.5">
                  1. Estado de Cobro *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFinalizeData((prev) => ({ ...prev, paymentStatus: "pagado" }))}
                    className={`py-3 px-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 touch-manipulation ${
                      finalizeData.paymentStatus === "pagado"
                        ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Pagado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFinalizeData((prev) => ({ ...prev, paymentStatus: "falta_pagar" }))}
                    className={`py-3 px-3 rounded-2xl border font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 touch-manipulation ${
                      finalizeData.paymentStatus === "falta_pagar"
                        ? "bg-rose-600/20 border-rose-500 text-rose-300 shadow-md shadow-rose-500/10"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Falta Pagar</span>
                  </button>
                </div>
              </div>

              {/* Paso 2: Si está Pagado */}
              {finalizeData.paymentStatus === "pagado" && (
                <div className="space-y-3 pt-2 border-t border-slate-800/80">
                  <label className="block text-[11px] font-bold text-slate-200">
                    2. Modalidad Declarada *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFinalizeData((prev) => ({ ...prev, paymentMethod: "efectivo" }))}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer active:scale-95 touch-manipulation ${
                        finalizeData.paymentMethod === "efectivo"
                          ? "bg-slate-800 border-red-500 text-white shadow"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-0.5">
                        <Banknote className="w-4 h-4 text-emerald-400" />
                        <span>En Efectivo</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Cobro de dinero físico en mano
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFinalizeData((prev) => ({ ...prev, paymentMethod: "comprobante_digital" }))}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer active:scale-95 touch-manipulation ${
                        finalizeData.paymentMethod === "comprobante_digital"
                          ? "bg-slate-800 border-red-500 text-white shadow"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white mb-0.5">
                        <Receipt className="w-4 h-4 text-blue-400" />
                        <span>Transferencia / QR</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Exige foto de comprobante
                      </p>
                    </button>
                  </div>

                  {finalizeData.paymentMethod === "comprobante_digital" && (
                    <div className="bg-slate-950 p-3.5 rounded-2xl border border-blue-500/40 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                          <UploadCloud className="w-4 h-4 text-blue-400" />
                          Foto o Comprobante Digital *
                        </span>
                        <span className="text-[10px] text-slate-500">Max 8MB</span>
                      </div>

                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/*,application/pdf"
                        capture="environment"
                        onChange={handleReceiptFileChange}
                        className="hidden"
                      />

                      {finalizeData.paymentReceiptUrl ? (
                        <div className="bg-slate-900 border border-emerald-500/50 rounded-xl p-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-xs font-medium text-white truncate">
                              {finalizeData.paymentReceiptName || "Comprobante cargado"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={finalizeData.paymentReceiptUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-bold text-emerald-400 hover:underline px-2 py-1 rounded bg-emerald-500/10 flex items-center gap-1"
                            >
                              <Eye className="w-3 h-3" /> Ver
                            </a>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="text-[11px] text-slate-400 hover:text-white px-2 py-1"
                            >
                              Cambiar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={finalizeData.isUploading}
                          className="w-full border-2 border-dashed border-blue-500/40 hover:border-blue-500 bg-blue-500/5 hover:bg-blue-500/10 p-4 rounded-2xl text-center cursor-pointer transition-all active:scale-98 touch-manipulation"
                        >
                          <UploadCloud className="w-6 h-6 text-blue-400 mx-auto mb-1" />
                          <div className="text-xs font-bold text-white">
                            {finalizeData.isUploading ? "Cargando archivo..." : "Tomar foto o subir captura"}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Requerido para validar la rendición en caja
                          </p>
                        </button>
                      )}
                    </div>
                  )}

                  {finalizeData.paymentMethod === "efectivo" && (
                    <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-2xl p-3 text-xs text-emerald-300 flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Declaración en Efectivo:</strong> Dejas constancia de que el cliente entregó en mano los {selectedAppointment.servicePrice.toLocaleString("es-PY")} Gs.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Botones */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFinalizeModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmFinalize}
                  disabled={finalizeMutation.isPending || finalizeData.isUploading}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-5 py-3 rounded-2xl transition-all shadow-lg shadow-red-600/30 active:scale-95 cursor-pointer touch-manipulation"
                >
                  {finalizeMutation.isPending ? "Registrando..." : "Confirmar Cierre"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ALTA / EDICIÓN DE SERVICIO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl relative max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5">
                  {editingAppointmentId ? (
                    <Pencil className="w-4 h-4 text-red-500" />
                  ) : (
                    <Plus className="w-4 h-4 text-red-500" />
                  )}
                  {editingAppointmentId ? "Editar Reserva" : "Alta de Servicio a Domicilio"}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {editingAppointmentId
                    ? "Podés cambiar fecha, horario, cliente, vehículos y dirección"
                    : "555 Detail Studio"}
                </p>
              </div>
              <button
                onClick={handleCloseFormModal}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Segmento de Cliente
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, clientType: "particular" })}
                    className={`py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 touch-manipulation ${
                      formData.clientType === "particular"
                        ? "bg-red-600/20 border-red-500 text-red-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Particular
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, clientType: "oficina" })}
                    className={`py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 touch-manipulation ${
                      formData.clientType === "oficina"
                        ? "bg-red-600/20 border-red-500 text-red-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Oficina
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, clientType: "empresa_flota" })}
                    className={`py-2.5 text-xs font-bold rounded-xl border transition-all active:scale-95 touch-manipulation ${
                      formData.clientType === "empresa_flota"
                        ? "bg-red-600/20 border-red-500 text-red-300"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Empresa
                  </button>
                </div>
              </div>

              {formData.clientType !== "particular" && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Empresa / Razón Social
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Distribuidora del Este / Logística S.A."
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Nombre del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Sebastián Gómez"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    WhatsApp de Contacto *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Ej: 0981 123 456"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* RUC / Facturación (Opcional) y Autocompletado Inteligente */}
              <div className="space-y-1.5 bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-300">
                    RUC / Documento de Facturación (Opcional)
                  </label>
                  <span className="text-[10px] text-slate-500 font-semibold">Para factura o recibo</span>
                </div>
                <input
                  type="text"
                  placeholder="Ej: 80012345-6 / 4567890-1"
                  value={formData.clientTaxId}
                  onChange={(e) => setFormData({ ...formData, clientTaxId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
                {customers && customers.length > 0 && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <span className="block text-[10px] uppercase font-bold text-amber-400 mb-1.5">
                      {formData.clientPhone || formData.clientName
                        ? "Cliente recurrente encontrado (tocá para autocompletar):"
                        : "Clientes recientes (tocá para autocompletar):"}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {customers.slice(0, 3).map((cust: any) => (
                        <button
                          key={cust.id || cust.phoneKey}
                          type="button"
                          onClick={() => handleSelectCustomerSuggestion(cust)}
                          className="text-left text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-700/80 px-2.5 py-1.5 rounded-xl text-slate-200 transition-all active:scale-95 touch-manipulation"
                        >
                          <span className="font-bold text-white block">{cust.clientName}</span>
                          <span className="text-[10px] text-slate-400">
                            {cust.clientPhone}{cust.clientTaxId ? ` · RUC: ${cust.clientTaxId}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sección de Vehículos: Permite 1 o más vehículos */}
              <div className="space-y-2.5 bg-slate-950/70 p-3 sm:p-3.5 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-200">
                      Vehículos a Lavar ({formVehicles.length}) *
                    </label>
                    <span className="text-[10px] text-slate-400 block">
                      Auto: 90.000 Gs. · Camioneta: 120.000 Gs.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setFormVehicles((prev) => [
                        ...prev,
                        { id: "v" + (prev.length + 1) + "_" + Date.now(), type: "auto", model: "", plate: "" },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/40 text-[11px] font-bold transition-all active:scale-95 touch-manipulation cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Agregar Vehículo</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {formVehicles.map((vehicle, index) => (
                    <div
                      key={vehicle.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-2 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-red-400">
                          Vehículo #{index + 1}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-extrabold text-slate-300">
                            {vehicle.type === "auto" ? "90.000 Gs." : "120.000 Gs."}
                          </span>
                          {formVehicles.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setFormVehicles((prev) => prev.filter((v) => v.id !== vehicle.id))}
                              className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 touch-manipulation"
                              title="Quitar vehículo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Selector de Tipo */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setFormVehicles((prev) =>
                              prev.map((v) => (v.id === vehicle.id ? { ...v, type: "auto" } : v))
                            )
                          }
                          className={`py-1.5 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all touch-manipulation ${
                            vehicle.type === "auto"
                              ? "bg-red-600/20 border-red-500 text-red-300"
                              : "bg-slate-950 border-slate-800 text-slate-400"
                          }`}
                        >
                          <Car className="w-3.5 h-3.5" />
                          <span>Auto (90k)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setFormVehicles((prev) =>
                              prev.map((v) => (v.id === vehicle.id ? { ...v, type: "camioneta" } : v))
                            )
                          }
                          className={`py-1.5 px-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all touch-manipulation ${
                            vehicle.type === "camioneta"
                              ? "bg-red-600/20 border-red-500 text-red-300"
                              : "bg-slate-950 border-slate-800 text-slate-400"
                          }`}
                        >
                          <Truck className="w-3.5 h-3.5" />
                          <span>Camioneta (120k)</span>
                        </button>
                      </div>

                      {/* Modelo y Chapa */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Modelo (ej: Kia Rio blanco)"
                          value={vehicle.model}
                          onChange={(e) =>
                            setFormVehicles((prev) =>
                              prev.map((v) => (v.id === vehicle.id ? { ...v, model: e.target.value } : v))
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                        />
                        <input
                          type="text"
                          placeholder="Chapa (opcional)"
                          value={vehicle.plate}
                          onChange={(e) =>
                            setFormVehicles((prev) =>
                              prev.map((v) => (v.id === vehicle.id ? { ...v, plate: e.target.value } : v))
                            )
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-semibold">Total Consolidado ({formVehicles.length} vehículos):</span>
                  <span className="text-sm sm:text-base font-extrabold text-red-400 font-display">
                    {totalCalculatedPrice.toLocaleString("es-PY")} Gs.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Ciudad *
                  </label>
                  <select
                    value={formData.cityZone}
                    onChange={(e) => setFormData({ ...formData, cityZone: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Asuncion">Asunción</option>
                    <option value="Luque">Luque</option>
                    <option value="Mariano Roque Alonso">Mariano Roque Alonso</option>
                    <option value="San Lorenzo">San Lorenzo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Dirección Escrita *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Calle, número de casa, barrio"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/40 space-y-1">
                <label className="block text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5" />
                  URL de Ubicación GPS (Google Maps / Waze)
                </label>
                <input
                  type="url"
                  placeholder="Pegá el link de Maps o Waze..."
                  value={formData.locationUrl}
                  onChange={(e) => setFormData({ ...formData, locationUrl: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Fecha del Lavado *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.scheduledDate}
                    onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1">
                    Horario Asignado *
                  </label>
                  <select
                    value={formData.timeSlot}
                    onChange={(e) => setFormData({ ...formData, timeSlot: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Indicaciones para el Móvil (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ej: Portón negro, garaje con techo, llevar alargue..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseFormModal}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white touch-manipulation"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-6 py-3 rounded-2xl transition-all shadow-lg shadow-red-600/30 flex items-center gap-1.5 cursor-pointer active:scale-95 touch-manipulation"
                >
                  {editingAppointmentId
                    ? updateMutation.isPending
                      ? "Guardando..."
                      : "Guardar Cambios"
                    : createMutation.isPending
                      ? "Agendando..."
                      : "Confirmar Servicio"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DETALLE DE SERVICIO */}
      {isDetailOpen && selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-t-3xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl relative max-h-[92vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <div>
                <span className="text-[10px] font-mono text-red-400">{selectedAppointment.code}</span>
                <h3 className="text-sm sm:text-base font-bold text-white">Detalle de Producción</h3>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-400 font-semibold">Estado del servicio</span>
                  {getStatusBadge(selectedAppointment.status)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {STATUS_FLOW.map((st) => {
                    const isActive = selectedAppointment.status === st.value;
                    return (
                      <button
                        key={st.value}
                        type="button"
                        disabled={updateStatusMutation.isPending || isActive}
                        onClick={() => {
                          if (st.value === "finalizado") {
                            handleInitiateFinalize(selectedAppointment);
                            return;
                          }
                          updateStatusMutation.mutate({
                            id: selectedAppointment.id,
                            status: st.value,
                          });
                        }}
                        className={`min-h-10 px-2 py-2 rounded-xl text-[11px] font-bold border transition-all active:scale-95 touch-manipulation disabled:opacity-60 ${
                          isActive
                            ? "bg-red-600/20 border-red-500/50 text-red-200"
                            : "bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {st.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-500 leading-snug">
                  Podés pasar por Pendiente → Confirmado → En camino → En proceso. “Finalizado” abre el cobro.
                </p>
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Cliente:</span>
                  <span className="font-bold text-white">{selectedAppointment.clientName}</span>
                </div>
                {selectedAppointment.clientTaxId && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">RUC / Facturación:</span>
                    <span className="font-mono font-bold text-amber-300">{selectedAppointment.clientTaxId}</span>
                  </div>
                )}
                {selectedAppointment.companyName && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Razón Social:</span>
                    <span className="text-slate-200">{selectedAppointment.companyName}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">WhatsApp:</span>
                  <a
                    href={`https://wa.me/595${selectedAppointment.clientPhone.replace(/\D/g, "").replace(/^0/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-bold text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <span>{selectedAppointment.clientPhone}</span>
                    <Share2 className="w-3 h-3" />
                  </a>
                </div>
              </div>

                  <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                      <span className="text-slate-400 font-semibold">Vehículos ({parseVehicles(selectedAppointment).length}):</span>
                      <span className="font-extrabold text-red-400 font-display text-sm">
                        Total: {selectedAppointment.servicePrice.toLocaleString("es-PY")} Gs.
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {parseVehicles(selectedAppointment).map((veh: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
                          <div className="flex items-center gap-1.5 text-xs text-white">
                            {veh.type === "auto" ? <Car className="w-3.5 h-3.5 text-red-400" /> : <Truck className="w-3.5 h-3.5 text-red-400" />}
                            <span className="font-bold">{veh.model}</span>
                            {veh.plate && <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">{veh.plate}</span>}
                          </div>
                          <span className="text-xs font-bold text-slate-300">
                            {veh.type === "auto" ? "90.000 Gs." : "120.000 Gs."}
                          </span>
                        </div>
                      ))}
                    </div>
                <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                  <span className="text-slate-400">Cobro:</span>
                  <div>{getPaymentBadge(selectedAppointment.paymentStatus, selectedAppointment.paymentMethod) || <span className="text-slate-500">Pendiente de cierre</span>}</div>
                </div>
                {selectedAppointment.paymentReceiptUrl && (
                  <div className="pt-1">
                    <a
                      href={selectedAppointment.paymentReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Ver Comprobante Digital</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>

              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Zona:</span>
                  <span className="font-bold text-red-400">{selectedAppointment.cityZone}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">Dirección:</span>
                  <span className="text-slate-200">{selectedAppointment.address}</span>
                </div>
                {selectedAppointment.locationUrl && (
                  <div className="pt-2 border-t border-slate-800">
                    <a
                      href={selectedAppointment.locationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 touch-manipulation"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Abrir Ubicación GPS</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Confirmación limitada para el cliente: no muestra dirección, GPS, notas ni estado de cobro */}
              <div className="bg-gradient-to-br from-red-950/35 to-slate-950 p-3 rounded-2xl border border-red-500/30 space-y-2.5">
                <div className="flex items-start gap-2">
                  <FileCheck className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-bold text-xs text-white">Confirmación para el Cliente</div>
                    <p className="text-[10px] text-slate-400 leading-snug">
                      Incluye pedido, fecha, zona, vehículos y total. No incluye datos internos ni ubicación exacta.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadConfirmation(selectedAppointment)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation"
                  >
                    <FileCheck className="w-3.5 h-3.5 text-red-400" />
                    <span>Descargar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareConfirmation(selectedAppointment)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-red-600/20 transition-all active:scale-95 touch-manipulation"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Compartir PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWhatsAppConfirmation(selectedAppointment)}
                    className="min-h-11 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all active:scale-95 touch-manipulation"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Texto WhatsApp</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleOpenEditModal(selectedAppointment)}
                className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 active:scale-95 touch-manipulation cursor-pointer"
              >
                <Pencil className="w-4 h-4 text-red-400" />
                <span>Editar Reserva</span>
              </button>

              <button
                onClick={() => handleInitiateFinalize(selectedAppointment)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 active:scale-95 touch-manipulation cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{selectedAppointment.status === "finalizado" ? "Ver o Editar Cobro" : "Finalizar Servicio y Cobro"}</span>
              </button>

              <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                <button
                  onClick={() => {
                    if (confirm("¿Estás seguro de eliminar este registro?")) {
                      deleteMutation.mutate({ id: selectedAppointment.id });
                    }
                  }}
                  className="text-red-400 hover:text-red-300 text-xs flex items-center gap-1 py-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>

                <button
                  onClick={() => setIsDetailOpen(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-2 rounded-xl text-xs active:scale-95"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
