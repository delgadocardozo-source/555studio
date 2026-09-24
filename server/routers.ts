import { COOKIE_NAME } from "@shared/const";
import {
  buildTimeSlot,
  durationForVehicles,
  fitsInWorkday,
  formatDuration,
  getSlotStart,
} from "@shared/scheduling";
import { z } from "zod";
import { put as putBlob } from "@vercel/blob";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import * as db from "./db";

async function assertScheduleAvailable(params: {
  scheduledDate: string;
  timeSlot: string;
  vehicleCount: number;
  excludeId?: number;
}) {
  const start = getSlotStart(params.timeSlot);
  const normalizedSlot = buildTimeSlot(start, params.vehicleCount);

  if (!fitsInWorkday(start, params.vehicleCount)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `El lavado de ${params.vehicleCount} vehículo(s) (${formatDuration(durationForVehicles(params.vehicleCount))}) no entra en la jornada 08:00–18:00 partiendo de ${start}.`,
    });
  }

  const overlaps = await db.findOverlappingAppointments({
    scheduledDate: params.scheduledDate,
    timeSlot: normalizedSlot,
    excludeId: params.excludeId,
  });

  if (overlaps.length > 0) {
    const conflict = overlaps[0];
    throw new TRPCError({
      code: "CONFLICT",
      message: `Horario ocupado: se solapa con ${conflict.clientName} (${conflict.timeSlot}). Cada vehículo requiere 1h 20min.`,
    });
  }

  return normalizedSlot;
}

const vehicleItemInputSchema = z.object({
  type: z.enum(["auto", "camioneta"]),
  model: z.string().min(2, "Modelo o marca del vehículo requerido"),
  plate: z.string().optional().nullable(),
});

