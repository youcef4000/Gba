/* ============================================================================
   Coordonnees affichees sur le site. C'est le seul fichier a modifier pour
   personnaliser les contacts.

   Le formulaire envoie les demandes a l'API (/api/contact) : elles arrivent
   dans l'espace admin (/admin) et, si Resend est configure, par e-mail.

   whatsapp  : numero au format international, chiffres uniquement
               (ex. "213551234567" pour 0551 23 45 67). Ajoute le bouton
               "Sur WhatsApp" a cote de l'envoi et le lien en pied de page.
   email     : affiche en pied de page.
   analytics : false coupe les statistiques de visite.
   Laisser une valeur vide masque le lien correspondant.
   ========================================================================== */
window.SITE_CONFIG = {
  name: "Bornz Studio",
  whatsapp: "213558678038",
  email: "youcef.ny@gmail.com",
  instagram: "",
  // Base Supabase : formulaire, statistiques et espace admin.
  // La cle "publishable" est faite pour etre publique : la base n'accepte du
  // site que deux fonctions (enregistrer un message, compter une visite).
  supabase: {
    url: "https://jamhieikgggcrrrxafab.supabase.co",
    key: "sb_publishable_hXw61UrO2OjHjlaOHxI-VA_vb6u-pmn",
  },
  adminEmail: "youcef.ny@gmail.com",
  analytics: true,
};
