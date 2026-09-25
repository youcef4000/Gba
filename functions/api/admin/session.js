/* GET /api/admin/session : repond 200 si la session est valide (le middleware a verifie). */
import { json } from "../../../lib/server.js";

export const onRequestGet = () => json({ ok: true });
