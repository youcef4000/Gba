# Youcef — portfolio

Site vitrine pour attirer de nouveaux clients : quatre projets en ligne présentés avec des animations au scroll, en français, en arabe et en anglais. Il comprend aussi un formulaire de contact qui enregistre vraiment les demandes, et un espace admin privé avec les messages reçus et les statistiques de visite.

Tout tourne sur **Cloudflare Pages**, gratuitement :

| Élément | Où | Rôle |
|---|---|---|
| Le site | `public/` | Pages statiques, sans étape de build |
| L'API | `functions/api/` | Reçoit les demandes, compte les visites, sert l'admin |
| La base | Cloudflare D1 | Stocke messages et statistiques (tables créées automatiquement) |
| L'e-mail (facultatif) | Resend | T'envoie chaque nouveau message par e-mail |

---

## 1. Mettre le site en ligne

Compte à créer une seule fois : [dash.cloudflare.com](https://dash.cloudflare.com) (gratuit).

1. **Workers & Pages → Créer → Pages → Importer un dépôt Git existant.** Connecte ton compte GitHub et choisis le dépôt `youcef4000/Gba`.
2. Réglages de build :
   - Branche de production : `master`
   - Préréglage de framework : *Aucun*
   - Commande de build : *laisser vide*
   - Répertoire de sortie : `public`
3. **Enregistrer et déployer.** Le site est en ligne à l'adresse `https://<nom-du-projet>.pages.dev`.

À partir de là, chaque `git push` sur `master` remet le site à jour automatiquement.

## 2. Activer le formulaire et l'espace admin

1. **Stockage et bases de données → D1 → Créer une base de données**, nom : `portfolio`.
2. Dans le projet Pages : **Paramètres → Liaisons → Ajouter → Base de données D1**.
   Nom de la variable : `DB` (en majuscules, exactement), base : `portfolio`.
3. **Paramètres → Variables et secrets → Ajouter**, type *Secret* :
   - `ADMIN_PASSWORD` : le mot de passe de ton espace admin (long, et unique).
4. **Déploiements → relancer le dernier déploiement.** Les liaisons ne s'appliquent qu'au déploiement suivant.
5. Ouvre `https://<nom-du-projet>.pages.dev/admin` et connecte-toi.

Les tables se créent toutes seules au premier message ou à la première visite. Il n'y a rien à lancer à la main.

## 3. Recevoir chaque message par e-mail (facultatif, recommandé)

1. Crée un compte gratuit sur [resend.com](https://resend.com) (3 000 e-mails par mois).
2. **API Keys → Create API Key**, avec l'accès *Sending access*.
3. Dans Cloudflare, **Variables et secrets**, ajoute :
   - `RESEND_API_KEY` (Secret) : la clé créée ;
   - `NOTIFY_EMAIL` : l'adresse qui reçoit les messages. Tant qu'aucun domaine n'est vérifié chez Resend, ce doit être l'adresse de ton compte Resend.
4. Relance le déploiement.

L'e-mail reprend tout le message. Le bouton « Répondre » répond directement au client quand il a laissé une adresse e-mail.

Avec ton propre domaine vérifié chez Resend, ajoute `MAIL_FROM` = `Portfolio <contact@tondomaine.com>` pour envoyer depuis ton adresse.

## 4. Nom de domaine

Dans le projet Pages : **Domaines personnalisés → Configurer un domaine**. Tu peux acheter le domaine chez Cloudflare (Registrar, au prix coûtant) ou le brancher depuis ton registraire actuel.

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
- Pour suivre une campagne, ajoute `?utm_source=nom` au lien partagé (ex. `…pages.dev/?utm_source=pub_instagram`) : il apparaît tel quel dans les sources.

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
functions/api/          API (Cloudflare Pages Functions)
  contact.js            POST /api/contact
  track.js              POST /api/track
  admin/                login, session, messages, stats (+ garde d'accès)
lib/server.js           outils partagés : base, sessions, anti-spam, e-mail
schema.sql              schéma de la base, pour référence
```

## Tester en local

```bash
npx wrangler pages dev public --d1 DB --binding ADMIN_PASSWORD=motdepasse-local
```

Le site est alors sur http://localhost:8788 et l'admin sur http://localhost:8788/admin, avec une base D1 locale.
