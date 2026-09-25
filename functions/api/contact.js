/* POST /api/contact : enregistre une demande du configurateur. */
import { handle, json, fail, readJson, clean, isEmail, isPhone, db, ipHash, notifyByEmail } from "../../lib/server.js";

const LANGS = ["fr", "ar", "en"];
const PER_HOUR = 5;

export const onRequestPost = handle(async ({ request, env, waitUntil }) => {
  const DB = await db(env);
  const body = await readJson(request, 12000);

  // Champ piege invisible : un robot le remplit, un humain jamais.
  if (clean(body.website, 200)) return json({ ok: true });

  const m = {
    name: clean(body.name, 80),
    contact: clean(body.contact, 120),
    business: clean(body.business, 120),
    project_type: clean(body.type, 60),
    options: (Array.isArray(body.options) ? body.options : [])
      .map((o) => clean(o, 60))
      .filter(Boolean)
      .slice(0, 12)
      .join(", "),
    timing: clean(body.when, 60),
    details: clean(body.details, 2000),
    message: clean(body.message, 4000),
    lang: LANGS.includes(body.lang) ? body.lang : "fr",
    country: (request.cf && request.cf.country) || "",
  };
  if (!isEmail(m.contact) && !isPhone(m.contact)) return fail("invalid_contact");

  const now = Date.now();
  const ip = await ipHash(request, env);
  const recent = await DB.prepare("SELECT COUNT(*) AS n FROM messages WHERE ip_hash = ? AND created_at > ?")
    .bind(ip, now - 3600e3)
    .first("n");
  if (recent >= PER_HOUR) return fail("rate_limited", 429);

  const res = await DB.prepare(
    `INSERT INTO messages (created_at, name, contact, business, project_type, options, timing, details, message, lang, country, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(now, m.name, m.contact, m.business, m.project_type, m.options, m.timing, m.details, m.message, m.lang, m.country, ip)
    .run();

  const id = res.meta && res.meta.last_row_id;
  waitUntil(notifyByEmail(env, { ...m, id }, new URL(request.url).origin).catch((e) => console.error(e)));
  return json({ ok: true, id });
});
