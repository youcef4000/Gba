/* ============================================================================
   Bornz Studio — portfolio. Toute l'interaction de la page.

   Ordre de demarrage :
     1. langue sauvegardee appliquee, rideau de chargement lance ;
     2. polices pretes -> build() cree toutes les animations au scroll ;
     3. le rideau se leve et joue l'intro du hero.

   Toutes les animations liees au scroll vivent dans un gsap.matchMedia :
   changer de langue fait mm.revert() puis build(), ce qui remet le DOM a
   plat (SplitText compris) avant de le re-decouper dans la nouvelle langue.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const root = document.documentElement;
  const CFG = window.SITE_CONFIG || {};
  const I18N = window.I18N || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const gsap = window.gsap;

  if (reduce) root.classList.add("no-motion");

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* stockage bloque */ } },
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* stockage bloque */ } },
  };

  /* ================================================================ i18n */

  // Le francais est la source : on le relit dans le DOM avant tout decoupage.
  const FR = {};
  $$("[data-i18n]").forEach((el) => { FR[el.dataset.i18n] = el.innerHTML; });
  $$("[data-i18n-ph]").forEach((el) => { FR["ph:" + el.dataset.i18nPh] = el.placeholder; });

  let lang = "fr";
  const str = () => (I18N.str && I18N.str[lang]) || I18N.str.fr;
  const words = () => (I18N.words && I18N.words[lang]) || I18N.words.fr;

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
      if (!waNumber) { a.textContent = ""; a.removeAttribute("href"); return; }
      a.href = "https://wa.me/" + waNumber;
      a.textContent = "WhatsApp +" + waNumber;
    });
    $$(".contact-mail").forEach((a) => {
      if (!email) { a.textContent = ""; a.removeAttribute("href"); return; }
      a.href = "mailto:" + email;
      a.textContent = email;
    });
    $$(".contact-ig").forEach((a) => {
      if (!CFG.instagram) { a.textContent = ""; a.removeAttribute("href"); return; }
      const h = String(CFG.instagram).replace(/^@/, "");
      a.href = "https://instagram.com/" + h;
      a.textContent = "Instagram @" + h;
    });
    const wa = $("#cfg-wa");
    if (wa) wa.hidden = !waNumber;
    const fc = $(".f-contact");
    if (fc) fc.hidden = !waNumber && !email && !CFG.instagram;
    const alt = $(".cfg-alt");
    if (alt) {
      alt.hidden = !waNumber && !email;
      const sep = $(".cfg-sep", alt);
      if (sep) sep.hidden = !(waNumber && email);
    }
  }

  /* ============================================================ analytics */

  // Statistiques maison : un evenement = un petit POST vers /api/track.
  // Pas de cookie, pas d'IP stockee ; "Do Not Track" est respecte.
  const API = (CFG.api || "/api").replace(/\/$/, "");
  const track = (() => {
    const off =
      CFG.analytics === false ||
      !/^https?:$/.test(location.protocol) ||
      navigator.doNotTrack === "1" ||
      window.doNotTrack === "1";
    const once = new Set();
    return (type, label = "", unique = false) => {
      if (off) return;
      const key = type + ":" + label;
      if (unique && once.has(key)) return;
      once.add(key);
      const params = new URLSearchParams(location.search);
      const body = JSON.stringify({
        type,
        label,
        lang,
        path: location.pathname,
        ref: type === "pageview" ? document.referrer : "",
        utm: type === "pageview" ? params.get("utm_source") || "" : "",
      });
      try {
        if (navigator.sendBeacon && navigator.sendBeacon(API + "/track", new Blob([body], { type: "application/json" }))) return;
        fetch(API + "/track", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
      } catch (e) { /* statistiques facultatives */ }
    };
  })();

  function initTracking() {
    track("pageview");
    // Sections atteintes : c'est l'entonnoir visite -> projets -> contact.
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

  /* ========================================================= configurator */

  const TYPE_WEIGHT = { landing: 22, vitrine: 16, shop: 42, saas: 56, ai: 50 };

  function readForm() {
    const form = $("#cfg-form");
    if (!form) return null;
    const type = form.querySelector('input[name="type"]:checked');
    const when = form.querySelector('input[name="when"]:checked');
    const opts = $$('input[name="opt"]:checked', form);
    const label = (input) => input ? input.nextElementSibling.textContent.trim() : "";
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
    if (!el) return;
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
      if (lenis) lenis.scrollTo(input, { offset: -160, duration: 0.8 });
      else input.scrollIntoView({ block: "center" });
      if (gsap && !reduce) gsap.fromTo(input, { x: -8 }, { x: 0, duration: 0.5, ease: "elastic.out(1, 0.3)" });
      return;
    }
    showContactError(false);

    const btn = $("#cfg-submit");
    const s = str();
    btn.disabled = true;
    btn.classList.add("is-loading");
    setStatus(s.sending, false);
    try {
      const res = await fetch(API + "/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw Object.assign(new Error("send"), { code: data.error || "server" });
      setStatus("", false);
      showDone(true);
    } catch (err) {
      const code = err.code || "offline";
      if (code === "invalid_contact") showContactError(true);
      setStatus((s.errors && (s.errors[code] || s.errors.server)) || "", true);
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  function showDone(on) {
    const done = $("#cfg-done");
    const compose = $("#cfg-compose");
    done.hidden = !on;
    compose.hidden = on;
    if (on && gsap && !reduce) {
      gsap.from(done.children, { y: 20, opacity: 0, stagger: 0.08, duration: 0.7, ease: "power3.out" });
    }
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  function initConfigurator() {
    const form = $("#cfg-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitForm();
    });
    form.addEventListener("input", (e) => {
      if (e.target.id === "f-contact") showContactError(false);
      updateMessage();
    });
    form.addEventListener("change", (e) => {
      updateMessage();
      const chip = e.target.closest(".chip");
      if (chip && gsap && !reduce) gsap.fromTo(chip.querySelector("span"), { scale: 0.9 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
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
      try {
        navigator.clipboard.writeText(lastMessage).then(() => flash(str().copied), selectText);
      } catch (e) {
        selectText();
      }
    });
  }

  /* ================================================================ clock */

  function updateClock() {
    const el = $(".clock");
    if (!el) return;
    try {
      el.textContent = new Intl.DateTimeFormat(str().locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch (e) { /* fuseau inconnu : on laisse le tiret */ }
  }

  /* ============================================================== rotator */

  const rotator = (() => {
    const box = $(".rotator");
    const word = $(".rot-word");
    let i = 0;
    let timer = null;

    function reset() {
      i = 0;
      if (word) word.textContent = words()[0];
      if (box) box.style.width = "";
    }

    function next() {
      if (!box || !word || document.hidden || !gsap) return;
      const list = words();
      i = (i + 1) % list.length;
      const w0 = box.getBoundingClientRect().width;
      gsap.timeline()
        .to(word, { yPercent: -140, duration: 0.42, ease: "power3.in" })
        .add(() => {
          word.textContent = list[i];
          box.style.width = "";
          const w1 = box.getBoundingClientRect().width;
          if (getComputedStyle(box).display !== "block") {
            gsap.fromTo(box, { width: w0 }, { width: w1, duration: 0.55, ease: "power3.inOut", clearProps: "width" });
          }
        })
        .fromTo(word, { yPercent: 140 }, { yPercent: 0, duration: 0.65, ease: "power3.out" });
    }

    function start() {
      if (reduce || timer) return;
      timer = setInterval(next, 2600);
    }

    return { reset, start };
  })();

  /* ======================================================= smooth scroll */

  let lenis = null;

  function initScroll() {
    if (!gsap || reduce || typeof window.Lenis !== "function") return;
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on("scroll", window.ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (id === "#") { e.preventDefault(); return; }
    const target = id === "#top" ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(target, { duration: 1.5, offset: 0 });
    else if (target === 0) scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });

  /* =============================================================== cursor */

  function initCursor() {
    if (!finePointer || reduce || !gsap) return;
    const cur = $(".cursor");
    const dot = $(".cursor-dot");
    const ring = $(".cursor-ring");
    const label = $(".cursor-label");
    gsap.set([dot, ring], { xPercent: -50, yPercent: -50 });
    const dx = gsap.quickTo(dot, "x", { duration: 0.08, ease: "power3" });
    const dy = gsap.quickTo(dot, "y", { duration: 0.08, ease: "power3" });
    const rx = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3" });
    const ry = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3" });
    let shown = false;

    addEventListener("pointermove", (e) => {
      if (!shown) { shown = true; gsap.to([dot, ring], { opacity: 1, duration: 0.3 }); }
      dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { shown = false; gsap.to([dot, ring], { opacity: 0, duration: 0.3 }); });

    document.addEventListener("pointerover", (e) => {
      const labelled = e.target.closest("[data-cursor]");
      const link = e.target.closest("a, button, label.chip, summary, input");
      if (labelled) {
        const key = labelled.dataset.cursor;
        label.textContent = key === "demo" ? str().cursorDemo : str().cursorVisit;
      }
      cur.classList.toggle("has-label", !!labelled);
      cur.classList.toggle("is-link", !labelled && !!link);
    });
  }

  /* ============================================================ magnetic */

  function initMagnetic() {
    if (!finePointer || reduce || !gsap) return;
    $$(".magnetic").forEach((el) => {
      const xTo = gsap.quickTo(el, "x", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.8, ease: "elastic.out(1, 0.4)" });
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.32);
        yTo((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener("pointerleave", () => { xTo(0); yTo(0); });
    });
  }

  /* ================================================ bento spotlight + tilt */

  function initPointerFx() {
    if (!finePointer) return;
    $$(".bcard").forEach((c) => {
      c.addEventListener("pointermove", (e) => {
        const r = c.getBoundingClientRect();
        c.style.setProperty("--mx", e.clientX - r.left + "px");
        c.style.setProperty("--my", e.clientY - r.top + "px");
      });
    });
    if (reduce || !gsap) return;

    // Leger tilt 3D des maquettes. Il agit sur le conteneur, le scroll agit
    // sur la fenetre : les deux transformations ne se marchent pas dessus.
    $$(".project-visual").forEach((v) => {
      const rxTo = gsap.quickTo(v, "rotationX", { duration: 0.8, ease: "power3" });
      const ryTo = gsap.quickTo(v, "rotationY", { duration: 0.8, ease: "power3" });
      gsap.set(v, { transformPerspective: 1400 });
      v.addEventListener("pointermove", (e) => {
        const r = v.getBoundingClientRect();
        ryTo(((e.clientX - r.left) / r.width - 0.5) * 8);
        rxTo(-((e.clientY - r.top) / r.height - 0.5) * 6);
      });
      v.addEventListener("pointerleave", () => { rxTo(0); ryTo(0); });
    });

    // Parallaxe souris du hero : les cartes et la lueur derivent en sens opposes.
    const hero = $(".hero");
    const cards = $(".hero-cards");
    const glow = $(".hero-glow");
    const cx = gsap.quickTo(cards, "x", { duration: 1.2, ease: "power3" });
    const cy = gsap.quickTo(cards, "y", { duration: 1.2, ease: "power3" });
    const gx = gsap.quickTo(glow, "x", { duration: 2, ease: "power3" });
    const gy = gsap.quickTo(glow, "y", { duration: 2, ease: "power3" });
    hero.addEventListener("pointermove", (e) => {
      const nx = e.clientX / innerWidth - 0.5;
      const ny = e.clientY / innerHeight - 0.5;
      if (matchMedia("(min-width: 801px)").matches) { cx(nx * -36); cy(ny * -26); }
      gx(nx * 80); gy(ny * 60);
    });
  }

  /* ================================================================= map */

  const map = (() => {
    // Globe terrestre en points : il tourne avec le scroll, les points
    // s'allument, puis des liaisons relient de grandes villes. Aucun pays
    // n'est nomme : c'est l'idee d'une clientele partout dans le monde.
    const canvas = $(".map-canvas");
    const P = window.GLOBE_DATA;
    if (!canvas || !P) return null;
    const ctx = canvas.getContext("2d");
    const RAD = Math.PI / 180;
    const TILT = 18 * RAD;

    const pts = [];
    for (let i = 0; i < P.length; i += 2) {
      const lon = P[i] / 10, lat = P[i + 1] / 10;
      // Ordre d'allumage pseudo-aleatoire mais stable d'un rendu a l'autre.
      const k = Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453;
      pts.push({ lon: lon * RAD, lat: lat * RAD, order: k - Math.floor(k) });
    }
    pts.sort((a, b) => a.order - b.order);

    const CITIES = {
      ny: [-74, 40.7], mtl: [-73.6, 45.5], sp: [-46.6, -23.5], ldn: [-0.1, 51.5],
      par: [2.35, 48.86], ist: [29, 41], dxb: [55.3, 25.2], sin: [103.8, 1.35],
      tyo: [139.7, 35.7], lag: [3.4, 6.5],
    };
    const ARCS = [["par", "ny"], ["ldn", "mtl"], ["par", "dxb"], ["dxb", "sin"], ["ny", "sp"], ["ist", "ldn"], ["dxb", "lag"], ["sin", "tyo"]];
    const vec = ([lon, lat]) => {
      const l = lon * RAD, f = lat * RAD;
      return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)];
    };

    let W = 0, H = 0, dpr = 1, R = 1, cx = 0, cy = 0;
    let progress = reduce ? 1 : 0;
    let spin = 0;
    let running = false;

    function colors() {
      const cs = getComputedStyle(root);
      return {
        fg: cs.getPropertyValue("--fg").trim() || "#f2efe8",
        accent: cs.getPropertyValue("--accent").trim() || "#e8b84a",
        accent2: cs.getPropertyValue("--accent2").trim() || "#9b6bff",
      };
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      R = Math.min(W, H) * 0.44;
      cx = W / 2;
      cy = H / 2;
      draw();
    }

    // Projection orthographique ; renvoie aussi la profondeur (cos c).
    function project(lon, lat, lon0, k = 1) {
      const d = lon - lon0;
      const cosLat = Math.cos(lat);
      const depth = Math.sin(TILT) * Math.sin(lat) + Math.cos(TILT) * cosLat * Math.cos(d);
      return {
        x: cx + k * R * cosLat * Math.sin(d),
        y: cy - k * R * (Math.cos(TILT) * Math.sin(lat) - Math.sin(TILT) * cosLat * Math.cos(d)),
        depth,
      };
    }

    function slerp(a, b, t) {
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const om = Math.acos(dot);
      const so = Math.sin(om) || 1;
      const s1 = Math.sin((1 - t) * om) / so, s2 = Math.sin(t * om) / so;
      const x = s1 * a[0] + s2 * b[0], y = s1 * a[1] + s2 * b[1], z = s1 * a[2] + s2 * b[2];
      return [Math.atan2(y, x), Math.asin(Math.max(-1, Math.min(1, z)))];
    }

    function draw() {
      if (!W) return;
      const col = colors();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Le globe tourne de l'Atlantique vers l'Asie pendant le scroll.
      const lon0 = (-55 + progress * 130 + spin) * RAD;

      // Halo et disque.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.25);
      halo.addColorStop(0, "rgba(0,0,0,0)");
      halo.addColorStop(0.6, col.accent2);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.25, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = col.fg;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = col.fg;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Points : ceux allumes passent a la couleur d'accent.
      const lit = Math.floor(Math.min(1, progress / 0.6) * pts.length);
      const base = Math.max(1.1, R * 0.0105);
      for (let pass = 0; pass < 2; pass++) {
        ctx.fillStyle = pass ? col.accent : col.fg;
        for (let i = pass ? 0 : lit; i < (pass ? lit : pts.length); i++) {
          const q = pts[i];
          const pr = project(q.lon, q.lat, lon0);
          if (pr.depth <= 0) continue;
          ctx.globalAlpha = pass ? 0.35 + 0.65 * pr.depth : 0.1 + 0.3 * pr.depth;
          const r = base * (0.55 + 0.45 * pr.depth);
          ctx.fillRect(pr.x - r, pr.y - r, r * 2, r * 2);
        }
      }

      // Liaisons entre villes, en arc au-dessus de la surface.
      const p2 = Math.max(0, Math.min(1, (progress - 0.4) / 0.5));
      if (p2 > 0) {
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = col.accent2;
        ARCS.forEach(([a, b], n) => {
          const t = Math.max(0, Math.min(1, p2 * 1.8 - n * 0.1));
          if (!t) return;
          const va = vec(CITIES[a]), vb = vec(CITIES[b]);
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          let pen = false;
          let head = null;
          for (let s2 = 0; s2 <= 48; s2++) {
            const u = (s2 / 48) * t;
            const [lon, lat] = slerp(va, vb, u);
            const pr = project(lon, lat, lon0, 1 + 0.2 * Math.sin(Math.PI * u));
            if (pr.depth < -0.12) { pen = false; head = null; continue; }
            if (pen) ctx.lineTo(pr.x, pr.y); else ctx.moveTo(pr.x, pr.y);
            pen = true;
            head = pr;
          }
          ctx.stroke();
          if (head) {
            ctx.fillStyle = col.accent2;
            ctx.beginPath();
            ctx.arc(head.x, head.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        // Villes reliees : un point et une onde.
        const pulse = (performance.now() / 1600) % 1;
        Object.values(CITIES).forEach(([lon, lat]) => {
          const pr = project(lon * RAD, lat * RAD, lon0);
          if (pr.depth <= 0.05) return;
          ctx.globalAlpha = p2;
          ctx.fillStyle = col.fg;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = p2 * (1 - pulse) * 0.8;
          ctx.strokeStyle = col.accent;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(pr.x, pr.y, 3 + pulse * 12, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
      ctx.globalAlpha = 1;
    }

    let last = 0;
    function loop(time) {
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
      last = time;
      spin = (spin + dt * 4) % 360;
      draw();
    }

    function setRunning(on) {
      if (reduce || !gsap || on === running) return;
      running = on;
      last = 0;
      if (on) gsap.ticker.add(loop); else gsap.ticker.remove(loop);
    }

    return {
      resize,
      draw,
      setProgress(p) { progress = p; if (!running) draw(); },
      setRunning,
    };
  })();

  /* ============================================================ chameleon */

  const DEFAULT_THEME = { bg: "#0a0a0d", fg: "#f2efe8", accent: "#e8b84a", accent2: "#9b6bff" };
  const themeMeta = $('meta[name="theme-color"]');

  function themeOf(el) {
    return {
      bg: el.dataset.bg || DEFAULT_THEME.bg,
      fg: el.dataset.fg || DEFAULT_THEME.fg,
      accent: el.dataset.accent || DEFAULT_THEME.accent,
      accent2: el.dataset.accent2 || DEFAULT_THEME.accent2,
    };
  }

  let currentTheme = null;
  function setTheme(t) {
    const key = t.bg + t.fg + t.accent + t.accent2;
    if (key === currentTheme) return;
    currentTheme = key;
    if (themeMeta) themeMeta.content = t.bg;
    gsap.to(root, {
      "--bg": t.bg,
      "--fg": t.fg,
      "--accent": t.accent,
      "--accent2": t.accent2,
      duration: reduce ? 0 : 0.9,
      ease: "power2.out",
      overwrite: "auto",
    });
  }

  /* =============================================================== helpers */

  function fmt(n, sep) {
    const s = String(Math.round(n));
    return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : s;
  }

  function countUp(el, duration = 1.6) {
    const to = Number(el.dataset.to || 0);
    const sep = el.dataset.sep || "";
    const o = { v: 0 };
    el.textContent = fmt(0, sep);
    return gsap.to(o, {
      v: to,
      duration,
      ease: "power2.out",
      onUpdate: () => { el.textContent = fmt(o.v, sep); },
    });
  }

  const isArabic = () => lang === "ar";

  /* ================================================================ build */

  let mm = null;
  let heroIntro = null;

  function build(first) {
    const ST = window.ScrollTrigger;
    const Split = window.SplitText;
    mm = gsap.matchMedia();

    mm.add(
      {
        desktop: "(min-width: 901px)",
        mobile: "(max-width: 900px)",
        motion: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { desktop, motion } = ctx.conditions;
        const cleanups = [];

        /* ---- Chameleon : chaque section [data-bg] repeint la page ----- */
        // Le tableau existe avant les declencheurs : un onToggle peut partir
        // des la creation si la page est deja scrollee (changement de langue).
        const themeTriggers = [];
        $$("[data-bg]").forEach((el) => {
          themeTriggers.push(ST.create({
            trigger: el,
            start: "top 55%",
            end: "bottom 55%",
            onToggle: () => {
              const active = themeTriggers.filter((t) => t.isActive).pop();
              setTheme(active ? themeOf(active.trigger) : DEFAULT_THEME);
            },
          }));
        });

        /* ---- Nav : fond au scroll, masquee en descendant ------------- */
        const nav = $(".nav");
        ST.create({
          start: 0,
          end: "max",
          onUpdate(self) {
            const y = self.scroll();
            nav.classList.toggle("is-scrolled", y > 40);
            nav.classList.toggle("is-hidden", self.direction === 1 && y > 500);
          },
        });
        $$(".nav-links a").forEach((a) => {
          const sec = $(a.getAttribute("href"));
          if (!sec) return;
          ST.create({
            trigger: sec,
            start: "top 50%",
            end: "bottom 50%",
            onToggle: (self) => a.classList.toggle("is-active", self.isActive),
          });
        });

        /* ---- Carte : progression pilotee par le scroll -------------- */
        if (map) {
          map.resize();
          const onResize = () => map.resize();
          addEventListener("resize", onResize);
          cleanups.push(() => removeEventListener("resize", onResize));
          if (motion) {
            const proxy = { p: 0 };
            gsap.to(proxy, {
              p: 1,
              ease: "none",
              onUpdate: () => map.setProgress(proxy.p),
              scrollTrigger: { trigger: ".reach", start: "top 70%", end: "bottom 65%", scrub: 0.6 },
            });
            ST.create({
              trigger: ".reach",
              start: "top bottom",
              end: "bottom top",
              onToggle: (self) => map.setRunning(self.isActive),
            });
            cleanups.push(() => map.setRunning(false));
          } else {
            map.setProgress(1);
          }
        }

        if (!motion) {
          root.classList.remove("anim");
          ST.sort();
          return () => cleanups.forEach((f) => f());
        }
        root.classList.add("anim");

        /* ---- Barre de progression ----------------------------------- */
        gsap.to(".progress", { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: 0.3 } });

        /* ---- Hero : intro (premier chargement) ---------------------- */
        const heroSplitType = isArabic() ? "words" : "words,chars";
        const heroSplit = Split.create(".hero-title .l1, .hero-title .l2-pre", {
          type: heroSplitType,
          mask: "words",
        });
        if (first) {
          heroIntro = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } })
            .from(isArabic() ? heroSplit.words : heroSplit.chars, { yPercent: 115, duration: 1.2, stagger: 0.028 })
            .from(".rot-word", { yPercent: 115, duration: 1.2 }, 0.35)
            .from(".hero-status", { y: 20, opacity: 0, duration: 1 }, 0.1)
            .from(".hero-sub", { y: 30, opacity: 0, duration: 1.1 }, 0.45)
            .from(".hero-ctas > *", { y: 30, opacity: 0, duration: 1, stagger: 0.08 }, 0.55)
            .from(".hcard", { scale: 0.4, opacity: 0, yPercent: 80, duration: 1.4, stagger: 0.1, ease: "back.out(1.6)" }, 0.5)
            .from(".hero-foot", { opacity: 0, duration: 1 }, 0.9);
        }

        /* ---- Hero : sortie au scroll -------------------------------- */
        const heroOut = gsap.timeline({
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
        heroOut
          .to(".hero-inner", { yPercent: 22, scale: 0.94, opacity: 0.1, ease: "none" }, 0)
          .to(".hero-glow", { yPercent: 30, ease: "none" }, 0)
          .to(".hero-grid", { yPercent: 18, opacity: 0, ease: "none" }, 0);
        if (desktop) {
          const out = [
            { x: 260, y: -260, rotation: 28 },
            { x: -120, y: 320, rotation: -34 },
            { x: 320, y: 180, rotation: 22 },
            { x: -260, y: -300, rotation: -26 },
          ];
          $$(".hcard").forEach((c, i) => heroOut.to(c, { ...out[i], ease: "none" }, 0));
        }

        /* ---- Marquee : boucle infinie + acceleration au scroll ------- */
        const loops = [];
        $$(".mq-row").forEach((row, i) => {
          const track = $(".mq-track", row);
          const group = $(".mq-group", track);
          $$(".mq-clone", track).forEach((n) => n.remove());
          const w = group.getBoundingClientRect().width;
          if (!w) return;
          const copies = Math.ceil((row.getBoundingClientRect().width * 1.2) / w) + 1;
          for (let k = 0; k < copies; k++) {
            const c = group.cloneNode(true);
            c.classList.add("mq-clone");
            c.removeAttribute("data-i18n");
            c.setAttribute("aria-hidden", "true");
            track.appendChild(c);
          }
          const reverse = i % 2 === 1;
          loops.push(
            gsap.fromTo(track, { x: reverse ? -w : 0 }, { x: reverse ? 0 : -w, duration: w / 70, ease: "none", repeat: -1 })
          );
        });
        const skew = gsap.quickTo(".mq-track", "skewX", { duration: 0.4, ease: "power3" });
        ST.create({
          trigger: ".marquee",
          start: "top bottom",
          end: "bottom top",
          onUpdate(self) {
            const v = self.getVelocity();
            const boost = 1 + Math.min(Math.abs(v) / 350, 6);
            loops.forEach((t) => {
              gsap.killTweensOf(t, "timeScale");
              t.timeScale(boost);
              gsap.to(t, { timeScale: 1, duration: 1.2, ease: "power2.out" });
            });
            skew(gsap.utils.clamp(-12, 12, v / -220));
          },
        });
        cleanups.push(() => { $$(".mq-clone").forEach((n) => n.remove()); gsap.set(".mq-track", { clearProps: "all" }); });

        /* ---- Manifeste : les mots s'allument un par un -------------- */
        const man = Split.create(".manifesto-text", { type: "words" });
        gsap.fromTo(man.words, { opacity: 0.12 }, {
          opacity: 1,
          stagger: 0.12,
          ease: "none",
          scrollTrigger: { trigger: ".manifesto-text", start: "top 78%", end: "bottom 45%", scrub: true },
        });
        gsap.from(".manifesto .eyebrow", { x: -30, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: ".manifesto", start: "top 75%" } });

        /* ---- Titres de section : lignes qui montent ----------------- */
        $$(".split-lines").forEach((el) => {
          Split.create(el, {
            type: "lines",
            mask: "lines",
            autoSplit: true,
            onSplit: (self) =>
              gsap.from(self.lines, {
                yPercent: 110,
                duration: 1.2,
                stagger: 0.1,
                ease: "expo.out",
                scrollTrigger: { trigger: el, start: "top 85%", once: true },
              }),
          });
        });
        $$(".sec-head").forEach((head) => {
          const bits = $$(".eyebrow, .sec-lead", head);
          if (!bits.length) return;
          gsap.from(bits, { y: 26, opacity: 0, duration: 1, stagger: 0.12, ease: "power3.out", scrollTrigger: { trigger: head, start: "top 82%", once: true } });
        });

        /* ---- Projets ------------------------------------------------ */
        $$(".project").forEach((p) => {
          const browser = $(".browser", p);
          const rev = p.classList.contains("p-rev");
          gsap.from($$(".project-info > *", p), {
            y: 44,
            opacity: 0,
            duration: 1,
            stagger: 0.07,
            ease: "power3.out",
            scrollTrigger: { trigger: p, start: "top 68%", once: true },
          });
          gsap.from($(".p-name", p), {
            letterSpacing: "0.04em",
            duration: 1.6,
            ease: "expo.out",
            scrollTrigger: { trigger: p, start: "top 68%", once: true },
          });
          // Entree 3D : la fenetre se redresse en arrivant.
          gsap.fromTo(browser,
            { rotationX: 24, rotationY: rev ? 16 : -16, scale: 0.84, y: 90, transformPerspective: 1400 },
            { rotationX: 0, rotationY: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "center 58%", scrub: 1 } });
          // Sortie : la fenetre file un peu plus vite que la page.
          gsap.to(browser, {
            yPercent: -12,
            ease: "none",
            scrollTrigger: { trigger: p, start: "center 58%", end: "bottom top", scrub: 1 },
          });

          // Contenu vivant de chaque maquette, joue a l'arrivee.
          const tl = gsap.timeline({ paused: true });
          $$(".count", p).forEach((c) => tl.add(countUp(c, 1.4), 0.2));
          ST.create({ trigger: p, start: "top 60%", once: true, onEnter: () => tl.play() });

          if (p.id === "p-exporter") {
            const spark = $(".spark", p);
            const len = spark.getTotalLength();
            gsap.set(spark, { strokeDasharray: len, strokeDashoffset: len });
            tl.to(spark, { strokeDashoffset: 0, duration: 1.4, ease: "power2.inOut" }, 0.3)
              .from($$(".ex-row, .ex-rate, .ex-total", p), { x: 24, opacity: 0, stagger: 0.08, duration: 0.7, ease: "power3.out" }, 0)
              .from($$(".ex-thumbs span", p), { scale: 0.6, opacity: 0, stagger: 0.1, duration: 0.8, ease: "back.out(2)" }, 0.4);
            gsap.to($(".ex-photo", p), { yPercent: 8, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
          }

          if (p.id === "p-lab") {
            tl.from($$(".lab-card", p), { scale: 0.5, opacity: 0, stagger: 0.12, duration: 0.8, ease: "back.out(2)" }, 0)
              .from($$(".lab-timeline i", p), { scaleY: 0, stagger: 0.05, duration: 0.5, ease: "power3.out" }, 0.2);
            // Les cartes derivent a des vitesses differentes : profondeur.
            $$(".lab-card", p).forEach((c, i) => {
              gsap.to(c, { y: [-30, 26, -18, 34][i], ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
            });
          }

          if (p.id === "p-hooked") {
            tl.from($$(".hk-mods i", p), { "--p": 0, stagger: 0.1, duration: 1.2, ease: "power3.out" }, 0.2)
              .from($(".hk-badge", p), { scale: 0.6, opacity: 0, duration: 0.8, ease: "back.out(2.4)" }, 0.5);
            gsap.fromTo($(".hk-big", p), { yPercent: 20, rotation: -8 }, { yPercent: -10, rotation: 0, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
          }

          if (p.id === "p-swiftly") {
            const models = ["Claude 4.6 Opus", "GPT-5.2 Pro", "Gemini 3 Pro", "DeepSeek V4", "Grok 4.1", "FLUX.2 Max"];
            const nameEl = $(".sw-model-name", p);
            const lines = $$(".sw-line", p);
            let mi = 0;
            let timer = null;
            const type = () => gsap.fromTo(lines, { scaleX: 0 }, { scaleX: 1, duration: 0.5, stagger: 0.18, ease: "power2.out" });
            const cycle = () => {
              mi = (mi + 1) % models.length;
              gsap.timeline()
                .to(nameEl, { yPercent: -60, opacity: 0, duration: 0.25, ease: "power2.in" })
                .add(() => { nameEl.textContent = models[mi]; })
                .fromTo(nameEl, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" })
                .add(type, 0.2);
            };
            tl.from($(".sw-user", p), { y: 20, opacity: 0, duration: 0.6, ease: "power3.out" }, 0)
              .add(type, 0.5);
            ST.create({
              trigger: p,
              start: "top 60%",
              end: "bottom 30%",
              onToggle(self) {
                clearInterval(timer);
                timer = self.isActive ? setInterval(cycle, 2200) : null;
              },
            });
            cleanups.push(() => { clearInterval(timer); nameEl.textContent = models[0]; });
          }

          if (p.id === "p-villa") {
            // Le plan se dessine trait par trait, les typologies arrivent ensuite.
            tl.fromTo($$(".vl-plan .pl", p), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, stagger: 0.12, ease: "power2.inOut" }, 0.1)
              .from($$(".vl-plan text", p), { opacity: 0, y: 4, stagger: 0.08, duration: 0.5 }, 0.9)
              .from($$(".vl-types li", p), { y: 14, opacity: 0, stagger: 0.08, duration: 0.6, ease: "power3.out" }, 0.3);
            gsap.fromTo($(".vl-photo", p), { scale: 1.18, yPercent: -4 }, { scale: 1.02, yPercent: 4, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
            gsap.fromTo($(".vl-sun", p), { yPercent: -40 }, { yPercent: 80, ease: "none", scrollTrigger: { trigger: p, start: "top bottom", end: "bottom top", scrub: true } });
          }

          if (p.id === "p-stick") {
            // Compteur de tournage qui defile tant que la maquette est visible.
            const tc = $(".sp-tc", p);
            let frames = 0;
            let timer = null;
            const pad = (n) => String(n).padStart(2, "0");
            const tick = () => {
              frames += 1;
              const f = frames % 25, sec = Math.floor(frames / 25);
              tc.textContent = `00:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}:${pad(f)}`;
            };
            tl.from($$(".sp-ring i", p), { scale: 0.3, opacity: 0, stagger: 0.07, duration: 0.8, ease: "back.out(1.8)" }, 0)
              .from($(".sp-cta", p), { y: 14, opacity: 0, duration: 0.6, ease: "power3.out" }, 0.4);
            ST.create({
              trigger: p,
              start: "top 80%",
              end: "bottom 20%",
              onToggle(self) {
                clearInterval(timer);
                timer = self.isActive ? setInterval(tick, 40) : null;
              },
            });
            cleanups.push(() => clearInterval(timer));
          }
        });

        /* ---- Portee : chiffres -------------------------------------- */
        ST.create({
          trigger: ".stats",
          start: "top 85%",
          once: true,
          onEnter: () => $$(".stats .count").forEach((c, i) => countUp(c, 1.6).delay(i * 0.12)),
        });
        gsap.from(".stat", { y: 40, opacity: 0, stagger: 0.1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".stats", start: "top 85%", once: true } });

        /* ---- Services : defilement horizontal epingle --------------- */
        const track = $(".services-track");
        const pin = $(".services-pin");
        if (desktop && track && pin) {
          const dist = () => {
            const pad = parseFloat(getComputedStyle(pin).paddingLeft) || 0;
            return Math.max(0, track.scrollWidth - (pin.clientWidth - pad * 2));
          };
          // En arabe la piste part de la droite et defile vers la gauche.
          const sign = isArabic() ? 1 : -1;
          const horiz = gsap.to(track, {
            x: () => sign * dist(),
            ease: "none",
            scrollTrigger: {
              trigger: pin,
              start: "top top",
              end: () => "+=" + dist(),
              pin: true,
              scrub: 1,
              invalidateOnRefresh: true,
              anticipatePin: 1,
            },
          });
          $$(".svc", track).forEach((card) => {
            gsap.from(card, {
              y: 70,
              rotation: 3 * -sign,
              opacity: 0.25,
              ease: "none",
              scrollTrigger: isArabic()
                ? { trigger: card, containerAnimation: horiz, start: "right 0%", end: "right 38%", scrub: true }
                : { trigger: card, containerAnimation: horiz, start: "left 100%", end: "left 62%", scrub: true },
            });
          });
        } else {
          $$(".svc").forEach((card) => {
            gsap.from(card, { y: 60, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: card, start: "top 88%", once: true } });
          });
        }

        /* ---- Methode : le rail se remplit, les etapes s'allument ---- */
        gsap.to(".rail-fill", {
          scaleY: 1,
          ease: "none",
          scrollTrigger: { trigger: ".steps-wrap", start: "top 62%", end: "bottom 62%", scrub: 0.5 },
        });
        $$(".step").forEach((s) => {
          ST.create({
            trigger: s,
            start: "top 62%",
            onEnter: () => s.classList.add("is-on"),
            onLeaveBack: () => s.classList.remove("is-on"),
          });
          gsap.from($(".step-n", s), { x: isArabic() ? 40 : -40, opacity: 0, duration: 1, ease: "expo.out", scrollTrigger: { trigger: s, start: "top 80%", once: true } });
        });
        cleanups.push(() => $$(".step").forEach((s) => s.classList.remove("is-on")));

        /* ---- Inclus : grille qui se deplie -------------------------- */
        gsap.from(".bcard", {
          y: 70,
          opacity: 0,
          scale: 0.95,
          stagger: { each: 0.08, from: "start" },
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: { trigger: ".bento", start: "top 80%", once: true },
        });
        gsap.from(".bars i", { scaleY: 0, stagger: 0.07, duration: 0.9, ease: "back.out(1.8)", scrollTrigger: { trigger: ".bars", start: "top 88%", once: true } });

        /* ---- Contact / FAQ ------------------------------------------ */
        gsap.from(".cfg-group, .cfg-inputs", { y: 40, opacity: 0, stagger: 0.1, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".cfg", start: "top 80%", once: true } });
        gsap.from(".cfg-summary", { y: 60, opacity: 0, duration: 1.2, ease: "power3.out", scrollTrigger: { trigger: ".cfg", start: "top 75%", once: true } });
        gsap.from(".qa", { y: 30, opacity: 0, stagger: 0.08, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: ".faq-list", start: "top 85%", once: true } });

        /* ---- CTA final ---------------------------------------------- */
        const finalSplit = Split.create(".final-title .ft-line:not(.ft-em-wrap)", { type: "words", mask: "words" });
        const fin = gsap.timeline({
          scrollTrigger: { trigger: ".final", start: "top 75%", end: "center 55%", scrub: 1 },
        });
        fin.from(finalSplit.words, { yPercent: 110, stagger: 0.08, ease: "none" }, 0)
          .from(".ft-em", { yPercent: 110, rotation: isArabic() ? -3 : 3, ease: "none" }, 0.2)
          .from(".btn-round", { scale: 0, rotation: -120, ease: "none" }, 0.35);

        /* ---- Footer : les lettres montent, la sphere nait ------------ */
        gsap.timeline({ scrollTrigger: { trigger: ".f-logo", start: "top 92%", once: true } })
          .from(".f-logo .bz-word path", { y: 90, opacity: 0, stagger: 0.07, duration: 1.1, ease: "expo.out" })
          .from(".f-logo .bz-orb", { scale: 0, rotation: -120, transformOrigin: "50% 50%", duration: 1.4, ease: "elastic.out(1, 0.6)" }, 0.2)
          .from(".f-logo .bz-studio", { x: -40, opacity: 0, duration: 0.9, ease: "expo.out" }, 0.55);

        // Les declencheurs crees avant l'epinglage des services doivent etre
        // recalcules apres lui : on les remet dans l'ordre de la page.
        ST.sort();
        return () => cleanups.forEach((f) => f());
      }
    );
  }

  /* ========================================================= preloader */

  function runPreloader(ready) {
    const pre = $(".preloader");
    const done = () => { if (heroIntro) heroIntro.play(); rotator.start(); };
    if (!pre) { ready.then(done); return; }
    if (!gsap || reduce || session.get("seen")) {
      pre.remove();
      ready.then(done);
      return;
    }
    session.set("seen", "1");
    pre.style.animation = "none";
    const num = $(".pre-num", pre);
    // La sphere du logo grandit au rythme du compteur.
    const orb = $(".bz-orb", pre);
    if (orb) gsap.set(orb, { scale: 0, transformOrigin: "50% 50%" });
    const o = { v: 0 };
    gsap.timeline()
      .from(".pre-name .bz-word path", { yPercent: 40, opacity: 0, stagger: 0.06, duration: 0.8, ease: "expo.out" })
      .from(".pre-name .bz-studio", { opacity: 0, duration: 0.6 }, 0.3)
      .to(o, {
        v: 100,
        duration: 1.1,
        ease: "power2.inOut",
        onUpdate: () => {
          num.textContent = Math.round(o.v);
          if (orb) gsap.set(orb, { scale: o.v / 100, rotation: (o.v / 100 - 1) * 90 });
        },
      }, 0)
      .add(() => {
        ready.then(() => {
          gsap.timeline({ onComplete: () => pre.remove() })
            .to(".pre-inner, .pre-tag", { y: -40, opacity: 0, duration: 0.5, ease: "power3.in" })
            .to(pre, { clipPath: "inset(0 0 100% 0)", duration: 0.9, ease: "expo.inOut" }, 0.25)
            .add(done, 0.6);
        });
      });
  }

  /* =============================================================== boot */

  function boot() {
    const year = $(".year");
    if (year) year.textContent = String(new Date().getFullYear());
    fillContacts();
    initConfigurator();

    const saved = store.get("lang");
    applyLang(saved || "fr");
    initTracking();
    setInterval(updateClock, 30000);

    $$(".lang button").forEach((b) => {
      b.addEventListener("click", () => switchLang(b.dataset.lang));
    });

    if (!gsap || !window.ScrollTrigger || !window.SplitText) {
      const pre = $(".preloader");
      if (pre) pre.remove();
      if (map) { map.resize(); map.setProgress(1); }
      return;
    }

    gsap.registerPlugin(window.ScrollTrigger, window.SplitText);
    initScroll();
    initCursor();
    initMagnetic();
    initPointerFx();

    const fontsReady = Promise.race([
      document.fonts ? document.fonts.ready : Promise.resolve(),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    const ready = fontsReady.then(() => {
      build(true);
      window.ScrollTrigger.refresh();
    });
    runPreloader(ready);
  }

  function switchLang(next) {
    if (next === lang) return;
    store.set("lang", next);
    track("lang", next);
    if (!gsap || !mm) { applyLang(next); return; }
    const scroller = $("main");
    gsap.to([scroller, ".footer"], {
      opacity: 0,
      duration: 0.25,
      onComplete: () => {
        mm.revert();
        currentTheme = null;
        applyLang(next);
        build(false);
        window.ScrollTrigger.refresh();
        gsap.to([scroller, ".footer"], { opacity: 1, duration: 0.45, clearProps: "opacity" });
      },
    });
  }

  boot();
})();
