---
name: bornz-studio-sites
description: Méthode Bornz Studio pour concevoir et coder des sites web premium, animés et non génériques (landing pages, portfolios, sites vitrines, e-commerce, SaaS, démos clients), au niveau des sites primés sur Awwwards. Contient un catalogue d'animations testées (GSAP, ScrollTrigger, SplitText, Lenis, WebGL), des associations de polices et palettes, les pièges déjà rencontrés et un script de vérification en captures. Utilise ce skill dès que l'utilisateur demande de créer, refaire ou améliorer un site, une landing page, une démo ou une page d'accueil, même s'il ne dit pas « premium » ni « animations », et aussi quand il dit « ajoute au fichier skills » ou « ajoute ce prompt / cette référence aux skills ».
---

# Bornz Studio : sites premium, jamais génériques

Le client de Bornz Studio a déjà refusé des propositions « propres mais génériques ». Il veut des sites
qu'on retient : un concept propre au sujet, un moment signature au scroll, une typographie qui a du
caractère, et une exécution sans défaut sur téléphone. Ce skill rassemble la méthode, les techniques
déjà éprouvées sur bornzstudio.com et les références que l'utilisateur ajoute au fil du temps.

## Quand l'utilisateur dit « ajoute au fichier skills »

C'est une demande d'enrichir ce skill, pas de construire un site. Fais ceci :

1. Identifie ce qu'il apporte : un prompt, une capture de site, un lien, une animation, une police,
   une palette, une règle (« je ne veux plus jamais X »).
