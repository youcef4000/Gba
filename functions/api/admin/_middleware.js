/* Garde de l'espace admin : toute route /api/admin/* exige une session. */
import { fail, verifySession, sameOrigin } from "../../../lib/server.js";

export const onRequest = async (ctx) => {
  const { pathname } = new URL(ctx.request.url);
  if (pathname === "/api/admin/login") return ctx.next();
  if (!(await verifySession(ctx.request, ctx.env))) return fail("unauthorized", 401);
  if (ctx.request.method !== "GET" && !sameOrigin(ctx.request)) return fail("forbidden", 403);
  return ctx.next();
};
