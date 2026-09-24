import { COOKIE_NAME } from "@shared/const";
import {
  appointmentVehicleCount,
  buildTimeSlot,
  durationForVehicles,
  fitsInWorkday,
  formatDuration,
  getSlotStart,
  planMoveWithPush,
  ScheduleItem,
} from "@shared/scheduling";
import { z } from "zod";
import { issueSignedToken, put as putBlob, presignUrl } from "@vercel/blob";
import { TRPCError } from "@trpc/server";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { storagePut } from "./storage";
import * as db from "./db";
import * as cashDb from "./cashLedgerDb";

function isPrivateVercelBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

function pathnameFromBlobUrl(url: string): string {
  const { pathname } = new URL(url);
  return decodeURIComponent(pathname.replace(/^\//, ""));
}

/** Public blobs open as-is; private blobs need a short-lived signed GET URL. */
async function resolveReceiptViewUrl(url: string): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN || !isPrivateVercelBlobUrl(url)) {
    return url;
  }

  const pathname = pathnameFromBlobUrl(url);
  if (!pathname.startsWith("555-detail-agenda/receipts/")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "URL de comprobante inválida",
    });
  }

  try {
    const token = await issueSignedToken({
      pathname,
      operations: ["get"],
      validUntil: Date.now() + 60 * 60 * 1000,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname,
      access: "private",
      validUntil: Date.now() + 15 * 60 * 1000,
    });
    return presignedUrl;
  } catch (err: any) {
    console.error("[receipts] No se pudo firmar URL privada:", err?.message || err);
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No se pudo generar el enlace del comprobante",
    });
  }
}

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
      message: `El lavado de ${params.vehicleCount} vehículo(s) (${formatDuration(durationForVehicles(params.vehicleCount))}) no se puede agarrar a las ${start}. Se aceptan inicios de 07:30 a 18:00 (puede terminar después).`,
    });
  }

  const overlaps = await db.findOverlappingAppointments({
    scheduledDate: params.scheduledDate,
    timeSlot: normalizedSlot,
    excludeId: params.excludeId,
  });

  if (overlaps.length > 0) {
    const names = overlaps
      .slice(0, 3)
      .map((c) => `${c.clientName} (${c.timeSlot})`)
      .join("; ");
    const extra = overlaps.length > 3 ? ` y ${overlaps.length - 3} más` : "";
    throw new TRPCError({
      code: "CONFLICT",
      message: `Horario ocupado: se solapa con ${names}${extra}. Cada vehículo requiere 1h 20min — elegí otro inicio o mové el turno que choca.`,
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

        const catalogVehicles = rawList.map((v) => ({
          type: v.type,
          model: v.model.trim(),
          plate: v.plate?.trim() || null,
          price: v.type === "auto" ? 90000 : 120000,
        }));

        const catalogTotal = catalogVehicles.reduce((acc, curr) => acc + curr.price, 0);
        const totalServicePrice =
          input.servicePrice != null && input.servicePrice > 0 ? input.servicePrice : catalogTotal;

        // Si el total es custom, repartimos en el primer vehículo y dejamos el resto en 0
        // para que la suma coincida con lo cobrado (auditoría simple).
        const computedVehicles =
          totalServicePrice === catalogTotal
            ? catalogVehicles
            : catalogVehicles.map((v, idx) =>
                idx === 0 ? { ...v, price: totalServicePrice } : { ...v, price: 0 }
              );

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

    // Comprobantes en Vercel Blob (producción) o Manus Storage (workspace actual).
    // Blob privado: el navegador no puede abrir la URL cruda (Forbidden).
    // Usar getReceiptUrl para obtener un enlace firmado de corta duración.
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

    getReceiptUrl: publicProcedure
      .input(z.object({ url: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const viewUrl = await resolveReceiptViewUrl(input.url);
        return { url: viewUrl };
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
          const catalog = vehicles.map((v) => ({
            type: v.type,
            model: v.model.trim(),
            plate: v.plate?.trim() || null,
            price: v.type === "auto" ? 90000 : 120000,
          }));
          const catalogTotal = catalog.reduce((acc, curr) => acc + curr.price, 0);
          const total =
            input.data.servicePrice != null && input.data.servicePrice > 0
              ? input.data.servicePrice
              : catalogTotal;
          const computed =
            total === catalogTotal
              ? catalog
              : catalog.map((v, idx) => (idx === 0 ? { ...v, price: total } : { ...v, price: 0 }));
          payload.vehicles = JSON.stringify(computed);
          payload.vehicleCount = computed.length;
          payload.servicePrice = total;
          if (computed[0]) {
            payload.vehicleType = computed[0].type;
            payload.vehicleModel = computed[0].model;
            payload.licensePlate = computed[0].plate;
          }
        } else if (input.data.servicePrice != null && input.data.servicePrice > 0) {
          payload.servicePrice = input.data.servicePrice;
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

        const existingNormalized = buildTimeSlot(
          getSlotStart(String(existing.timeSlot || "")),
          Number(existing.vehicleCount) > 0 ? Number(existing.vehicleCount) : 1
        );
        const nextNormalized = buildTimeSlot(getSlotStart(String(nextSlotInput)), nextVehicleCount);
        const scheduleChanged =
          String(nextDate) !== String(existing.scheduledDate) ||
          nextNormalized !== existingNormalized;

        // Si no cambia fecha/inicio/cantidad de vehículos, no revalidar solapes:
        // turnos viejos pueden solaparse tras corregir N×80 y igual hay que poder guardar datos.
        if (scheduleChanged) {
          payload.timeSlot = await assertScheduleAvailable({
            scheduledDate: nextDate,
            timeSlot: nextSlotInput,
            vehicleCount: nextVehicleCount,
            excludeId: input.id,
          });
        } else {
          payload.timeSlot = existingNormalized;
        }

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

    /** Mover turno a otro horario/fecha sin reabrir el formulario completo. */
    reschedule: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          /** Si true, empuja turnos que bloquean el nuevo hueco (p. ej. mover un 4h más temprano). */
          pushConflicts: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const existing = await db.getAppointmentById(input.id);
        if (!existing) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Turno no encontrado" });
        }
        if (existing.status === "cancelado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No se puede mover un turno cancelado." });
        }

        const vehicleCount =
          Number(existing.vehicleCount) > 0
            ? Number(existing.vehicleCount)
            : appointmentVehicleCount(existing);
        const nextDate = input.scheduledDate || existing.scheduledDate;

        if (input.pushConflicts) {
          const dayRows = await db.listAppointments({ date: String(nextDate) });
          const items: ScheduleItem[] = dayRows.map((row) => ({
            id: Number(row.id),
            timeSlot: String(row.timeSlot || ""),
            vehicleCount: appointmentVehicleCount(row),
            clientName: String(row.clientName || ""),
            status: row.status ?? null,
          }));

          // Si cambia de día, el turno movido se planifica solo contra el día destino.
          const planItems =
            String(nextDate) === String(existing.scheduledDate)
              ? items
              : [
                  ...items.filter((i) => i.id !== input.id),
                  {
                    id: input.id,
                    timeSlot: String(existing.timeSlot || ""),
                    vehicleCount,
                    clientName: String(existing.clientName || ""),
                    status: existing.status ?? null,
                  },
                ];

          const plan = planMoveWithPush(planItems, input.id, input.startTime);
          if (!plan) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `No se puede empezar a las ${input.startTime}: no hay forma de acomodar los turnos siguientes sin pasar las 18:00. Probá otro inicio o mové antes el turno que bloquea.`,
            });
          }

          const updates: Array<{ id: number; timeSlot: string }> = [
            { id: input.id, timeSlot: plan.slot },
            ...plan.pushes.map((p) => ({ id: p.id, timeSlot: p.toSlot })),
          ];

          if (String(nextDate) !== String(existing.scheduledDate)) {
            await db.updateAppointmentDetails(input.id, {
              scheduledDate: nextDate,
              timeSlot: plan.slot,
            });
            const otherShifts = updates.filter((u) => u.id !== input.id);
            if (otherShifts.length > 0) {
              await db.applyScheduleShifts(otherShifts);
            }
          } else {
            await db.applyScheduleShifts(updates);
          }

          const updated = await db.getAppointmentById(input.id);
          return {
            appointment: updated,
            pushed: plan.pushes.map((p) => ({
              id: p.id,
              clientName: p.clientName,
              fromSlot: p.fromSlot,
              toSlot: p.toSlot,
            })),
          };
        }

        const normalizedSlot = await assertScheduleAvailable({
          scheduledDate: nextDate,
          timeSlot: buildTimeSlot(input.startTime, vehicleCount),
          vehicleCount,
          excludeId: input.id,
        });

        const appointment = await db.updateAppointmentDetails(input.id, {
          scheduledDate: nextDate,
          timeSlot: normalizedSlot,
        });
        return { appointment, pushed: [] as Array<{ id: number; clientName: string; fromSlot: string; toSlot: string }> };
      }),

    /** Corrige solapes del día (p. ej. tras heal N×80) empujando turnos posteriores. */
    sanitizeDay: publicProcedure
      .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
      .mutation(async ({ input }) => {
        const result = await db.sanitizeDaySchedule(input.date);
        return result;
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

  /**
   * Libro de caja — independiente del cobro de turnos.
   * Ingresos / egresos con responsable (persona) y filtros.
   */
  cashLedger: router({
    list: publicProcedure
      .input(
        z
          .object({
            type: z.enum(["ingreso", "egreso", "todos"]).optional(),
            person: z.string().optional(),
            category: z.string().optional(),
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            search: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => await cashDb.listCashMovements(input || {})),

    stats: publicProcedure
      .input(
        z
          .object({
            type: z.enum(["ingreso", "egreso", "todos"]).optional(),
            person: z.string().optional(),
            category: z.string().optional(),
            dateFrom: z.string().optional(),
            dateTo: z.string().optional(),
            search: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => await cashDb.getCashLedgerStats(input || {})),

    persons: publicProcedure.query(async () => await cashDb.listCashPersons()),

    create: publicProcedure
      .input(
        z.object({
          type: z.enum(["ingreso", "egreso"]),
          amount: z.number().positive(),
          movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          person: z.string().min(1),
          category: z.string().min(1),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await cashDb.createCashMovement(input);
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err?.message || "No se pudo registrar el movimiento",
          });
        }
      }),

    update: publicProcedure
      .input(
        z.object({
          id: z.number().int(),
          data: z.object({
            type: z.enum(["ingreso", "egreso"]).optional(),
            amount: z.number().positive().optional(),
            movementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            person: z.string().min(1).optional(),
            category: z.string().min(1).optional(),
            description: z.string().optional(),
          }),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await cashDb.updateCashMovement(input.id, input.data);
        } catch (err: any) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: err?.message || "No se pudo actualizar el movimiento",
          });
        }
      }),

    delete: publicProcedure
      .input(z.object({ id: z.number().int() }))
      .mutation(async ({ input }) => {
        try {
          return await cashDb.deleteCashMovement(input.id);
        } catch (err: any) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: err?.message || "Movimiento no encontrado",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