const appointmentInputSchema = z.object({
  clientName: z.string().min(2, "El nombre del cliente es obligatorio"),
  clientPhone: z.string().min(6, "El teléfono de contacto es obligatorio"),
  clientType: z.enum(["particular", "oficina", "empresa_flota"]).default("particular"),
  companyName: z.string().optional().nullable(),
  clientTaxId: z.string().optional().nullable(), // RUC opcional
  // Compatible con llamadas directas anteriores de un solo vehículo
  vehicleType: z.enum(["auto", "camioneta"]).optional(),
  vehicleModel: z.string().optional(),
  licensePlate: z.string().optional().nullable(),
  // Lista de vehículos para clientes con más de un auto/camioneta
  vehicles: z.array(vehicleItemInputSchema).min(1, "Debe cargar al menos un vehículo").optional(),
  servicePrice: z.number().int().positive().optional(),
  cityZone: z.enum(["Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"]),
  address: z.string().min(3, "La dirección exacta es requerida"),
  locationUrl: z.string().optional().nullable(),
  addressReference: z.string().optional().nullable(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  timeSlot: z.string().min(3, "Franja horaria requerida"),
  notes: z.string().optional().nullable(),
  source: z.enum(["interno_manual", "portal_cliente"]).default("interno_manual"),
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  appointments: router({
    list: publicProcedure
      .input(
        z.object({
          date: z.string().optional(),
          month: z.string().optional(),
          status: z.enum(["pendiente", "confirmado", "en_camino", "en_proceso", "finalizado", "cancelado"]).optional(),
          paymentStatus: z.enum(["sin_definir", "pagado", "falta_pagar"]).optional(),
          cityZone: z.enum(["Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"]).optional(),
          vehicleType: z.enum(["auto", "camioneta"]).optional(),
          clientType: z.enum(["particular", "oficina", "empresa_flota"]).optional(),
          search: z.string().optional(),
        }).optional()
      )
      .query(async ({ input }) => await db.listAppointments(input)),

    getById: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .query(async ({ input }) => await db.getAppointmentById(input.id)),

    create: publicProcedure
      .input(appointmentInputSchema)
      .mutation(async ({ input }) => {
        const rawList = input.vehicles && input.vehicles.length > 0
          ? input.vehicles
          : [
              {
                type: input.vehicleType || "auto",
                model: input.vehicleModel || "Vehículo sin modelo",
                plate: input.licensePlate || null,
              },
            ];

        const computedVehicles = rawList.map((v) => ({
          type: v.type,
          model: v.model.trim(),
          plate: v.plate?.trim() || null,
          price: v.type === "auto" ? 90000 : 120000,
        }));

        const totalServicePrice = computedVehicles.reduce((acc, curr) => acc + curr.price, 0);
        const primary = computedVehicles[0];
        const normalizedTimeSlot = await assertScheduleAvailable({
          scheduledDate: input.scheduledDate,
          timeSlot: input.timeSlot,
          vehicleCount: computedVehicles.length,
        });

        // Guarda o actualiza la ficha del cliente de forma automática para reservas recurrentes
        await db.upsertCustomerProfile({
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          clientType: input.clientType,
          companyName: input.companyName ?? null,
          clientTaxId: input.clientTaxId?.trim() ? input.clientTaxId.trim() : null,
        });

        return await db.createAppointment({
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          clientType: input.clientType,
          companyName: input.companyName ?? null,
          clientTaxId: input.clientTaxId?.trim() ? input.clientTaxId.trim() : null,
          vehicleType: primary.type,
          vehicleModel: primary.model,
          licensePlate: primary.plate,
          vehicleCount: computedVehicles.length,
          vehicles: JSON.stringify(computedVehicles),
          servicePrice: totalServicePrice,
          cityZone: input.cityZone,
          address: input.address,
          locationUrl: input.locationUrl?.trim() ? input.locationUrl.trim() : null,
          addressReference: input.addressReference ?? null,
          scheduledDate: input.scheduledDate,
          timeSlot: normalizedTimeSlot,
          notes: input.notes ?? null,
          status: "pendiente",
          paymentStatus: "sin_definir",
          source: input.source || "interno_manual",
        });
      }),

    updateStatus: publicProcedure
      .input(z.object({ id: z.number().int(), status: z.enum(["pendiente", "confirmado", "en_camino", "en_proceso", "finalizado", "cancelado"]) }))
      .mutation(async ({ input }) => await db.updateAppointmentStatus(input.id, input.status)),

    finalizeWithPayment: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          paymentStatus: z.enum(["pagado", "falta_pagar"]),
          paymentMethod: z.enum(["efectivo", "comprobante_digital"]).optional(),
          paymentReceiptUrl: z.string().optional().nullable(),
          paymentReceiptName: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input }) => await db.finalizeAppointmentWithPayment(input)),

    // Comprobantes en Vercel Blob (producción) o Manus Storage (workspace actual)
    uploadReceipt: publicProcedure
      .input(z.object({ fileName: z.string(), contentType: z.string(), base64Data: z.string() }))
      .mutation(async ({ input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        const safeName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `555-detail-agenda/receipts/${Date.now()}-${safeName}`;

        if (process.env.BLOB_READ_WRITE_TOKEN) {
          const stored = await putBlob(key, buffer, {
            access: "private",
            contentType: input.contentType || "application/octet-stream",
          });
          return { key: stored.pathname, url: stored.url };
        }

        const stored = await storagePut(key, buffer, input.contentType || "application/octet-stream");
        return { key: stored.key, url: stored.url };
      }),

    update: publicProcedure
      .input(z.object({ id: z.number().int(), data: appointmentInputSchema.partial() }))
      .mutation(async ({ input }) => {
        const { vehicles, clientTaxId, ...rest } = input.data;
        const payload: any = { ...rest };
        if (clientTaxId !== undefined) {
          payload.clientTaxId = clientTaxId?.trim() ? clientTaxId.trim() : null;
        }
        if (vehicles) {
          const computed = vehicles.map((v) => ({
            type: v.type,
            model: v.model.trim(),
            plate: v.plate?.trim() || null,
            price: v.type === "auto" ? 90000 : 120000,
          }));
          payload.vehicles = JSON.stringify(computed);
          payload.vehicleCount = computed.length;
          payload.servicePrice = computed.reduce((acc, curr) => acc + curr.price, 0);
          if (computed[0]) {
            payload.vehicleType = computed[0].type;
            payload.vehicleModel = computed[0].model;
            payload.licensePlate = computed[0].plate;
          }
        }

        const existing = await db.getAppointmentById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
        }

        const nextDate = payload.scheduledDate || existing.scheduledDate;
        const nextVehicleCount =
          payload.vehicleCount != null
            ? Number(payload.vehicleCount)
            : Number(existing.vehicleCount) || 1;
        const nextSlotInput = payload.timeSlot || existing.timeSlot;
        payload.timeSlot = await assertScheduleAvailable({
          scheduledDate: nextDate,
          timeSlot: nextSlotInput,
          vehicleCount: nextVehicleCount,
          excludeId: input.id,
        });

        if (input.data.clientPhone && input.data.clientName) {
          await db.upsertCustomerProfile({
            clientName: input.data.clientName,
            clientPhone: input.data.clientPhone,
            clientType: (input.data.clientType as any) || "particular",
            companyName: input.data.companyName ?? null,
            clientTaxId: input.data.clientTaxId?.trim() ? input.data.clientTaxId.trim() : null,
          });
        }
        return await db.updateAppointmentDetails(input.id, payload);
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => await db.deleteAppointment(input.id)),

    stats: publicProcedure.query(async () => await db.getDashboardStats()),
  }),

  customers: router({
    search: publicProcedure
      .input(z.object({ query: z.string().optional() }))
      .query(async ({ input }) => await db.searchCustomers(input.query || "")),

    findByPhone: publicProcedure
      .input(z.object({ phone: z.string() }))
      .query(async ({ input }) => await db.findCustomerByPhone(input.phone)),

    upsert: publicProcedure
      .input(
        z.object({
          clientName: z.string().min(2),
          clientPhone: z.string().min(6),
          clientType: z.enum(["particular", "oficina", "empresa_flota"]).default("particular"),
          companyName: z.string().optional().nullable(),
          clientTaxId: z.string().optional().nullable(),
        })
      )
      .mutation(async ({ input }) => await db.upsertCustomerProfile(input)),
  }),
});

export type AppRouter = typeof appRouter;
