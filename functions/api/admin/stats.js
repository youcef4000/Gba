/* GET /api/admin/stats?days=7|30|90 : chiffres du tableau de bord. */
import { handle, json, db, dayOf } from "../../../lib/server.js";

const PERIODS = [7, 30, 90];
// Jour d'un message, calcule en SQL a l'heure d'Alger (UTC+1).
const MSG_DAY = "strftime('%Y-%m-%d', created_at / 1000 + 3600, 'unixepoch')";

export const onRequestGet = handle(async ({ request, env, waitUntil }) => {
  const DB = await db(env);
  const asked = Number(new URL(request.url).searchParams.get("days"));
  const days = PERIODS.includes(asked) ? asked : 30;

  const now = Date.now();
  const to = dayOf(now);
  const from = dayOf(now - (days - 1) * 864e5);
  const prevTo = dayOf(now - days * 864e5);
  const prevFrom = dayOf(now - (2 * days - 1) * 864e5);

  const pv = (extra = "") =>
    `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor || day) AS visits FROM events WHERE type = 'pageview' AND day BETWEEN ? AND ? ${extra}`;
  const top = (col) =>
    DB.prepare(
      `SELECT ${col} AS k, COUNT(DISTINCT visitor || day) AS n FROM events
       WHERE type = 'pageview' AND day BETWEEN ? AND ? GROUP BY ${col} ORDER BY n DESC LIMIT 8`
    ).bind(from, to);

  const [
    daily,
    dailyMsg,
    cur,
    prev,
    msgCur,
    msgPrev,
    countries,
    sources,
    devices,
    langs,
    reach,
    clicks,
  ] = await DB.batch([
    DB.prepare(
      `SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visits FROM events
       WHERE type = 'pageview' AND day BETWEEN ? AND ? GROUP BY day`
    ).bind(from, to),
    DB.prepare(`SELECT ${MSG_DAY} AS day, COUNT(*) AS n FROM messages WHERE ${MSG_DAY} BETWEEN ? AND ? GROUP BY day`).bind(from, to),
    DB.prepare(pv()).bind(from, to),
    DB.prepare(pv()).bind(prevFrom, prevTo),
    DB.prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${MSG_DAY} BETWEEN ? AND ?`).bind(from, to),
    DB.prepare(`SELECT COUNT(*) AS n FROM messages WHERE ${MSG_DAY} BETWEEN ? AND ?`).bind(prevFrom, prevTo),
    top("country"),
    top("referrer"),
    top("device"),
    top("lang"),
    DB.prepare(
      `SELECT label AS k, COUNT(DISTINCT visitor || day) AS n FROM events
       WHERE type = 'reach' AND day BETWEEN ? AND ? GROUP BY label`
    ).bind(from, to),
    DB.prepare(
      `SELECT label AS k, COUNT(*) AS n FROM events
       WHERE type = 'click' AND day BETWEEN ? AND ? GROUP BY label ORDER BY n DESC LIMIT 10`
    ).bind(from, to),
  ]);

  // Une serie complete, jour par jour, zeros compris.
  const byDay = new Map(daily.results.map((r) => [r.day, r]));
  const msgByDay = new Map(dailyMsg.results.map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dayOf(now - i * 864e5);
    const r = byDay.get(d);
    series.push({ day: d, visits: r ? r.visits : 0, views: r ? r.views : 0, messages: msgByDay.get(d) || 0 });
  }

  const reached = Object.fromEntries(reach.results.map((r) => [r.k, r.n]));
  const visits = cur.results[0].visits;
  const messages = msgCur.results[0].n;

  // Menage occasionnel : les evenements de plus de 400 jours partent.
  if (Math.random() < 0.05) {
    waitUntil(DB.prepare("DELETE FROM events WHERE day < ?").bind(dayOf(now - 400 * 864e5)).run());
  }

  return json({
    ok: true,
    days,
    from,
    to,
    totals: {
      visits,
      views: cur.results[0].views,
      messages,
      conversion: visits ? messages / visits : 0,
    },
    previous: {
      visits: prev.results[0].visits,
      views: prev.results[0].views,
      messages: msgPrev.results[0].n,
      conversion: prev.results[0].visits ? msgPrev.results[0].n / prev.results[0].visits : 0,
    },
    series,
    funnel: [
      { key: "visits", n: visits },
      { key: "projets", n: reached.projets || 0 },
      { key: "contact", n: reached.contact || 0 },
      { key: "messages", n: messages },
    ],
    countries: countries.results,
    sources: sources.results,
    devices: devices.results,
    langs: langs.results,
    clicks: clicks.results,
  });
});
