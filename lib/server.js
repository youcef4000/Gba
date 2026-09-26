/* ============================================================================
   Outils partages par l'API du portfolio (Worker Cloudflare "gba").

   Liaisons attendues (Cloudflare > Worker gba > Settings) :
     DB              base D1 (obligatoire pour le formulaire et l'admin)
     ADMIN_PASSWORD  mot de passe de l'espace admin (obligatoire pour l'admin)
     RESEND_API_KEY  cle Resend, pour recevoir chaque message par e-mail
     NOTIFY_EMAIL    adresse qui recoit ces e-mails
     MAIL_FROM       expediteur verifie chez Resend (facultatif)

   Les tables se creent toutes seules au premier appel : aucune migration
   a lancer a la main.
   ========================================================================== */

const enc = new TextEncoder();

/* ------------------------------------------------------------- reponses */

export class HttpError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export const fail = (code, status = 400) => json({ ok: false, error: code }, status);
export const empty = () => new Response(null, { status: 204 });

/** Enveloppe un handler : toute erreur devient une reponse JSON propre. */
export function handle(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.code, err.status);
      console.error(err && err.stack ? err.stack : err);
      return fail("server", 500);
    }
  };
}

export async function readJson(request, max = 8000) {
  const text = await request.text();
  if (text.length > max) throw new HttpError("too_large", 413);
  try {
    const data = JSON.parse(text || "{}");
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    throw new HttpError("bad_json", 400);
  }
}

/* ------------------------------------------------------------ validation */

// Retire les caracteres de controle, garde les retours a la ligne.
export function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
export function isPhone(v) {
  if (!/^\+?[\d\s().-]{8,22}$/.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

/* --------------------------------------------------------------- schema */

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    name TEXT, contact TEXT NOT NULL, business TEXT,
    project_type TEXT, options TEXT, timing TEXT,
    details TEXT, message TEXT,
    lang TEXT, country TEXT, ip_hash TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_ip ON messages (ip_hash, created_at)`,
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL, day TEXT NOT NULL, type TEXT NOT NULL,
    label TEXT, path TEXT, lang TEXT, country TEXT,
    device TEXT, referrer TEXT, visitor TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_events_day ON events (day, type)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip_hash TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts (ip_hash, ts)`,
];

let schemaReady = null;

export function db(env) {
  if (!env.DB) throw new HttpError("not_configured", 503);
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady.then(() => env.DB);
}

/* -------------------------------------------------------------- hachage */

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const salt = (env) => env.HASH_SALT || env.ADMIN_PASSWORD || "portfolio";
const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "0.0.0.0";

/** Empreinte de l'IP : sert aux limites anti-spam, l'IP n'est jamais stockee. */
export async function ipHash(request, env) {
  return hex(await sha256(salt(env) + "|ip|" + clientIp(request))).slice(0, 24);
}

/** Visiteur anonyme du jour : l'empreinte change chaque jour, sans cookie. */
export async function visitorHash(request, env, day) {
  const ua = request.headers.get("user-agent") || "";
  return hex(await sha256(salt(env) + "|v|" + day + "|" + clientIp(request) + "|" + ua)).slice(0, 20);
}

/** Jour calendaire a Alger (UTC+1 toute l'annee). */
export const dayOf = (ts) => new Date(ts + 3600e3).toISOString().slice(0, 10);

/* ------------------------------------------------------------- sessions */

const COOKIE = "__Host-admin";

const b64u = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b + "=".repeat((4 - (b.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function sessionKey(env) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode("session|" + (env.SESSION_SECRET || env.ADMIN_PASSWORD)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSession(env, days = 7) {
  const payload = String(Date.now() + days * 864e5);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(env), enc.encode(payload)));
  return payload + "." + b64u(sig);
}

export async function verifySession(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)__Host-admin=([^;]+)/);
  if (!m) return false;
  const [payload, sig] = m[1].split(".");
  if (!payload || !sig || !(Number(payload) > Date.now())) return false;
  try {
    return await crypto.subtle.verify("HMAC", await sessionKey(env), unb64u(sig), enc.encode(payload));
  } catch (e) {
    return false;
  }
}

export const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/** Comparaison en temps constant, sur des empreintes de meme longueur. */
export async function samePassword(given, expected) {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch (e) {
    return false;
  }
}

/* ---------------------------------------------------------------- e-mail */

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Previent par e-mail via Resend. Silencieux si la cle n'est pas configuree. */
export async function notifyByEmail(env, m, origin) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) return;
  const who = m.name || m.contact;
  const rows = [
    ["Nom", m.name],
    ["Contact", m.contact],
    ["Activité", m.business],
    ["Projet", m.project_type],
    ["Options", m.options],
    ["Délai", m.timing],
    ["Pays", m.country],
    ["Langue", m.lang],
  ].filter(([, v]) => v);

  const text = [
    `Nouveau message sur ton portfolio (n°${m.id})`,
    "",
    ...rows.map(([k, v]) => `${k} : ${v}`),
    "",
    m.details ? "Précisions :\n" + m.details + "\n" : "",
    "Message :",
    m.message,
    "",
    `Espace admin : ${origin}/admin/`,
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:560px">
<h2 style="margin:0 0 12px;font-size:20px">Nouveau message de ${esc(who)}</h2>
<table style="border-collapse:collapse;width:100%">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`)
    .join("")}</table>
${m.details ? `<p style="margin:16px 0 4px;color:#666">Précisions</p><p style="margin:0;white-space:pre-wrap">${esc(m.details)}</p>` : ""}
<p style="margin:16px 0 4px;color:#666">Message</p>
<pre style="margin:0;padding:12px;background:#f4f2ee;border-radius:8px;white-space:pre-wrap;font-family:inherit">${esc(m.message)}</pre>
<p style="margin:20px 0 0"><a href="${esc(origin)}/admin/" style="color:#b8892a">Ouvrir l'espace admin</a></p>
</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "Portfolio <onboarding@resend.dev>",
      to: [env.NOTIFY_EMAIL],
      reply_to: isEmail(m.contact) ? m.contact : undefined,
      subject: `Nouveau projet : ${m.project_type || "site"} — ${who}`,
      text,
      html,
    }),
  });
  if (!res.ok) console.error("resend", res.status, await res.text());
}
