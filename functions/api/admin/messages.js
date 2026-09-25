/* /api/admin/messages : liste (GET), changement de statut (PATCH), suppression (DELETE). */
import { handle, json, fail, readJson, db } from "../../../lib/server.js";

const STATUSES = ["new", "read", "archived"];

export const onRequestGet = handle(async ({ request, env }) => {
  const DB = await db(env);
  const status = new URL(request.url).searchParams.get("status") || "inbox";
  const where =
    status === "all" ? "" : status === "inbox" ? "WHERE status != 'archived'" : STATUSES.includes(status) ? "WHERE status = ?" : "";
  const list = DB.prepare(
    `SELECT id, created_at, status, name, contact, business, project_type, options, timing, details, message, lang, country
     FROM messages ${where} ORDER BY created_at DESC LIMIT 300`
  );
  const [rows, counts] = await DB.batch([
    STATUSES.includes(status) ? list.bind(status) : list,
    DB.prepare("SELECT status, COUNT(*) AS n FROM messages GROUP BY status"),
  ]);
  const byStatus = { new: 0, read: 0, archived: 0 };
  for (const r of counts.results) byStatus[r.status] = r.n;
  return json({ ok: true, messages: rows.results, counts: byStatus });
});

export const onRequestPatch = handle(async ({ request, env }) => {
  const DB = await db(env);
  const { id, status } = await readJson(request, 500);
  if (!Number.isInteger(id) || !STATUSES.includes(status)) return fail("bad_request");
  await DB.prepare("UPDATE messages SET status = ? WHERE id = ?").bind(status, id).run();
  return json({ ok: true });
});

export const onRequestDelete = handle(async ({ request, env }) => {
  const DB = await db(env);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id < 1) return fail("bad_request");
  await DB.prepare("DELETE FROM messages WHERE id = ?").bind(id).run();
  return json({ ok: true });
});
