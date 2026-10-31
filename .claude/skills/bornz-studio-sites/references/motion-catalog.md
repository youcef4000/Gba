# Catalogue d'animations éprouvées

Chaque fiche : ce que voit le visiteur, quand l'utiliser, le cœur du code, les pièges. Toutes ont été
codées et vérifiées en captures sur bornzstudio.com (GSAP 3.15, ScrollTrigger, SplitText, Lenis 1.3).
Référence vivante : `public/assets/js/main.js` et `public/assets/css/style.css` du dépôt Gba.

## Sommaire
1. Socle : Lenis + ScrollTrigger + matchMedia
2. Rideau de chargement qui passe le relais à un élément de la page
3. Sphère irisée WebGL (orbe) pilotée par le scroll
4. Nom géant dont les lettres s'envolent, entrée dans l'objet
5. Texte révélé mot par mot au scroll (manifeste)
6. Scène épinglée : projets qui s'ouvrent en iris
7. Index filtrable avec aperçu qui suit la souris
8. Grands noms en contour qui se remplissent au scroll
9. Étapes en défilement horizontal épinglé
10. Bandeau infini qui accélère et penche avec le scroll
11. Mot qui tourne dans le titre
12. Curseur personnalisé, boutons aimantés
13. Thème caméléon (la page prend les couleurs de la section)
14. Pied de page en rideau
15. Pièges rencontrés (à relire avant de livrer)
16. Techniques repérées à explorer

---

## 1. Socle
```js
gsap.registerPlugin(ScrollTrigger, SplitText);
ScrollTrigger.config({ ignoreMobileResize: true });
const lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

const mm = gsap.matchMedia();
mm.add({ desktop: "(min-width: 861px)", motion: "(prefers-reduced-motion: no-preference)" }, (ctx) => {
  if (!ctx.conditions.motion) return;
  // toutes les timelines, SplitText et ScrollTrigger ici
  return () => { /* remettre les variables globales à null */ };
});
// changement de langue : mm.revert(); réécrire les textes; reconstruire; ScrollTrigger.refresh();
```
Crée les ScrollTrigger **dans l'ordre de la page** (les épinglages décalent ceux d'après).
Après tout changement de hauteur (accordéon, filtre, formulaire envoyé), appelle
`ScrollTrigger.refresh()` avec un petit délai, sinon les déclencheurs suivants sont décalés.

## 2. Rideau de chargement avec passage de relais
Visiteur : fond noir, compteur 000→100 en très grand, l'objet signature grandit au centre ; le
rideau s'efface et l'objet glisse jusqu'à sa place dans le hero.
- Compteur : `gsap.to(o, { v: 100, duration: 1.9, onUpdate })`, chiffres `padStart(3, "0")`.
- L'objet est au-dessus du rideau pendant le chargement (`.is-loading .orb-gl { z-index: 95 }`).
- Ne le montrer qu'une fois par session (`sessionStorage`), sinon il agace.
- Le rideau ne doit jamais rester bloqué : `Promise.race([pret, délai 7 s])`.
- Pendant l'attente, cacher le hero avec une classe (`.intro-pending … { visibility: hidden }`)
  retirée au moment de jouer l'intro, pour éviter tout clignotement.