2. Range-le au bon endroit :
   - règle de goût ou interdit → `references/journal.md`, section « Règles de l'utilisateur » ;
   - technique d'animation → `references/motion-catalog.md` (nouvelle fiche, même format) ;
   - police / palette → `references/type-color.md` ;
   - site ou ressource d'inspiration → `references/sources.md` ;
   - prompt complet → `references/prompts/<nom-court>.md` (texte intégral + date + d'où il vient).
   Pour une capture, décris ce qui la rend réussie (composition, typo, mouvement) plutôt que de
   seulement la nommer : c'est cette analyse qui servira plus tard.
3. Ajoute une ligne datée dans `references/journal.md` (« Ajouts ») qui résume l'ajout.
4. Commit dans le dépôt où vit le skill (`.claude/skills/bornz-studio-sites/`), puis reconstruis le
   paquet `.skill` (voir « Mettre à jour la version installée ») et envoie-le pour qu'il remplace
   l'ancienne version de son compte.

Ne recopie pas mot pour mot le contenu payant d'un site tiers (prompts premium, templates) que
l'utilisateur n'a pas lui-même fourni : décris la technique avec tes mots. Ce qu'il colle lui-même
depuis un abonnement qu'il paie peut être rangé tel quel dans `references/prompts/`.

## Construire un site : la méthode

### 1. Trouver le concept avant le style
Pose (ou déduis) : qui est le client, ce qu'il vend, à qui, et l'unique action attendue du visiteur.
Puis cherche **un objet ou un geste propre à ce monde** qui deviendra le fil conducteur :
- l'orbe du logo Bornz (le « o » devient une sphère dans laquelle on entre) ;
- la basket qui se démonte pièce par pièce au scroll (Tlemceni) ;
- la villa qu'on visite en scrollant, du survol de la côte à chaque pièce (Villa Lumen) ;
- les réalisations qui tournent en spirale (Stickprod).
Formule-le en une phrase avant d'écrire du code : « Le visiteur ___ et la page ___ ». Si la phrase
s'applique à n'importe quel client, le concept est trop faible : recommence.

### 2. Regarder les références du moment
Avant de dessiner, consulte au moins une source récente (voir `references/sources.md` : Awwwards
répond à WebFetch, getlayers.ai aussi ; land-book et pageflows bloquent les robots, demande des
captures). Note 2 ou 3 techniques à transposer, jamais une page à imiter.

### 3. Poser le système avant les pages
Écris en tête du CSS : les couleurs en variables (4 à 6, dont un fond choisi, pas un gris par
défaut), 2 ou 3 rôles typographiques (affichage, texte, utilitaire), l'échelle de tailles et la
gouttière. Choisis les polices dans `references/type-color.md` en fonction du concept.
Pour un site multilingue avec l'arabe, prévois Alexandria (ou équivalent) dès le départ.

### 4. Un moment signature, le reste au service
Choisis **une** séquence forte (entrée dans l'orbe, iris entre les projets, objet qui se démonte…)
et soigne-la à fond. Les autres sections restent calmes : révélations de titres, remplissage au
scroll, bandeau. Une page où tout bouge autant fait générique. Le catalogue est dans
`references/motion-catalog.md` : lis les fiches des techniques que tu retiens, avec leurs pièges.

### 5. Construire
Pile par défaut (sans étape de build, hébergeable sur GitHub Pages) : HTML statique, GSAP 3 +
ScrollTrigger + SplitText, Lenis, WebGL brut pour les effets lumineux. Point de départ réutilisable
pour une sphère irisée : `assets/orb.js` (shader prêt, couleurs et position pilotées depuis le JS).
Respecte toujours :
- toutes les animations au scroll dans un `gsap.matchMedia()`, pour pouvoir les défaire et les
  reconstruire (changement de langue, passage mobile/ordinateur) ;
- une version complète sans animation (`prefers-reduced-motion`) et un repli sans WebGL ;
- le téléphone d'abord : chaque séquence épinglée doit tenir dans 390 × 844 ;
- textes en français dans le HTML, autres langues dans un dictionnaire, RTL pour l'arabe.

### 6. Vérifier en captures, puis corriger
Lance `scripts/shoot.js` (Playwright) sur ordinateur et mobile, dans chaque langue, et regarde
**toutes** les étapes du scroll avant de livrer. C'est là qu'on a attrapé chez Bornz : un projet
qui transparaissait sous les suivants, 100vh de vide après une séquence épinglée, un titre latin
inversé en arabe, un débordement horizontal de 10 000 px en RTL. Voir la liste complète dans
`references/motion-catalog.md`, section « Pièges ».

## Liste anti-générique (relis-la avant de livrer)

- Le hero dit quelque chose que seul ce client peut dire, avec son objet ou son geste.
- Pas de dégradé violet-bleu sur fond blanc, pas de fond crème + serif + terracotta, pas d'Inter
  ou de Space Grotesk par réflexe, pas d'émojis comme icônes, pas de cartes toutes identiques.
- Les numéros (01, 02…) seulement quand l'ordre a un sens (étapes, index de projets).
- Aucun chiffre ni témoignage inventé : uniquement des données réelles du client.
- Les textes parlent comme un humain qui connaît le métier, en phrases courtes.
- Sur mobile, rien ne déborde, les boutons font au moins 44 px, la séquence signature reste lisible.
- Les règles personnelles de l'utilisateur dans `references/journal.md` sont respectées.

## Mettre à jour la version installée

Le skill vit dans le dépôt (`.claude/skills/bornz-studio-sites/`). Après chaque modification :
commit, puis empaquette-le avec le script `package_skill` du skill « skill-creator » s'il est
disponible (`python -m scripts.package_skill <dossier-du-skill>` depuis le dossier de skill-creator),
sinon un zip du dossier renommé en `.skill`, et envoie le fichier à l'utilisateur pour qu'il
l'enregistre dans son compte (bouton « Save skill »).

## Fichiers du skill

- `references/motion-catalog.md` : techniques d'animation éprouvées, avec code clé et pièges.
- `references/type-color.md` : associations de polices et palettes, par type de client.
- `references/sources.md` : où trouver l'inspiration, ce qui est accessible, catalogue getlayers.
- `references/journal.md` : règles de l'utilisateur et historique des ajouts.
- `references/prompts/` : prompts fournis par l'utilisateur.
- `assets/orb.js` : sphère irisée WebGL réutilisable.
- `scripts/shoot.js` : captures automatiques à chaque étape du scroll + erreurs console.
