/* ============================================================================
   Espace admin : connexion, boite de reception, projets, statistiques.
   Connexion par Supabase Auth, donnees par les fonctions admin_* de la base.
   Les textes saisis par les visiteurs sont inseres avec textContent.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const SVG = "http://www.w3.org/2000/svg";

  const nf = new Intl.NumberFormat("fr-FR");
  const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const dfFull = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Algiers" });
  const dfShort = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
  const dfDay = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  let regions = null;
  try { regions = new Intl.DisplayNames(["fr"], { type: "region" }); } catch (e) { /* ancien navigateur */ }

  const LANGS = { fr: "Français", ar: "Arabe", en: "Anglais" };
  const FUNNEL = {
    visits: "Visites",
    projets: "Ont vu les projets",
    contact: "Ont atteint le formulaire",
    messages: "Ont envoyé un message",
  };
  const LOGIN_ERR = {
    wrong_password: "Mot de passe incorrect.",
    locked: "Trop d'essais. Réessayez dans quelques minutes.",
    not_configured: "L'espace admin n'est pas encore relié à la base Supabase (clé manquante dans config.js).",
    server: "Connexion impossible pour le moment. Réessayez.",
  };

  /* ------------------------------------------------------------- outils */

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }

  function s(tag, attrs = {}) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  /* ------------------------------------------------- base Supabase */

  // La connexion passe par Supabase Auth (e-mail de config.js + mot de passe) ;
  // les donnees par les fonctions admin_* de la base, refusees a tout autre compte.
  const CFG = window.SITE_CONFIG || {};
  const SB = CFG.supabase || {};
  const SB_URL = (SB.url || "").replace(/\/$/, "");
  const SB_OK = !!(SB_URL && SB.key && !/^SUPABASE_/.test(SB.key) && CFG.adminEmail);
  const STORE = "bz-admin-session";
  const fail = (code, status) => Object.assign(new Error(code), { code, status });

  let session = null;
  try { session = JSON.parse(localStorage.getItem(STORE)); } catch (e) { session = null; }
  function keep(s) {
    session = s;
    try { s ? localStorage.setItem(STORE, JSON.stringify(s)) : localStorage.removeItem(STORE); } catch (e) { /* session en memoire */ }
  }

  async function authToken(grant, body) {
    let res;
    try {
      res = await fetch(`${SB_URL}/auth/v1/token?grant_type=${grant}`, {
        method: "POST",
        headers: { apikey: SB.key, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) { throw fail("server"); }
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) throw fail("locked", 429);
    if (res.status === 400 || res.status === 401) throw fail("wrong_password", res.status);
    if (!res.ok || !data.access_token) throw fail("server", res.status);
    keep({ access: data.access_token, refresh: data.refresh_token, exp: Date.now() + (data.expires_in - 60) * 1000 });
  }

  async function accessToken() {
    if (!session) throw fail("unauthorized", 401);
    if (Date.now() > session.exp) {
      try { await authToken("refresh_token", { refresh_token: session.refresh }); }
      catch (e) { keep(null); throw fail("unauthorized", 401); }
    }
    return session.access;
  }

  async function rpc(fn, args = {}) {
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: SB.key, authorization: "Bearer " + (await accessToken()), "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403 || data.code === "42501") { keep(null); throw fail("unauthorized", 401); }
    if (!res.ok || data.ok === false) throw fail(data.error || "server", res.status);
    return data;
  }

  // Meme interface qu'avant (chemins de l'ancienne API), traduite en appels Supabase.
  async function api(path, opts = {}) {
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : {};
    const [name, query] = path.split("?");
    const q = new URLSearchParams(query || "");
    try {
      if (!SB_OK) throw fail("not_configured", 503);
      if (name === "login") {
        if (method === "DELETE") {
          const s = session;
          keep(null);
          if (s) fetch(`${SB_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SB.key, authorization: "Bearer " + s.access } }).catch(() => {});
          return { ok: true };
        }
        await authToken("password", { email: CFG.adminEmail, password: body.password });
        await rpc("admin_ping").catch((e) => { throw e.code === "unauthorized" ? fail("wrong_password", 401) : e; });
        return { ok: true };
      }
      if (name === "session") return await rpc("admin_ping");
      if (name === "messages") {
        if (method === "PATCH") return await rpc("admin_set_status", { p_id: body.id, p_status: body.status });
        if (method === "DELETE") return await rpc("admin_delete_message", { p_id: Number(q.get("id")) });
        return await rpc("admin_messages", { p_status: q.get("status") || "inbox" });
      }
      if (name === "stats") return await rpc("admin_stats", { p_days: Number(q.get("days")) || 30 });
      if (name === "projects") {
        if (method === "POST") return await rpc("admin_save_project", { p: body });
        if (method === "DELETE") return await rpc("admin_delete_project", { p_id: Number(q.get("id")) });
        return await rpc("admin_projects");
      }
      if (name === "projects/move") return await rpc("admin_move_project", { p_id: body.id, p_dir: body.dir });
      throw fail("server");
    } catch (e) {
      if (e.code === "unauthorized" && name !== "login") showLogin();
      throw e;
    }
  }

  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function relTime(ts) {
    const diff = (ts - Date.now()) / 1000;
    const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
    for (const [unit, sec] of units) {
      if (Math.abs(diff) >= sec) return rtf.format(Math.round(diff / sec), unit);
    }
    return "à l'instant";
  }

  const dayDate = (d) => new Date(d + "T00:00:00Z");
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
  const country = (code) => (code ? (regions && regions.of(code)) || code : "Inconnu");

  function waLink(contact, name) {
    let d = String(contact).replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0") && d.length === 10) d = "213" + d.slice(1);
    const hello = `Bonjour${name ? " " + name : ""}, merci pour votre message sur mon portfolio. `;
    return `https://wa.me/${d}?text=${encodeURIComponent(hello)}`;
  }

  /* ----------------------------------------------------------- connexion */

  let polling = null;

  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    clearInterval(polling);
    polling = null;
    setTimeout(() => $("#password").focus(), 30);
  }

  function showApp() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    route();
    if (location.hash !== "#messages" && location.hash) loadMessages(true);
    clearInterval(polling);
    polling = setInterval(() => { if (!document.hidden) loadMessages(true); }, 60000);
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-btn");
    const err = $("#login-error");
    btn.disabled = true;
    err.textContent = "";
    try {
      await api("login", { method: "POST", body: JSON.stringify({ password: $("#password").value }) });
      $("#password").value = "";
      showApp();
    } catch (ex) {
      err.textContent = LOGIN_ERR[ex.code] || LOGIN_ERR.server;
    } finally {
      btn.disabled = false;
    }
  });

  $("#logout").addEventListener("click", async () => {
    try { await api("login", { method: "DELETE" }); } catch (e) { /* on sort quand meme */ }
    showLogin();
  });

  /* -------------------------------------------------------------- onglets */

  const TABS = ["messages", "projects", "stats"];

  function route() {
    const tab = location.hash.slice(1);
    select(TABS.includes(tab) ? tab : "messages");
  }

  function select(tab) {
    TABS.forEach((t) => {
      $("#tab-" + t).setAttribute("aria-selected", String(t === tab));
      $("#view-" + t).hidden = t !== tab;
    });
    if (tab === "stats") loadStats();
    else if (tab === "projects") loadProjects();
    else loadMessages();
  }

  addEventListener("hashchange", () => { if (!$("#app").hidden) route(); });
  TABS.forEach((t) => {
    $("#tab-" + t).addEventListener("click", () => {
      if (t !== "projects" && !leaveEditor()) return;
      history.replaceState(null, "", "#" + t);
      select(t);
    });
  });

  /* ------------------------------------------------------------- messages */

  const box = { status: "inbox", list: [], counts: { new: 0, read: 0, archived: 0 }, current: null, confirm: false };

  async function loadMessages(silent) {
    try {
      const data = await api("messages?status=" + box.status);
      box.list = data.messages;
      box.counts = data.counts;
      if (box.current && !box.list.some((m) => m.id === box.current)) box.current = null;
      renderBadge();
      renderList();
      if (!silent || !$("#msg-detail").childElementCount) renderDetail();
    } catch (e) {
      if (e.code === "unauthorized") return;
      if (!silent) {
        $("#msg-list").replaceChildren(h("li", { class: "empty" }, h("strong", {}, "Messages indisponibles"),
          e.code === "not_configured" ? "Le site n'est pas encore relié à la base Supabase (config.js)." : "Réessayez dans un instant."));
      }
    }
  }

  function renderBadge() {
    const n = box.counts.new || 0;
    const badge = $("#badge");
    badge.hidden = !n;
    badge.textContent = String(n);
    document.title = (n ? `(${n}) ` : "") + "Admin · Bornz Studio";
  }

  function renderList() {
    const ul = $("#msg-list");
    if (!box.list.length) {
      const text = {
        inbox: "Les demandes envoyées depuis le formulaire du site arriveront ici.",
        new: "Tous les messages ont été lus.",
        archived: "Aucun message archivé.",
        all: "Les demandes envoyées depuis le formulaire du site arriveront ici.",
      }[box.status];
      ul.replaceChildren(h("li", { class: "empty" }, h("strong", {}, "Aucun message"), text));
      return;
    }
    ul.replaceChildren(
      ...box.list.map((m) =>
        h("li", {},
          h("button", {
            type: "button",
            class: "msg-item" + (m.status === "new" ? "" : " is-read"),
            "aria-current": m.id === box.current ? "true" : null,
            onclick: () => open(m.id),
          },
            h("span", { class: "msg-top" },
              h("span", { class: "dot", "aria-label": m.status === "new" ? "Non lu" : null }),
              h("span", { class: "msg-name" }, m.name || m.contact),
              h("span", { class: "msg-time" }, relTime(m.created_at))
            ),
            h("span", { class: "msg-sub" },
              m.status === "archived" ? h("span", { class: "tag" }, "Archivé") : null,
              m.status === "archived" ? " " : null,
              [m.project_type, m.business].filter(Boolean).join(" · ") || m.contact
            )
          )
        )
      )
    );
  }

  async function open(id) {
    box.current = id;
    box.confirm = false;
    const m = box.list.find((x) => x.id === id);
    $("#inbox").classList.add("show-detail");
    renderList();
    renderDetail();
    if (m && m.status === "new") await setStatus(m, "read", true);
    if (matchMedia("(max-width: 860px)").matches) scrollTo({ top: 0 });
  }

  async function setStatus(m, status, quiet) {
    const before = m.status;
    m.status = status;
    if (before !== status) {
      box.counts[before] = Math.max(0, (box.counts[before] || 0) - 1);
      box.counts[status] = (box.counts[status] || 0) + 1;
    }
    renderBadge();
    renderList();
    renderDetail();
    try {
      await api("messages", { method: "PATCH", body: JSON.stringify({ id: m.id, status }) });
      if (!quiet) toast({ read: "Marqué comme lu", new: "Marqué comme non lu", archived: "Message archivé" }[status]);
      if ((box.status === "new" && status !== "new") || (box.status === "inbox" && status === "archived") || (box.status === "archived" && status !== "archived")) {
        setTimeout(() => loadMessages(true), 400);
      }
    } catch (e) {
      m.status = before;
      toast("La modification n'a pas été enregistrée.");
      loadMessages(true);
    }
  }

  async function remove(m) {
    try {
      await api("messages?id=" + m.id, { method: "DELETE" });
      box.current = null;
      box.confirm = false;
      $("#inbox").classList.remove("show-detail");
      toast("Message supprimé");
      await loadMessages();
    } catch (e) {
      toast("La suppression a échoué.");
    }
  }

  function renderDetail() {
    const pane = $("#msg-detail");
    const m = box.list.find((x) => x.id === box.current);
    if (!m) {
      pane.replaceChildren(h("div", { class: "empty" }, h("strong", {}, "Sélectionnez un message"), "Son contenu complet et les boutons pour répondre s'affichent ici."));
      return;
    }
    const phone = !isEmail(m.contact);
    const copy = () => {
      navigator.clipboard.writeText(m.contact).then(() => toast("Contact copié"), () => toast("Copie impossible : sélectionnez le contact"));
    };

    const actions = h("div", { class: "actions" },
      phone
        ? h("a", { class: "btn btn-wa", href: waLink(m.contact, m.name), target: "_blank", rel: "noopener" }, "Répondre sur WhatsApp")
        : h("a", { class: "btn btn-primary", href: `mailto:${m.contact}?subject=${encodeURIComponent("Votre projet de site")}&body=${encodeURIComponent(`Bonjour${m.name ? " " + m.name : ""},\n\n`)}` }, "Répondre par e-mail"),
      h("button", { type: "button", class: "btn", onclick: copy }, "Copier le contact"),
      m.status === "new"
        ? h("button", { type: "button", class: "btn", onclick: () => setStatus(m, "read") }, "Marquer comme lu")
        : h("button", { type: "button", class: "btn", onclick: () => setStatus(m, "new") }, "Marquer comme non lu"),
      m.status === "archived"
        ? h("button", { type: "button", class: "btn", onclick: () => setStatus(m, "read") }, "Désarchiver")
        : h("button", { type: "button", class: "btn", onclick: () => setStatus(m, "archived") }, "Archiver"),
      box.confirm
        ? h("span", { class: "confirm" }, "Supprimer définitivement ?",
            h("button", { type: "button", class: "btn btn-danger", onclick: () => remove(m) }, "Oui, supprimer"),
            h("button", { type: "button", class: "btn", onclick: () => { box.confirm = false; renderDetail(); } }, "Annuler"))
        : h("button", { type: "button", class: "btn btn-danger", onclick: () => { box.confirm = true; renderDetail(); } }, "Supprimer")
    );

    const meta = [
      ["Activité", m.business],
      ["Projet", m.project_type],
      ["Options", m.options],
      ["Délai", m.timing],
      ["Pays", m.country ? country(m.country) : ""],
      ["Langue du site", LANGS[m.lang] || m.lang],
    ].filter(([, v]) => v);

    pane.replaceChildren(
      h("button", { type: "button", class: "btn back", onclick: () => { $("#inbox").classList.remove("show-detail"); } }, "← Messages"),
      h("header", { class: "detail-head" },
        h("h1", {}, m.name || "Sans nom"),
        h("p", { class: "detail-contact" }, m.contact),
        h("p", { class: "detail-date" }, dfFull.format(new Date(m.created_at)) + " · " + relTime(m.created_at))
      ),
      actions,
      meta.length ? h("dl", { class: "meta" }, meta.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))) : "",
      m.details ? h("p", { class: "block-t" }, "Précisions du client") : "",
      m.details ? h("p", { class: "block" }, m.details) : "",
      h("p", { class: "block-t" }, "Message complet"),
      h("pre", { class: "block" }, m.message || "")
    );
  }

  $$("#view-messages .seg button").forEach((b) => {
    b.addEventListener("click", () => {
      box.status = b.dataset.status;
      $$("#view-messages .seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      box.current = null;
      $("#inbox").classList.remove("show-detail");
      loadMessages();
    });
  });
  $("#refresh").addEventListener("click", () => loadMessages().then(() => toast("À jour")));

  /* --------------------------------------------------------- statistiques */

  const stats = { days: 30, data: null };

  async function loadStats() {
    const wrap = $("#stats");
    wrap.classList.add("is-loading");
    try {
      stats.data = await api("stats?days=" + stats.days);
      renderStats(stats.data);
    } catch (e) {
      if (e.code === "unauthorized") return;
      toast(e.code === "not_configured" ? "Base Supabase non reliée : statistiques indisponibles" : "Statistiques indisponibles pour le moment");
    } finally {
      wrap.classList.remove("is-loading");
    }
  }

  $$("#view-stats .seg button").forEach((b) => {
    b.addEventListener("click", () => {
      stats.days = Number(b.dataset.days);
      $$("#view-stats .seg button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      loadStats();
    });
  });

  function renderStats(d) {
    $("#range").textContent = `Du ${dfShort.format(dayDate(d.from))} au ${dfShort.format(dayDate(d.to))}`;
    renderKpis(d);
    renderChart(d.series);
    renderTable(d.series);

    const visits = d.totals.visits;
    renderRows($("#funnel"), d.funnel.map((f) => ({ k: FUNNEL[f.key], n: f.n })), { base: visits, share: true, keepZero: visits > 0 });
    renderRows($("#sources"), d.sources.map((r) => ({ k: r.k || "Direct", n: r.n })), { base: visits, share: true });
    renderRows($("#countries"), d.countries.map((r) => ({ k: country(r.k), n: r.n })), { base: visits, share: true });
    renderRows($("#clicks"), d.clicks.map((r) => ({ k: r.k, n: r.n })), {});
    renderRows($("#devices"), d.devices.map((r) => ({ k: r.k, n: r.n })), { base: visits, share: true });
    renderRows($("#langs"), d.langs.map((r) => ({ k: LANGS[r.k] || r.k, n: r.n })), { base: visits, share: true });
  }

  function renderKpis(d) {
    const t = d.totals;
    const p = d.previous;
    const since = `vs les ${d.days} jours précédents`;
    const delta = (cur, prev, rate) => {
      if (rate) {
        if (!prev && !cur) return h("p", { class: "kpi-delta" }, "—");
        const pts = (cur - prev) * 100;
        if (Math.abs(pts) < 0.05) return h("p", { class: "kpi-delta" }, "Stable ", since);
        const up = pts > 0;
        return h("p", { class: "kpi-delta" },
          h("b", { class: up ? "up" : "down" }, (up ? "▲ +" : "▼ ") + pts.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " pt"), " ", since);
      }
      if (!prev) return h("p", { class: "kpi-delta" }, cur ? "Première période mesurée" : "—");
      const ch = (cur - prev) / prev;
      if (Math.abs(ch) < 0.005) return h("p", { class: "kpi-delta" }, "Stable ", since);
      const up = ch > 0;
      return h("p", { class: "kpi-delta" }, h("b", { class: up ? "up" : "down" }, (up ? "▲ +" : "▼ ") + pct.format(Math.abs(ch)).replace(/^-/, "")), " ", since);
    };
    const tile = (label, value, d2) => h("div", { class: "kpi" }, h("p", { class: "kpi-label" }, label), h("p", { class: "kpi-value" }, value), d2);
    $("#kpis").replaceChildren(
      tile("Visites", nf.format(t.visits), delta(t.visits, p.visits)),
      tile("Pages vues", nf.format(t.views), delta(t.views, p.views)),
      tile("Messages reçus", nf.format(t.messages), delta(t.messages, p.messages)),
      tile("Taux de conversion", t.visits ? pct.format(t.conversion) : "—", delta(t.conversion, p.conversion, true))
    );
  }

  function renderRows(el, rows, { base = 0, share = false, keepZero = false } = {}) {
    const list = rows.filter((r) => keepZero || r.n > 0);
    if (!list.length) {
      el.replaceChildren(h("p", { class: "rows-empty" }, "Pas encore de données sur cette période."));
      return;
    }
    const max = Math.max(...list.map((r) => r.n), 1);
    el.replaceChildren(
      ...list.map((r) =>
        h("div", { class: "row" },
          h("div", { class: "row-top" },
            h("span", { class: "row-label", title: r.k }, r.k),
            h("span", { class: "row-value" }, nf.format(r.n), share && base ? h("small", {}, pct.format(r.n / base)) : null)
          ),
          h("div", { class: "row-track" }, h("div", { class: "row-bar", style: `width:${(r.n / max) * 100}%` }))
        )
      )
    );
  }

  function renderTable(series) {
    const wrap = $("#daily-table");
    const rows = [...series].reverse();
    wrap.replaceChildren(
      h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Jour"), h("th", { scope: "col" }, "Visites"), h("th", { scope: "col" }, "Pages vues"), h("th", { scope: "col" }, "Messages"))),
        h("tbody", {}, rows.map((r) => h("tr", {}, h("td", {}, dfDay.format(dayDate(r.day))), h("td", {}, nf.format(r.visits)), h("td", {}, nf.format(r.views)), h("td", {}, nf.format(r.messages)))))
      )
    );
  }

  $("#toggle-table").addEventListener("click", (e) => {
    const t = $("#daily-table");
    t.hidden = !t.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!t.hidden));
    e.currentTarget.textContent = t.hidden ? "Voir le tableau" : "Masquer le tableau";
  });

  /* Graduations lisibles : 1, 2 ou 5 x 10^n, jamais de demi-visite. */
  function niceTicks(max, count = 4) {
    const raw = max / count;
    const exp = Math.floor(Math.log10(raw));
    const f = raw / 10 ** exp;
    const step = Math.max(1, (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * 10 ** exp);
    const ticks = [];
    for (let v = 0; v <= Math.ceil(max / step) * step + 1e-9; v += step) ticks.push(v);
    return ticks;
  }

  function colPath(x, y, w, hgt) {
    const r = Math.min(4, w / 2, hgt);
    return `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hgt}Z`;
  }

  function renderChart(series) {
    const boxEl = $("#chart");
    boxEl.replaceChildren();
    const W = boxEl.clientWidth;
    const H = boxEl.clientHeight;
    if (!W) return;
    const pad = { l: 40, r: 10, t: 24, b: 28 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const values = series.map((d) => d.visits);
    const max = Math.max(...values, 0);
    const ticks = niceTicks(Math.max(max, 4));
    const top = ticks[ticks.length - 1];
    const band = iw / series.length;
    const bw = Math.max(1, Math.min(24, band - Math.max(2, band * 0.3)));
    const y = (v) => pad.t + ih - (v / top) * ih;

    const peak = values.lastIndexOf(max);
    const svg = s("svg", {
      viewBox: `0 0 ${W} ${H}`,
      tabindex: "0",
      role: "img",
      "aria-label": max
        ? `Visites par jour. Pic de ${max} visites le ${dfDay.format(dayDate(series[peak].day))}. Flèches gauche et droite pour parcourir les jours.`
        : "Visites par jour : aucune visite sur la période.",
    });

    ticks.forEach((v) => {
      svg.append(s("line", { class: v === 0 ? "baseline" : "grid-line", x1: pad.l, x2: W - pad.r, y1: y(v) + 0.5, y2: y(v) + 0.5 }));
      const t = s("text", { class: "axis-text", x: pad.l - 8, y: y(v) + 4, "text-anchor": "end" });
      t.textContent = nf.format(v);
      svg.append(t);
    });

    const bars = series.map((d, i) => {
      const x = pad.l + i * band + (band - bw) / 2;
      const hgt = (d.visits / top) * ih;
      if (!d.visits) return null;
      const p = s("path", { class: "bar", d: colPath(x, y(d.visits), bw, hgt) });
      svg.append(p);
      return p;
    });

    // Etiquettes de dates : une sur n, la derniere toujours presente.
    const fit = Math.max(2, Math.min(6, Math.floor(iw / 72)));
    const every = Math.max(1, Math.ceil(series.length / fit));
    series.forEach((d, i) => {
      if ((series.length - 1 - i) % every) return;
      const cx = pad.l + i * band + band / 2;
      // Les dates aux bords s'alignent sur le bord au lieu de deborder.
      const edgeR = cx + 34 > W - pad.r;
      const edgeL = cx - 34 < pad.l;
      const t = s("text", {
        class: "axis-text",
        x: edgeR ? W - pad.r : edgeL ? pad.l : cx,
        y: H - 8,
        "text-anchor": edgeR ? "end" : edgeL ? "start" : "middle",
      });
      t.textContent = dfShort.format(dayDate(d.day));
      svg.append(t);
    });

    // Un seul libelle direct : le pic.
    if (max) {
      const t = s("text", { class: "peak-text", x: pad.l + peak * band + band / 2, y: y(max) - 7, "text-anchor": "middle" });
      t.textContent = nf.format(max);
      svg.append(t);
    }

    const tip = h("div", { class: "tooltip", hidden: true });
    let active = -1;
    const show = (i) => {
      if (i < 0 || i >= series.length) return;
      if (bars[active]) bars[active].classList.remove("is-hot");
      active = i;
      if (bars[i]) bars[i].classList.add("is-hot");
      const d = series[i];
      tip.replaceChildren(
        h("p", { class: "tt-date" }, dfDay.format(dayDate(d.day))),
        h("div", { class: "tt-row" }, h("span", {}, h("i", { class: "tt-key" }), "Visites"), h("b", {}, nf.format(d.visits))),
        h("div", { class: "tt-row" }, h("span", {}, "Pages vues"), h("b", {}, nf.format(d.views))),
        h("div", { class: "tt-row" }, h("span", {}, "Messages"), h("b", {}, nf.format(d.messages)))
      );
      tip.hidden = false;
      const cx = pad.l + i * band + band / 2;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      tip.style.left = Math.max(0, Math.min(W - tw, cx - tw / 2)) + "px";
      tip.style.top = Math.max(-th + 10, y(d.visits) - th - 12) + "px";
    };
    const hide = () => {
      if (bars[active]) bars[active].classList.remove("is-hot");
      active = -1;
      tip.hidden = true;
    };

    // Zones de survol : toute la hauteur de chaque jour, pas seulement la barre.
    series.forEach((d, i) => {
      const hit = s("rect", { class: "hit", x: pad.l + i * band, y: pad.t, width: band, height: ih });
      hit.addEventListener("pointerenter", () => show(i));
      svg.append(hit);
    });
    svg.addEventListener("pointerleave", hide);
    svg.addEventListener("blur", hide);
    svg.addEventListener("focus", () => show(active >= 0 ? active : series.length - 1));
    svg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(Math.max(0, active - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(Math.min(series.length - 1, active + 1)); }
      if (e.key === "Escape") hide();
    });

    boxEl.append(svg, tip);
    if (!max) {
      boxEl.append(h("div", { class: "chart-empty" }, "Pas encore de visites sur cette période. Les barres apparaissent dès les premières visites du site en ligne."));
    }
  }

  let resizeTimer = null;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (stats.data && !$("#view-stats").hidden) renderChart(stats.data.series); }, 150);
  });

  /* -------------------------------------------------------------- projets */

  // Les projets vivent dans la table projects ; les captures dans le dossier
  // public "projects" de Supabase Storage. Les premiers de la liste sont
  // presentes en grand sur le site, tous apparaissent dans l'index.
  const FEATURED = 8;
  const KINDS = { site: "Site", app: "Application", demo: "Démo" };
  const P_LANGS = [["fr", "FR"], ["en", "EN"], ["ar", "AR"]];
  const PROJ_ERR = {
    title_required: "Donnez un nom au projet.",
    bad_url: "L'adresse du site doit commencer par https://",
    bad_cover: "Image invalide : choisissez à nouveau la capture.",
    not_image: "Ce fichier n'est pas une image lisible (PNG, JPG ou WebP).",
    too_big: "Image trop lourde : 8 Mo maximum.",
    upload: "L'image n'a pas pu être envoyée. Réessayez.",
    not_found: "Ce projet n'existe plus : la liste a été actualisée.",
    server: "Enregistrement impossible pour le moment. Réessayez.",
  };
  const PUBLIC_IMG = `${SB_URL}/storage/v1/object/public/projects/`;
  const pj = { list: [], current: null, draft: null, saved: "", lang: "fr", confirm: false, busy: false, uploads: [] };

  const blankProject = () => ({
    id: null,
    title: "",
    kind: "site",
    url: "",
    year: new Date().getFullYear(),
    cat: { fr: "", en: "", ar: "" },
    summary: { fr: "", en: "", ar: "" },
    tags: { fr: [], en: [], ar: [] },
    bg: "#0b0b10",
    accent: "#e8b84a",
    accent2: "#9b6bff",
    cover: "",
    cover_m: "",
    published: true,
  });

  const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const imgSrc = (u) => (!u ? "" : /^(https?:|blob:)/.test(u) ? u : "/" + u.replace(/^\//, ""));
  const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return ""; } };
  const storagePath = (u) => (u && u.startsWith(PUBLIC_IMG) ? decodeURIComponent(u.slice(PUBLIC_IMG.length)) : null);
  const snapshot = (d) => JSON.stringify(d, (k, v) => (k === "_local" ? undefined : v));
  const dirty = () => !!pj.draft && snapshot(pj.draft) !== pj.saved;

  // Couleur de texte lisible sur le fond choisi (meme regle que le site).
  function inkOn(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    if (Number.isNaN(n)) return "#f2efe8";
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return l > 0.42 ? "#0a0a0d" : "#f2efe8";
  }

  function leaveEditor() {
    if (!dirty()) return true;
    if (!confirm("Les modifications de ce projet ne sont pas enregistrées. Les abandonner ?")) return false;
    discardUploads();
    pj.draft = null;
    pj.current = null;
    return true;
  }

  async function loadProjects() {
    try {
      const data = await api("projects");
      pj.list = data.projects || [];
      if (pj.current && pj.current !== "new" && !pj.list.some((p) => p.id === pj.current)) {
        pj.current = null;
        pj.draft = null;
      }
      renderProjList();
      if (!pj.draft) renderEditor();
    } catch (e) {
      if (e.code === "unauthorized") return;
      const missing = e.status === 404;
      $("#proj-count").textContent = "";
      fill($("#proj-list"),
        h("li", { class: "empty" },
          h("strong", {}, missing ? "Une dernière étape" : "Projets indisponibles"),
          missing
            ? h("span", {}, "Dans Supabase, ouvrez SQL Editor, collez le contenu du fichier ", h("code", {}, "supabase/projects.sql"), " puis cliquez sur Run. Vos projets apparaîtront ici.")
            : "Réessayez dans un instant."
        )
      );
      fill($("#proj-editor"));
    }
  }

  function renderProjList() {
    const ul = $("#proj-list");
    const n = pj.list.length;
    const live = pj.list.filter((p) => p.published).length;
    $("#proj-count").textContent = n ? `${n} projet${n > 1 ? "s" : ""} · ${live} visible${live > 1 ? "s" : ""} sur le site` : "";
    if (!n) {
      fill(ul, h("li", { class: "empty" }, h("strong", {}, "Aucun projet"), "Ajoutez votre premier site avec le bouton « Ajouter un projet »."));
      return;
    }
    let rank = 0;
    fill(ul,
      ...pj.list.map((p, i) => {
        const featured = p.published && rank++ < FEATURED;
        return h("li", { class: "proj-item" + (p.published ? "" : " is-hidden") },
          h("button", {
            type: "button",
            class: "proj-open",
            "aria-current": p.id === pj.current ? "true" : null,
            onclick: () => openProject(p.id),
          },
            h("span", { class: "proj-thumb", style: `--pbg:${p.bg};--pac:${p.accent};--pac2:${p.accent2}` },
              p.cover ? h("img", { src: imgSrc(p.cover), alt: "", loading: "lazy" }) : h("i", { "aria-hidden": "true" })),
            h("span", { class: "proj-txt" },
              h("span", { class: "proj-name" }, p.title),
              h("span", { class: "proj-sub" }, KINDS[p.kind] || p.kind, " · ", hostOf(p.url) || "sans lien")),
            h("span", { class: "proj-flags" },
              featured ? h("span", { class: "tag tag-gold" }, "En grand") : null,
              p.published ? null : h("span", { class: "tag" }, "Masqué"))
          ),
          h("span", { class: "proj-move" },
            h("button", { type: "button", class: "icon-btn", "aria-label": `Monter ${p.title}`, title: "Monter", disabled: i === 0, onclick: () => moveProject(p, -1) }, "↑"),
            h("button", { type: "button", class: "icon-btn", "aria-label": `Descendre ${p.title}`, title: "Descendre", disabled: i === n - 1, onclick: () => moveProject(p, 1) }, "↓"))
        );
      })
    );
  }

  async function moveProject(p, dir) {
    const i = pj.list.indexOf(p);
    const j = i + dir;
    if (j < 0 || j >= pj.list.length) return;
    [pj.list[i], pj.list[j]] = [pj.list[j], pj.list[i]];
    renderProjList();
    const btn = $$(`#proj-list .proj-item`)[j];
    if (btn) { const b = $$(".icon-btn", btn)[dir < 0 ? 0 : 1]; if (b && !b.disabled) b.focus(); }
    try {
      await api("projects/move", { method: "POST", body: JSON.stringify({ id: p.id, dir }) });
    } catch (e) {
      toast("L'ordre n'a pas été enregistré.");
      loadProjects();
    }
  }

  function openProject(id, force) {
    if (!force && id === pj.current) return;
    if (!force && !leaveEditor()) return;
    const p = id === "new" ? blankProject() : pj.list.find((x) => x.id === id);
    if (!p) return;
    pj.current = id;
    pj.draft = JSON.parse(JSON.stringify(p));
    ["cat", "summary"].forEach((k) => { pj.draft[k] = Object.assign({ fr: "", en: "", ar: "" }, pj.draft[k]); });
    pj.draft.tags = Object.assign({ fr: [], en: [], ar: [] }, pj.draft.tags);
    delete pj.draft.position;
    pj.saved = snapshot(pj.draft);
    pj.confirm = false;
    pj.lang = "fr";
    $("#projects").classList.add("show-detail");
    renderProjList();
    renderEditor();
    if (matchMedia("(max-width: 860px)").matches) scrollTo({ top: 0 });
    const first = $("#pe-title");
    if (id === "new" && first) first.focus();
  }

  $("#proj-add").addEventListener("click", () => openProject("new"));

  /* ---- images : redimensionnees et converties en WebP dans le navigateur */

  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(fail("not_image"));
      img.src = src;
    });
  }

  async function prepareImage(file, maxW) {
    if (!/^image\//.test(file.type)) throw fail("not_image");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const encode = (type, q) => new Promise((r) => c.toBlob(r, type, q));
      let blob = await encode("image/webp", 0.82);
      if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg", 0.86);
      if (!blob) throw fail("not_image");
      if (blob.size > 8 * 1024 * 1024) throw fail("too_big");
      return { blob, canvas: c };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function storageFetch(method, path, body, type) {
    const res = await fetch(`${SB_URL}/storage/v1/object/projects${path ? "/" + path : ""}`, {
      method,
      headers: Object.assign(
        { apikey: SB.key, authorization: "Bearer " + (await accessToken()) },
        type ? { "content-type": type, "cache-control": "max-age=31536000", "x-upsert": "false" } : { "content-type": "application/json" }
      ),
      body,
    });
    if (!res.ok) throw fail(res.status === 413 ? "too_big" : "upload", res.status);
    return res.json().catch(() => ({}));
  }

  function slugify(v) {
    return String(v || "")
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "projet";
  }

  async function uploadImage(blob, slot) {
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${slugify(pj.draft.title)}-${slot === "cover_m" ? "mobile" : "desktop"}-${Date.now().toString(36)}.${ext}`;
    await storageFetch("POST", path, blob, blob.type);
    const url = PUBLIC_IMG + path;
    pj.uploads.push(url);
    return url;
  }

  // Nettoyage discret du stockage : une image remplacee ou abandonnee est retiree.
  function removeImages(urls) {
    const paths = [...new Set(urls.map(storagePath).filter(Boolean))];
    if (!paths.length) return;
    storageFetch("DELETE", "", JSON.stringify({ prefixes: paths })).catch(() => { /* sans gravite */ });
  }

  function discardUploads() {
    removeImages(pj.uploads);
    pj.uploads = [];
  }

  // Trois couleurs tirees de la capture : le fond (bords de l'image) et les
  // deux teintes vives les plus presentes.
  function paletteOf(source) {
    const w = 72;
    const hgt = Math.max(1, Math.round((source.height / source.width) * w));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, w, hgt);
    const px = ctx.getImageData(0, 0, w, hgt).data;
    const edge = [0, 0, 0, 0];
    const buckets = Array.from({ length: 12 }, (_, k) => ({ k, w: 0, r: 0, g: 0, b: 0 }));
    for (let y = 0; y < hgt; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (x < 3 || x >= w - 3 || y < 3 || y >= hgt - 3) { edge[0] += r; edge[1] += g; edge[2] += b; edge[3]++; }
        const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
        const l = (max + min) / 2;
        const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
        const weight = sat * sat * Math.max(0, 1 - Math.abs(l - 0.55) * 2);
        if (weight < 0.06) continue;
        let hue;
        const R = r / 255, G = g / 255, B = b / 255, d = max - min;
        if (max === R) hue = ((G - B) / d + 6) % 6;
        else if (max === G) hue = (B - R) / d + 2;
        else hue = (R - G) / d + 4;
        const bk = buckets[Math.floor(hue * 2) % 12];
        bk.w += weight; bk.r += r * weight; bk.g += g * weight; bk.b += b * weight;
      }
    }
    const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
    const ranked = buckets.filter((b) => b.w > 0).sort((a, b) => b.w - a.w);
    const color = (b) => hex(b.r / b.w, b.g / b.w, b.b / b.w);
    const first = ranked[0];
    const far = first && ranked.find((b) => Math.min(Math.abs(b.k - first.k), 12 - Math.abs(b.k - first.k)) >= 2 && b.w > first.w * 0.08);
    return {
      bg: hex(edge[0] / edge[3], edge[1] / edge[3], edge[2] / edge[3]),
      accent: first ? color(first) : null,
      accent2: far ? color(far) : null,
    };
  }

  function applyPalette(pal) {
    const d = pj.draft;
    if (pal.bg) d.bg = pal.bg;
    if (pal.accent) d.accent = pal.accent;
    if (pal.accent2) d.accent2 = pal.accent2;
    ["bg", "accent", "accent2"].forEach((k) => {
      const box = $(`[data-color="${k}"]`);
      if (!box) return;
      $("input[type=color]", box).value = d[k];
      $("input[type=text]", box).value = d[k];
    });
    renderPreview();
  }

  async function paletteFromCover() {
    const d = pj.draft;
    if (!d || !d.cover) return;
    try {
      const img = await loadImage(imgSrc(d._local && d._local.cover ? d._local.cover : d.cover), true);
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      applyPalette(paletteOf(c));
      toast("Couleurs reprises de la capture");
    } catch (e) {
      toast("Impossible de lire les couleurs de cette image.");
    }
  }

  async function handleFile(file, slot) {
    const d = pj.draft;
    if (!file || !d) return;
    const zone = $(`[data-slot="${slot}"]`);
    const status = $(".drop-status", zone);
    zone.classList.add("is-busy");
    status.textContent = "Préparation…";
    try {
      const { blob, canvas } = await prepareImage(file, slot === "cover_m" ? 780 : 1600);
      const local = URL.createObjectURL(blob);
      d._local = Object.assign({}, d._local, { [slot]: local });
      const isNew = !d.id && slot === "cover" && !d.cover;
      status.textContent = "Envoi…";
      renderDrop(slot);
      renderPreview();
      d[slot] = await uploadImage(blob, slot);
      if (isNew) applyPalette(paletteOf(canvas));
      toast(slot === "cover" ? "Capture ajoutée" : "Capture mobile ajoutée");
    } catch (e) {
      if (e.code === "unauthorized") return;
      if (d._local) delete d._local[slot];
      toast(PROJ_ERR[e.code] || PROJ_ERR.upload);
    } finally {
      zone.classList.remove("is-busy");
      renderDrop(slot);
      renderPreview();
    }
  }

  /* ---- editeur */

  function field(label, input, hint) {
    return h("label", { class: "field" }, h("span", {}, label), input, hint ? h("small", { class: "hint" }, hint) : null);
  }

  function dropZone(slot, title, hint) {
    const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/avif,image/gif", class: "sr-only", id: "pe-file-" + slot });
    input.addEventListener("change", () => { handleFile(input.files[0], slot); input.value = ""; });
    const zone = h("div", { class: "drop" + (slot === "cover_m" ? " drop-m" : ""), "data-slot": slot },
      h("div", { class: "drop-media" }),
      h("div", { class: "drop-body" },
        h("p", { class: "drop-t" }, title),
        h("p", { class: "hint" }, hint),
        h("div", { class: "drop-actions" },
          h("label", { class: "btn btn-sm", for: "pe-file-" + slot }, "Choisir une image"),
          h("button", { type: "button", class: "link drop-clear", onclick: () => { pj.draft[slot] = ""; if (pj.draft._local) delete pj.draft._local[slot]; renderDrop(slot); renderPreview(); } }, "Retirer")),
        h("p", { class: "drop-status", "aria-live": "polite" })),
      input
    );
    ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove("is-over")));
    zone.addEventListener("drop", (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0], slot); });
    return zone;
  }

  function renderDrop(slot) {
    const zone = $(`[data-slot="${slot}"]`);
    if (!zone || !pj.draft) return;
    const d = pj.draft;
    const src = (d._local && d._local[slot]) || imgSrc(d[slot]);
    fill($(".drop-media", zone), src ? h("img", { src, alt: "" }) : h("span", { class: "drop-ph" }, slot === "cover_m" ? "9:19" : "16:10"));
    $(".drop-clear", zone).hidden = !d[slot];
    if (!zone.classList.contains("is-busy")) $(".drop-status", zone).textContent = "";
    const pal = $("#pe-palette");
    if (pal && slot === "cover") pal.disabled = !d.cover;
  }

  function colorField(key, label) {
    const d = pj.draft;
    const picker = h("input", { type: "color", value: d[key], "aria-label": label });
    const text = h("input", { type: "text", value: d[key], maxlength: "7", spellcheck: "false", "aria-label": label + " (code)" });
    picker.addEventListener("input", () => { d[key] = picker.value; text.value = picker.value; renderPreview(); });
    text.addEventListener("input", () => {
      const v = text.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { d[key] = v.toLowerCase(); picker.value = d[key]; renderPreview(); }
    });
    return h("div", { class: "color", "data-color": key }, h("span", { class: "color-l" }, label), h("span", { class: "color-in" }, picker, text));
  }

  function renderTexts() {
    const box = $("#pe-texts");
    if (!box) return;
    const d = pj.draft;
    const l = pj.lang;
    const rtl = l === "ar" ? "rtl" : null;
    const cat = h("input", { type: "text", maxlength: "60", value: d.cat[l] || "", dir: rtl, placeholder: l === "fr" ? "SaaS IA, Boutique en ligne…" : "" });
    cat.addEventListener("input", () => { d.cat[l] = cat.value; renderPreview(); });
    const sum = h("textarea", { rows: "5", maxlength: "600", dir: rtl, placeholder: l === "fr" ? "Ce que fait le site, en deux phrases." : "" });
    sum.value = d.summary[l] || "";
    const count = h("small", { class: "hint count" }, `${sum.value.length} / 600`);
    sum.addEventListener("input", () => { d.summary[l] = sum.value; count.textContent = `${sum.value.length} / 600`; });
    const tags = h("input", { type: "text", maxlength: "320", value: (d.tags[l] || []).join(", "), dir: rtl, placeholder: l === "fr" ? "Paiement à la livraison, FR · AR · EN" : "" });
    tags.addEventListener("input", () => {
      d.tags[l] = tags.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8);
    });
    fill(box,
      h("div", { class: "seg seg-sm", role: "group", "aria-label": "Langue des textes" },
        P_LANGS.map(([k, label]) => h("button", {
          type: "button",
          "aria-pressed": String(k === l),
          onclick: () => { pj.lang = k; renderTexts(); },
        }, label, k !== "fr" && !(d.summary[k] || d.cat[k]) ? h("i", { class: "seg-dot", title: "Pas encore traduit" }) : null))
      ),
      l === "fr" ? null : h("p", { class: "hint" }, "Laissé vide, le site affiche le texte français."),
      field("Catégorie", cat),
      h("label", { class: "field" }, h("span", {}, "Description"), sum, count),
      field("Mots-clés", tags, "Séparés par des virgules, 8 au maximum.")
    );
  }

  function renderPreview() {
    const box = $("#pe-preview");
    const d = pj.draft;
    if (!box || !d) return;
    const shot = (d._local && d._local.cover) || imgSrc(d.cover);
    const shotM = (d._local && d._local.cover_m) || imgSrc(d.cover_m);
    box.style.setProperty("--pbg", d.bg);
    box.style.setProperty("--pfg", inkOn(d.bg));
    box.style.setProperty("--pac", d.accent);
    box.style.setProperty("--pac2", d.accent2);
    fill(box,
      h("div", { class: "pv-top" },
        h("span", {}, "01"),
        h("span", {}, [KINDS[d.kind], d.year].filter(Boolean).join(" · "))),
      h("p", { class: "pv-title" }, d.title || "Nom du projet"),
      h("p", { class: "pv-cat" }, d.cat.fr || "Catégorie"),
      h("div", { class: "pv-shot" },
        h("span", { class: "pv-bar" }, h("i"), h("i"), h("i")),
        shot ? h("img", { src: shot, alt: "" }) : h("span", { class: "pv-empty" }, "Capture ordinateur")),
      shotM ? h("div", { class: "pv-phone" }, h("img", { src: shotM, alt: "" })) : null,
      h("span", { class: "pv-orb", "aria-hidden": "true" })
    );
    const head = $("#pe-head-title");
    if (head) head.textContent = d.title || (d.id ? "Sans nom" : "Nouveau projet");
    const open = $("#pe-open");
    if (open) { open.hidden = !/^https?:\/\//.test(d.url); open.href = d.url; }
  }

  function renderEditor() {
    const pane = $("#proj-editor");
    const d = pj.draft;
    if (!d) {
      fill(pane, h("div", { class: "empty" }, h("strong", {}, "Sélectionnez un projet"),
        "Ou ajoutez-en un : son nom, son lien, ses captures, ses couleurs et ses textes en trois langues."));
      return;
    }

    const title = h("input", { type: "text", id: "pe-title", maxlength: "80", required: true, value: d.title, placeholder: "Hooked Lab" });
    title.addEventListener("input", () => { d.title = title.value; renderPreview(); });
    const url = h("input", { type: "url", inputmode: "url", maxlength: "300", value: d.url, placeholder: "https://monsite.com/" });
    url.addEventListener("input", () => { d.url = url.value.trim(); renderPreview(); });
    url.addEventListener("blur", () => {
      const v = url.value.trim();
      if (v && !/^https?:\/\//i.test(v) && /\./.test(v)) { url.value = "https://" + v; d.url = url.value; renderPreview(); }
    });
    const year = h("input", { type: "number", min: "2000", max: "2100", step: "1", value: d.year || "", inputmode: "numeric" });
    year.addEventListener("input", () => { d.year = year.value ? Number(year.value) : null; renderPreview(); });
    const pub = h("input", { type: "checkbox", role: "switch", checked: d.published });
    pub.addEventListener("change", () => { d.published = pub.checked; });

    const kinds = h("div", { class: "seg seg-sm", role: "group", "aria-label": "Type de projet" },
      Object.entries(KINDS).map(([k, label]) => h("button", {
        type: "button",
        "aria-pressed": String(d.kind === k),
        onclick: (e) => {
          d.kind = k;
          $$("button", kinds).forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
          renderPreview();
        },
      }, label))
    );

    const form = h("form", { class: "pe", novalidate: true, onsubmit: saveProject },
      h("button", { type: "button", class: "btn back", onclick: () => { if (leaveEditor()) { pj.draft = null; pj.current = null; $("#projects").classList.remove("show-detail"); renderProjList(); renderEditor(); } } }, "← Projets"),
      h("header", { class: "pe-head" },
        h("h1", { id: "pe-head-title" }),
        h("a", { class: "link", id: "pe-open", target: "_blank", rel: "noopener" }, "Ouvrir le site ↗")),
      h("div", { class: "pe-grid" },
        h("div", { class: "pe-col" },
          h("section", { class: "pe-sec" },
            h("h2", {}, "L'essentiel"),
            field("Nom du projet", title),
            h("div", { class: "field" }, h("span", {}, "Type"), kinds),
            field("Adresse du site", url),
            h("div", { class: "pe-row" },
              field("Année", year),
              h("label", { class: "switch" }, pub, h("span", { class: "switch-ui", "aria-hidden": "true" }), h("span", {}, "Visible sur le site")))),
          h("section", { class: "pe-sec" },
            h("h2", {}, "Captures d'écran"),
            dropZone("cover", "Ordinateur", "Format paysage, idéalement 1600 × 1000. Convertie en WebP automatiquement."),
            dropZone("cover_m", "Téléphone (facultatif)", "Format portrait. Affichée dans un téléphone à côté de la capture ordinateur.")),
          h("section", { class: "pe-sec" },
            h("div", { class: "pe-sec-head" },
              h("h2", {}, "Couleurs"),
              h("button", { type: "button", class: "link", id: "pe-palette", onclick: paletteFromCover }, "Reprendre celles de la capture")),
            h("p", { class: "hint" }, "Le site prend ces couleurs quand le projet s'affiche : le fond, puis deux teintes pour l'orbe et les détails."),
            h("div", { class: "colors" }, colorField("bg", "Fond"), colorField("accent", "Accent"), colorField("accent2", "Accent 2"))),
          h("section", { class: "pe-sec" }, h("h2", {}, "Textes"), h("div", { id: "pe-texts", class: "pe-texts" }))
        ),
        h("aside", { class: "pe-side" },
          h("p", { class: "block-t" }, "Aperçu"),
          h("div", { class: "pv", id: "pe-preview" }),
          h("p", { class: "hint" }, "Les premiers projets de la liste sont présentés en grand sur le site ; tous apparaissent dans l'index. Utilisez ↑ ↓ pour choisir l'ordre."))
      ),
      h("p", { class: "form-error", id: "pe-error", role: "alert" }),
      h("div", { class: "pe-actions" })
    );
    fill(pane, form);
    renderActions();
    renderDrop("cover");
    renderDrop("cover_m");
    renderTexts();
    renderPreview();
  }

  // Seule la barre d'actions change : les champs restent tels quels.
  function renderActions() {
    const bar = $(".pe-actions");
    const d = pj.draft;
    if (!bar || !d) return;
    let del = null;
    if (d.id && pj.confirm) {
      del = h("span", { class: "confirm" }, "Supprimer ce projet ?",
        h("button", { type: "button", class: "btn btn-danger", onclick: deleteProject }, "Oui, supprimer"),
        h("button", { type: "button", class: "btn", onclick: () => { pj.confirm = false; renderActions(); } }, "Non"));
    } else if (d.id) {
      del = h("button", { type: "button", class: "btn btn-danger pe-del", onclick: () => { pj.confirm = true; renderActions(); } }, "Supprimer");
    }
    fill(bar,
      h("button", { type: "submit", class: "btn btn-primary", id: "pe-save" }, d.id ? "Enregistrer" : "Ajouter le projet"),
      h("button", { type: "button", class: "btn", onclick: cancelEdit }, "Annuler"),
      del
    );
  }

  function cancelEdit() {
    if (!leaveEditor()) return;
    discardUploads();
    pj.draft = null;
    pj.current = null;
    $("#projects").classList.remove("show-detail");
    renderProjList();
    renderEditor();
  }

  async function saveProject(e) {
    e.preventDefault();
    const d = pj.draft;
    const err = $("#pe-error");
    if (pj.busy || !d) return;
    err.textContent = "";
    if (!d.title.trim()) { err.textContent = PROJ_ERR.title_required; $("#pe-title").focus(); return; }
    if (d.url && !/^https?:\/\//i.test(d.url)) { err.textContent = PROJ_ERR.bad_url; return; }
    if ($(".drop.is-busy")) { err.textContent = "Patientez : une image est en cours d'envoi."; return; }
    pj.busy = true;
    const btn = $("#pe-save");
    btn.disabled = true;
    const before = d.id ? pj.list.find((p) => p.id === d.id) : null;
    const payload = Object.assign({}, d);
    delete payload._local;
    try {
      const res = await api("projects", { method: "POST", body: JSON.stringify(payload) });
      const stale = pj.uploads.filter((u) => u !== d.cover && u !== d.cover_m);
      if (before) {
        if (before.cover !== d.cover) stale.push(before.cover);
        if (before.cover_m !== d.cover_m) stale.push(before.cover_m);
      }
      removeImages(stale);
      pj.uploads = [];
      toast(d.id ? "Projet enregistré" : "Projet ajouté au site");
      pj.draft = null;
      pj.current = res.id;
      await loadProjects();
      openProject(res.id, true);
    } catch (ex) {
      if (ex.code === "unauthorized") return;
      err.textContent = PROJ_ERR[ex.code] || PROJ_ERR.server;
      if (ex.code === "not_found") loadProjects();
    } finally {
      pj.busy = false;
      const b = $("#pe-save");
      if (b) b.disabled = false;
    }
  }

  async function deleteProject() {
    const d = pj.draft;
    if (!d || !d.id) return;
    const before = pj.list.find((p) => p.id === d.id);
    try {
      await api("projects?id=" + d.id, { method: "DELETE" });
      removeImages([...(before ? [before.cover, before.cover_m] : []), ...pj.uploads]);
      pj.uploads = [];
      pj.draft = null;
      pj.current = null;
      $("#projects").classList.remove("show-detail");
      toast("Projet supprimé");
      await loadProjects();
    } catch (e) {
      if (e.code !== "unauthorized") toast("La suppression a échoué.");
    }
  }

  addEventListener("beforeunload", (e) => {
    if (dirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ----------------------------------------------------------- demarrage */

  api("session")
    .then(showApp)
    .catch((e) => { if (e.code !== "unauthorized") showLogin(); });
})();