## 3. Sphère irisée WebGL (l'orbe)
Fichier prêt : `assets/orb.js`. Une toile fixe plein écran, un fragment shader dessine une sphère
(position, rayon, 4 couleurs brassées par un bruit fractal, reflet qui suit la souris, halo,
irisation sur le bord, grain anti-bandes). Le JS appelle `orb.render(etat, temps)` à chaque image.
- Position pilotée par des **ancres DOM** (`getBoundingClientRect` d'un élément vide placé là où
  l'objet doit être) : le trou du « o » d'un logo, le coin d'une capture, le pied de page.
- Lisser vers la cible (`k = 1 - (1 - 0.32) ** (dt / 16.67)`), plus doux (0.09) pendant un
  changement de section, pour qu'elle voyage d'une ancre à l'autre.
- « Dedans » : quand le rayon dépasse l'écran, passer les coordonnées du bruit en coordonnées écran
  (uniform `inside`) et assombrir vers la couleur de fond (`dim`) pour lire du texte par-dessus.
- Le temps envoyé au shader doit être **intégré** (`flow += dt * (1 + énergie)`), jamais
  `t * facteur variable`, sinon le motif saute.
- Plafonner la définition à 1,5 pixel physique et la baisser si les images ralentissent
  (`degrade()`), désactiver sans WebGL ou en mouvement réduit (orbe en CSS à la place).
- Profondeur : toile `z-index` sous la page (`.orb-back`) quand du texte doit passer devant, au-dessus
  sinon. Les sections opaques recouvrent alors naturellement l'orbe.

## 4. Nom géant dont les lettres s'envolent
Les lettres du logo en `<path>` séparés dans un SVG pleine largeur, un vide là où vit l'objet.
Au scroll (section épinglée), chaque lettre part dans sa direction avec rotation et fondu
(`xPercent/yPercent/rotation/opacity`, départs décalés de 0,02 à 0,1) pendant que l'objet grossit
jusqu'à couvrir l'écran. `transform-box: fill-box; transform-origin: 50% 50%` sur les paths.
Garder le nom géant visible sur écrans bas : `max-width: max(40%, calc((100svh - 380px) * ratio))`.

## 5. Texte révélé mot par mot
`new SplitText(el, { type: "words" })`, puis `fromTo(words, {opacity: .1}, {opacity: 1, stagger: .035})`
dans la timeline épinglée. Une serif élégante en grand (Instrument Serif) sur fond vivant marche
très bien. **Sortie** : ne pas faire disparaître l'objet dans l'épinglage (ça laisse 100vh de vide) ;
terminer l'épinglage quand le texte est lu, puis refermer l'objet pendant que la section suivante
monte par-dessus (ScrollTrigger séparé sur la section suivante : `top bottom` → `top 15%`).

## 6. Scène épinglée : projets qui s'ouvrent en iris
Une scène de 100svh, un « monde » par projet en `position: absolute`. Chaque monde suivant est
découpé par `clip-path: circle(calc(var(--iris) * var(--iris-max)) at var(--sx) var(--sy))`, et
`--iris` passe de 0 à 1 au scroll. Le centre du cercle = l'objet signature du projet (petit orbe
au coin de la capture), qui gonfle pendant la naissance (`r * (1 + 0.55 * sin(PI * f))`) et prend
les couleurs du projet suivant.
- Chaque monde a ses couleurs (`--wbg --wfg --wac --wac2`), texte clair ou foncé calculé selon la
  luminance du fond.
- Monde précédent : `scale .93`, `opacity .2` ; nouveau monde : lettres du titre qui montent
  (SplitText chars + mask lines), image qui se resserre (`scale 1.22 → 1`), téléphone qui remonte.
- **Obligatoire** : `isolation: isolate` sur chaque monde, sinon le texte du premier monde
  transparaît sous tous les autres (il n'a pas de clip-path, donc pas de contexte d'empilement).
- Calculer `--sx/--sy` avec `offsetLeft/offsetTop` (pas `getBoundingClientRect`, faussé par les
  transformations en cours), et `--iris-max` = distance au coin le plus éloigné.
- Au-delà de 8 projets, mettre les premiers en grand et le reste dans l'index.

