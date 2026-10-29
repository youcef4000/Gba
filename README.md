# Bornz Studio — portfolio

Site vitrine du studio, pour attirer de nouveaux clients : les sites, applications et démos en ligne, présentés avec des animations au scroll autour de l'orbe du logo (WebGL), en français, en arabe et en anglais. Il comprend aussi un formulaire de contact qui enregistre vraiment les demandes, et un espace admin privé pour gérer les projets affichés, lire les messages et suivre les statistiques de visite.

Deux services gratuits :

| Élément | Où | Rôle |
|---|---|---|
| Le site | `public/`, publié par **GitHub Pages** (`.github/workflows/static.yml`) | Pages statiques, en ligne sur bornzstudio.com |
| La base | **Supabase** (projet `bornz-studio`) | Projets affichés et leurs captures, messages du formulaire, statistiques de visite, connexion à l'admin |

Le site parle directement à Supabase (adresse et clé publique dans `public/assets/js/config.js`). La clé « publishable » est faite pour être publique : depuis le site, la base n'accepte que trois fonctions : lire les projets publiés, enregistrer un message et compter une visite. Les fonctions de l'admin ne répondent qu'au compte dont l'e-mail figure dans la table `admins`.

---

## 1. Mettre le site en ligne

Chaque `git push` sur `master` publie le dossier `public/` sur GitHub Pages en une à deux minutes.

## 2. Préparer la base Supabase (une seule fois)

1. **SQL Editor → New query** : coller tout le fichier `supabase/setup.sql`, puis **Run**. Recommencer avec `supabase/projects.sql` (projets et dossier d'images). Les deux scripts peuvent être relancés sans risque : les projets existants restent.
2. **Authentication → Users → Add user → Create new user** : e-mail `youcef.ny@gmail.com`, ton mot de passe (6 caractères minimum), case **Auto Confirm User** cochée.
3. **Authentication → Sign In / Providers** : désactiver **Allow new users to sign up**, pour que personne ne puisse se créer un compte.

**Changer le mot de passe admin** : Authentication → Users → ligne de ton compte → **⋯ → Reset password**, ou supprimer le compte et le recréer avec le nouveau mot de passe.

**Autoriser un autre compte** : SQL Editor → `insert into public.admins (email) values ('autre@exemple.com');`, puis créer ce compte dans Authentication → Users.

## L'espace admin (`/admin`)

**Projets**
- Ajouter un site, une application ou une démo : nom, type, lien, année, capture ordinateur et capture téléphone (glisser-déposer ; l'image est redimensionnée et convertie en WebP avant l'envoi), couleurs (reprises automatiquement de la capture), catégorie, description et mots-clés en français, anglais et arabe.
- Modifier, masquer (« Visible sur le site »), supprimer, et choisir l'ordre avec ↑ ↓. Les 8 premiers projets visibles sont présentés en grand, un écran chacun ; tous apparaissent dans l'index filtrable.
- Les captures sont rangées dans le dossier public `projects` de Supabase Storage ; une image remplacée ou un projet supprimé libère ses fichiers.
- Si Supabase ne répond pas, le site affiche la copie de secours `public/assets/data/projects.json`.

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

- **Logo** : `public/assets/img/` contient `logo.svg` (fond sombre), `logo-ink.svg` (fond clair), `favicon.svg`, `apple-touch-icon.png` et `og.jpg` (image affichée quand on partage le lien). Sur la page, le « o » du logo est une sphère irisée dessinée en WebGL (`assets/js/orb.js`) : elle sert de fil conducteur, du chargement jusqu'au pied de page, et prend les couleurs de chaque projet.
- **Contacts affichés** : `public/assets/js/config.js` (WhatsApp, e-mail, Instagram). Un numéro WhatsApp renseigné ajoute le bouton « Sur WhatsApp » à côté de l'envoi.
- **Textes français** : directement dans `public/index.html`.
- **Arabe et anglais** : `public/assets/js/i18n.js`, sous la même clé que l'attribut `data-i18n` du HTML.
- **Projets** : depuis l'admin, onglet Projets (rien à toucher dans le code).

## Structure

```
public/                 le site publié tel quel (GitHub Pages)
  index.html
  admin/                espace admin (index.html, admin.css, admin.js)
  assets/               styles, scripts, images, GSAP et Lenis
  assets/js/config.js   contacts affichés + adresse et clé publique Supabase
  assets/js/orb.js      l'orbe en WebGL
  assets/data/          copie de secours des projets
  robots.txt
supabase/setup.sql      messages, statistiques, admins (à coller dans le SQL Editor)
supabase/projects.sql   projets et dossier d'images (à coller ensuite)
.github/workflows/      publication GitHub Pages
```

## Tester en local

```bash
npx http-server public -p 8080
```

Le site est alors sur http://localhost:8080 et l'admin sur http://localhost:8080/admin, branchés sur la vraie base Supabase.
