# Youcef — portfolio

Site vitrine pour attirer de nouveaux clients : quatre projets en ligne présentés avec des animations au scroll, en français, en arabe et en anglais. Il comprend aussi un formulaire de contact qui enregistre vraiment les demandes, et un espace admin privé avec les messages reçus et les statistiques de visite.

Tout tourne sur **Cloudflare Workers**, gratuitement :

| Élément | Où | Rôle |
|---|---|---|
| Le site | `public/` | Pages statiques, servies directement par Cloudflare |
| L'API | `worker/index.js` → `functions/api/` | Reçoit les demandes, compte les visites, sert l'admin |
| La base | Cloudflare D1 | Stocke messages et statistiques (créée et remplie automatiquement) |
| L'e-mail (facultatif) | Resend | T'envoie chaque nouveau message par e-mail |

La configuration du Worker est dans `wrangler.jsonc` (nom du Worker : `gba`).

---

## 1. Mettre le site en ligne

Le Worker `gba` est relié au dépôt GitHub. Il reste trois réglages à faire dans Cloudflare.

1. **Construire la bonne branche.** Worker `gba` → **Settings → Build → Branch control** → branche de production : `master`.
   *Recommandé aussi :* GitHub → **Settings → General → Default branch** → `master`, pour que tout pointe au même endroit.
2. **Réglages de build** (même page) :
   - Build command : *vide*
   - Deploy command : `npx wrangler deploy`
   - Root directory : `/`
3. **Mot de passe admin.** **Settings → Variables and Secrets → Add** → type **Secret**, nom `ADMIN_PASSWORD`, valeur : ton mot de passe (long et unique).

Le prochain `git push` sur `master` déclenche le déploiement, et chaque push suivant remet le site à jour. Il est en ligne sur **https://bornzstudio.com** (voir la section 4), et reste joignable en secours sur `https://gba.youcef-ny.workers.dev`.

> **Attention à ne pas confondre Production et aperçu.** En haut de la page du Worker, le sélecteur à côté de `gba` doit indiquer **Production** (l'adresse se termine par `/production/settings`). Un aperçu nommé `master` peut apparaître si des commits ont été poussés avant le réglage de la branche : il ne sert à rien, on le supprime depuis ses propres réglages (**General → Delete**). Ses builds échouent de toute façon, car la commande d'aperçu ne sait pas créer la base D1.
>
> **Les variables se règlent après le premier déploiement réussi.** Tant que le Worker n'a jamais été déployé, Cloudflare refuse d'ajouter `ADMIN_PASSWORD` (« Create a deployment before patching one »).

## 2. La base de données et l'espace admin

Rien à créer : au premier déploiement, Wrangler crée la base D1 et la relie au Worker (le journal de build affiche « Provisioning DB »). Les tables se créent au premier message ou à la première visite.

Ouvre ensuite https://bornzstudio.com/admin et connecte-toi avec `ADMIN_PASSWORD`.

*Si le journal indique que la création a été ignorée faute de permission :* **Storage & Databases → D1 → Create**, puis Worker `gba` → **Settings → Bindings → Add → D1 database**, nom de la variable `DB`, et redéploie.

## 3. Recevoir chaque message par e-mail (facultatif, recommandé)

1. Crée un compte gratuit sur [resend.com](https://resend.com) (3 000 e-mails par mois).
2. **API Keys → Create API Key**, avec l'accès *Sending access*.
3. Dans le Worker, **Settings → Variables and Secrets**, ajoute en type **Secret** :
   - `RESEND_API_KEY` : la clé créée ;
   - `NOTIFY_EMAIL` : l'adresse qui reçoit les messages. Tant qu'aucun domaine n'est vérifié chez Resend, ce doit être l'adresse de ton compte Resend.
4. Redéploie (un push, ou *Retry build* sur le dernier build de `master`).

L'e-mail reprend tout le message. Le bouton « Répondre » répond directement au client quand il a laissé une adresse e-mail.

Avec ton propre domaine vérifié chez Resend, ajoute `MAIL_FROM` = `Portfolio <contact@tondomaine.com>` pour envoyer depuis ton adresse.

## 4. Nom de domaine

Le domaine **bornzstudio.com** est acheté et renouvelé chez Hostinger, mais son DNS est géré par Cloudflare : chez Hostinger, les nameservers sont ceux de Cloudflare (`isla.ns.cloudflare.com`, `oswald.ns.cloudflare.com`).

| Adresse | Worker |
|---|---|
| `bornzstudio.com` | `gba` (ce portfolio) |
| `www.bornzstudio.com` | `gba`, redirigé vers `bornzstudio.com` par une règle Cloudflare |
| `demos.bornzstudio.com` | `demos` (dépôt `youcef4000/demos`) |

Pour brancher une nouvelle adresse : Worker → onglet **Domains** → **Add Domain** → sous-domaine (vide pour la racine). Cloudflare crée l'enregistrement DNS et le certificat HTTPS tout seul. Les domaines ajoutés ainsi restent en place à chaque déploiement.

---

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
- Session par cookie `HttpOnly` et `Secure`, valable 7 jours. Blocage de 15 minutes après 5 mauvais mots de passe.
- Anti-spam : champ piège invisible et 5 demandes maximum par heure depuis une même connexion.
- Les statistiques n'utilisent ni cookie ni adresse IP stockée. L'identifiant anonyme d'un visiteur change chaque jour, les robots sont ignorés et « Do Not Track » est respecté.

---

## Personnaliser

- **Contacts affichés** : `public/assets/js/config.js` (WhatsApp, e-mail, Instagram). Un numéro WhatsApp renseigné ajoute le bouton « Sur WhatsApp » à côté de l'envoi.
- **Textes français** : directement dans `public/index.html`.
- **Arabe et anglais** : `public/assets/js/i18n.js`, sous la même clé que l'attribut `data-i18n` du HTML.
- **Ajouter un projet** : copier un bloc `<article class="project">` et changer `data-bg`, `data-fg`, `data-accent`, `data-accent2` ; la page prendra ses couleurs au scroll.

## Structure

```
public/                 le site servi tel quel
  index.html
  admin/                espace admin (index.html, admin.css, admin.js)
  assets/               styles, scripts, images, GSAP et Lenis
  _headers              en-têtes de sécurité
  robots.txt
worker/index.js         point d'entrée du Worker : aiguille /api/* vers functions/
wrangler.jsonc          configuration Cloudflare (nom, fichiers statiques, base D1)
functions/api/          handlers de l'API
  contact.js            POST /api/contact
  track.js              POST /api/track
  admin/                login, session, messages, stats (+ garde d'accès)
lib/server.js           outils partagés : base, sessions, anti-spam, e-mail
schema.sql              schéma de la base, pour référence
```

## Tester en local

```bash
npx wrangler dev --var ADMIN_PASSWORD:motdepasse-local
```

Le site est alors sur http://localhost:8787 et l'admin sur http://localhost:8787/admin, avec une base D1 locale.
