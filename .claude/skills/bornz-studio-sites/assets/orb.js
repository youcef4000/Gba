/* ============================================================================
   L'orbe : la sphere irisee du logo, rendue en WebGL sur une toile fixe.

   Une seule toile couvre l'ecran ; le fragment shader dessine une sphere
   (position, rayon, couleurs) et la laisse transparente ailleurs. main.js
   decide ou elle se trouve a chaque image : dans le "o" du logo, plein
   ecran pendant le manifeste, au coeur de chaque projet, dans le pied de page.

   Quatre taches de couleur, comme le logo : or (accent), orange, violet
   (accent 2) et cyan, brassees par un bruit fractal. La lumiere suit la souris.
   ========================================================================== */
(() => {
  "use strict";

  const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uOrb;   // centre x, y (pixels, origine en haut a gauche), rayon
uniform vec4 uLook;  // assombri, immersion, opacite, energie
uniform vec2 uLight; // direction de la lumiere (-1..1)
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uC4;
uniform vec3 uBg;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float R = max(uOrb.z, 0.001);
  float inside = uLook.y;
  vec2 d = (frag - uOrb.xy) / R;
  float ang = atan(d.y, d.x);
  float t = uTime;

  // Bord legerement vivant : la sphere respire.
  float wob = 1.0 + (0.008 * sin(ang * 3.0 + t * 1.1) + 0.004 * sin(ang * 5.0 - t * 1.7)) * (1.0 - inside);
  vec2 s = d / wob;
  float r = length(s);
  float edge = 1.5 / R;
  float body = 1.0 - smoothstep(1.0 - edge, 1.0 + edge, r);
  float halo = (1.0 - body) * exp(-max(r - 1.0, 0.0) * 4.5) * 0.3 * (1.0 - inside);
  if (body + halo < 0.002) { gl_FragColor = vec4(0.0); return; }

  float z = sqrt(max(0.0, 1.0 - min(dot(s, s), 1.0)));
  vec3 n = normalize(vec3(s, z + 0.0001));

  // Champ de couleurs : coordonnees de la sphere, puis de l'ecran une fois dedans.
  vec2 scr = (frag - uOrb.xy) / (0.5 * uRes.y);
  vec2 uv = mix(s * (1.12 - 0.28 * z), scr, inside);
  float ts = t * 0.09;
  vec2 q = vec2(fbm(uv * 1.3 + vec2(ts, -ts * 0.7)), fbm(uv * 1.3 + vec2(-ts * 0.6, ts) + 4.3));
  vec2 w = uv + (q - 0.5) * 1.5 + uLight * 0.12;
  float a = fbm(w * 1.15 + vec2(1.7, ts * 1.3)) + 0.3 * (-uv.x - uv.y);
  float b = fbm(w * 1.25 + vec2(-3.1, -ts)) + 0.3 * (uv.x - uv.y);
  float c = fbm(w * 1.05 + vec2(5.2, ts * 0.8)) + 0.3 * (uv.x + uv.y);
  vec3 col = uC3;
  col = mix(col, uC1, smoothstep(0.4, 0.78, a));
  col = mix(col, uC2, smoothstep(0.46, 0.84, b) * 0.9);
  col = mix(col, uC4, smoothstep(0.48, 0.86, c) * 0.85);

  // Volume : diffus, reflet, irisation sur le bord. S'efface quand on est dedans.
  vec3 L = normalize(vec3(uLight.x * 0.9 - 0.35, uLight.y * 0.9 - 0.45, 0.85));
  float diff = 0.6 + 0.4 * max(dot(n, L), 0.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), 52.0);
  float fres = pow(1.0 - z, 2.4);
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + fres * 1.3 + ts * 2.0));
  vec3 lit = col * diff + film * fres * 0.24 + vec3(spec * 0.42) - vec3(fres * 0.1);
  col = mix(col, lit, 1.0 - inside);

  col = mix(col, uBg, uLook.x);
  col += (hash(frag + fract(t) * 91.0) - 0.5) * 0.028;

  vec3 haloCol = mix(uC1, uC3, 0.5);
  float alpha = (body + halo) * uLook.z;
  gl_FragColor = vec4((max(col, 0.0) * body + haloCol * halo) * uLook.z, alpha);
}`;

  const rgb = (hex) => {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const mixRgb = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

  function create(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    } catch (e) { gl = null; }
    if (!gl) return null;

    const shader = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = {};
    ["uRes", "uTime", "uOrb", "uLook", "uLight", "uC1", "uC2", "uC3", "uC4", "uBg"].forEach((k) => { u[k] = gl.getUniformLocation(prog, k); });

    let dpr = 1;
    let cap = 1.5;
    let blank = false;
    let lost = false;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); lost = true; });

    function resize() {
      // L'orbe est douce : inutile de depasser 1,5 pixel physique par pixel CSS.
      dpr = Math.min(window.devicePixelRatio || 1, cap);
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    }

    // s : { x, y, r (pixels CSS), dim, inside, alpha, energy, lx, ly, c1..c4, bg (tableaux rgb) }
    function render(s, time) {
      if (lost) return;
      if (s.r < 0.5 || s.alpha < 0.005) {
        if (!blank) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); blank = true; }
        return;
      }
      blank = false;
      gl.uniform2f(u.uRes, canvas.width, canvas.height);
      gl.uniform1f(u.uTime, time);
      gl.uniform3f(u.uOrb, s.x * dpr, s.y * dpr, s.r * dpr);
      gl.uniform4f(u.uLook, s.dim, s.inside, s.alpha, s.energy);
      gl.uniform2f(u.uLight, s.lx, s.ly);
      gl.uniform3fv(u.uC1, s.c1);
      gl.uniform3fv(u.uC2, s.c2);
      gl.uniform3fv(u.uC3, s.c3);
      gl.uniform3fv(u.uC4, s.c4);
      gl.uniform3fv(u.uBg, s.bg);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Appareil lent : on baisse la definition plutot que la fluidite.
    function degrade() {
      if (cap <= 0.6) return false;
      cap = cap > 1 ? 1 : 0.6;
      resize();
      return true;
    }

    resize();
    return { resize, render, degrade };
  }

  window.BornzOrb = { create, rgb, mixRgb };
})();
