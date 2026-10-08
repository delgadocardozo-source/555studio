import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/** Agenda interna, ERP y caja. El portal /agendar no usa este procedimiento. */
export const staffProcedure = t.procedure.use(async (opts) => {
  if (process.env.STAFF_GATE === "off") return opts.next();
  const { readStaffCookie, staffTokenValid, STAFF_LOCK_MESSAGE } = await import("../staffAccess");
  const { readStaffSecret } = await import("../staffAccessDb");
  const secret = await readStaffSecret();
  const token = readStaffCookie(opts.ctx.req);
  if (!secret || !staffTokenValid(token, secret.hash)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: STAFF_LOCK_MESSAGE });
  }
  return opts.next();
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
