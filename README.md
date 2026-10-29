# Bornz Studio — portfolio

Site vitrine du studio, pour attirer de nouveaux clients : quatre projets en ligne présentés avec des animations au scroll, en français, en arabe et en anglais. Il comprend aussi un formulaire de contact qui enregistre vraiment les demandes, et un espace admin privé avec les messages reçus et les statistiques de visite.

Deux services gratuits :

| Élément | Où | Rôle |
|---|---|---|
| Le site | `public/`, publié par **GitHub Pages** (`.github/workflows/static.yml`) | Pages statiques, en ligne sur bornzstudio.com |
| La base | **Supabase** (projet `bornz-studio`) | Messages du formulaire, statistiques de visite, connexion à l'admin |

Le site parle directement à Supabase (adresse et clé publique dans `public/assets/js/config.js`). La clé « publishable » est faite pour être publique : depuis le site, la base n'accepte que deux fonctions, enregistrer un message et compter une visite. Les fonctions de l'admin ne répondent qu'au compte dont l'e-mail figure dans la table `admins`.

---

## 1. Mettre le site en ligne

Chaque `git push` sur `master` publie le dossier `public/` sur GitHub Pages en une à deux minutes.

## 2. Préparer la base Supabase (une seule fois)

1. **SQL Editor → New query** : coller tout le fichier `supabase/setup.sql`, puis **Run**. Le script peut être relancé sans risque.
2. **Authentication → Users → Add user → Create new user** : e-mail `youcef.ny@gmail.com`, ton mot de passe (6 caractères minimum), case **Auto Confirm User** cochée.
3. **Authentication → Sign In / Providers** : désactiver **Allow new users to sign up**, pour que personne ne puisse se créer un compte.

**Changer le mot de passe admin** : Authentication → Users → ligne de ton compte → **⋯ → Reset password**, ou supprimer le compte et le recréer avec le nouveau mot de passe.

**Autoriser un autre compte** : SQL Editor → `insert into public.admins (email) values ('autre@exemple.com');`, puis créer ce compte dans Authentication → Users.

## L'espace admin (`/admin`)

**Messages**
- Toutes les demandes du configurateur : nom, WhatsApp ou e-mail du client, activité, type de projet, options, délai, précisions, pays.
- Boutons *Répondre sur WhatsApp* (numéro algérien converti automatiquement au format international) ou *Répondre par e-mail*.
- Non lus, archivés, suppression. Le compteur de non-lus s'affiche dans l'onglet du navigateur.

**Statistiques** (7, 30 ou 90 jours, comparées à la période précédente)
- Visites, pages vues, messages reçus, taux de conversion.
- Visites par jour, avec le détail au survol et un tableau.
- Parcours : visites → ont vu les projets → ont atteint le formulaire → ont envoyé un message.
- Sources (Instagram, Facebook, TikTok, Google…), pays, appareils, langue choisie, clics vers tes sites et vers WhatsApp.
- Pour suivre une campagne, ajoute `?utm_source=nom` au lien partagé (ex. `https://bornzstudio.com/?utm_source=pub_instagram`) : il apparaît tel quel dans les sources.

**Sécurité et vie privée**
- Connexion par Supabase Auth (e-mail de `config.js` + mot de passe), qui limite lui-même les essais répétés.
- Anti-spam : champ piège invisible et 5 demandes maximum par heure depuis une même connexion.
- Les statistiques n'utilisent ni cookie ni adresse IP stockée. L'identifiant anonyme d'un visiteur change chaque jour, les robots sont ignorés et « Do Not Track » est respecté.

---

## Personnaliser

- **Logo** : `public/assets/img/` contient `logo.svg` (fond sombre), `logo-ink.svg` (fond clair), `favicon.svg`, `apple-touch-icon.png` et `og.png` (image affichée quand on partage le lien). Le logo est aussi intégré directement dans `index.html` (chargement, navigation, pied de page) : son « o » est une sphère irisée qui tourne doucement et prend les couleurs du projet en cours.
- **Contacts affichés** : `public/assets/js/config.js` (WhatsApp, e-mail, Instagram). Un numéro WhatsApp renseigné ajoute le bouton « Sur WhatsApp » à côté de l'envoi.
- **Textes français** : directement dans `public/index.html`.
- **Arabe et anglais** : `public/assets/js/i18n.js`, sous la même clé que l'attribut `data-i18n` du HTML.
- **Ajouter un projet** : copier un bloc `<article class="project">` et changer `data-bg`, `data-fg`, `data-accent`, `data-accent2` ; la page prendra ses couleurs au scroll.

## Structure

```
public/                 le site publié tel quel (GitHub Pages)
  index.html
  admin/                espace admin (index.html, admin.css, admin.js)
  assets/               styles, scripts, images, GSAP et Lenis
  assets/js/config.js   contacts affichés + adresse et clé publique Supabase
  robots.txt
supabase/setup.sql      tables, fonctions et droits de la base (à coller dans le SQL Editor)
.github/workflows/      publication GitHub Pages
```

## Tester en local

```bash
npx http-server public -p 8080
```

Le site est alors sur http://localhost:8080 et l'admin sur http://localhost:8080/admin, branchés sur la vraie base Supabase.
