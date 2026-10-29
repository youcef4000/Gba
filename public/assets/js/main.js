/* ============================================================================
   Bornz Studio — portfolio. Toute l'interaction de la page.

   Demarrage :
     1. langue sauvegardee appliquee, compteur de chargement lance ;
     2. polices pretes -> l'intro (hero + manifeste) est construite ;
     3. projets recus (Supabase, sinon copie locale) -> le reste est construit ;
     4. le rideau tombe, l'orbe quitte le centre et se pose dans le "o".

   L'orbe (orb.js) est pilotee ici a chaque image : sa position, sa taille
   et ses couleurs dependent de la section a l'ecran (voir orbTarget).
   Les animations au scroll vivent dans deux gsap.matchMedia : changer de
   langue les defait, re-ecrit les textes, puis les reconstruit.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const CFG = window.SITE_CONFIG || {};
  const I18N = window.I18N || {};
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const Split = window.SplitText;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const motion = !reduce && !!gsap && !!ST && !!Split;
  const FEATURED = 8;

  if (!motion) root.classList.add("no-motion");
  else root.classList.add("intro-pending");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloque */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* stockage bloque */ } },
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, f) => a + (b - a) * f;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>';
  const icon = (html) => { const t = document.createElement("template"); t.innerHTML = html; return t.content.firstChild; };

  /* ================================================================ i18n */

  // Le francais est la source : on le relit dans le DOM avant tout decoupage.
  const FR = {};
  $$("[data-i18n]").forEach((el) => { FR[el.dataset.i18n] = el.innerHTML; });
  $$("[data-i18n-ph]").forEach((el) => { FR["ph:" + el.dataset.i18nPh] = el.placeholder; });

  let lang = "fr";
  const str = () => (I18N.str && I18N.str[lang]) || I18N.str.fr;
  const words = () => (I18N.words && I18N.words[lang]) || I18N.words.fr;
  const pick = (o) => (o && (o[lang] || o.fr)) || "";
  const hasArabic = (s) => /[؀-ۿ]/.test(s || "");

  function applyLang(next) {
    lang = ["fr", "ar", "en"].includes(next) ? next : "fr";
    const dict = lang === "fr" ? {} : I18N[lang] || {};
    $$("[data-i18n]").forEach((el) => {
      const k = el.dataset.i18n;
      const v = k in dict ? dict[k] : FR[k];
      if (v != null && el.innerHTML !== v) el.innerHTML = v;
    });
    $$("[data-i18n-ph]").forEach((el) => {
      const k = el.dataset.i18nPh;
      el.placeholder = k in dict ? dict[k] : FR["ph:" + k];
    });
    $$(".svc-name").forEach((el) => { el.dataset.text = el.textContent; });
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = str().title;
    $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    rotator.reset();
    updateClock();
    updateMessage();
  }

  /* ============================================================== config */

  const isSet = (v) => !!v && !/^2130+$/.test(v) && !/exemple\.com$/i.test(v);
  const waNumber = isSet(CFG.whatsapp) ? String(CFG.whatsapp).replace(/\D/g, "") : "";
  const email = isSet(CFG.email) ? CFG.email : "";

  function fillContacts() {
    $$(".contact-wa").forEach((a) => {
      if (!waNumber) { a.hidden = true; return; }
      a.href = "https://wa.me/" + waNumber;
      a.textContent = "WhatsApp +" + waNumber;
    });
    $$(".contact-mail").forEach((a) => {
      if (!email) { a.hidden = true; return; }
      a.href = "mailto:" + email;
      a.textContent = email;
    });
    const wa = $("#cfg-wa");
    if (wa) wa.hidden = !waNumber;
    const alt = $(".cfg-alt");
    if (alt) {
      alt.hidden = !waNumber && !email;
      const sep = $(".cfg-sep", alt);
      if (sep) sep.hidden = !(waNumber && email);
    }
  }

  /* ============================================================ supabase */

  const SB = CFG.supabase || {};
  const SB_OK = !!(SB.url && SB.key && !/^SUPABASE_/.test(SB.key));
  const rpc = (fn, args, opts = {}) =>
    fetch(SB.url.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
      method: "POST",
      keepalive: !!opts.keepalive,
      signal: opts.signal,
      headers: { "content-type": "application/json", apikey: SB.key },
      body: JSON.stringify(args || {}),
    });

  /* ============================================================ analytics */

  // Statistiques maison : un evenement = un appel a track_event.
  // Pas de cookie, pas d'IP stockee ; "Do Not Track" est respecte.
  const track = (() => {
    const off =
      CFG.analytics === false ||
      !SB_OK ||
      !/^https?:$/.test(location.protocol) ||
      /^(localhost|127\.)/.test(location.hostname) ||
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1";
    const once = new Set();
    return (type, label = "", unique = false) => {
      if (off) return;
      const key = type + ":" + label;
      if (unique && once.has(key)) return;
      once.add(key);
      const params = new URLSearchParams(location.search);
      let ref = type === "pageview" ? document.referrer : "";
      try { if (ref && new URL(ref).host === location.host) ref = ""; } catch (e) { ref = ""; }
      const p = { type, label, lang, path: location.pathname, ref, utm: type === "pageview" ? params.get("utm_source") || "" : "" };
      try { rpc("track_event", { p }, { keepalive: true }).catch(() => {}); } catch (e) { /* facultatif */ }
    };
  })();

  function initTracking() {
    track("pageview");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          track("reach", en.target.id, true);
          io.unobserve(en.target);
        });
      }, { rootMargin: "-45% 0px -45% 0px" });
      ["projets", "services", "contact"].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
    }
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[href]");
      if (!a) return;
      if (a.id === "cfg-wa" || a.classList.contains("contact-wa")) { track("click", "WhatsApp"); return; }
      if (a.classList.contains("contact-mail")) { track("click", "E-mail"); return; }
      if (/^https?:/.test(a.href) && a.host !== location.host) {
        const path = a.pathname.split("/").filter(Boolean)[0];
        track("click", a.host.replace(/^www\./, "") + (path ? "/" + path : ""));
      }
    });
  }

  /* ============================================================= projets */

  let projects = [];
  const HEX = /^#[0-9a-f]{6}$/i;

  function normalize(p) {
    const txt = (o) => (o && typeof o === "object" ? o : { fr: String(o || "") });
    const tags = (o) => {
      const out = {};
      ["fr", "en", "ar"].forEach((l) => { out[l] = Array.isArray(o && o[l]) ? o[l].filter(Boolean).map(String) : []; });
      return out;
    };
    const url = /^https?:\/\//.test(p.url || "") ? p.url : "";
    const img = (v) => (/^(https?:\/\/|assets\/)/.test(v || "") ? v : "");
    return {
      title: String(p.title || "").trim(),
      kind: ["site", "app", "demo"].includes(p.kind) ? p.kind : "site",
      url,
      year: p.year || "",
      cat: txt(p.cat),
      summary: txt(p.summary),
      tags: tags(p.tags),
      bg: HEX.test(p.bg) ? p.bg : "#0b0b10",
      accent: HEX.test(p.accent) ? p.accent : "#e8b84a",
      accent2: HEX.test(p.accent2) ? p.accent2 : "#9b6bff",
      cover: img(p.cover),
      cover_m: img(p.cover_m),
    };
  }

  async function loadProjects() {
    const fromDb = async () => {
      if (!SB_OK) throw new Error("off");
      const ctrl = typeof AbortController === "function" ? new AbortController() : null;
      const timer = setTimeout(() => ctrl && ctrl.abort(), 3000);
      try {
        const res = await rpc("get_projects", {}, { signal: ctrl ? ctrl.signal : undefined });
        if (!res.ok) throw new Error("http");
        const data = await res.json();
        if (!Array.isArray(data)) throw new Error("shape");
        return data;
      } finally {
        clearTimeout(timer);
      }
    };
    const fromFile = async () => {
      const res = await fetch("assets/data/projects.json?v=20261030");
      return res.json();
    };
    let list = [];
    try { list = await fromDb(); } catch (e) {
      try { list = await fromFile(); } catch (e2) { list = []; }
    }
    projects = list.map(normalize).filter((p) => p.title);
  }

  // Couleur de texte lisible sur le fond d'un projet.
  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const l = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return l > 0.42 ? "#0a0a0d" : "#f2efe8";
  }
  const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return ""; } };
  const two = (n) => String(n).padStart(2, "0");

  function worldEl(p, i, total) {
    const s = str();
    const cursor = p.kind === "demo" ? "demo" : "visit";
    const cta = p.kind === "demo" ? s.demo : s.visit;
    const meta = [s.kinds[p.kind], p.year].filter(Boolean).join(" · ");
    const tags = p.tags[lang] && p.tags[lang].length ? p.tags[lang] : p.tags.fr;
    const link = (cls, extra, ...kids) => p.url
      ? h("a", Object.assign({ class: cls, href: p.url, target: "_blank", rel: "noopener", "data-cursor": cursor }, extra), ...kids)
      : h("div", { class: cls }, ...kids);

    const visual = link("w-visual", { tabindex: "-1", "aria-hidden": "true" },
      h("span", { class: "w-browser" },
        h("span", { class: "w-bar" }, h("i"), h("i"), h("i"), h("span", { text: hostOf(p.url) })),
        p.cover
          ? h("span", { class: "w-shot" }, h("img", { src: p.cover, alt: "", loading: i < 2 ? "eager" : "lazy", decoding: "async" }))
          : h("span", { class: "w-poster", text: p.title })),
      p.cover_m ? h("span", { class: "w-phone" }, h("img", { src: p.cover_m, alt: "", loading: i < 2 ? "eager" : "lazy", decoding: "async" })) : null,
      h("span", { class: "w-seed" })
    );

    const summary = pick(p.summary);
    const cat = pick(p.cat);
    return h("article", {
      class: "world" + (p.cover_m ? " has-phone" : ""),
      style: `--wbg:${p.bg};--wfg:${inkOn(p.bg)};--wac:${p.accent};--wac2:${p.accent2}`,
      "aria-label": p.title,
      "data-i": i,
    },
      h("span", { class: "w-glow", "aria-hidden": "true" }),
      h("div", { class: "w-top" },
        h("span", {}, h("span", { class: "w-num", text: two(i + 1) }), " / " + two(total)),
        h("span", { text: meta })),
      h("div", { class: "w-text" },
        cat ? h("span", { class: "w-cat", text: cat }) : null,
        h("h3", { class: "w-title", text: p.title, dir: hasArabic(p.title) ? "rtl" : "ltr" }),
        summary ? h("p", { class: "w-sum", text: summary }) : null,
        tags.length ? h("ul", { class: "w-tags" }, tags.map((t) => h("li", { text: t }))) : null,
        p.url ? link("w-cta", {}, h("span", { text: cta }), icon(ARROW)) : null
      ),
      visual
    );
  }

  function rowEl(p, i) {
    const s = str();
    const inner = [
      h("span", { class: "r-n", text: two(i + 1) }),
      h("span", { class: "r-thumb" }, p.cover ? h("img", { src: p.cover, alt: "", loading: "lazy", decoding: "async" }) : null),
      h("span", { class: "r-t" }, h("span", { class: "r-dot", "aria-hidden": "true" }), h("b", { text: p.title, dir: "auto" })),
      h("span", { class: "r-c", text: pick(p.cat) }),
      h("span", { class: "r-k", text: s.kinds[p.kind] }),
      h("span", { class: "r-y", text: String(p.year || "") }),
      h("span", { class: "r-a", "aria-hidden": "true" }, icon(ARROW)),
    ];
    const a = p.url
      ? h("a", { class: "row-a", href: p.url, target: "_blank", rel: "noopener", "data-i": i }, inner)
      : h("div", { class: "row-a", "data-i": i }, inner);
    return h("li", { class: "row", "data-kind": p.kind, style: `--rac:${p.accent};--rac2:${p.accent2};--rbg:${p.bg}` }, a);
  }

  let filter = "all";

  function renderWorks() {
    const works = $("#projets");
    works.hidden = !projects.length;
    $$(".count-live").forEach((el) => { el.textContent = two(projects.length); });
    const featured = projects.slice(0, FEATURED);
    $("#stage").replaceChildren(...featured.map((p, i) => worldEl(p, i, featured.length)));
    $("#rows").replaceChildren(...projects.map(rowEl));
    $$(".filters button").forEach((b) => {
      const k = b.dataset.kind;
      const n = k === "all" ? projects.length : projects.filter((p) => p.kind === k).length;
      $(".f-n", b).textContent = String(n);
      b.hidden = k !== "all" && !n;
    });
    applyFilter(filter, false);
  }

  function applyFilter(kind, animate) {
    filter = kind;
    $$(".filters button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
    const rows = $$("#rows .row");
    const show = (r) => kind === "all" || r.dataset.kind === kind;
    if (!animate || !motion) {
      rows.forEach((r) => r.classList.toggle("is-out", !show(r)));
      return;
    }
    const visible = rows.filter((r) => !r.classList.contains("is-out"));
    gsap.to(visible, {
      opacity: 0,
      y: -10,
      duration: 0.22,
      stagger: 0.02,
      onComplete: () => {
        rows.forEach((r) => r.classList.toggle("is-out", !show(r)));
        gsap.fromTo(rows.filter(show), { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: "power3.out", clearProps: "opacity,transform" });
        refreshSoon();
      },
    });
  }

  $$(".filters button").forEach((b) => b.addEventListener("click", () => applyFilter(b.dataset.kind, true)));

  /* ========================================================= formulaire */

  const TYPE_WEIGHT = { landing: 22, vitrine: 16, shop: 42, saas: 56, app: 50, ai: 50 };

  function readForm() {
    const form = $("#cfg-form");
    if (!form) return null;
    const type = form.querySelector('input[name="type"]:checked');
    const when = form.querySelector('input[name="when"]:checked');
    const opts = $$('input[name="opt"]:checked', form);
    const label = (input) => (input ? input.nextElementSibling.textContent.trim() : "");
    return {
      typeKey: type ? type.value : "landing",
      type: label(type),
      when: label(when),
      opts: opts.map(label),
      name: $("#f-name").value.trim(),
      contact: $("#f-contact").value.trim(),
      biz: $("#f-biz").value.trim(),
      details: $("#f-details").value.trim(),
    };
  }

  function composeMessage(d) {
    const m = str().msg;
    const fill = (tpl, v) => tpl.replace("{v}", v);
    const lines = [m.hello.replace("{site}", CFG.name || "Bornz Studio"), ""];
    if (d.name) lines.push(fill(m.name, d.name));
    if (d.biz) lines.push(fill(m.biz, d.biz));
    if (d.contact) lines.push(fill(m.contact, d.contact));
    if (d.name || d.biz || d.contact) lines.push("");
    lines.push(fill(m.type, d.type));
    lines.push(fill(m.opts, d.opts.length ? d.opts.join(", ") : m.none));
    lines.push(fill(m.when, d.when));
    if (d.details) lines.push("", fill(m.details, d.details));
    lines.push("", m.end);
    return lines.join("\n");
  }

  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const isPhone = (v) => /^\+?[\d\s().-]{8,22}$/.test(v) && v.replace(/\D/g, "").length >= 8 && v.replace(/\D/g, "").length <= 15;

  let lastMessage = "";
  function updateMessage() {
    const d = readForm();
    if (!d) return;
    lastMessage = composeMessage(d);
    $("#cfg-msg").textContent = lastMessage;
    const score = Math.min(100, (TYPE_WEIGHT[d.typeKey] || 20) + d.opts.length * 7);
    $(".meter-bar i").style.width = score + "%";
    $(".meter-v").textContent = score + "%";
    const wa = $("#cfg-wa");
    if (wa && waNumber) wa.href = "https://wa.me/" + waNumber + "?text=" + encodeURIComponent(lastMessage);
  }

  function setStatus(text, isError) {
    const el = $("#cfg-status");
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function showContactError(on) {
    const input = $("#f-contact");
    input.closest(".field").classList.toggle("is-invalid", on);
    input.setAttribute("aria-invalid", String(on));
    $("#f-contact-err").hidden = !on;
  }

  async function submitForm() {
    const d = readForm();
    if (!isEmail(d.contact) && !isPhone(d.contact)) {
      showContactError(true);
      const input = $("#f-contact");
      input.focus({ preventScroll: true });
      if (lenis) lenis.scrollTo(input, { offset: -180, duration: 0.8 });
      else input.scrollIntoView({ block: "center" });
      if (motion) gsap.fromTo(input, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
      return;
    }
    showContactError(false);
    const btn = $("#cfg-submit");
    const s = str();
    btn.disabled = true;
    btn.classList.add("is-loading");
    setStatus(s.sending, false);
    try {
      if (!SB_OK) throw Object.assign(new Error("send"), { code: "server" });
      const res = await rpc("submit_message", {
        p: {
          name: d.name,
          contact: d.contact,
          business: d.biz,
          type: d.type,
          options: d.opts,
          when: d.when,
          details: d.details,
          message: lastMessage,
          lang,
          website: $("#f-website").value,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw Object.assign(new Error("send"), { code: data.error || "server" });
      setStatus("", false);
      showDone(true);
    } catch (err) {
      const code = err.code || "server";
      if (code === "invalid_contact") showContactError(true);
      setStatus((s.errors && (s.errors[code] || s.errors.server)) || "", true);
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  function showDone(on) {
    const done = $("#cfg-done");
    done.hidden = !on;
    $("#cfg-compose").hidden = on;
    if (on && motion) gsap.from(done.children, { y: 20, opacity: 0, stagger: 0.08, duration: 0.7, ease: "power3.out" });
    refreshSoon();
  }

  function initForm() {
    const form = $("#cfg-form");
    form.addEventListener("submit", (e) => { e.preventDefault(); submitForm(); });
    form.addEventListener("input", (e) => {
      if (e.target.id === "f-contact") showContactError(false);
      updateMessage();
    });
    form.addEventListener("change", (e) => {
      updateMessage();
      const chip = e.target.closest(".chip");
      if (chip && motion) gsap.fromTo(chip.querySelector("span"), { scale: 0.92 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
    });
    $("#cfg-again").addEventListener("click", () => {
      $("#f-details").value = "";
      updateMessage();
      showDone(false);
    });
    const copy = $("#cfg-copy");
    copy.addEventListener("click", () => {
      const labelEl = copy.querySelector("span");
      const original = labelEl.innerHTML;
      const flash = (text) => {
        labelEl.textContent = text;
        setTimeout(() => { labelEl.innerHTML = original; }, 2200);
      };
      const selectText = () => {
        const range = document.createRange();
        range.selectNodeContents($("#cfg-msg"));
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        flash(str().copyFail);
      };
      try { navigator.clipboard.writeText(lastMessage).then(() => flash(str().copied), selectText); } catch (e) { selectText(); }
    });
  }

  /* ======================================================= horloge, mots */

  function updateClock() {
    const el = $(".clock");
    if (!el) return;
    try { el.textContent = new Intl.DateTimeFormat(str().locale, { hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch (e) { /* tiret */ }
  }

  const rotator = (() => {
    const word = $(".rot-word");
    let i = 0;
    let timer = null;
    function reset() { i = 0; if (word) word.textContent = words()[0]; }
    function next() {
      if (!word || document.hidden || !motion) return;
      const list = words();
      i = (i + 1) % list.length;
      gsap.timeline()
        .to(word, { yPercent: -110, duration: 0.45, ease: "power3.in" })
        .add(() => { word.textContent = list[i]; })
        .fromTo(word, { yPercent: 110 }, { yPercent: 0, duration: 0.7, ease: "power3.out" });
    }
    function start() { if (motion && !timer) timer = setInterval(next, 2800); }
    return { reset, start };
  })();

  /* ======================================================== defilement */

  let lenis = null;

  function initScroll() {
    if (!motion || typeof window.Lenis !== "function") return;
    lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true });
    lenis.on("scroll", ST.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  function goTo(target) {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, offset: 0 });
    else if (target === 0) scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id === "#") { e.preventDefault(); return; }
    const target = id === "#top" ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (menuOpen) toggleMenu(false);
    goTo(target);
  });

  let refreshTimer = null;
  function refreshSoon(delay = 120) {
    if (!motion) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => ST.refresh(), delay);
  }

  /* ============================================================== menu */

  let menuOpen = false;
  function toggleMenu(open) {
    const menu = $("#menu");
    const btn = $(".menu-btn");
    menuOpen = open;
    btn.setAttribute("aria-expanded", String(open));
    if (open) {
      menu.hidden = false;
      if (lenis) lenis.stop();
      if (motion) {
        gsap.fromTo(menu, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.7, ease: "expo.out" });
        gsap.fromTo($$(".menu-links a span", menu), { yPercent: 110 }, { yPercent: 0, duration: 0.8, stagger: 0.06, ease: "expo.out", delay: 0.1 });
      }
    } else {
      if (lenis) lenis.start();
      if (motion) gsap.to(menu, { clipPath: "inset(0 0 100% 0)", duration: 0.5, ease: "expo.in", onComplete: () => { menu.hidden = true; } });
      else menu.hidden = true;
    }
  }
  $(".menu-btn").addEventListener("click", () => toggleMenu(!menuOpen));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menuOpen) toggleMenu(false); });

  /* ======================================================= services, faq */

  $$(".svc-head").forEach((btn) => {
    btn.addEventListener("click", () => {
      const li = btn.closest(".svc");
      const open = !li.classList.contains("is-open");
      li.classList.toggle("is-open", open);
      btn.setAttribute("aria-expanded", String(open));
      refreshSoon(760);
    });
  });

  $$(".qa").forEach((qa) => {
    const sum = $("summary", qa);
    const body = $(".qa-a", qa);
    sum.addEventListener("click", (e) => {
      if (!motion) return;
      e.preventDefault();
      if (qa.open) {
        gsap.to(body, { height: 0, duration: 0.45, ease: "power3.inOut", onComplete: () => { qa.open = false; gsap.set(body, { clearProps: "height" }); refreshSoon(); } });
      } else {
        qa.open = true;
        gsap.fromTo(body, { height: 0 }, { height: "auto", duration: 0.6, ease: "power3.out", clearProps: "height", onComplete: () => refreshSoon() });
      }
    });
  });

  /* ============================================================ curseur */

  function initCursor() {
    if (!finePointer || !motion) return;
    const cur = $(".cursor");
    const dot = $(".cursor-dot");
    const ring = $(".cursor-ring");
    const label = $(".cursor-label");
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
    const dx = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power3" });
    const dy = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power3" });
    const rx = gsap.quickTo(ring, "x", { duration: 0.42, ease: "power3" });
    const ry = gsap.quickTo(ring, "y", { duration: 0.42, ease: "power3" });
    let shown = false;
    addEventListener("pointermove", (e) => {
      if (!shown) { shown = true; gsap.to([dot, ring], { opacity: 1, duration: 0.3 }); }
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { shown = false; gsap.to([dot, ring], { opacity: 0, duration: 0.3 }); });
    document.addEventListener("pointerover", (e) => {
      const labelled = e.target.closest("[data-cursor]");
      const link = e.target.closest("a, button, label.chip, summary, input, textarea");
      if (labelled) label.textContent = labelled.dataset.cursor === "demo" ? str().cursorDemo : str().cursorVisit;
      cur.classList.toggle("has-label", !!labelled);
      cur.classList.toggle("is-link", !labelled && !!link);
    });
  }

  function initMagnetic() {
    if (!finePointer || !motion) return;
    $$(".magnetic").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.3);
        yTo((e.clientY - r.top - r.height / 2) * 0.38);
      });
      el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });
  }

  // Apercu flottant de l'index : suit la souris et penche selon la vitesse.
  function initPeek() {
    if (!finePointer || !motion) return;
    const peek = $(".peek");
    const inner = $(".peek-in");
    const xTo = gsap.quickTo(peek, "x", { duration: 0.6, ease: "power3" });
    const yTo = gsap.quickTo(peek, "y", { duration: 0.6, ease: "power3" });
    const rTo = gsap.quickTo(peek, "rotation", { duration: 0.8, ease: "power3" });
    let lastX = 0;
    let current = -1;
    gsap.set(peek, { xPercent: -50, yPercent: -50 });
    const rows = $("#rows");
    rows.addEventListener("pointermove", (e) => {
      xTo(e.clientX); yTo(e.clientY);
      rTo(clamp((e.clientX - lastX) * 0.6, -14, 14));
      lastX = e.clientX;
    });
    rows.addEventListener("pointerover", (e) => {
      const a = e.target.closest(".row-a");
      if (!a) return;
      const i = Number(a.dataset.i);
      const p = projects[i];
      if (!p || !p.cover || i === current) return;
      current = i;
      const img = h("img", { src: p.cover, alt: "" });
      inner.append(img);
      gsap.fromTo(img, { clipPath: "inset(100% 0 0 0)", scale: 1.2 }, { clipPath: "inset(0% 0 0 0)", scale: 1, duration: 0.6, ease: "expo.out" });
      while (inner.children.length > 3) inner.firstChild.remove();
      gsap.to(peek, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "power3.out" });
    });
    rows.addEventListener("pointerleave", () => {
      current = -1;
      gsap.to(peek, { autoAlpha: 0, scale: 0.85, duration: 0.35, ease: "power2.in" });
    });
  }

  /* ============================================================ theme */

  const DEFAULT_THEME = { bg: "#0a0a0d", fg: "#f2efe8", accent: "#e8b84a", accent2: "#9b6bff" };
  const themeMeta = $('meta[name="theme-color"]');
  let themeKey = "";
  function setTheme(t) {
    const key = t.bg + t.fg + t.accent + t.accent2;
    if (key === themeKey) return;
    themeKey = key;
    if (themeMeta) themeMeta.content = t.bg;
    gsap.to(root, { "--bg": t.bg, "--fg": t.fg, "--accent": t.accent, "--accent2": t.accent2, duration: 0.7, ease: "power2.out", overwrite: "auto" });
  }

  /* ============================================================== orbe */

  const OrbLib = window.BornzOrb;
  const rgb = OrbLib ? OrbLib.rgb : () => [0, 0, 0];
  const mixRgb = OrbLib ? OrbLib.mixRgb : (a) => a;
  const WHITE = [1, 1, 1];
  const BRAND = { c1: rgb("#e8b84a"), c2: rgb("#ff5a1f"), c3: rgb("#9b6bff"), c4: rgb("#2fd3e6") };
  const paletteOf = (p) => {
    const c1 = rgb(p.accent);
    const c3 = rgb(p.accent2);
    return { c1, c2: mixRgb(c1, WHITE, 0.28), c3, c4: mixRgb(c3, WHITE, 0.32) };
  };

  const orb = {
    gl: null,
    mode: "intro",
    modeAt: 0,
    loaderR: 0,
    intro: { grow: 0, implode: 0 },
    s: { x: innerWidth / 2, y: innerHeight / 2, r: 0, dim: 0, inside: 0, alpha: 1, energy: 0, lx: 0, ly: 0, c1: BRAND.c1.slice(), c2: BRAND.c2.slice(), c3: BRAND.c3.slice(), c4: BRAND.c4.slice(), bg: rgb("#0a0a0d") },
    flow: 0,
    mouse: { x: innerWidth * 0.6, y: innerHeight * 0.4, speed: 0, seen: false },
    back: null,
    slow: 16,
    frames: 0,
  };

  let introST = null;
  let introOutST = null;
  let worksST = null;
  let worksTL = null;
  let worksMeta = null;

  const centerOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  };

  function worksPhase() {
    const { n, L, hold } = worksMeta;
    if (n < 2) return { from: 0, to: 0, f: 0 };
    const t = worksTL.time() - hold;
    if (t <= 0) return { from: 0, to: 1, f: 0 };
    const i = Math.min(n - 2, Math.floor(t / L));
    const f = clamp((t - i * L) / 1, 0, 1);
    return { from: i, to: i + 1, f: easeIO(f) };
  }

  function resolveMode(y, vh) {
    if (root.classList.contains("is-loading")) return "loading";
    if (introST && y < (introOutST ? introOutST.end : introST.end) - 2) return "intro";
    if (worksST && y >= worksST.start - vh * 0.75 && y <= worksST.end + vh * 0.35) return "works";
    const foot = $("#footer");
    if (foot && ST && y > ST.maxScroll(window) - foot.offsetHeight - 4) return "footer";
    return "none";
  }

  function orbTarget(mode, vw, vh) {
    const t = { x: orb.s.x, y: orb.s.y, r: 0, dim: 0, inside: 0, colors: BRAND, back: false };
    if (mode === "loading") {
      return Object.assign(t, { x: vw / 2, y: vh * 0.45, r: orb.loaderR });
    }
    if (mode === "intro") {
      const hole = centerOf($(".mark-hero .mark-orb"));
      if (!hole) return t;
      const g = orb.intro.grow;
      const im = orb.intro.implode;
      const e = easeIO(g);
      const cover = Math.hypot(vw, vh) * 0.6;
      t.x = lerp(hole.x, vw / 2, e);
      t.y = lerp(hole.y, vh / 2, e);
      t.r = lerp(hole.r, cover, g ** 1.7) * (1 - im ** 1.4);
      t.inside = smooth(0.55, 1, g) * (1 - smooth(0, 0.45, im));
      t.dim = 0.66 * smooth(0.3, 0.92, g) * (1 - smooth(0, 0.5, im));
      t.back = true;
      return t;
    }
    if (mode === "works" && worksMeta) {
      const worlds = worksMeta.worlds;
      const ph = worksPhase();
      const a = centerOf($(".w-seed", worlds[ph.from]));
      const b = centerOf($(".w-seed", worlds[ph.to])) || a;
      if (!a) return t;
      t.x = lerp(a.x, b.x, ph.f);
      t.y = lerp(a.y, b.y, ph.f);
      t.r = lerp(a.r, b.r, ph.f) * (1 + 0.55 * Math.sin(Math.PI * ph.f));
      const pa = worksMeta.palettes[ph.from];
      const pb = worksMeta.palettes[ph.to] || pa;
      t.colors = { c1: mixRgb(pa.c1, pb.c1, ph.f), c2: mixRgb(pa.c2, pb.c2, ph.f), c3: mixRgb(pa.c3, pb.c3, ph.f), c4: mixRgb(pa.c4, pb.c4, ph.f) };
      t.active = ph.f > 0.5 ? ph.to : ph.from;
      return t;
    }
    if (mode === "footer") {
      const hole = $(".mark-foot .mark-orb");
      const c = centerOf(hole);
      if (!c) return t;
      // Le pied de page est revele par le bas : l'orbe n'apparait que si son trou est decouvert.
      const foot = $("#footer");
      const curtain = foot.classList.contains("is-curtain");
      const uncoveredTop = curtain ? vh - (foot.offsetHeight - (ST.maxScroll(window) - window.scrollY)) : 0;
      const visible = Math.min(smooth(-c.r, c.r * 0.5, c.y - c.r - uncoveredTop), smooth(-c.r, c.r * 0.5, vh - (c.y + c.r)));
      return Object.assign(t, { x: c.x, y: c.y, r: c.r * visible });
    }
    return t;
  }

  let lastScrollY = 0;
  let scrollV = 0;

  function orbTick(time, dt) {
    const vw = innerWidth;
    const vh = innerHeight;
    const y = window.scrollY;
    const step = Math.min(dt, 64) / 16.67;
    scrollV = lerp(scrollV, (y - lastScrollY) / Math.max(step, 0.2), 0.2);
    lastScrollY = y;

    const mode = resolveMode(y, vh);
    if (mode !== orb.mode) { orb.mode = mode; orb.modeAt = time; }
    const tg = orbTarget(mode, vw, vh);
    const s = orb.s;
    // Suivi serre une fois installee, plus souple pendant un changement de section.
    const settling = time - orb.modeAt < 0.9 || mode === "loading";
    const k = 1 - Math.pow(1 - (settling ? 0.09 : 0.32), step);
    s.x = lerp(s.x, tg.x, k);
    s.y = lerp(s.y, tg.y, k);
    s.r = lerp(s.r, tg.r, k);
    if (Math.abs(s.r - tg.r) < 0.05) s.r = tg.r;
    s.dim = lerp(s.dim, tg.dim, k);
    s.inside = lerp(s.inside, tg.inside, k);
    const kc = 1 - Math.pow(0.9, step);
    ["c1", "c2", "c3", "c4"].forEach((c) => { s[c] = mixRgb(s[c], tg.colors[c], kc); });
    if (tg.back !== orb.back) { orb.back = tg.back; root.classList.toggle("orb-back", tg.back); }

    // Lumiere : suit la souris, ou tourne doucement sur ecran tactile.
    const m = orb.mouse;
    const span = Math.max(s.r * 2.5, Math.min(vw, vh) * 0.5);
    const lx = m.seen ? clamp((m.x - s.x) / span, -1, 1) : Math.sin(time * 0.4) * 0.6;
    const ly = m.seen ? clamp((m.y - s.y) / span, -1, 1) : Math.cos(time * 0.33) * 0.4;
    const kl = 1 - Math.pow(0.94, step);
    s.lx = lerp(s.lx, lx, kl);
    s.ly = lerp(s.ly, ly, kl);
    m.speed *= Math.pow(0.9, step);
    s.energy = lerp(s.energy, clamp(m.speed / 1800 + Math.abs(scrollV) / 60, 0, 1), 1 - Math.pow(0.93, step));
    orb.flow += (dt / 1000) * (1 + s.energy * 3);

    if (orb.gl) {
      orb.gl.render(s, orb.flow);
      // Si l'orbe pleine page fait tomber sous ~40 images/s, on allege.
      if (s.r > 2) {
        orb.slow = lerp(orb.slow, dt, 0.05);
        orb.frames++;
        if (orb.frames > 90 && orb.slow > 26 && orb.gl.degrade()) { orb.frames = 0; orb.slow = 16; }
      }
    }

    if (mode === "works" && tg.active != null && worksMeta) {
      const p = worksMeta.projects[tg.active];
      if (p) setTheme({ bg: p.bg, fg: inkOn(p.bg), accent: p.accent, accent2: p.accent2 });
    } else if (mode !== "loading") {
      setTheme(DEFAULT_THEME);
    }
  }

  function initOrb() {
    if (!motion || !OrbLib) { root.classList.add("no-gl"); return; }
    orb.gl = OrbLib.create($(".orb-gl"));
    if (!orb.gl) { root.classList.add("no-gl"); return; }
    root.classList.add("gl");
    addEventListener("resize", () => orb.gl.resize());
    addEventListener("pointermove", (e) => {
      const m = orb.mouse;
      const d = Math.hypot(e.clientX - m.x, e.clientY - m.y);
      m.speed = Math.max(m.speed, d * 30);
      m.x = e.clientX;
      m.y = e.clientY;
      m.seen = e.pointerType === "mouse";
    }, { passive: true });
  }

  /* ================================================= bandeau, nav, pied */

  function initTicker() {
    const nav = $(".nav");
    const band = $(".band-track");
    const group = $(".band-group");
    const foot = $("#footer");
    let bandX = 0;
    let bandDir = 1;
    let groupW = 0;
    const fillBand = () => {
      if (!band || !group) return;
      $$(".band-group", band).slice(1).forEach((g) => g.remove());
      groupW = group.offsetWidth;
      const copies = Math.max(2, Math.ceil((innerWidth * 2) / Math.max(groupW, 1)));
      for (let i = 1; i < copies; i++) {
        const c = group.cloneNode(true);
        c.setAttribute("aria-hidden", "true");
        c.removeAttribute("data-i18n");
        band.append(c);
      }
    };
    fillBand();
    addEventListener("resize", fillBand);
    document.addEventListener("bz:lang", fillBand);

    let lastY = window.scrollY;
    gsap.ticker.add((time, dt) => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      // Navigation : cachee en descendant, revient des qu'on remonte.
      if (!menuOpen) {
        if (y > 160 && dy > 2) nav.classList.add("is-hidden");
        else if (dy < -2 || y < 160) nav.classList.remove("is-hidden");
      }
      nav.classList.toggle("is-scrolled", y > 40);
      // Bandeau : avance tout seul, accelere et penche avec le scroll.
      if (band && groupW && !reduce) {
        if (Math.abs(dy) > 0.5) bandDir = dy > 0 ? 1 : -1;
        const speed = 70 + Math.min(Math.abs(scrollV) * 22, 1400);
        bandX -= (speed * bandDir * Math.min(dt, 64)) / 1000;
        if (bandX <= -groupW) bandX += groupW;
        if (bandX > 0) bandX -= groupW;
        band.style.transform = `translate3d(${bandX}px,0,0) skewX(${clamp(-scrollV * 0.5, -10, 10)}deg)`;
      }
      // Pied de page en rideau : visible seulement quand on approche du bas.
      if (foot.classList.contains("is-curtain")) {
        const near = y > ST.maxScroll(window) - foot.offsetHeight - innerHeight * 0.5;
        foot.style.visibility = near ? "visible" : "hidden";
      }
    });
  }

  function layoutFooter() {
    const foot = $("#footer");
    const main = $("#main");
    foot.classList.remove("is-curtain");
    foot.style.visibility = "";
    main.style.marginBottom = "";
    if (!motion) return;
    const hgt = foot.offsetHeight;
    if (hgt <= innerHeight) {
      foot.classList.add("is-curtain");
      main.style.marginBottom = hgt + "px";
    }
  }

  /* ========================================================= intro (hero) */

  let mmIntro = null;
  let mmRest = null;
  let introPlayed = false;

  function playIntro() {
    root.classList.remove("intro-pending");
    if (introPlayed || !motion) { rotator.start(); return; }
    introPlayed = true;
    const tl = gsap.timeline({ onComplete: () => rotator.start() });
    tl.from(".hero .ht-in", { yPercent: 110, duration: 1.2, stagger: 0.1, ease: "expo.out" }, 0)
      .from(".mark-hero .mk", { yPercent: 70, opacity: 0, duration: 1.3, stagger: 0.07, ease: "expo.out" }, 0.08)
      .from(".hero-meta > *, .hero-side > *, .hero-foot > *", { y: 18, opacity: 0, duration: 0.9, stagger: 0.05, ease: "power3.out" }, 0.3);
  }

  function buildIntro() {
    mmIntro = gsap.matchMedia();
    mmIntro.add("(prefers-reduced-motion: no-preference)", () => {
      const man = $(".manifesto");
      const split = new Split($(".man-text"), { type: "words", wordsClass: "mw" });
      const marks = (c) => $(".mark-hero .mk-" + c);
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: ".intro",
          start: "top top",
          end: () => "+=" + Math.round(innerHeight * 2.3),
          pin: ".intro-pin",
          scrub: 0.8,
          invalidateOnRefresh: true,
        },
      });
      introST = tl.scrollTrigger;
      orb.intro.grow = 0;
      orb.intro.implode = 0;
      tl.to(orb.intro, { grow: 1, duration: 1 }, 0)
        .to(marks("b"), { xPercent: -170, yPercent: -90, rotation: -32, opacity: 0, duration: 0.75, ease: "power2.in" }, 0.06)
        .to(marks("r"), { xPercent: 120, yPercent: -230, rotation: 38, opacity: 0, duration: 0.75, ease: "power2.in" }, 0.1)
        .to(marks("n"), { xPercent: 150, yPercent: 160, rotation: -26, opacity: 0, duration: 0.75, ease: "power2.in" }, 0.12)
        .to(marks("z"), { xPercent: 240, yPercent: -40, rotation: 44, opacity: 0, duration: 0.75, ease: "power2.in" }, 0.04)
        .to(".hero-copy", { yPercent: -18, opacity: 0, duration: 0.45, ease: "power2.in" }, 0)
        .to(".hero-meta, .hero-foot", { opacity: 0, duration: 0.25 }, 0)
        .set(man, { visibility: "visible" }, 0.72)
        .fromTo(man.querySelector(".eyebrow"), { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, 0.76)
        .fromTo(split.words, { opacity: 0.1 }, { opacity: 1, duration: 0.18, stagger: 0.035 }, 0.86)
        .to({}, { duration: 0.3 });
      // A la sortie, la suite de la page monte par-dessus et l'orbe se referme.
      const out = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: ".band", start: "top bottom", end: "top 15%", scrub: 0.6 },
      });
      introOutST = out.scrollTrigger;
      out.to(orb.intro, { implode: 1, duration: 1, ease: "power1.in" }, 0)
        .to(man, { opacity: 0, duration: 0.6 }, 0);
      return () => { introST = null; introOutST = null; };
    });
  }

  /* ===================================================== reste de la page */

  function splitTitle(el) {
    // L'arabe se decoupe en mots (les lettres sont liees), le latin en lettres.
    const arabic = hasArabic(el.textContent);
    const sp = new Split(el, { type: arabic ? "lines,words" : "lines,words,chars", mask: "lines", linesClass: "split-mask" });
    return arabic ? sp.words : sp.chars;
  }

  function buildWorks(isDesktop) {
    const stage = $("#stage");
    const worlds = $$(".world", stage);
    const n = worlds.length;
    worksMeta = null;
    if (!n) return;
    const featured = projects.slice(0, n);
    const titles = worlds.map((w) => splitTitle($(".w-title", w)));
    const L = 1.3;
    const hold = 0.25;

    // Centre de l'iris = l'orbe du projet suivant (positions de mise en page, sans transformations).
    const setIris = () => {
      const W = stage.offsetWidth;
      const H = stage.offsetHeight;
      worlds.forEach((w) => {
        const v = $(".w-visual", w);
        const sd = $(".w-seed", w);
        const sx = v.offsetLeft + sd.offsetLeft + sd.offsetWidth / 2;
        const sy = v.offsetTop + sd.offsetTop + sd.offsetHeight / 2;
        const far = Math.max(Math.hypot(sx, sy), Math.hypot(W - sx, sy), Math.hypot(sx, H - sy), Math.hypot(W - sx, H - sy));
        w.style.setProperty("--sx", sx + "px");
        w.style.setProperty("--sy", sy + "px");
        w.style.setProperty("--iris-max", Math.ceil(far + 4) + "px");
      });
    };
    setIris();

    const tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: stage,
        start: "top top",
        end: () => "+=" + Math.round(innerHeight * Math.max(n - 1, 0.6) * (isDesktop ? 1.15 : 1)),
        pin: true,
        scrub: 0.7,
        invalidateOnRefresh: true,
        onRefresh: setIris,
      },
    });
    worksST = tl.scrollTrigger;
    tl.to({}, { duration: hold });
    for (let i = 1; i < n; i++) {
      const w = worlds[i];
      const prev = worlds[i - 1];
      const at = hold + (i - 1) * L;
      tl.fromTo(w, { "--iris": 0 }, { "--iris": 1, duration: 1, ease: "power2.inOut" }, at)
        .to([$(".w-text", prev), $(".w-visual", prev)], { scale: 0.93, opacity: 0.2, duration: 1, ease: "power2.in" }, at)
        .from(titles[i], { yPercent: 118, duration: 0.42, stagger: 0.016, ease: "power3.out" }, at + 0.42)
        .from($$(".w-cat, .w-sum, .w-tags, .w-cta", w), { y: 26, opacity: 0, duration: 0.4, stagger: 0.05, ease: "power2.out" }, at + 0.5)
        .from($(".w-shot img", w) || {}, { scale: 1.22, duration: 1.1, ease: "power2.out" }, at + 0.15)
        .from($(".w-phone", w) || {}, { yPercent: 24, duration: 0.9, ease: "power2.out" }, at + 0.3);
    }
    tl.to({}, { duration: 0.35 });
    worksTL = tl;
    worksMeta = { n, L, hold, worlds, projects: featured, palettes: featured.map(paletteOf) };

    // Premier projet : il se construit quand la scene arrive.
    const w0 = worlds[0];
    gsap.timeline({ scrollTrigger: { trigger: stage, start: "top 75%", toggleActions: "play none none reverse" } })
      .from(titles[0], { yPercent: 118, duration: 1, stagger: 0.025, ease: "expo.out" }, 0)
      .from($$(".w-cat, .w-sum, .w-tags, .w-cta", w0), { y: 30, opacity: 0, duration: 0.8, stagger: 0.06, ease: "power3.out" }, 0.15)
      .from($(".w-shot img", w0) || {}, { scale: 1.2, duration: 1.4, ease: "expo.out" }, 0)
      .from($(".w-phone", w0) || {}, { yPercent: 20, opacity: 0, duration: 1.1, ease: "expo.out" }, 0.1);
  }

  function buildRest() {
    mmRest = gsap.matchMedia();
    mmRest.add({ desktop: "(min-width: 861px)", mobile: "(max-width: 860px)", motion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
      const { desktop, motion: ok } = ctx.conditions;
      if (!ok) return undefined;

      buildWorks(desktop);

      // Titres de section : les lignes montent derriere un masque.
      $$("[data-split]").forEach((el) => {
        const sp = new Split(el, { type: "lines", mask: "lines", linesClass: "split-mask" });
        gsap.from(sp.lines, { yPercent: 105, duration: 1.1, stagger: 0.08, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 86%" } });
      });
      $$(".sec-head .eyebrow, .sec-lead").forEach((el) => {
        gsap.from(el, { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
      });

      // Index
      gsap.from(".index-title, .filters", { y: 30, opacity: 0, duration: 0.9, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".index", start: "top 80%" } });
      ST.batch("#rows .row", {
        start: "top 92%",
        once: true,
        onEnter: (els) => gsap.from(els, { y: 40, opacity: 0, duration: 0.8, stagger: 0.06, ease: "power3.out" }),
      });

      // Services : le nom se remplit de gauche a droite en passant au centre.
      $$(".svc").forEach((li) => {
        gsap.fromTo($(".svc-name", li), { "--fill": "0%" }, {
          "--fill": "100%",
          ease: "none",
          scrollTrigger: { trigger: li, start: "top 82%", end: "top 42%", scrub: 0.4 },
        });
      });

      // Methode
      const steps = $(".steps");
      const stepEls = $$(".step", steps);
      if (desktop) {
        const dist = () => Math.max(0, steps.offsetWidth - innerWidth);
        const dir = lang === "ar" ? 1 : -1;
        gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: ".process",
            start: "top top",
            end: () => "+=" + Math.max(dist(), innerHeight * 0.6),
            pin: ".proc-pin",
            scrub: 0.7,
            invalidateOnRefresh: true,
            onUpdate: () => {
              const edge = innerWidth * (lang === "ar" ? 0.35 : 0.65);
              stepEls.forEach((s) => {
                const r = s.getBoundingClientRect();
                s.classList.toggle("is-on", lang === "ar" ? r.right > edge : r.left < edge);
              });
            },
          },
        })
          .to({}, { duration: 0.08 })
          .to(steps, { x: () => dir * dist(), duration: 1 }, 0.08)
          .to(".proc-fill", { scaleX: 1, duration: 1 }, 0.08);
      } else {
        gsap.fromTo(".proc-fill", { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: steps, start: "top 70%", end: "bottom 60%", scrub: 0.5 } });
        stepEls.forEach((s) => ST.create({ trigger: s, start: "top 70%", onToggle: (self) => s.classList.toggle("is-on", self.isActive || self.progress > 0), end: "max" }));
      }
      gsap.from(stepEls, { y: 40, opacity: 0, duration: 0.9, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: steps, start: "top 85%" } });

      // Contact et questions
      gsap.from(".cfg-group, .cfg-inputs", { y: 36, opacity: 0, duration: 0.9, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".cfg", start: "top 80%" } });
      gsap.from(".cfg-card", { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: ".cfg", start: "top 75%" } });
      gsap.from(".qa", { y: 24, opacity: 0, duration: 0.8, stagger: 0.06, ease: "power3.out", scrollTrigger: { trigger: ".faq-list", start: "top 85%" } });

      // Pied de page : le nom geant remonte quand le rideau s'ouvre.
      gsap.from(".mark-foot .mk", {
        yPercent: 60,
        opacity: 0,
        stagger: 0.05,
        ease: "none",
        scrollTrigger: { trigger: "#main", start: "bottom bottom", end: () => "bottom " + Math.max(innerHeight - $("#footer").offsetHeight * 0.9, 0), scrub: 0.6 },
      });
      return () => { worksST = null; worksTL = null; worksMeta = null; };
    });
  }

  /* ========================================================== chargement */

  function runLoader(ready) {
    const el = $(".loader");
    const finish = () => {
      root.classList.remove("is-loading");
      if (el) el.remove();
      if (lenis) lenis.start();
    };
    if (!motion || !el) { if (el) el.remove(); ready.then(playIntro); return; }
    if (session.get("seen")) { finish(); ready.then(playIntro); return; }
    session.set("seen", "1");
    root.classList.add("is-loading");
    if (lenis) lenis.stop();
    const num = $(".loader-num", el);
    const o = { v: 0 };
    const target = () => Math.min(innerWidth, innerHeight) * (innerWidth < 700 ? 0.17 : 0.12);
    gsap.timeline()
      .from(".loader-tag span", { y: 16, opacity: 0, duration: 0.8, stagger: 0.1, ease: "power3.out" }, 0)
      .to(o, {
        v: 100,
        duration: 1.9,
        ease: "power2.inOut",
        onUpdate: () => {
          num.textContent = String(Math.round(o.v)).padStart(3, "0");
          orb.loaderR = target() * (o.v / 100);
        },
      }, 0)
      .add(() => {
        ready.then(() => {
          gsap.timeline()
            .to(".loader-count, .loader-tag", { yPercent: 30, opacity: 0, duration: 0.5, ease: "power3.in" }, 0)
            .to(el, { opacity: 0, duration: 0.9, ease: "power2.inOut" }, 0.3)
            .add(() => { root.classList.remove("is-loading"); }, 0.35)
            .add(playIntro, 0.4)
            .add(finish, 1.25);
        });
      });
  }

  /* =============================================================== boot */

  function onHash() {
    const id = location.hash;
    if (!id || id === "#top") return;
    const target = $(id);
    if (target) setTimeout(() => goTo(target), 300);
  }

  async function boot() {
    const year = $(".year");
    if (year) year.textContent = String(new Date().getFullYear());
    fillContacts();
    initForm();
    applyLang(store.get("lang") || "fr");
    initTracking();
    setInterval(updateClock, 30000);
    $$(".lang button").forEach((b) => b.addEventListener("click", () => switchLang(b.dataset.lang)));

    const data = loadProjects();

    if (!motion) {
      const l = $(".loader");
      if (l) l.remove();
      await data;
      renderWorks();
      return;
    }

    gsap.registerPlugin(ST, Split);
    ST.config({ ignoreMobileResize: true });
    initScroll();
    initOrb();
    initCursor();
    initMagnetic();
    initPeek();
    initTicker();
    gsap.ticker.add(orbTick);
    ST.addEventListener("refreshInit", layoutFooter);

    const fonts = Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((r) => setTimeout(r, 1800)),
    ]);
    const fail = (e) => { if (window.console) console.error(e); };
    const introReady = fonts.then(() => { layoutFooter(); buildIntro(); ST.refresh(); }).catch(fail);
    const allReady = Promise.all([introReady, data]).then(() => {
      renderWorks();
      buildRest();
      ST.refresh();
      onHash();
    }).catch(fail);
    // Le rideau ne reste jamais bloque : 7 secondes au plus.
    runLoader(Promise.race([Promise.all([introReady, allReady]), new Promise((r) => setTimeout(r, 7000))]));
  }

  function switchLang(next) {
    if (next === lang) return;
    store.set("lang", next);
    track("lang", next);
    if (!motion || !mmIntro) { applyLang(next); renderWorks(); return; }
    const page = $(".page");
    const y = window.scrollY;
    gsap.to(page, {
      opacity: 0,
      duration: 0.25,
      onComplete: () => {
        if (mmRest) mmRest.revert();
        mmIntro.revert();
        themeKey = "";
        applyLang(next);
        document.dispatchEvent(new Event("bz:lang"));
        renderWorks();
        buildIntro();
        buildRest();
        ST.refresh();
        if (lenis) lenis.scrollTo(y, { immediate: true });
        else window.scrollTo(0, y);
        gsap.to(page, { opacity: 1, duration: 0.45, clearProps: "opacity" });
      },
    });
  }

  boot();
})();