## 7. Index filtrable avec aperçu flottant
Liste en grille (n°, nom en police d'affichage, catégorie, type, année, flèche). Au survol : fond
de la couleur du projet qui monte (`::before scaleY`), nom décalé, flèche qui pivote ; une capture
suit la souris (`gsap.quickTo` x/y, rotation selon la vitesse, image révélée par `clip-path`).
Filtres en pastilles avec compteurs ; masquer un filtre vide. Sur mobile : vignette à gauche.

## 8. Grands noms en contour qui se remplissent
Texte en `color: transparent; -webkit-text-stroke: 1px …`, un `::after { content: attr(data-text) }`
plein, découpé par `clip-path: inset(-10% calc(100% - var(--fill)) -10% 0)` ; `--fill` 0→100 %
au scroll (`top 82%` → `top 42%`). En RTL inverser l'inset. Mettre à jour `data-text` à chaque
changement de langue. Combine bien avec un accordéon (`grid-template-rows: 0fr → 1fr`).

## 9. Étapes en défilement horizontal épinglé
Piste `width: max-content`, épinglée, `x: -(largeur - écran)` au scroll + ligne de progression
dégradée `scaleX`. Petite pause au début pour que la première étape soit vue entière. En RTL : `x`
positif. Sur mobile : liste verticale avec une ligne qui se remplit (`scaleY`).

## 10. Bandeau infini sensible au scroll
Groupe de textes cloné pour couvrir 2 écrans ; dans `gsap.ticker`, avancer de
`(70 + |vitesse scroll| * 22) px/s`, changer de sens avec le scroll, `skewX` proportionnel à la
vitesse, boucler sur la largeur d'un groupe. `direction: ltr` sur la rangée même en arabe.

## 11. Mot qui tourne dans le titre
« Des sites nés pour *vendre / convaincre / durer…* » : le mot en serif italique avec un dégradé
en `background-clip: text`, sortie `yPercent -110`, entrée `110 → 0`, toutes les 2,8 s, dans un
conteneur `overflow: clip`. Liste de mots par langue.

## 12. Curseur et boutons aimantés
Point + anneau (`quickTo` 0,08 s et 0,42 s), anneau qui grossit sur les liens, étiquette (« Visiter »,
« Démo ») sur les éléments `[data-cursor]`. Seulement si `(hover: hover) and (pointer: fine)`.
Boutons `.magnetic` : décalage de 30 à 40 % de la position de la souris, retour élastique.

## 13. Thème caméléon
Variables `--bg --fg --accent --accent2` sur `:root`, animées par `gsap.to(root, {"--bg": …})`
selon la section ou le projet affiché ; la navigation, le logo et la sélection suivent.
Mettre aussi à jour `<meta name="theme-color">`.

## 14. Pied de page en rideau
Si le pied de page tient dans l'écran : `position: fixed; bottom: 0` sous le contenu,
`margin-bottom` = sa hauteur sur `<main>`, et ne le rendre visible qu'à l'approche du bas (sinon il
transparaît à travers les sections transparentes). Recalculer à chaque `refreshInit`.
Sinon, pied de page normal. Le nom géant y revient, avec l'objet signature dans son trou.

## 15. Pièges rencontrés
- `isolation: isolate` sur les calques empilés (voir 6).
- Champ piège anti-spam en `left: -9999px` → **10 000 px de défilement horizontal en RTL**. Le cacher
  avec `clip-path: inset(50%)` sans décalage.
- SplitText en mode lettres casse l'arabe (lettres liées) : mots seulement si le texte contient de
  l'arabe ; et un titre latin dans une page RTL doit avoir `dir="ltr"`, sinon « Hooked Lab »
  devient « Lab Hooked ».
- Arabe + nom latin collé à « و » (وClaude) s'affiche mal : écrire « و Claude » ou utiliser « ، ».
- `replaceChildren(null)` écrit « null » dans la page : filtrer les valeurs vides.
- Épinglage qui finit sur un écran vide : voir la sortie en 5.
- Hero trop haut pour les portables (650-720 px utiles) : tester en 1200×630 et 1366×657.
- Sous Chromium sans GPU (SwiftShader), les captures sont lentes : augmenter les délais, ce n'est
  pas la page qui est lente. Vérifier le coût réel avec les métriques CDP (ScriptDuration, Layout).

## 16. Techniques repérées à explorer
(Ajouter ici ce que l'utilisateur envoie ou ce qui est repéré sur Awwwards / getlayers.)
- Particules qui forment un objet puis se dispersent (getlayers « Particle Forms »).
- Tissu holographique, verre réfractant (« Holographic Cloth », « Refract », « Pixel Glass »).
- Fond ASCII ou tramé (« ASCII Studio », « Dither Art ») pour une marque tech ou rétro.
- Galaxie spirale, terrains en vagues (« Pinwheel Galaxy », « Aurum Peak ») en fond de hero.
- Carrousels en couloir de miroirs, sections en colonnade, feuille de route en ascension
  (« Mirror Hall », « Colonnade », « Roadmap Ascent »).
- Transitions de page en WebGL et curseur fluide (portfolio G. Colombel, Awwwards SOTD oct. 2026).
