// Captures d'un site a chaque etape du scroll, sur ordinateur et telephone,
// avec les erreurs de la console. Necessite Playwright (deja installe dans
// les sessions cloud : require('playwright') fonctionne partout).
//
//   node shoot.js <url> <dossier-de-sortie> [etapes=12] [langue]
//
// La langue (fr, ar, en) est ecrite dans localStorage("lang") avant le chargement.
// Le rideau de chargement est saute (sessionStorage "seen").
// WebGL passe par SwiftShader : lent mais fidele ; les delais en tiennent compte.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const [, , url, out = "shots", stepsArg = "12", lang = ""] = process.argv;
if (!url) {
  console.error("usage: node shoot.js <url> <dossier> [etapes] [langue]");
  process.exit(1);
}
const steps = Number(stepsArg) || 12;
const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  laptop: { width: 1366, height: 657 },
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

(async () => {
  const browser = await chromium.launch({
    args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  for (const [name, vp] of Object.entries(VIEWPORTS)) {
    const dir = path.join(out, name + (lang ? "-" + lang : ""));
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor || 1, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
    await page.addInitScript((l) => {
      try { sessionStorage.setItem("seen", "1"); if (l) localStorage.setItem("lang", l); } catch (e) { /* rien */ }
    }, lang);
    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(3500);
    const info = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    for (let i = 0; i <= steps; i++) {
      const y = Math.round(((info.height - vp.height) * i) / steps);
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(1300);
      await page.screenshot({ path: path.join(dir, String(i).padStart(2, "0") + ".png"), timeout: 60000 });
    }
    console.log(name, "hauteur", info.height, "debordement horizontal", info.overflowX + "px", "erreurs", JSON.stringify(errors));
    await ctx.close();
  }
  await browser.close();
})();
