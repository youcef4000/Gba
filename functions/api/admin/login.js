/* POST /api/admin/login : ouvre une session. DELETE : la ferme. */
import { handle, json, fail, readJson, db, ipHash, samePassword, createSession, sessionCookie } from "../../../lib/server.js";

const MAX_TRIES = 5;
const WINDOW = 15 * 60e3;

export const onRequestPost = handle(async ({ request, env }) => {
  if (!env.ADMIN_PASSWORD) return fail("not_configured", 503);
  const DB = await db(env);
  const ip = await ipHash(request, env);
  const now = Date.now();

  const tries = await DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip_hash = ? AND ts > ?")
    .bind(ip, now - WINDOW)
    .first("n");
  if (tries >= MAX_TRIES) return fail("locked", 429);

  const { password } = await readJson(request, 1000);
  if (!(await samePassword(String(password || ""), env.ADMIN_PASSWORD))) {
    await DB.prepare("INSERT INTO login_attempts (ip_hash, ts) VALUES (?, ?)").bind(ip, now).run();
    return fail("wrong_password", 401);
  }

  await DB.prepare("DELETE FROM login_attempts WHERE ip_hash = ? OR ts < ?").bind(ip, now - 864e5).run();
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(await createSession(env), 7 * 86400) });
});

export const onRequestDelete = () => json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
