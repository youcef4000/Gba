# Youcef — portfolio

Site vitrine pour attirer de nouveaux clients : quatre projets en ligne présentés avec des animations au scroll, en français, en arabe et en anglais.

Site statique : HTML, CSS et JavaScript, sans étape de build. Il s'ouvre tel quel et s'héberge partout (GitHub Pages, Netlify, Vercel, Cloudflare Pages, un hébergement mutualisé…).

## À faire avant la mise en ligne

Ouvrir `assets/js/config.js` et remplacer les valeurs d'exemple :

```js
window.SITE_CONFIG = {
  name: "Youcef",
  whatsapp: "213551234567",      // numéro international, chiffres uniquement
  email: "contact@mondomaine.com",
  instagram: "mon.compte",       // facultatif
};
```

Tant que le numéro WhatsApp et l'e-mail gardent leurs valeurs d'exemple, les boutons « Envoyer sur WhatsApp » et « Envoyer par e-mail » restent masqués : seul « Copier le message » s'affiche.

## Ce que contient la page

| Section | Effet |
|---|---|
| Chargement | Compteur 0 → 100 puis rideau qui se lève (une seule fois par session) |
| Accueil | Titre lettre par lettre, mot qui tourne (vendent, convertissent, exportent…), cartes projets flottantes, parallaxe souris |
| Bandeau | Deux lignes de texte en boucle qui accélèrent et s'inclinent avec la vitesse du scroll |
| Manifeste | Les mots s'allument un à un au scroll |
| Projets | La page entière prend les couleurs de chaque projet. Maquettes animées des quatre sites, entrée en 3D, tilt au survol |
| Portée | Carte de l'Algérie en points qui s'allume depuis Alger jusqu'à Tamanrasset, puis liaisons vers Marseille, Paris, Madrid et Rome |
| Services | Défilement horizontal épinglé (de droite à gauche en arabe) |
| Méthode | Rail qui se remplit, étapes qui s'allument |
| Inclus | Grille avec micro-animations et halo qui suit la souris |
| Contact | Configurateur : le visiteur coche ses besoins, le message WhatsApp se rédige tout seul |
| Fin | Passage en thème clair, titre qui monte au scroll, nom géant dans le pied de page |

Tout est désactivé proprement si le visiteur a demandé à réduire les animations (`prefers-reduced-motion`) : le contenu reste complet et lisible.

## Modifier les textes

- **Français** : directement dans `index.html`.
- **Arabe et anglais** : dans `assets/js/i18n.js`, sous la même clé que l'attribut `data-i18n` du HTML. Une clé absente retombe sur le français.
- **Mots qui tournent dans le titre** : `I18N.words` dans `assets/js/i18n.js`.

La langue choisie par le visiteur est mémorisée dans son navigateur.

## Ajouter un projet

1. Copier un bloc `<article class="project">` dans `index.html`.
2. Changer ses couleurs avec `data-bg`, `data-fg`, `data-accent`, `data-accent2` : la page les prendra automatiquement au scroll.
3. Mettre à jour le compteur `01 / 04` et la statistique « plateformes en ligne ».

## Structure

```
index.html
assets/
  css/style.css       styles, tokens de couleur (--bg, --fg, --accent, --accent2)
  js/config.js        coordonnées de contact
  js/i18n.js          traductions arabe et anglais
  js/main.js          animations, thème caméléon, carte, configurateur
  js/map-data.js      grille de points de la carte (générée depuis Natural Earth)
  vendor/             GSAP 3.15 (ScrollTrigger, SplitText) et Lenis 1.3
  img/                visuels de The Algerian Exporter, favicon
```

## Mettre en ligne sur GitHub Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, choisir la branche `master` et le dossier `/ (root)`. Le site est publié quelques minutes plus tard à l'adresse indiquée sur cette page. Un nom de domaine personnalisé se branche au même endroit.

## Tester en local

```bash
python3 -m http.server 8000
```

puis ouvrir http://localhost:8000.
