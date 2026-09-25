/* POST /api/track : statistiques de visite, sans cookie ni IP stockee. */
import { handle, empty, readJson, clean, db, dayOf, visitorHash } from "../../lib/server.js";

const TYPES = new Set(["pageview", "reach", "click", "lang"]);
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|monitor|scan/i;

const SOURCES = [
  [/instagram/, "Instagram"],
  [/facebook|fb\.|messenger/, "Facebook"],
  [/tiktok/, "TikTok"],
  [/google\./, "Google"],
  [/bing\./, "Bing"],
  [/linkedin|lnkd/, "LinkedIn"],
  [/(^|\.)t\.co$|twitter|(^|\.)x\.com$/, "X"],
  [/youtube|youtu\.be/, "YouTube"],
  [/whatsapp|wa\.me/, "WhatsApp"],
  [/snapchat/, "Snapchat"],
];

function source(ref, utm, pageUrl) {
  if (utm) return utm.slice(0, 40);
  if (!ref) return "Direct";
  try {
    const host = new URL(ref).hostname.replace(/^www\./, "");
    if (host === new URL(pageUrl).hostname.replace(/^www\./, "")) return "Direct";
    const hit = SOURCES.find(([re]) => re.test(host));
    return hit ? hit[1] : host;
  } catch (e) {
    return "Direct";
  }
}

function device(ua) {
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) return "Tablette";
  if (/Mobi|iPhone|Android/i.test(ua)) return "Mobile";
  return "Ordinateur";
}

export const onRequestPost = handle(async ({ request, env }) => {
  const ua = request.headers.get("user-agent") || "";
  if (!env.DB || !ua || BOTS.test(ua)) return empty();
  const DB = await db(env);
  const b = await readJson(request, 2000);

  const type = clean(b.type, 20);
  if (!TYPES.has(type)) return empty();

  const now = Date.now();
  const day = dayOf(now);
  await DB.prepare(
    "INSERT INTO events (ts, day, type, label, path, lang, country, device, referrer, visitor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      now,
      day,
      type,
      clean(b.label, 60),
      clean(b.path, 120) || "/",
      ["fr", "ar", "en"].includes(b.lang) ? b.lang : "fr",
      (request.cf && request.cf.country) || "",
      device(ua),
      type === "pageview" ? source(clean(b.ref, 300), clean(b.utm, 40), request.url) : "",
      await visitorHash(request, env, day)
    )
    .run();
  return empty();
});
