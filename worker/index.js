/* ============================================================================
   Point d'entree du Worker Cloudflare.

   Les fichiers du site (public/) sont servis directement par Cloudflare ;
   ce script ne tourne que pour /api/* (voir "run_worker_first" dans
   wrangler.jsonc). Il aiguille chaque route vers son handler dans
   functions/api/, ecrits au format Pages Functions : les deux modes de
   deploiement partagent donc exactement le meme code.
   ========================================================================== */
import * as contact from "../functions/api/contact.js";
import * as track from "../functions/api/track.js";
import * as login from "../functions/api/admin/login.js";
import * as session from "../functions/api/admin/session.js";
import * as messages from "../functions/api/admin/messages.js";
import * as stats from "../functions/api/admin/stats.js";
import { onRequest as adminGuard } from "../functions/api/admin/_middleware.js";
import { fail } from "../lib/server.js";

const ROUTES = {
  "/api/contact": contact,
  "/api/track": track,
  "/api/admin/login": login,
  "/api/admin/session": session,
  "/api/admin/messages": messages,
  "/api/admin/stats": stats,
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const mod = ROUTES[pathname.replace(/\/+$/, "")];
    if (!mod) return fail("not_found", 404);

    const m = request.method.toUpperCase();
    const handler = mod["onRequest" + m[0] + m.slice(1).toLowerCase()] || mod.onRequest;
    if (!handler) return fail("method_not_allowed", 405);

    const context = {
      request,
      env,
      params: {},
      data: {},
      waitUntil: (p) => ctx.waitUntil(p),
      passThroughOnException: () => {},
    };
    context.next = () => handler(context);
    return pathname.startsWith("/api/admin/") ? adminGuard(context) : context.next();
  },
};
