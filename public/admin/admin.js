/* ============================================================================
   Espace admin : connexion, boite de reception, statistiques.
   Toutes les donnees viennent de /api/admin/* (session par cookie HttpOnly).
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
    locked: "Trop d'essais. Réessayez dans 15 minutes.",
    not_configured: "L'espace admin n'est pas encore configuré : ajoutez la base D1 (liaison DB) et la variable ADMIN_PASSWORD dans Cloudflare, puis redéployez.",
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

  async function api(path, opts = {}) {
    const res = await fetch("/api/admin/" + path, {
      credentials: "same-origin",
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== "login") {
      showLogin();
      throw Object.assign(new Error("unauthorized"), { code: "unauthorized" });
    }
    if (!res.ok || data.ok === false) {
      throw Object.assign(new Error(data.error || "server"), { code: data.error || "server", status: res.status });
    }
    return data;
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
    if (location.hash === "#stats") loadMessages(true);
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

  function route() {
    select(location.hash === "#stats" ? "stats" : "messages");
  }

  function select(tab) {
    $("#tab-messages").setAttribute("aria-selected", String(tab === "messages"));
    $("#tab-stats").setAttribute("aria-selected", String(tab === "stats"));
    $("#view-messages").hidden = tab !== "messages";
    $("#view-stats").hidden = tab !== "stats";
    if (tab === "stats") loadStats();
    else loadMessages();
  }

  addEventListener("hashchange", () => { if (!$("#app").hidden) route(); });
  $("#tab-messages").addEventListener("click", () => { history.replaceState(null, "", "#messages"); select("messages"); });
  $("#tab-stats").addEventListener("click", () => { history.replaceState(null, "", "#stats"); select("stats"); });

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
          e.code === "not_configured" ? "La base D1 n'est pas encore reliée au projet Cloudflare." : "Réessayez dans un instant."));
      }
    }
  }

  function renderBadge() {
    const n = box.counts.new || 0;
    const badge = $("#badge");
    badge.hidden = !n;
    badge.textContent = String(n);
    document.title = (n ? `(${n}) ` : "") + "Admin · youcef.";
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
      toast(e.code === "not_configured" ? "Base D1 non reliée : statistiques indisponibles" : "Statistiques indisponibles pour le moment");
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

  /* ----------------------------------------------------------- demarrage */

  api("session")
    .then(showApp)
    .catch((e) => { if (e.code !== "unauthorized") showLogin(); });
})();
