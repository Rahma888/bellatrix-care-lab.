# Envoyer les e-mails du portail famille (SMTP)

Sans réglage, rien ne change : aucun e-mail n'est envoyé, le code de connexion reste visible dans Care Team.
Avec le réglage, le portail envoie :
- le **code de connexion** (6 chiffres, 15 minutes) à l'adresse de la personne ;
- un **e-mail de confirmation** à chaque nouveau compte (un code à 6 chiffres, et un lien si l'adresse publique du portail est réglée). Le compte marche déjà avant la confirmation.

Les adresses de test (`…@example.test`, `…@example.com`, `.invalid`, `.localhost`) ne reçoivent jamais rien.

## Service gratuit conseillé : Brevo
- Entreprise française, serveurs en Europe (RGPD), offre gratuite d'environ **300 e-mails par jour**.
- Serveur : `smtp-relay.brevo.com`, port `587` (connexion chiffrée STARTTLS).

## Mise en route (à faire par toi)
1. Crée un compte gratuit sur brevo.com.
2. Dans Brevo : **Expéditeurs, domaines et IP dédiées** → ajoute et vérifie l'adresse d'envoi (par exemple `bellatrix@ton-domaine.de`).
3. Dans Brevo : **SMTP et API** → **SMTP** → crée une **clé SMTP**. Note l'identifiant (login) affiché.
4. Sur le PC, dans le dossier `labland`, crée le fichier `smtp.local.json` :
   ```json
   {
     "host": "smtp-relay.brevo.com",
     "port": 587,
     "user": "IDENTIFIANT_SMTP_BREVO",
     "pass": "CLE_SMTP_BREVO",
     "from": "Bellatrix <bellatrix@ton-domaine.de>",
     "site": "https://adresse-fixe-du-portail"
   }
   ```
   `site` est facultatif (adresse publique fixe du portail, pour le lien de confirmation).
   Ce fichier n'est **jamais publié** (il est dans `.gitignore`). Ne le partage pas.
5. Redémarre le serveur. Le journal affiche « e-mail sent to s***@… » à chaque envoi, sans jamais montrer la clé.
