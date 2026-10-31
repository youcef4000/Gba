# Polices et couleurs

Toutes les polices ci-dessous sont sur Google Fonts (gratuites, chargeables sans compte). Choisis
selon le concept du client, pas par habitude. Une police d'affichage avec du caractère, utilisée
avec retenue, + une police de texte confortable + éventuellement une mono pour les étiquettes.

## Associations testées ou recommandées

| Univers | Affichage | Texte | Utilitaire | Effet |
|---|---|---|---|---|
| Studio créatif, tech premium (Bornz) | Unbounded 500-600, interlettrage -0,045em | Bricolage Grotesque | JetBrains Mono (majuscules, +0,12em) | Large, géométrique, sûr de lui |
| Accent éditorial dans un titre | Instrument Serif italique, 1,12-1,16em | — | — | Le mot important en serif + dégradé |
| Luxe, immobilier, parfum | Instrument Serif ou Cormorant Garamond | Manrope | DM Mono | Calme, cher |
| Mode, streetwear, sport | Anton ou Bebas Neue (condensé) | Archivo | Space Mono | Affiche, énergie |
| Production vidéo, culture | Fraunces (optique variable) | Inter Tight | IBM Plex Mono | Cinéma, auteur |
| SaaS / IA | Geist ou Sora | Geist | Geist Mono | Net, technique (attention au générique) |
| Food, artisanat | Recoleta-like : Gloock / DM Serif Display | Outfit | — | Chaleureux sans cliché |
| Arabe (toutes catégories) | Alexandria 600-700 | Alexandria 400 | — | Géométrique, s'accorde avec Unbounded |
| Arabe plus traditionnel | Amiri ou Reem Kufi | IBM Plex Sans Arabic | — | Calligraphique / kufi |

Règles : `text-wrap: balance` sur les titres, 60-70 caractères par ligne pour le texte, interlettrage
négatif sur les grandes tailles, positif sur les petites majuscules. Pour l'arabe : pas
d'interlettrage, interligne plus grand (1,25-1,45), pas de découpage en lettres.

## Couleurs

- Un fond **choisi** (presque noir teinté : #0a0a0d, #0b0b10, #0c2219 vert profond, #0d0a22 nuit
  violette…), jamais un gris neutre par défaut.
- Un texte cassé (#f2efe8 plutôt que #fff).
- Deux accents qui vivent ensemble (or #e8b84a + violet #9b6bff chez Bornz ; rouge #ef3b46 + or
  #d8b56a pour Tlemceni ; sable #d9b77c + bleu canard #3d8e9d pour Villa Lumen).
- Le spectre irisé Bornz pour les moments signature : `linear-gradient(100deg, #e8b84a, #ff5a1f 34%,
  #9b6bff 66%, #2fd3e6)` (texte en `background-clip: text`, boutons, lignes de progression).
- Couleurs de projet tirées de sa capture : fond = moyenne des bords, accents = teintes vives les
  plus présentes (algorithme dans `public/admin/admin.js`, fonction `paletteOf`).

## À éviter (signes de site généré)

Fond crème + serif + terracotta ; noir + une seule couleur acide ; dégradé violet→bleu sur blanc ;
Inter ou Space Grotesk choisis par réflexe ; tout centré ; même rayon et même ombre sur chaque bloc ;
barre d'accent sur des cartes arrondies ; émojis en guise d'icônes.

## Polices des logos célèbres (pour s'inspirer d'un registre)

Repères connus (à compléter avec fontinlogo.com quand il répond) : Google → Product Sans ;
Airbnb → Cereal ; Spotify → Circular ; Netflix → Netflix Sans / Graphique ; Nike → Futura Bold
Condensed ; Supreme → Futura Heavy Oblique ; Vogue → Didot ; Chanel → Couture ; Coca-Cola →
Spencerian Script ; Apple → SF Pro. Équivalents libres : Futura → Jost ; Circular → Plus Jakarta
Sans ; Didot → Playfair Display ; SF Pro → Inter / Geist.
