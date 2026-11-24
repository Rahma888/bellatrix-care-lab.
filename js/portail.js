/* Bellatrix family portal (1.16): the installable web app of the families ("Besoins fonctionnels –
   Portail famille", BF-01 to BF-28). In French, German and English; the language changes in the app
   (BF-01). The server: labland/family-portal.mjs.
   - Account (BF-02): with an invitation (code or QR code from the care team, RGPD consent) or made by
     the care team; sign-in with the email address and a one-time code the care team gives (no email is
     sent during the pilot). One relative may be linked to several residents and only sees theirs
     (BF-03): the resident is chosen at the top. An access the team suspended or removed shows a calm
     message (BF-04).
   - Messages (BF-10 to 14): text, photo, voice (recorded here, about a minute) or a short video
     (filmed here, about 30 s, or chosen); they go straight to the robot; each shows Sent -> Received
     (on the robot) -> Read (opened by the resident), refreshed by itself.
   - Album (BF-15/16): a photo with a theme, a caption, a date and an optional question; hide, show
     again or delete.
   - Premium (BF-20 to 24, 28): Play and Books separately for each resident; the care team's request
     can be paid by ANY linked relative on a simulated form; once paid, everyone sees "Paid / Active"
     without a name, the payer sees it in "My payments" only. Prices from js/premium-config.js; the
     payment is a test (simulated form, nothing debited).
     Listen together (Play Premium, consent "all").
   - BF-27: the resident's consent (set by the team) decides: without "all", messages, calls and album.
   Other modules add tabs with Portail.addTab({ id, label: {fr, de, en}, icon, render(el, ctx),
   visible(ctx) }) and call the server with Portail.api(path, opts): js/portail-feed.js (F2: activity),
   js/portail-calls.js (N2: calls and notifications).
   The session token stays on this phone and only travels in the Authorization header; the resident in
   the X-Resident header (a random id, never a name). */
(function () {
  'use strict';
  var API = 'portal/api/';
  var TOKEN = 'bellatrix-portail-token', LANGKEY = 'bellatrix-portail-lang', RESKEY = 'bellatrix-portail-resident', INVKEY = 'bellatrix-portail-invite';
  var THEMEKEY = 'bellatrix-portail-theme';
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };

  /* ---------- the texts (English keys; French and German) ---------- */
  (function () {
    function addNew(l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); }
    /* 24 Nov (Rahma: strict input checks, account in 3 steps) */
    addNew('fr', { 'Step {n} of 3': 'Étape {n} sur 3', 'About you': 'Vous', 'Your loved one': 'Votre proche', 'Your agreement': 'Votre accord', 'Letters only, please (2 to 40).': 'Uniquement des lettres, s’il vous plaît (2 à 40).', 'Please check the email address (e.g. name@example.com).': 'Vérifiez l’adresse e-mail (ex. nom@exemple.fr).', 'Please give the resident code.': 'Indiquez le code du résident.', 'e.g. +49 151 23456789': 'ex. +33 6 12 34 56 78', 'name@example.com': 'nom@exemple.fr', 'Digits only, with one + at the start if you like.': 'Uniquement des chiffres, avec un + au début si vous voulez.', 'Send my request': 'Envoyer ma demande' });
    addNew('de', { 'Step {n} of 3': 'Schritt {n} von 3', 'About you': 'Über Sie', 'Your loved one': 'Ihr Angehöriger', 'Your agreement': 'Ihre Zustimmung', 'Letters only, please (2 to 40).': 'Bitte nur Buchstaben (2 bis 40).', 'Please check the email address (e.g. name@example.com).': 'Bitte prüfen Sie die E-Mail-Adresse (z. B. name@beispiel.de).', 'Please give the resident code.': 'Bitte geben Sie den Code der Person an.', 'e.g. +49 151 23456789': 'z. B. +49 151 23456789', 'name@example.com': 'name@beispiel.de', 'Digits only, with one + at the start if you like.': 'Nur Ziffern, auf Wunsch mit einem + am Anfang.', 'Send my request': 'Anfrage senden' });
    /* 24 Nov (Rahma: the installed app must keep working) */
    addNew('fr', { 'No connection to Bellatrix. The app tries again by itself.': 'Pas de connexion à Bellatrix. L’app réessaie toute seule.', 'Bellatrix cannot be reached right now.': 'Bellatrix n’est pas joignable pour le moment.', 'The robot may be switched off or restarting. The app tries again by itself: you stay signed in.': 'Le robot est peut-être éteint ou en train de redémarrer. L’app réessaie toute seule : vous restez connecté.', 'If it stays like this, the robot may have a new address: scan the QR code on the robot again.': 'Si cela dure, le robot a peut-être une nouvelle adresse : scannez à nouveau le QR code sur le robot.' });
    addNew('de', { 'No connection to Bellatrix. The app tries again by itself.': 'Keine Verbindung zu Bellatrix. Die App versucht es von selbst erneut.', 'Bellatrix cannot be reached right now.': 'Bellatrix ist gerade nicht erreichbar.', 'The robot may be switched off or restarting. The app tries again by itself: you stay signed in.': 'Der Roboter ist vielleicht aus oder startet neu. Die App versucht es von selbst erneut: Sie bleiben angemeldet.', 'If it stays like this, the robot may have a new address: scan the QR code on the robot again.': 'Wenn es so bleibt, hat der Roboter vielleicht eine neue Adresse: Scannen Sie den QR-Code am Roboter erneut.' });
    /* 24 Nov (Rahma): input checks, password sign-in */
    addNew('fr', { 'Please check the phone number (8 to 15 digits).': 'Vérifiez le numéro de téléphone (8 à 15 chiffres).', 'Please choose a valid date.': 'Choisissez une date valide.', 'Email or password is not right.': 'E-mail ou mot de passe incorrect.', 'The password needs at least 8 characters, with a letter and a digit.': 'Le mot de passe doit avoir au moins 8 caractères, avec une lettre et un chiffre.', 'The current password is not right.': 'Le mot de passe actuel n’est pas correct.', 'The two passwords are not the same.': 'Les deux mots de passe ne sont pas identiques.', 'Password': 'Mot de passe', 'Your password': 'Votre mot de passe', 'No password yet? Get a code': 'Pas encore de mot de passe ? Recevoir un code', 'Sign in with my password': 'Me connecter avec mon mot de passe', 'Create a password': 'Créer un mot de passe', 'Change my password': 'Changer mon mot de passe', 'With a password you sign in with your email address, without asking the care team for a code.': 'Avec un mot de passe, vous vous connectez avec votre adresse e-mail, sans demander de code à l’équipe.', 'Current password': 'Mot de passe actuel', 'New password': 'Nouveau mot de passe', 'New password again': 'Confirmer le nouveau mot de passe', 'At least 8 characters, with a letter and a digit.': 'Au moins 8 caractères, avec une lettre et un chiffre.', 'Password saved.': 'Mot de passe enregistré.', 'Save the password': 'Enregistrer le mot de passe', 'Please give the name on the card.': 'Indiquez le nom inscrit sur la carte.', 'Please check the card number.': 'Vérifiez le numéro de carte.', 'Please check the expiry date (MM/YY).': 'Vérifiez la date d’expiration (MM/AA).', 'This card has expired.': 'Cette carte est expirée.', 'Please check the security code (3 or 4 digits).': 'Vérifiez le cryptogramme (3 ou 4 chiffres).', 'Please give your first and last name.': 'Indiquez votre prénom et votre nom.', 'Please give the resident code and first name.': 'Indiquez le code et le prénom du résident.' });
    addNew('de', { 'Please check the phone number (8 to 15 digits).': 'Bitte prüfen Sie die Telefonnummer (8 bis 15 Ziffern).', 'Please choose a valid date.': 'Bitte wählen Sie ein gültiges Datum.', 'Email or password is not right.': 'E-Mail oder Passwort ist nicht richtig.', 'The password needs at least 8 characters, with a letter and a digit.': 'Das Passwort braucht mindestens 8 Zeichen, mit einem Buchstaben und einer Ziffer.', 'The current password is not right.': 'Das aktuelle Passwort ist nicht richtig.', 'The two passwords are not the same.': 'Die beiden Passwörter sind nicht gleich.', 'Password': 'Passwort', 'Your password': 'Ihr Passwort', 'No password yet? Get a code': 'Noch kein Passwort? Einen Code erhalten', 'Sign in with my password': 'Mit meinem Passwort anmelden', 'Create a password': 'Passwort erstellen', 'Change my password': 'Passwort ändern', 'With a password you sign in with your email address, without asking the care team for a code.': 'Mit einem Passwort melden Sie sich mit Ihrer E-Mail-Adresse an, ohne das Team um einen Code zu bitten.', 'Current password': 'Aktuelles Passwort', 'New password': 'Neues Passwort', 'New password again': 'Neues Passwort bestätigen', 'At least 8 characters, with a letter and a digit.': 'Mindestens 8 Zeichen, mit einem Buchstaben und einer Ziffer.', 'Password saved.': 'Passwort gespeichert.', 'Save the password': 'Passwort speichern', 'Please give the name on the card.': 'Bitte geben Sie den Namen auf der Karte an.', 'Please check the card number.': 'Bitte prüfen Sie die Kartennummer.', 'Please check the expiry date (MM/YY).': 'Bitte prüfen Sie das Ablaufdatum (MM/JJ).', 'This card has expired.': 'Diese Karte ist abgelaufen.', 'Please check the security code (3 or 4 digits).': 'Bitte prüfen Sie die Prüfnummer (3 oder 4 Ziffern).', 'Please give your first and last name.': 'Bitte geben Sie Vor- und Nachnamen an.', 'Please give the resident code and first name.': 'Bitte geben Sie Code und Vornamen der Person an.' });
    addNew('fr', {
      /* 14 Nov: ticks, recordings without a time limit, installing the app */
      'Delivered': 'Distribué', 'On Bellatrix': 'Sur Bellatrix', 'Seen by {name}': 'Vu par {name}', 'Recording…': 'Enregistrement…', 'Sending… {p} %': 'Envoi… {p} %',
      'This video is too large to send.': 'Cette vidéo est trop lourde pour être envoyée.',
      'Notifications': 'Notifications', 'Attach': 'Joindre', 'Record a voice message': 'Enregistrer un message vocal', 'Install the app': 'Installer l’application', 'The app is installed on this phone.': 'L’application est installée sur ce téléphone.',
      'Bellatrix on your home screen, like an app.': 'Bellatrix sur votre écran d’accueil, comme une application.', 'Install': 'Installer', 'Not now': 'Plus tard',
      'Install Bellatrix on this phone?': 'Installer Bellatrix sur ce téléphone ?',
      'You opened the link inside Messenger or another app. It cannot install Bellatrix.': 'Vous avez ouvert le lien dans Messenger ou une autre application. Elle ne peut pas installer Bellatrix.',
      'Tap ⋯ or ⋮, then "Open in browser" (Chrome or Safari).': 'Touchez ⋯ ou ⋮, puis « Ouvrir dans le navigateur » (Chrome ou Safari).',
      'There, tap More › Install the app.': 'Là, touchez Plus › Installer l’application.',
      'Copy the address': 'Copier l’adresse', 'Address copied.': 'Adresse copiée.',
      'Tap ⋮ at the top right of Chrome.': 'Touchez ⋮ en haut à droite de Chrome.',
      'Choose "Install app" or "Add to Home screen".': 'Choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».',
      'Open Bellatrix from your home screen.': 'Ouvrez Bellatrix depuis l’écran d’accueil.',
      'Tap Share (the square with an arrow) in Safari.': 'Dans Safari, touchez Partager (le carré avec une flèche).',
      'Choose "Add to Home Screen", then "Add".': 'Choisissez « Sur l’écran d’accueil », puis « Ajouter ».',
      'Open Bellatrix from the home screen and sign in with your email address and this code:': 'Ouvrez Bellatrix depuis l’écran d’accueil et connectez-vous avec votre adresse e-mail et ce code :',
      'Valid 15 minutes.': 'Valable 15 minutes.', 'New code': 'Nouveau code', 'Show my code': 'Afficher mon code',
      'On a computer: open this address on your phone.': 'Sur un ordinateur : ouvrez cette adresse sur votre téléphone.',
      'Bellatrix · Family': 'Bellatrix · Famille', 'Family portal': 'Portail famille', 'Language': 'Langue', 'My account': 'Mon compte', 'Back': 'Retour',
      'Messages': 'Messages', 'Album': 'Album', 'Premium': 'Premium', 'Resident': 'Résident',
      'With {name}': 'Avec {name}', 'Available': 'Disponible', 'Voice note': 'Vocal', 'Add a photo': 'Ajouter une photo', 'Close': 'Fermer', 'Today': 'Aujourd’hui', 'Write a message': 'Écrire un message', 'Dark mode': 'Mode sombre', 'Light mode': 'Mode clair',
      'Write to {name}': 'Écrire à {name}', 'Text': 'Texte', 'Photo': 'Photo', 'Voice': 'Vocal', 'Video': 'Vidéo',
      'Your message': 'Votre message', 'A few words (optional)': 'Quelques mots (facultatif)',
      'e.g. Hello! We are thinking of you. See you on Sunday.': 'ex. Bonjour ! Nous pensons à toi. À dimanche.',
      'Send': 'Envoyer', 'Sending…': 'Envoi…', 'Choose a photo': 'Choisir une photo', 'Choose another photo': 'Choisir une autre photo',
      'Record': 'Enregistrer', 'Stop': 'Arrêter', 'Record again': 'Recommencer', 'Film': 'Filmer', 'Choose a video': 'Choisir une vidéo',
      'The microphone or the camera is not allowed. Allow it in the browser settings, then try again.': 'Le micro ou la caméra n’est pas autorisé. Autorisez-le dans les réglages du navigateur, puis réessayez.',
      'This phone cannot record here. Use the text or the photo.': 'Ce téléphone ne peut pas enregistrer ici. Utilisez le texte ou la photo.',
      'This video is in the iPhone format (HEVC) that Bellatrix cannot play. Film it here with "Film".': 'Cette vidéo est au format iPhone (HEVC) que Bellatrix ne lit pas. Filmez-la ici avec « Filmer ».',
      'OK': 'OK', 'Install the portal: Share, then "Add to Home Screen".': 'Installer le portail : Partager, puis « Sur l’écran d’accueil ».',
      'Messages go straight to Bellatrix. No links.': 'Les messages arrivent directement sur Bellatrix. Pas de liens.',
      'Thank you! Your message is on its way to {name}.': 'Merci ! Votre message part vers {name}.',
      'My messages': 'Mes messages', 'Nothing sent yet.': 'Rien d’envoyé pour l’instant.',
      'Sent': 'Envoyé', 'Received': 'Reçu', 'Read': 'Lu', 'Withdrawn by the team': 'Retiré par l’équipe',
      'Sent → received on the robot → read by {name}': 'Envoyé → reçu sur le robot → lu par {name}',
      'Read on {date}': 'Lu le {date}', 'Received on {date}': 'Reçu le {date}', 'Remove': 'Retirer', 'Message removed.': 'Message retiré.',
      'Voice message': 'Message vocal', 'Video message': 'Vidéo', 'Text message': 'Message texte', 'Photo message': 'Photo',
      'Video call with {name}': 'Appel vidéo avec {name}',
      'Add to the album of {name}': 'Ajouter à l’album de {name}', 'Theme': 'Thème', 'Short caption': 'Légende courte', 'Date (optional)': 'Date (facultatif)',
      'e.g. Paul’s wedding': 'ex. Mariage de Paul', 'e.g. June 1978': 'ex. juin 1978',
      'A question to start the conversation (optional)': 'Une question pour lancer la conversation (facultatif)',
      'e.g. Do you remember the music that day?': 'ex. Vous souvenez-vous de la musique ce jour-là ?',
      'Only photos you have the right to share.': 'Uniquement des photos que vous avez le droit de partager.',
      'Add to the album': 'Ajouter à l’album', 'Thank you! The photo goes into the album of {name}.': 'Merci ! La photo rejoint l’album de {name}.',
      'My photos in the album': 'Mes photos dans l’album', 'In the album': 'Dans l’album', 'Seen': 'Vue', 'Hidden': 'Masquée',
      'Hide': 'Masquer', 'Show again': 'Afficher', 'Delete': 'Supprimer', 'Photo deleted.': 'Photo supprimée.',
      'Hidden: {name} no longer sees it.': 'Masquée : {name} ne la voit plus.', 'Shown again.': 'De nouveau visible.',
      'Family': 'Famille', 'Travels': 'Voyages', 'Childhood': 'Enfance', 'Work': 'Métier', 'Animals': 'Animaux', 'Celebrations': 'Fêtes', 'My town': 'Ma ville',
      'Bellatrix Play Premium': 'Bellatrix Play Premium', 'Books Premium': 'Livres Premium',
      'Subscriptions of {name}': 'Abonnements de {name}',
      'The care team proposes {product} for {name}': 'L’équipe propose {product} pour {name}',
      'Pay': 'Payer', 'Refuse': 'Refuser', 'See': 'Voir', 'Simulated payment: no real payment is charged.': 'Paiement simulé : aucun paiement réel n’est débité.',
      'Waiting for payment': 'En attente de paiement', 'Paid · Bellatrix switches it on': 'Payé · Bellatrix l’active', 'Active until {date}': 'Actif jusqu’au {date}',
      'Refused': 'Refusé', 'Ended': 'Terminé', 'No subscription': 'Pas d’abonnement', 'Given · the care team switches it on': 'Offert · l’équipe l’active',
      'Paid / Active': 'Payé / Actif', 'Paid by you': 'Payé par vous',
      'Give': 'Offrir', 'Cancel': 'Annuler', 'Give {product} to {name}': 'Offrir {product} à {name}', 'Duration': 'Durée', '{n} month(s)': '{n} mois',
      'One payment, no automatic renewal. You can stop at any time.': 'Un seul paiement, sans renouvellement automatique. Vous pouvez arrêter à tout moment.',
      'Payment (demonstration)': 'Paiement (démonstration)',
      'No card data is kept. Do not type your real card: use 4242 4242 4242 4242.': 'Aucune donnée de carte n’est conservée. N’entrez pas votre vraie carte : utilisez 4242 4242 4242 4242.',
      'Name on the card': 'Nom sur la carte', 'Card number': 'Numéro de carte', 'Expiry (MM/YY)': 'Expiration (MM/AA)', 'Security code': 'Cryptogramme',
      'Pay (demo)': 'Payer (démo)', 'Continue': 'Continuer', 'Demonstration': 'Démonstration',
      'Paid. Bellatrix switches it on for {name} in a moment.': 'Payé. Bellatrix l’active pour {name} dans un instant.',
      'Thank you! The care team will switch it on for {name}.': 'Merci ! L’équipe va l’activer pour {name}.',
      'All right. Nothing is switched on.': 'D’accord. Rien n’est activé.', 'Stopped. Bellatrix switches it off.': 'Arrêté. Bellatrix le désactive.',
      'Songs, lyrics and listening without limits; listening together with the family.': 'Chansons, paroles et écoute sans limite ; écoute ensemble avec la famille.',
      'Premium books and recorded voices for reading.': 'Des livres Premium et des voix enregistrées pour la lecture.',
      'My payments': 'Mes paiements', 'Paid by {name} on {date}': 'Payé par {name} le {date}', 'Gift from {name} on {date}': 'Offert par {name} le {date}',
      'Listen together': 'Écouter ensemble', 'Listen together with {name}': 'Écouter ensemble avec {name}', 'Open': 'Ouvrir',
      'Now for {name}': 'En ce moment pour {name}', 'No song right now.': 'Pas de chanson pour l’instant.', 'With you: {names}': 'Avec vous : {names}',
      'Next songs': 'Prochaines chansons', 'No song waiting.': 'Aucune chanson en attente.', 'added by {name}': 'ajoutée par {name}',
      'Add a song': 'Ajouter une chanson', 'Title or singer': 'Titre ou chanteur', 'Search': 'Chercher', 'Add': 'Ajouter', 'No song found.': 'Aucune chanson trouvée.',
      'Added. Bellatrix plays it after the current song.': 'Ajoutée. Bellatrix la jouera après la chanson en cours.',
      'Bellatrix is not playing music for {name} right now.': 'Bellatrix ne joue pas de musique pour {name} en ce moment.', 'Refresh': 'Actualiser',
      'Listening together has ended.': 'L’écoute ensemble est terminée.',
      'Stay close, even from far away': 'Rester proche, même de loin',
      'Send a photo, a voice message or a few words. Bellatrix shows them to your loved one.': 'Envoyez une photo, un message vocal ou quelques mots. Bellatrix les montre à votre proche.',
      'I have an invitation code': 'J’ai un code d’invitation', 'Invitation code': 'Code d’invitation', 'I already have an account': 'J’ai déjà un compte',
      'Sign in': 'Me connecter', 'Sign out': 'Me déconnecter', 'A Bellatrix pilot in care homes. No advertising.': 'Un pilote Bellatrix en maison de soins. Sans publicité.',
      'Welcome to the family of {name}': 'Bienvenue dans la famille de {name}', 'Create your account in one minute.': 'Créez votre compte en une minute.',
      'Create an account': 'Créer un compte', 'Your last name': 'Votre nom', 'Who are you to the resident?': 'Qui êtes-vous pour le résident ?', 'e.g. daughter': 'ex. fille',
      'Your phone number': 'Votre téléphone', 'Resident code': 'Code du résident', 'First name of the resident': 'Prénom du résident', 'Both are given by the care team.': 'L’équipe soignante vous les a donnés.',
      'Send my request': 'Envoyer ma demande', 'Waiting for the care team': 'En attente de l’équipe', 'The care team will answer soon. You will see it here and in the bell.': 'L’équipe va répondre. Vous le verrez ici et dans la cloche.',
      'Access to {name} approved': 'Accès à {name} validé', 'Declined': 'Refusé',
      'We cannot find this resident. Check the code and the first name with the care team.': 'Nous ne trouvons pas ce résident. Vérifiez le code et le prénom avec l’équipe.',
      'You already have an account. Sign in.': 'Vous avez déjà un compte. Connectez-vous.',
      'Your first name': 'Votre prénom', 'e.g. Sophie': 'ex. Sophie', 'Who are you for {name}? (optional)': 'Qui êtes-vous pour {name} ? (facultatif)',
      'e.g. granddaughter': 'ex. petite-fille', 'Your email address': 'Votre adresse e-mail', 'Create my account': 'Créer mon compte',
      'What happens with my data?': 'Que deviennent mes données ?',
      'Kept: your first name, your email address, your language and what you send.': 'Conservés : votre prénom, votre adresse e-mail, votre langue et ce que vous envoyez.',
      'Messages go straight to the robot; the care team is told and can withdraw one.': 'Les messages arrivent directement sur le robot ; l’équipe soignante est prévenue et peut en retirer un.',
      'Messages and photos are deleted 30 days after they were read, or earlier if you ask.': 'Les messages et photos sont supprimés 30 jours après avoir été lus, ou plus tôt si vous le demandez.',
      'What you see about {name} depends on the consent recorded by the care team.': 'Ce que vous voyez de {name} dépend du consentement enregistré par l’équipe soignante.',
      'No advertising, no sale of data.': 'Pas de publicité, pas de revente de données.',
      'You can withdraw your consent at any time in "My account": your account and messages are then deleted.': 'Vous pouvez retirer votre consentement à tout moment dans « Mon compte » : votre compte et vos messages sont alors supprimés.',
      'I agree that what I send is kept and shown to {name} as described above.': 'J’accepte que ce que j’envoie soit conservé et montré à {name} comme décrit ci-dessus.',
      'The care team gives you a 6-digit code (by phone or on paper). No email is sent during the pilot.': 'L’équipe soignante vous donne un code à 6 chiffres (par téléphone ou sur papier). Aucun e-mail n’est envoyé pendant le pilote.',
      'Your code': 'Votre code', 'Use another email address': 'Utiliser une autre adresse e-mail', 'Get a code': 'Recevoir un code',
      'Hello {name}': 'Bonjour {name}', 'Before you start, please read this short notice.': 'Avant de commencer, merci de lire cette courte information.', 'I agree': 'J’accepte',
      'You already have an account. Sign in: {name} will be added to it.': 'Vous avez déjà un compte. Connectez-vous : {name} y sera ajouté(e).',
      '{name} is now in your account.': '{name} est maintenant dans votre compte.',
      'Your access to {name} is suspended by the care team.': 'Votre accès à {name} est suspendu par l’équipe soignante.',
      'Your access to {name} was removed by the care team.': 'Votre accès à {name} a été retiré par l’équipe soignante.',
      'You can talk about it with the care team. Nothing you sent is deleted.': 'Vous pouvez en parler avec l’équipe soignante. Rien de ce que vous avez envoyé n’est supprimé.',
      'No resident is linked to your account for now.': 'Aucun résident n’est lié à votre compte pour le moment.',
      'Add a resident': 'Ajouter un résident', 'With the invitation code the care team gives you.': 'Avec le code d’invitation que l’équipe soignante vous donne.',
      'My residents': 'Mes résidents', 'Active': 'Actif', 'Suspended': 'Suspendu', 'First name': 'Prénom', 'Email address': 'Adresse e-mail', 'Consent given on': 'Consentement donné le',
      'What you see': 'Ce que vous voyez', 'Everything: messages, album, calls and activity': 'Tout : messages, album, appels et activité',
      'Messages, calls and album': 'Messages, appels et album', 'The care team records the consent of {name} or of their representative.': 'L’équipe soignante enregistre le consentement de {name} ou de son représentant légal.',
      'Install the app on this phone': 'Installer l’application sur ce téléphone', 'To install: Share, then "Add to Home Screen".': 'Pour l’installer : Partager, puis « Sur l’écran d’accueil ».',
      'My data': 'Mes données', 'Delete all my messages and photos': 'Supprimer tous mes messages et photos',
      'Delete all the messages and photos you sent? This cannot be undone.': 'Supprimer tous les messages et photos que vous avez envoyés ? C’est définitif.',
      'Yes, delete them': 'Oui, les supprimer', 'No, keep them': 'Non, les garder',
      'Withdraw my consent and delete my account': 'Retirer mon consentement et supprimer mon compte',
      'Withdraw your consent? Your account and all your messages will be deleted. This cannot be undone.': 'Retirer votre consentement ? Votre compte et tous vos messages seront supprimés. C’est définitif.',
      'Yes, delete my account': 'Oui, supprimer mon compte', 'No, keep it': 'Non, le garder',
      'Your account and your messages have been deleted.': 'Votre compte et vos messages ont été supprimés.',
      'Your messages and photos have been deleted.': 'Vos messages et vos photos ont été supprimés.',
      'One moment…': 'Un instant…', 'your loved one': 'votre proche',
      'Bellatrix cannot be reached at this address.': 'Bellatrix n’est pas joignable à cette adresse.', 'The robot’s address may have changed. Please scan the QR code on the robot again.': 'L’adresse du robot a peut-être changé. Scannez à nouveau le QR code sur le robot.', 'Try again': 'Réessayer',
      'This invitation code is not known. Check it, or ask the care team for a new one.': 'Ce code d’invitation est inconnu. Vérifiez-le ou demandez-en un nouveau à l’équipe soignante.',
      'This invitation has already been used. Sign in with your email address.': 'Cette invitation a déjà été utilisée. Connectez-vous avec votre adresse e-mail.',
      'This invitation has expired. The care team can give you a new one.': 'Cette invitation a expiré. L’équipe soignante peut vous en donner une nouvelle.',
      'Please read and accept the data notice first.': 'Merci de lire et d’accepter d’abord l’information sur les données.',
      'Please check the email address.': 'Merci de vérifier l’adresse e-mail.', 'Please give your first name.': 'Merci d’indiquer votre prénom.',
      'This code does not work. Ask the care team for a new code.': 'Ce code ne fonctionne pas. Demandez un nouveau code à l’équipe soignante.',
      'The text is a little long.': 'Le texte est un peu long.', 'Links cannot be sent.': 'Les liens ne peuvent pas être envoyés.',
      'This photo could not be read. Please try another one.': 'Cette photo n’a pas pu être lue. Essayez-en une autre.',
      'This photo is too large. Please try another one.': 'Cette photo est trop lourde. Essayez-en une autre.',
      'This recording could not be sent. Please try again.': 'Cet enregistrement n’a pas pu être envoyé. Réessayez.',
      'Write a few words, or choose a photo, a voice message or a video.': 'Écrivez quelques mots, ou choisissez une photo, un message vocal ou une vidéo.',
      'That is plenty for today. You can send more tomorrow.': 'C’est déjà beaucoup pour aujourd’hui. Vous pourrez en envoyer d’autres demain.',
      'A gift is already on its way or active.': 'Un cadeau est déjà en cours ou actif.', 'Please choose a theme.': 'Merci de choisir un thème.',
      'Please check the card details (demo).': 'Merci de vérifier les données de la carte (démo).', 'This offer is no longer open.': 'Cette offre n’est plus ouverte.',
      'The queue is full for now.': 'La file est pleine pour l’instant.', 'This song is not in the Bellatrix catalogue.': 'Cette chanson n’est pas dans le catalogue Bellatrix.',
      'Please wait a few minutes before trying again.': 'Merci de patienter quelques minutes avant de réessayer.', 'Please sign in again.': 'Merci de vous reconnecter.',
      'This is not shared for {name}.': 'Ce n’est pas partagé pour {name}.',
      'No connection to Bellatrix right now. Please try again in a moment.': 'Pas de connexion avec Bellatrix pour le moment. Réessayez dans un instant.'
    });
    addNew('de', {
      'Delivered': 'Zugestellt', 'On Bellatrix': 'Auf Bellatrix', 'Seen by {name}': 'Gesehen von {name}', 'Recording…': 'Aufnahme…', 'Sending… {p} %': 'Senden… {p} %',
      'This video is too large to send.': 'Dieses Video ist zu groß zum Senden.',
      'Notifications': 'Benachrichtigungen', 'Attach': 'Anhängen', 'Record a voice message': 'Sprachnachricht aufnehmen', 'Install the app': 'App installieren', 'The app is installed on this phone.': 'Die App ist auf diesem Telefon installiert.',
      'Bellatrix on your home screen, like an app.': 'Bellatrix auf Ihrem Startbildschirm, wie eine App.', 'Install': 'Installieren', 'Not now': 'Später',
      'Install Bellatrix on this phone?': 'Bellatrix auf diesem Telefon installieren?',
      'You opened the link inside Messenger or another app. It cannot install Bellatrix.': 'Sie haben den Link in Messenger oder einer anderen App geöffnet. Dort lässt sich Bellatrix nicht installieren.',
      'Tap ⋯ or ⋮, then "Open in browser" (Chrome or Safari).': 'Tippen Sie auf ⋯ oder ⋮, dann auf „Im Browser öffnen“ (Chrome oder Safari).',
      'There, tap More › Install the app.': 'Dort: Mehr › App installieren.',
      'Copy the address': 'Adresse kopieren', 'Address copied.': 'Adresse kopiert.',
      'Tap ⋮ at the top right of Chrome.': 'Tippen Sie in Chrome oben rechts auf ⋮.',
      'Choose "Install app" or "Add to Home screen".': 'Wählen Sie „App installieren“ oder „Zum Startbildschirm hinzufügen“.',
      'Open Bellatrix from your home screen.': 'Öffnen Sie Bellatrix über den Startbildschirm.',
      'Tap Share (the square with an arrow) in Safari.': 'Tippen Sie in Safari auf Teilen (das Quadrat mit dem Pfeil).',
      'Choose "Add to Home Screen", then "Add".': 'Wählen Sie „Zum Home-Bildschirm“, dann „Hinzufügen“.',
      'Open Bellatrix from the home screen and sign in with your email address and this code:': 'Öffnen Sie Bellatrix über den Home-Bildschirm und melden Sie sich mit Ihrer E-Mail-Adresse und diesem Code an:',
      'Valid 15 minutes.': '15 Minuten gültig.', 'New code': 'Neuer Code', 'Show my code': 'Meinen Code zeigen',
      'On a computer: open this address on your phone.': 'Am Computer: Öffnen Sie diese Adresse auf Ihrem Telefon.',
      'Bellatrix · Family': 'Bellatrix · Familie', 'Family portal': 'Familienportal', 'Language': 'Sprache', 'My account': 'Mein Konto', 'Back': 'Zurück',
      'Messages': 'Nachrichten', 'Album': 'Album', 'Premium': 'Premium', 'Resident': 'Bewohner/in',
      'With {name}': 'Mit {name}', 'Available': 'Verfügbar', 'Voice note': 'Sprache', 'Add a photo': 'Foto hinzufügen', 'Close': 'Schließen', 'Today': 'Heute', 'Write a message': 'Nachricht schreiben', 'Dark mode': 'Dunkler Modus', 'Light mode': 'Heller Modus',
      'Write to {name}': 'An {name} schreiben', 'Text': 'Text', 'Photo': 'Foto', 'Voice': 'Sprachnachricht', 'Video': 'Video',
      'Your message': 'Ihre Nachricht', 'A few words (optional)': 'Ein paar Worte (freiwillig)',
      'e.g. Hello! We are thinking of you. See you on Sunday.': 'z. B. Hallo! Wir denken an dich. Bis Sonntag.',
      'Send': 'Senden', 'Sending…': 'Wird gesendet…', 'Choose a photo': 'Ein Foto wählen', 'Choose another photo': 'Ein anderes Foto wählen',
      'Record': 'Aufnehmen', 'Stop': 'Beenden', 'Record again': 'Neu aufnehmen', 'Film': 'Filmen', 'Choose a video': 'Ein Video wählen',
      'The microphone or the camera is not allowed. Allow it in the browser settings, then try again.': 'Mikrofon oder Kamera sind nicht erlaubt. Erlauben Sie sie in den Browser-Einstellungen und versuchen Sie es erneut.',
      'This phone cannot record here. Use the text or the photo.': 'Dieses Telefon kann hier nicht aufnehmen. Nutzen Sie Text oder Foto.',
      'This video is in the iPhone format (HEVC) that Bellatrix cannot play. Film it here with "Film".': 'Dieses Video hat das iPhone-Format (HEVC), das Bellatrix nicht abspielen kann. Filmen Sie es hier mit „Filmen“.',
      'OK': 'OK', 'Install the portal: Share, then "Add to Home Screen".': 'Portal installieren: Teilen, dann „Zum Home-Bildschirm“.',
      'Messages go straight to Bellatrix. No links.': 'Nachrichten gehen direkt an Bellatrix. Keine Links.',
      'Thank you! Your message is on its way to {name}.': 'Danke! Ihre Nachricht ist unterwegs zu {name}.',
      'My messages': 'Meine Nachrichten', 'Nothing sent yet.': 'Noch nichts gesendet.',
      'Sent': 'Gesendet', 'Received': 'Empfangen', 'Read': 'Gelesen', 'Withdrawn by the team': 'Vom Team zurückgezogen',
      'Sent → received on the robot → read by {name}': 'Gesendet → auf dem Roboter empfangen → von {name} gelesen',
      'Read on {date}': 'Gelesen am {date}', 'Received on {date}': 'Empfangen am {date}', 'Remove': 'Entfernen', 'Message removed.': 'Nachricht entfernt.',
      'Voice message': 'Sprachnachricht', 'Video message': 'Video', 'Text message': 'Textnachricht', 'Photo message': 'Foto',
      'Video call with {name}': 'Videoanruf mit {name}',
      'Add to the album of {name}': 'Zum Album von {name} hinzufügen', 'Theme': 'Thema', 'Short caption': 'Kurze Bildunterschrift', 'Date (optional)': 'Datum (freiwillig)',
      'e.g. Paul’s wedding': 'z. B. Pauls Hochzeit', 'e.g. June 1978': 'z. B. Juni 1978',
      'A question to start the conversation (optional)': 'Eine Frage für den Gesprächseinstieg (freiwillig)',
      'e.g. Do you remember the music that day?': 'z. B. Erinnern Sie sich an die Musik an diesem Tag?',
      'Only photos you have the right to share.': 'Nur Fotos, die Sie teilen dürfen.',
      'Add to the album': 'Zum Album hinzufügen', 'Thank you! The photo goes into the album of {name}.': 'Danke! Das Foto kommt ins Album von {name}.',
      'My photos in the album': 'Meine Fotos im Album', 'In the album': 'Im Album', 'Seen': 'Angesehen', 'Hidden': 'Ausgeblendet',
      'Hide': 'Ausblenden', 'Show again': 'Wieder zeigen', 'Delete': 'Löschen', 'Photo deleted.': 'Foto gelöscht.',
      'Hidden: {name} no longer sees it.': 'Ausgeblendet: {name} sieht es nicht mehr.', 'Shown again.': 'Wieder sichtbar.',
      'Family': 'Familie', 'Travels': 'Reisen', 'Childhood': 'Kindheit', 'Work': 'Beruf', 'Animals': 'Tiere', 'Celebrations': 'Feste', 'My town': 'Meine Stadt',
      'Bellatrix Play Premium': 'Bellatrix Play Premium', 'Books Premium': 'Bücher Premium',
      'Subscriptions of {name}': 'Abos von {name}',
      'The care team proposes {product} for {name}': 'Das Pflegeteam schlägt {product} für {name} vor',
      'Pay': 'Bezahlen', 'Refuse': 'Ablehnen', 'See': 'Ansehen', 'Simulated payment: no real payment is charged.': 'Simulierte Zahlung: Es wird keine echte Zahlung abgebucht.',
      'Waiting for payment': 'Wartet auf Zahlung', 'Paid · Bellatrix switches it on': 'Bezahlt · Bellatrix schaltet es ein', 'Active until {date}': 'Aktiv bis {date}',
      'Refused': 'Abgelehnt', 'Ended': 'Beendet', 'No subscription': 'Kein Abo', 'Given · the care team switches it on': 'Geschenkt · das Pflegeteam schaltet es ein',
      'Paid / Active': 'Bezahlt / Aktiv', 'Paid by you': 'Von Ihnen bezahlt',
      'Give': 'Schenken', 'Cancel': 'Abbrechen', 'Give {product} to {name}': '{product} an {name} schenken', 'Duration': 'Dauer', '{n} month(s)': '{n} Monat(e)',
      'One payment, no automatic renewal. You can stop at any time.': 'Eine Zahlung, keine automatische Verlängerung. Sie können jederzeit beenden.',
      'Payment (demonstration)': 'Zahlung (Demonstration)',
      'No card data is kept. Do not type your real card: use 4242 4242 4242 4242.': 'Es werden keine Kartendaten gespeichert. Geben Sie nicht Ihre echte Karte ein: Nutzen Sie 4242 4242 4242 4242.',
      'Name on the card': 'Name auf der Karte', 'Card number': 'Kartennummer', 'Expiry (MM/YY)': 'Ablauf (MM/JJ)', 'Security code': 'Prüfnummer',
      'Pay (demo)': 'Bezahlen (Demo)', 'Continue': 'Weiter', 'Demonstration': 'Demonstration',
      'Paid. Bellatrix switches it on for {name} in a moment.': 'Bezahlt. Bellatrix schaltet es gleich für {name} ein.',
      'Thank you! The care team will switch it on for {name}.': 'Danke! Das Pflegeteam schaltet es für {name} ein.',
      'All right. Nothing is switched on.': 'In Ordnung. Es wird nichts eingeschaltet.', 'Stopped. Bellatrix switches it off.': 'Beendet. Bellatrix schaltet es aus.',
      'Songs, lyrics and listening without limits; listening together with the family.': 'Lieder, Texte und Hören ohne Limit; gemeinsam hören mit der Familie.',
      'Premium books and recorded voices for reading.': 'Premium-Bücher und aufgenommene Stimmen zum Vorlesen.',
      'My payments': 'Meine Zahlungen', 'Paid by {name} on {date}': 'Bezahlt von {name} am {date}', 'Gift from {name} on {date}': 'Geschenkt von {name} am {date}',
      'Listen together': 'Gemeinsam hören', 'Listen together with {name}': 'Gemeinsam hören mit {name}', 'Open': 'Öffnen',
      'Now for {name}': 'Gerade für {name}', 'No song right now.': 'Gerade kein Lied.', 'With you: {names}': 'Mit Ihnen: {names}',
      'Next songs': 'Nächste Lieder', 'No song waiting.': 'Kein Lied in der Warteschlange.', 'added by {name}': 'hinzugefügt von {name}',
      'Add a song': 'Ein Lied hinzufügen', 'Title or singer': 'Titel oder Sänger', 'Search': 'Suchen', 'Add': 'Hinzufügen', 'No song found.': 'Kein Lied gefunden.',
      'Added. Bellatrix plays it after the current song.': 'Hinzugefügt. Bellatrix spielt es nach dem aktuellen Lied.',
      'Bellatrix is not playing music for {name} right now.': 'Bellatrix spielt gerade keine Musik für {name}.', 'Refresh': 'Aktualisieren',
      'Listening together has ended.': 'Das gemeinsame Hören ist beendet.',
      'Stay close, even from far away': 'Nah sein, auch aus der Ferne',
      'Send a photo, a voice message or a few words. Bellatrix shows them to your loved one.': 'Senden Sie ein Foto, eine Sprachnachricht oder ein paar Worte. Bellatrix zeigt sie Ihrem Angehörigen.',
      'I have an invitation code': 'Ich habe einen Einladungscode', 'Invitation code': 'Einladungscode', 'I already have an account': 'Ich habe schon ein Konto',
      'Sign in': 'Anmelden', 'Sign out': 'Abmelden', 'A Bellatrix pilot in care homes. No advertising.': 'Ein Bellatrix-Pilotprojekt in Pflegeheimen. Ohne Werbung.',
      'Welcome to the family of {name}': 'Willkommen in der Familie von {name}', 'Create your account in one minute.': 'Legen Sie Ihr Konto in einer Minute an.',
      'Create an account': 'Konto erstellen', 'Your last name': 'Ihr Nachname', 'Who are you to the resident?': 'Wer sind Sie für die Person?', 'e.g. daughter': 'z. B. Tochter',
      'Your phone number': 'Ihre Telefonnummer', 'Resident code': 'Code der Person', 'First name of the resident': 'Vorname der Person', 'Both are given by the care team.': 'Beides erhalten Sie vom Pflegeteam.',
      'Send my request': 'Anfrage senden', 'Waiting for the care team': 'Wartet auf das Pflegeteam', 'The care team will answer soon. You will see it here and in the bell.': 'Das Team antwortet bald. Sie sehen es hier und in der Glocke.',
      'Access to {name} approved': 'Zugang zu {name} bestätigt', 'Declined': 'Abgelehnt',
      'We cannot find this resident. Check the code and the first name with the care team.': 'Wir finden diese Person nicht. Bitte prüfen Sie Code und Vorname mit dem Pflegeteam.',
      'You already have an account. Sign in.': 'Sie haben schon ein Konto. Bitte melden Sie sich an.',
      'Your first name': 'Ihr Vorname', 'e.g. Sophie': 'z. B. Sophie', 'Who are you for {name}? (optional)': 'Wer sind Sie für {name}? (freiwillig)',
      'e.g. granddaughter': 'z. B. Enkelin', 'Your email address': 'Ihre E-Mail-Adresse', 'Create my account': 'Mein Konto anlegen',
      'What happens with my data?': 'Was passiert mit meinen Daten?',
      'Kept: your first name, your email address, your language and what you send.': 'Gespeichert werden: Ihr Vorname, Ihre E-Mail-Adresse, Ihre Sprache und was Sie senden.',
      'Messages go straight to the robot; the care team is told and can withdraw one.': 'Nachrichten gehen direkt an den Roboter; das Pflegeteam wird informiert und kann eine zurückziehen.',
      'Messages and photos are deleted 30 days after they were read, or earlier if you ask.': 'Nachrichten und Fotos werden 30 Tage nach dem Lesen gelöscht, oder früher, wenn Sie es wünschen.',
      'What you see about {name} depends on the consent recorded by the care team.': 'Was Sie von {name} sehen, hängt von der Einwilligung ab, die das Pflegeteam erfasst hat.',
      'No advertising, no sale of data.': 'Keine Werbung, kein Verkauf von Daten.',
      'You can withdraw your consent at any time in "My account": your account and messages are then deleted.': 'Sie können Ihre Einwilligung jederzeit unter „Mein Konto“ widerrufen: Ihr Konto und Ihre Nachrichten werden dann gelöscht.',
      'I agree that what I send is kept and shown to {name} as described above.': 'Ich bin einverstanden, dass das, was ich sende, wie oben beschrieben gespeichert und {name} gezeigt wird.',
      'The care team gives you a 6-digit code (by phone or on paper). No email is sent during the pilot.': 'Das Pflegeteam gibt Ihnen einen 6-stelligen Code (am Telefon oder auf Papier). Während des Pilotprojekts wird keine E-Mail verschickt.',
      'Your code': 'Ihr Code', 'Use another email address': 'Andere E-Mail-Adresse verwenden', 'Get a code': 'Code anfordern',
      'Hello {name}': 'Hallo {name}', 'Before you start, please read this short notice.': 'Bitte lesen Sie vor dem Start diesen kurzen Hinweis.', 'I agree': 'Einverstanden',
      'You already have an account. Sign in: {name} will be added to it.': 'Sie haben schon ein Konto. Melden Sie sich an: {name} wird hinzugefügt.',
      '{name} is now in your account.': '{name} ist jetzt in Ihrem Konto.',
      'Your access to {name} is suspended by the care team.': 'Ihr Zugang zu {name} wurde vom Pflegeteam ausgesetzt.',
      'Your access to {name} was removed by the care team.': 'Ihr Zugang zu {name} wurde vom Pflegeteam entfernt.',
      'You can talk about it with the care team. Nothing you sent is deleted.': 'Sprechen Sie gern mit dem Pflegeteam darüber. Nichts, was Sie gesendet haben, wird gelöscht.',
      'No resident is linked to your account for now.': 'Mit Ihrem Konto ist gerade keine Bewohnerin und kein Bewohner verknüpft.',
      'Add a resident': 'Eine Person hinzufügen', 'With the invitation code the care team gives you.': 'Mit dem Einladungscode, den Ihnen das Pflegeteam gibt.',
      'My residents': 'Meine Angehörigen', 'Active': 'Aktiv', 'Suspended': 'Ausgesetzt', 'First name': 'Vorname', 'Email address': 'E-Mail-Adresse', 'Consent given on': 'Einwilligung erteilt am',
      'What you see': 'Was Sie sehen', 'Everything: messages, album, calls and activity': 'Alles: Nachrichten, Album, Anrufe und Aktivität',
      'Messages, calls and album': 'Nachrichten, Anrufe und Album', 'The care team records the consent of {name} or of their representative.': 'Das Pflegeteam erfasst die Einwilligung von {name} oder der gesetzlichen Vertretung.',
      'Install the app on this phone': 'App auf diesem Telefon installieren', 'To install: Share, then "Add to Home Screen".': 'Zum Installieren: Teilen, dann „Zum Home-Bildschirm“.',
      'My data': 'Meine Daten', 'Delete all my messages and photos': 'Alle meine Nachrichten und Fotos löschen',
      'Delete all the messages and photos you sent? This cannot be undone.': 'Alle gesendeten Nachrichten und Fotos löschen? Das lässt sich nicht rückgängig machen.',
      'Yes, delete them': 'Ja, löschen', 'No, keep them': 'Nein, behalten',
      'Withdraw my consent and delete my account': 'Einwilligung widerrufen und Konto löschen',
      'Withdraw your consent? Your account and all your messages will be deleted. This cannot be undone.': 'Einwilligung widerrufen? Ihr Konto und alle Ihre Nachrichten werden gelöscht. Das lässt sich nicht rückgängig machen.',
      'Yes, delete my account': 'Ja, mein Konto löschen', 'No, keep it': 'Nein, behalten',
      'Your account and your messages have been deleted.': 'Ihr Konto und Ihre Nachrichten wurden gelöscht.',
      'Your messages and photos have been deleted.': 'Ihre Nachrichten und Fotos wurden gelöscht.',
      'One moment…': 'Einen Moment…', 'your loved one': 'Ihr Angehöriger',
      'Bellatrix cannot be reached at this address.': 'Bellatrix ist unter dieser Adresse nicht erreichbar.', 'The robot’s address may have changed. Please scan the QR code on the robot again.': 'Die Adresse des Roboters hat sich vielleicht geändert. Bitte scannen Sie den QR-Code am Roboter erneut.', 'Try again': 'Erneut versuchen',
      'This invitation code is not known. Check it, or ask the care team for a new one.': 'Dieser Einladungscode ist unbekannt. Prüfen Sie ihn oder bitten Sie das Pflegeteam um einen neuen.',
      'This invitation has already been used. Sign in with your email address.': 'Diese Einladung wurde schon benutzt. Melden Sie sich mit Ihrer E-Mail-Adresse an.',
      'This invitation has expired. The care team can give you a new one.': 'Diese Einladung ist abgelaufen. Das Pflegeteam kann Ihnen eine neue geben.',
      'Please read and accept the data notice first.': 'Bitte lesen und akzeptieren Sie zuerst den Datenschutzhinweis.',
      'Please check the email address.': 'Bitte prüfen Sie die E-Mail-Adresse.', 'Please give your first name.': 'Bitte geben Sie Ihren Vornamen an.',
      'This code does not work. Ask the care team for a new code.': 'Dieser Code funktioniert nicht. Bitten Sie das Pflegeteam um einen neuen Code.',
      'The text is a little long.': 'Der Text ist etwas lang.', 'Links cannot be sent.': 'Links können nicht gesendet werden.',
      'This photo could not be read. Please try another one.': 'Dieses Foto konnte nicht gelesen werden. Bitte versuchen Sie ein anderes.',
      'This photo is too large. Please try another one.': 'Dieses Foto ist zu groß. Bitte versuchen Sie ein anderes.',
      'This recording could not be sent. Please try again.': 'Diese Aufnahme konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
      'Write a few words, or choose a photo, a voice message or a video.': 'Schreiben Sie ein paar Worte oder wählen Sie ein Foto, eine Sprachnachricht oder ein Video.',
      'That is plenty for today. You can send more tomorrow.': 'Das ist schon viel für heute. Morgen können Sie mehr senden.',
      'A gift is already on its way or active.': 'Ein Geschenk ist schon unterwegs oder aktiv.', 'Please choose a theme.': 'Bitte wählen Sie ein Thema.',
      'Please check the card details (demo).': 'Bitte prüfen Sie die Kartendaten (Demo).', 'This offer is no longer open.': 'Dieses Angebot ist nicht mehr offen.',
      'The queue is full for now.': 'Die Warteschlange ist gerade voll.', 'This song is not in the Bellatrix catalogue.': 'Dieses Lied ist nicht im Bellatrix-Katalog.',
      'Please wait a few minutes before trying again.': 'Bitte warten Sie ein paar Minuten, bevor Sie es erneut versuchen.', 'Please sign in again.': 'Bitte melden Sie sich erneut an.',
      'This is not shared for {name}.': 'Das wird für {name} nicht geteilt.',
      'No connection to Bellatrix right now. Please try again in a moment.': 'Gerade keine Verbindung zu Bellatrix. Bitte versuchen Sie es gleich noch einmal.'
    });
  })();

  var $ = function (id) { return document.getElementById(id); };
  var app = $('app');
  var S = { lang: guessLang(), token: get(TOKEN), rid: get(RESKEY), me: null, tab: 'messages', sheet: '', screen: '', mode: 'text', photo: null, media: null, rec: null, busy: false,
    invite: null, email: '', pay: null, gift: null, listen: null, inListen: false, found: null, query: '', thumbs: {}, installEvt: null, sent: false,
    aPhoto: null, aTheme: 'family', aSent: false, confirmDelete: false, confirmData: false, draft: '' };
  var THEMES = [['family', 'Family'], ['travel', 'Travels'], ['childhood', 'Childhood'], ['work', 'Work'], ['animals', 'Animals'], ['celebrations', 'Celebrations'], ['town', 'My town']];
  var PRODUCTS = [['play', 'Bellatrix Play Premium', 'Songs, lyrics and listening without limits; listening together with the family.'], ['books', 'Books Premium', 'Premium books and recorded voices for reading.']];
  var INSTALL_SEEN = 'bellatrix-portail-install-seen';

  /* ---------- small helpers ---------- */
  function get(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (e) { /* this visit only */ } }
  function guessLang() { var l = get(LANGKEY) || String(navigator.language || 'fr').slice(0, 2); return I18N.valid(l); }
  function T(s, v) { return I18N.t(S.lang, s, v); }
  /* the look: light or dark (the phone's choice until the family taps the button) */
  function curTheme() { var t = get(THEMEKEY); if (t === 'dark' || t === 'light') return t; try { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; } }
  function applyTheme() { var t = curTheme(); document.documentElement.setAttribute('data-theme', t); var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', t === 'dark' ? '#0B1F33' : '#00519E'); }
  applyTheme();
  /* play() returns a promise that rejects when the page redraws meanwhile (or Safari wants a tap): never an error. */
  function quietPlay(el) { var pr = el.play(); if (pr && pr.catch) pr.catch(function () { /* a tap plays it */ }); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function who() { return (S.me && S.me.resident && S.me.resident.label) || (S.invite && S.invite.label) || selectedLabel() || T('your loved one'); }
  function selectedLabel() { var r = S.me && (S.me.residents || []).filter(function (x) { return x.rid === S.rid; })[0]; return r ? r.label : ''; }
  function themeName(id) { for (var i = 0; i < THEMES.length; i++) if (THEMES[i][0] === id) return T(THEMES[i][1]); return id || ''; }
  function productName(id) { for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i][0] === id) return T(PRODUCTS[i][1]); return id; }
  function dateText(iso, withTime) {
    if (!iso) return '';
    var d = new Date(iso), o = { day: 'numeric', month: 'long', year: 'numeric' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; }
    try { return d.toLocaleString(LOCALE[S.lang], o); } catch (e) { return d.toISOString().slice(0, 10); }
  }
  function money(cents, cur) { try { return new Intl.NumberFormat(LOCALE[S.lang], { style: 'currency', currency: cur || 'EUR' }).format((cents || 0) / 100); } catch (e) { return ((cents || 0) / 100).toFixed(2) + ' €'; } }
  /* BF-24: the configured price (js/premium-config.js); while payments are a test, one short line. */
  function price(cents, cur) { return esc(money(cents, cur)); }
  function testLine() { return ''; }   /* 24 Nov (Rahma): no "simulated payment" lines on the screens any more */
  function toast(t) {
    var el = $('toast');
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3400);
  }
  var ERRORS = {
    'unknown-invite': 'This invitation code is not known. Check it, or ask the care team for a new one.',
    'used-invite': 'This invitation has already been used. Sign in with your email address.',
    'expired-invite': 'This invitation has expired. The care team can give you a new one.',
    'consent-needed': 'Please read and accept the data notice first.',
    'unknown-resident': 'We cannot find this resident. Check the code and the first name with the care team.', 'account-exists': 'You already have an account. Sign in.',
    'bad-email': 'Please check the email address.', 'bad-name': 'Please give your first name.',
    'bad-code': 'This code does not work. Ask the care team for a new code.',
    'too-long': 'The text is a little long.', 'no-links': 'Links cannot be sent.',
    'bad-photo': 'This photo could not be read. Please try another one.', 'photo-too-big': 'This photo is too large. Please try another one.', 'too-big': 'This photo is too large. Please try another one.',
    'bad-media': 'This recording could not be sent. Please try again.', 'media-too-big': 'This video is too large to send.',
    'empty': 'Write a few words, or choose a photo, a voice message or a video.',
    'enough-today': 'That is plenty for today. You can send more tomorrow.',
    'offer-open': 'A gift is already on its way or active.', 'bad-theme': 'Please choose a theme.',
    'bad-card': 'Please check the card number.', 'not-open': 'This offer is no longer open.',
    'bad-phone': 'Please check the phone number (8 to 15 digits).', 'bad-date': 'Please choose a valid date.',
    'bad-login': 'Email or password is not right.', 'weak-password': 'The password needs at least 8 characters, with a letter and a digit.',
    'bad-current': 'The current password is not right.', 'bad-relation': 'Letters only, please (2 to 40).',
    'listen-closed': 'Listening together has ended.', 'queue-full': 'The queue is full for now.', 'not-in-catalogue': 'This song is not in the Bellatrix catalogue.',
    'slow-down': 'Please wait a few minutes before trying again.', 'signed-out': 'Please sign in again.',
    'network': 'No connection to Bellatrix right now. Please try again in a moment.'
  };
  function errText(e) {
    if (e && e.code === 'no-consent') return T('This is not shared for {name}.', { name: who() });
    if (e && (e.code === 'access-suspended' || e.code === 'access-removed' || e.code === 'not-linked')) { loadMe().catch(function () {}); return T(e.code === 'access-suspended' ? 'Your access to {name} is suspended by the care team.' : 'Your access to {name} was removed by the care team.', { name: who() }); }
    return T(ERRORS[e && e.code] || ERRORS.network);
  }

  /* Portail.api: the server, with this phone's session and the chosen resident. */
  function api(method, path, body, opts) {
    opts = opts || {};
    var o = { method: method, headers: {}, cache: 'no-store' };
    if (S.token) o.headers.Authorization = 'Bearer ' + S.token;
    if (S.rid) o.headers['X-Resident'] = S.rid;
    if (opts.raw) { o.headers['Content-Type'] = opts.type || 'application/octet-stream'; o.body = opts.raw; }
    else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
    return fetch(API + path, o).then(function (r) {
      /* the tunnel answers 502..530 when the robot behind it is off */
      netState(r.status >= 502 && r.status <= 530);
      if (opts.blob && r.ok) return r.blob();
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'http-' + r.status); e.code = j.error || ''; e.status = r.status;
          if (r.status === 401 && S.token && path !== 'family/login/verify') { signedOut(); render(); }
          throw e;
        }
        return j;
      });
    }, function () { netState(true); var e = new Error('network'); e.code = 'network'; throw e; });
  }
  function fam(method, path, body, opts) { return api(method, 'family/' + path, body, opts); }
  /* 24 Nov (Rahma: "once installed the app must always work, also after leaving it and coming back"):
     when Bellatrix cannot be reached the app keeps the account and what it shows, says so in a thin line at
     the top (outside the page, so nothing being typed is touched), and tries again by itself: every 10 s, as
     soon as the phone is online again, and each time the app comes back on the screen. */
  function netState(down) {
    down = !!down;
    if (!!S.offline === down) return;
    S.offline = down;
    var b = document.getElementById('netBanner');
    if (!b && down) { b = document.createElement('div'); b.id = 'netBanner'; b.className = 'net-banner'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    if (b) { b.textContent = T('No connection to Bellatrix. The app tries again by itself.'); b.classList.toggle('on', down); }
    if (down) retrySoon();
  }
  var retryTimer = 0;
  function retrySoon() {
    if (retryTimer) return;
    retryTimer = setInterval(function () {
      if (S.screen !== 'unreachable' && !S.offline) { clearInterval(retryTimer); retryTimer = 0; return; }
      if (document.visibilityState !== 'hidden') wake();
    }, 10000);
  }
  /* back on the screen, back online, or the 10 s retry: fetch the account again (quietly) */
  function wake() {
    if (!S.token) return;
    if (S.screen === 'unreachable') { loadMe().then(function (x) { follow(x); }, function () { /* still away: the screen stays */ }); return; }
    if (S.screen === 'home' && !S.pay && !S.gift && !S.rec && !S.sheet) loadMe().catch(function () { /* the line at the top says it */ });
  }
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') wake(); });
  function signedOut() { S.token = ''; put(TOKEN, ''); S.me = null; S.screen = 'welcome'; S.sheet = ''; }
  function setLang(l) {
    S.lang = I18N.valid(l); put(LANGKEY, S.lang);
    document.documentElement.lang = S.lang;
    if (S.token && S.me) fam('POST', 'lang', { lang: S.lang }).catch(function () { /* kept on this phone */ });
    render();
  }

  /* ---------- the tab registry (Portail.addTab) ---------- */
  var ICON = {
    msg: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5 h16 v11 h-9 l-5 4 v-4 h-2 z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    photo: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 6 l1.6-2.2 h4.8 L16 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6 h14 M5 11 h14 M5 16 h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    voice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 11 a6.5 6.5 0 0 0 13 0 M12 17.5 V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    album: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 16 l3.5-4 2.5 3 2-2 2 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="9" cy="8" r="1.6" fill="currentColor"/></svg>',
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2.5 9 h19 M12 9 v11 M12 9 C9 4 5 6 8 9 M12 9 C15 4 19 6 16 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor"/></svg>',
    me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4.5 20 c1.5-4.5 13.5-4.5 15 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    listen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 15 v-3 a8 8 0 0 1 16 0 v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="14" width="5" height="7" rx="2" fill="currentColor"/><rect x="16" y="14" width="5" height="7" rx="2" fill="currentColor"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18 V5 l11-2 v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="16" r="2.8" fill="currentColor"/></svg>',
    call: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="3" fill="currentColor"/><path d="M16.5 10.5 L21.5 7.5 V16.5 L16.5 13.5 Z" fill="currentColor"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 L19 12 L8 19 Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 7.5 9.3 14.7a1.8 1.8 0 0 0 2.6 2.6l7.6-7.6a3.6 3.6 0 0 0-5.1-5.1L6.8 12.2a5.4 5.4 0 0 0 7.6 7.6l6.1-6.1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 L20 4.5 L15.5 20 L11.5 13 Z" fill="currentColor"/><path d="M11.5 13 L20 4.5" stroke="#FFFFFF" stroke-width="1.2" opacity=".5"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    crown: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 68 L17 32 L36 48 L50 24 L64 48 L83 32 L78 68 Z" fill="currentColor"/><rect x="22" y="68" width="56" height="11" rx="4" fill="currentColor"/></svg>'
  };
  var HEART = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 84 C18 62 10 44 19 31 C28 19 43 22 50 34 C57 22 72 19 81 31 C90 44 82 62 50 84 Z" fill="currentColor"/></svg>';
  var TABS = [
    { id: 'messages', core: true, label: 'Messages', icon: ICON.msg, render: messagesTab, visible: function (c) { return c.features.messages; } },
    { id: 'album', core: true, label: 'Album', icon: ICON.album, render: albumTab, visible: function (c) { return c.features.album; } },
    { id: 'premium', core: true, label: { fr: 'Plus', de: 'Mehr', en: 'More' }, icon: ICON.more, render: premiumTab, visible: function (c) { return c.features.premium; }, last: true }
  ];
  function addTab(t) {
    if (!t || !t.id || typeof t.render !== 'function') return false;
    TABS = TABS.filter(function (x) { return x.id !== t.id; });
    var tab = { id: t.id, label: t.label, icon: t.icon || ICON.msg, render: t.render, visible: typeof t.visible === 'function' ? t.visible : function () { return true; }, order: typeof t.order === 'number' ? t.order : 50 };
    var at = TABS.length; for (var i = 0; i < TABS.length; i++) if (TABS[i].last) { at = i; break; }
    TABS.splice(at, 0, tab);
    if (S.screen === 'home' && !S.sheet) render();
    return true;
  }
  function tabLabel(t) { return typeof t.label === 'string' ? T(t.label) : (t.label && (t.label[S.lang] || t.label.en || t.label.fr)) || t.id; }
  function ctx() {
    var r = S.me && S.me.resident;
    return { account: S.me ? S.me.account : null, person: S.me ? S.me.person : null, resident: r || null, residents: S.me ? S.me.residents : [],
      consent: r ? r.consent : null, features: (r && r.features) || { messages: true, album: true, calls: true, premium: true, feed: false, listen: false },
      lang: S.lang, t: T, esc: esc, api: api, toast: toast, refresh: loadMe, who: who };
  }
  function visibleTabs() { var c = ctx(); return TABS.filter(function (t) { try { return t.visible(c) !== false; } catch (e) { return false; } }); }

  /* ---------- drawing ---------- */
  function langSwitch() {
    return '<div class="langs" role="group" aria-label="' + esc(T('Language')) + '">' + ['fr', 'de', 'en'].map(function (l) {
      return '<button type="button" lang="' + l + '" data-lang="' + l + '" aria-pressed="' + (S.lang === l) + '"' + (S.lang === l ? ' class="on"' : '') + '>' + l.toUpperCase() + '</button>';
    }).join('') + '</div>';
  }
  function head(home) {
    var res = home && S.me ? (S.me.residents || []) : [];
    var dark = curTheme() === 'dark', tl = T(dark ? 'Light mode' : 'Dark mode');
    var theme = '<button type="button" class="themebtn" data-do="theme" aria-label="' + esc(tl) + '" title="' + esc(tl) + '">' + (dark ? ICON.sun : ICON.moon) + '</button>';
    var brand, cross = '<img class="logo" src="img/suavia-cross-white.svg" alt="">';
    if (home && S.me && who()) {
      var title = res.length > 1 ? '<label class="pick"><span class="with">' + esc(T('With {name}', { name: '' }).replace(/\s+$/, '')) + '</span><span class="sr">' + esc(T('Resident')) + '</span><select id="resSel">' + res.map(function (r) {
        return '<option value="' + esc(r.rid) + '"' + (r.rid === S.rid ? ' selected' : '') + '>' + esc(r.label) + (r.status !== 'active' ? ' (' + esc(T('Suspended')) + ')' : '') + '</option>';
      }).join('') + '</select></label>' : '<b class="wordmark">' + esc(T('With {name}', { name: who() })) + '</b>';
      brand = cross + '<div class="brand">' + title + '<small class="avail">' + esc(T('Available')) + '</small></div>';
    } else brand = cross + '<div class="brand"><b class="wordmark">Bellatrix</b><small>' + esc(T('Family portal')) + '</small></div>';
    return '<header class="top">' + brand + langSwitch() + theme + '</header>';
  }
  function consentBlock(id) {
    return '<div class="consent">' +
      '<details><summary>' + esc(T('What happens with my data?')) + '</summary><ul>' +
      '<li>' + esc(T('Kept: your first name, your email address, your language and what you send.')) + '</li>' +
      '<li>' + esc(T('Messages go straight to the robot; the care team is told and can withdraw one.')) + '</li>' +
      '<li>' + esc(T('Messages and photos are deleted 30 days after they were read, or earlier if you ask.')) + '</li>' +
      '<li>' + esc(T('What you see about {name} depends on the consent recorded by the care team.', { name: who() })) + '</li>' +
      '<li>' + esc(T('No advertising, no sale of data.')) + '</li>' +
      '<li>' + esc(T('You can withdraw your consent at any time in "My account": your account and messages are then deleted.')) + '</li>' +
      '</ul></details>' +
      '<label class="check"><input type="checkbox" id="' + id + '"> <span>' + esc(T('I agree that what I send is kept and shown to {name} as described above.', { name: who() })) + '</span></label></div>';
  }
  function render() {
    document.documentElement.lang = S.lang;
    document.title = T('Bellatrix · Family');
    var h = '';
    if (S.screen === 'loading') h = head(false) + '<main class="main center"><p class="muted">' + esc(T('One moment…')) + '</p></main>';
    /* 15 Nov: the robot's public address changes when its app restarts; an installed app keeps the old one. */
    else if (S.screen === 'unreachable') { h = head(false) + '<main class="main center"><section class="card"><h2>' + esc(T('Bellatrix cannot be reached right now.')) + '</h2><p class="muted">' + esc(T('The robot may be switched off or restarting. The app tries again by itself: you stay signed in.')) + '</p><button type="button" class="btn primary" data-do="retry-start">' + esc(T('Try again')) + '</button><p class="fine">' + esc(T('If it stays like this, the robot may have a new address: scan the QR code on the robot again.')) + '</p></section></main>'; retrySoon(); }
    else if (S.screen === 'invite') h = inviteScreen();
    else if (S.screen === 'signin') h = signinScreen();
    else if (S.screen === 'request') h = requestScreen();
    else if (S.screen === 'consent') h = consentScreen();
    else if (S.screen === 'home') h = homeScreen();
    else h = welcomeScreen();
    stopLive();
    app.innerHTML = h;
    after();
  }
  function welcomeScreen() {
    return head(false) + '<main class="main welcome">' +
      '<section class="hero"><h1>' + esc(T('Stay close, even from far away')) + '</h1>' +
      '<p>' + esc(T('Send a photo, a voice message or a few words. Bellatrix shows them to your loved one.')) + '</p></section>' +
      '<section class="enter">' +
      '<button type="button" class="btn primary" data-do="to-signin">' + esc(T('I already have an account')) + '</button>' +
      '<button type="button" class="btn" data-do="to-request">' + esc(T('Create an account')) + '</button></section>' +
      '<details class="invite"><summary>' + esc(T('I have an invitation code')) + '</summary>' +
      '<label class="field"><span>' + esc(T('Invitation code')) + '</span><input id="invCode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" maxlength="12"></label>' +
      '<button type="button" class="btn" data-do="invite">' + esc(T('Continue')) + '</button></details></main>';
  }
  function inviteScreen() {
    return head(false) + '<main class="main"><section class="card">' +
      '<h1>' + esc(T('Welcome to the family of {name}', { name: who() })) + '</h1>' +
      '<p class="muted">' + esc(T('Create your account in one minute.')) + '</p>' +
      '<label class="field"><span>' + esc(T('Your first name')) + '</span><input id="regName" autocomplete="given-name" maxlength="40" placeholder="' + esc(T('e.g. Sophie')) + '"></label>' +
      '<label class="field"><span>' + esc(T('Who are you for {name}? (optional)', { name: who() })) + '</span><input id="regRel" maxlength="40" placeholder="' + esc(T('e.g. granddaughter')) + '"></label>' +
      '<label class="field"><span>' + esc(T('Your email address')) + '</span><input id="regEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" maxlength="160" placeholder="' + esc(T('name@example.com')) + '"></label>' +
      consentBlock('regConsent') +
      '<button type="button" class="btn primary" data-do="register"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Create my account')) + '</button>' +
      '<button type="button" class="link" data-do="to-signin">' + esc(T('I already have an account')) + '</button>' +
      '<button type="button" class="link" data-do="to-welcome">' + esc(T('Back')) + '</button></section></main>';
  }
  /* A relative asks for access: the care team validates with one tap (Care Team > To handle). */
  /* 24 Nov (Rahma: "too crowded in one part"): creating an account takes 3 short steps: 1. you, 2. your loved
     one, 3. the agreement. What is typed is kept when going back and forth (S.req). */
  var REQ_FIELDS = [['reqFirst', 'first'], ['reqLast', 'last'], ['reqPhone', 'phone'], ['reqEmail', 'email'], ['reqRel', 'rel'], ['reqCode', 'code'], ['reqRes', 'res']];
  function keepReq() { var R = S.req || (S.req = {}); REQ_FIELDS.forEach(function (x) { if ($(x[0])) R[x[1]] = val(x[0]).trim(); }); return R; }
  function requestScreen() {
    var st = S.reqStep || 1, R = S.req || (S.req = {});
    var f = function (id, key, label, max, ph, extra) { return '<label class="field"><span>' + esc(T(label)) + '</span><input id="' + id + '" maxlength="' + max + '" value="' + esc(R[key] || '') + '" placeholder="' + esc(ph ? T(ph) : '') + '"' + (extra || '') + '></label>'; };
    var body = st === 1
      ? f('reqFirst', 'first', 'Your first name', 40, '', ' autocomplete="given-name" autocapitalize="words" spellcheck="false"') +
        f('reqLast', 'last', 'Your last name', 40, '', ' autocomplete="family-name" autocapitalize="words" spellcheck="false"') +
        f('reqPhone', 'phone', 'Your phone number', 20, 'e.g. +49 151 23456789', ' type="tel" inputmode="tel" autocomplete="tel"') +
        f('reqEmail', 'email', 'Your email address', 160, 'name@example.com', ' type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false"')
      : st === 2
      ? f('reqRel', 'rel', 'Who are you to the resident?', 40, 'e.g. daughter') +
        '<p class="muted">' + esc(T('Both are given by the care team.')) + '</p>' +
        f('reqCode', 'code', 'Resident code', 12, '', ' autocapitalize="characters" autocomplete="off" spellcheck="false"') +
        f('reqRes', 'res', 'First name of the resident', 40, '', ' autocapitalize="words" autocomplete="off" spellcheck="false"')
      : consentBlock('reqConsent');
    var steps = '<div class="req-steps" aria-hidden="true">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= st ? 'on' : '') + '"></i>'; }).join('') + '</div>';
    return head(false) + '<main class="main"><section class="card"><h1>' + esc(T('Create an account')) + '</h1>' + steps +
      '<p class="req-step">' + esc(T('Step {n} of 3', { n: st })) + ' · <b>' + esc(T(['About you', 'Your loved one', 'Your agreement'][st - 1])) + '</b></p>' +
      body +
      (st < 3 ? '<button type="button" class="btn primary" data-do="req-next">' + esc(T('Continue')) + '</button>'
        : '<button type="button" class="btn primary" data-do="request-access"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Send my request')) + '</button>') +
      '<button type="button" class="link" data-do="req-back">' + esc(T('Back')) + '</button></section></main>';
  }
  /* the checks of one step: the first wrong field is marked with its reason under it */
  function reqStepOk(st) {
    var R = keepReq(), M_NAME = T('Letters only, please (2 to 40).');
    if (st === 1) {
      if (!nameOk(R.first)) return bad('reqFirst', M_NAME), false;
      if (!nameOk(R.last)) return bad('reqLast', M_NAME), false;
      if (!phoneOk(R.phone)) return bad('reqPhone', T(ERRORS['bad-phone'])), false;
      if (!emailOk(R.email)) return bad('reqEmail', T('Please check the email address (e.g. name@example.com).')), false;
    }
    if (st === 2) {
      if (R.rel && !nameOk(R.rel)) return bad('reqRel', M_NAME), false;
      if (!/^[A-Z0-9-]{1,12}$/.test(R.code || '')) return bad('reqCode', T('Please give the resident code.')), false;
      if (!nameOk(R.res)) return bad('reqRes', M_NAME), false;
    }
    return true;
  }
  function signinScreen() {
    var step2 = !!S.email;
    var top = head(false) + '<main class="main"><section class="card"><h1>' + esc(T('Sign in')) + '</h1>' +
      (S.invite ? '<p class="note">' + esc(T('You already have an account. Sign in: {name} will be added to it.', { name: S.invite.label })) + '</p>' : '');
    /* 24 Nov (Rahma: a password to get in more easily): e-mail and password first; the care team's code stays the other way */
    if (!S.signinCode) {
      return top +
        '<label class="field"><span>' + esc(T('Your email address')) + '</span><input id="pwEmail" type="email" autocomplete="username" inputmode="email" maxlength="160"></label>' +
        '<label class="field"><span>' + esc(T('Your password')) + '</span><input id="pwPass" type="password" autocomplete="current-password" maxlength="128"></label>' +
        '<button type="button" class="btn primary" data-do="pw-login"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Sign in')) + '</button>' +
        '<button type="button" class="link" data-do="to-code">' + esc(T('No password yet? Get a code')) + '</button>' +
        '<button type="button" class="link" data-do="to-welcome">' + esc(T('Back')) + '</button></section></main>';
    }
    return top +
      (step2 ?
        '<p>' + esc(T('The care team gives you a 6-digit code (by phone or on paper). No email is sent during the pilot.')) + '</p>' +
        '<p class="muted">' + esc(S.email) + '</p>' +
        '<label class="field"><span>' + esc(T('Your code')) + '</span><input id="sinCode" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" class="code"></label>' +
        '<button type="button" class="btn primary" data-do="verify"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Sign in')) + '</button>' +
        '<button type="button" class="link" data-do="other-email">' + esc(T('Use another email address')) + '</button>'
        :
        '<label class="field"><span>' + esc(T('Your email address')) + '</span><input id="sinEmail" type="email" autocomplete="email" inputmode="email" maxlength="160"></label>' +
        '<button type="button" class="btn primary" data-do="ask-code"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Get a code')) + '</button>') +
      '<button type="button" class="link" data-do="to-password">' + esc(T('Sign in with my password')) + '</button>' +
      '<button type="button" class="link" data-do="to-welcome">' + esc(T('Back')) + '</button></section></main>';
  }
  function consentScreen() {
    return head(false) + '<main class="main"><section class="card"><h1>' + esc(T('Hello {name}', { name: S.me.person.name })) + '</h1>' +
      '<p>' + esc(T('Before you start, please read this short notice.')) + '</p>' +
      consentBlock('firstConsent') +
      '<button type="button" class="btn primary" data-do="consent">' + esc(T('I agree')) + '</button>' +
      '<button type="button" class="link" data-do="logout">' + esc(T('Sign out')) + '</button></section></main>';
  }

  /* ---------- home ---------- */
  function homeScreen() {
    if (S.sheet === 'account') return head(true) + '<main class="main">' + accountPage() + '</main>';
    if (S.sheet === 'install') return head(true) + '<main class="main">' + installPage() + '</main>';
    var m = S.me;
    if (!m.resident) {
      var r = (m.residents || []).filter(function (x) { return x.rid === S.rid; })[0] || (m.residents || [])[0];
      S.wasPending = m.access === 'access-pending';
      var body = m.access === 'access-pending'
        ? '<section class="card notice"><h1>' + esc(T('Waiting for the care team')) + '</h1><p>' + esc(T('The care team will answer soon. You will see it here and in the bell.')) + '</p></section>'
        : m.access === 'access-refused' ? '<section class="card notice"><h1>' + esc(T('Declined')) + '</h1></section>'
        : m.access === 'access-suspended' || m.access === 'access-removed'
        ? '<section class="card notice"><h1>' + esc(T(m.access === 'access-suspended' ? 'Your access to {name} is suspended by the care team.' : 'Your access to {name} was removed by the care team.', { name: r ? r.label : who() })) + '</h1>' +
          '<p>' + esc(T('You can talk about it with the care team. Nothing you sent is deleted.')) + '</p></section>'
        : '<section class="card notice"><h1>' + esc(T('No resident is linked to your account for now.')) + '</h1></section>';
      return head(true) + '<main class="main">' + body + (m.access === 'access-pending' || m.access === 'access-refused' ? '' : addResidentCard()) + '</main>';
    }
    var tabs = visibleTabs();
    if (!tabs.some(function (t) { return t.id === S.tab; })) S.tab = tabs.length ? tabs[0].id : 'messages';
    var cur = tabs.filter(function (t) { return t.id === S.tab; })[0];
    var inner = cur && cur.core ? cur.render() : '<div id="extTab" class="ext"></div>';
    return head(true) + '<main class="main" id="tabMain">' + inner + '</main>' +
      '<nav class="tabs" role="tablist">' + tabs.map(function (t) {
        var on = S.tab === t.id, n = t.id === 'premium' ? waitingRequests().length : 0;
        return '<button type="button" role="tab" aria-selected="' + on + '" data-tab="' + esc(t.id) + '"' + (on ? ' class="on"' : '') + '>' + t.icon + '<span>' + esc(tabLabel(t)) + '</span>' + (n ? '<i class="dotc">' + n + '</i>' : '') + '</button>';
      }).join('') + '</nav>';
  }
  function callButton() {
    var link = S.me && S.me.account && S.me.account.callLink;
    return link ? '<button type="button" class="btn call" data-do="call">' + ICON.call + '<span>' + esc(T('Video call with {name}', { name: who() })) + '</span></button>' : '';
  }

  /* ---------- Messages (BF-10 to 14) ---------- */
  var KIND = { text: ['Text message', ICON.text], photo: ['Photo message', ICON.photo], voice: ['Voice message', ICON.voice], video: ['Video message', ICON.video], album: ['Album', ICON.album] };
  /* WhatsApp ticks (14 Nov, Rahma): one grey tick = sent; two grey ticks = delivered to the robot
     (deliveredAt); two blue ticks (#53BDEB) = the resident has seen it on the tablet (readAt). */
  var TICK1 = '<svg viewBox="0 0 18 12" aria-hidden="true"><path d="M2 6.6 L5.2 9.6 L11.6 2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var TICK2 = '<svg viewBox="0 0 18 12" aria-hidden="true"><path d="M1.2 6.6 L4.4 9.6 L10.8 2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.4 8.7 L8.4 9.6 L14.8 2.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function tickState(m) { return m.status === 'read' || m.readAt ? 'read' : m.status === 'received' || m.deliveredAt || m.receivedAt ? 'delivered' : 'sent'; }
  function ticks(m) {
    var st = tickState(m), label = T(st === 'read' ? (m.kind === 'album' ? 'Seen' : 'Read') : st === 'delivered' ? 'Delivered' : 'Sent');
    var at = st === 'read' ? m.readAt : st === 'delivered' ? (m.deliveredAt || m.receivedAt) : m.at, full = label + (at ? ' · ' + timeText(at) : '');
    return '<span class="ticks t-' + st + '" data-ticks="' + st + '" role="img" aria-label="' + esc(full) + '" title="' + esc(full) + '">' + (st === 'sent' ? TICK1 : TICK2) + '</span>';
  }
  function statusChip(m) {
    if (m.status === 'withdrawn') return '<span class="chip s-not">' + esc(T('Withdrawn by the team')) + '</span>';
    return ticks(m);
  }
  function timeText(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleTimeString(LOCALE[S.lang], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function dayKey(iso) { return String(iso || '').slice(0, 10) && new Date(iso).toDateString(); }
  function dayLabel(iso) { return new Date(iso).toDateString() === new Date().toDateString() ? T('Today') : dateText(iso); }
  /* the thread: my messages as bubbles, oldest first, the newest just above the writing box */
  /* 14 Nov (Rahma: families must feel at home at once): the Messages tab follows the chat pattern people
     know from their phone (our own look and names): my bubbles on the right, time and ticks inside the
     bubble, voice notes with a play button and a wave bar, photo and video bubbles, day separators, and
     at the bottom one writing bar: attach, the text field, the microphone (the send arrow once there is
     something to send). */
  function waveBars(id, n) {
    var h = 0, s = String(id || 'x'), out = '';
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    for (var j = 0; j < n; j++) { h = (h * 73 + 41) % 9973; out += '<i style="height:' + (28 + (h % 72)) + '%"></i>'; }
    return out;
  }
  function voiceNote(id, own) {
    return '<div class="wa-vn"' + (id ? ' data-vn="' + esc(id) + '"' : '') + '><button type="button" class="wa-play" data-do="' + (own ? 'vn-local' : 'playmine') + '" data-id="' + esc(id || '') + '" aria-label="' + esc(T('Voice message')) + '">' + ICON.play + '</button>' +
      '<span class="wa-wave" aria-hidden="true"><span class="wa-fill"></span>' + waveBars(id || 'draft', 30) + '</span></div>';
  }
  /* A voice note's own small player: the button plays / pauses, the wave fills up while it plays. */
  function wirePlayer(vn, a) {
    if (!vn || !a || vn.__audio) return;
    vn.__audio = a;
    var btn = vn.querySelector('.wa-play'), fill = vn.querySelector('.wa-fill');
    if (btn && btn.getAttribute('data-do') === 'vn-local') btn.setAttribute('data-do', 'playmine');
    a.addEventListener('timeupdate', function () { if (fill && a.duration && isFinite(a.duration)) fill.style.width = Math.min(100, 100 * a.currentTime / a.duration) + '%'; });
    a.addEventListener('play', function () { vn.classList.add('on'); if (btn) btn.innerHTML = ICON.pause; });
    a.addEventListener('pause', function () { vn.classList.remove('on'); if (btn) btn.innerHTML = ICON.play; });
    a.addEventListener('ended', function () { if (fill) fill.style.width = '0'; });
  }
  function toggleVoice(vn) { var a = vn && vn.__audio; if (!a) return; if (a.paused) quietPlay(a); else a.pause(); }
  function bubble(m) {
    var k = KIND[m.kind] || KIND.text;
    var media = !m.hasMedia || m.hasPhoto ? '' : m.kind === 'voice' ? voiceNote(m.id) :
      '<button type="button" class="wa-video" data-do="playmine" data-id="' + esc(m.id) + '" aria-label="' + esc(T(k[0])) + '"><span class="wa-vplay">' + ICON.play + '</span></button>';
    return '<li class="bubble-row mine"><div class="bubble k-' + esc(m.kind || 'text') + (m.hasPhoto ? ' withphoto' : '') + '">' +
      (m.hasPhoto ? thumb(m, k[1]) : '') + media +
      (m.text ? '<p class="htext">' + esc(m.text) + '</p>' : '') +
      '<div class="bmeta"><button type="button" class="link small" data-del="' + esc(m.id) + '">' + esc(T('Remove')) + '</button>' +
      '<span class="bstamp"><span class="btime">' + esc(timeText(m.at)) + '</span>' + statusChip(m) + '</span></div></div></li>';
  }
  function tickLegend() {
    return '<p class="fine ticklegend"><span class="ticks t-sent">' + TICK1 + '</span> ' + esc(T('Sent')) + ' · <span class="ticks t-delivered">' + TICK2 + '</span> ' + esc(T('On Bellatrix')) +
      ' · <span class="ticks t-read">' + TICK2 + '</span> ' + esc(T('Seen by {name}', { name: who() })) + '</p>';
  }
  function messagesTab() {
    var lim = (S.me && S.me.limits) || { text: 300 };
    var list = ((S.me && S.me.messages) || []).filter(function (m) { return m.kind !== 'album'; }).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    var h = installOnce() + callButton() + requestBanner() + '<section class="thread"><h1>' + esc(T('Messages')) + '</h1>';
    if (list.length) {
      var last = '';
      h += '<ul class="bubbles">' + list.map(function (m) {
        var dk = dayKey(m.at), lab = dk !== last ? '<li class="daylabel" aria-hidden="true">' + esc(dayLabel(m.at)) + '</li>' : '';
        last = dk; return lab + bubble(m);
      }).join('') + '</ul>';
    } else h += '<p class="muted">' + esc(T('Nothing sent yet.')) + '</p>';
    h += '</section>' + tickLegend() + composerHtml(lim);
    return h;
  }
  /* The writing bar at the bottom: attach · text · microphone (or the send arrow). What is attached or
     recorded shows just above it, with a × to take it away. */
  function composerHtml(lim) {
    var r = S.rec, md = S.media, has = !!(S.photo || md || (S.draft && S.draft.trim())), top = '';
    if (S.photo || md || r) S.attach = false;
    if (S.photo) top = '<figure class="wa-prev"><img src="' + S.photo.url + '" alt=""><button type="button" class="wa-x" data-do="photo-del" aria-label="' + esc(T('Remove')) + '">×</button></figure>';
    else if (r) top = recorderHtml(r.kind);
    else if (md) top = '<div class="wa-prev media">' + (md.kind === 'voice' ? voiceNote('', true) + '<audio id="draftAudio" src="' + md.url + '" preload="metadata" hidden></audio>' : '<video class="live" controls playsinline src="' + md.url + '"></video>') +
      '<button type="button" class="wa-x" data-do="rec-again" aria-label="' + esc(T('Remove')) + '">×</button></div>';
    else if (S.attach) top = '<div class="wa-attach-menu" role="group" aria-label="' + esc(T('Attach')) + '">' +
      '<button type="button" data-do="pick">' + ICON.photo + '<span>' + esc(T('Photo')) + '</span></button>' +
      '<button type="button" data-do="rec-video">' + ICON.video + '<span>' + esc(T('Film')) + '</span></button>' +
      '<button type="button" data-do="pick-video">' + ICON.album + '<span>' + esc(T('Choose a video')) + '</span></button></div>';
    var bar = r ? '<div class="wabar rec"><button type="button" class="wa-btn ghost" data-do="rec-cancel" aria-label="' + esc(T('Remove')) + '">×</button>' +
        '<p class="rectime" id="recTime"><i class="recdot" aria-hidden="true"></i>' + esc(T('Recording…')) + '</p>' +
        '<button type="button" class="wa-btn round" data-do="rec-stop" aria-label="' + esc(T('Stop')) + '"><i class="sq"></i></button></div>'
      : '<div class="wabar' + (has ? ' has' : '') + '" id="waBar">' +
        '<button type="button" class="wa-btn ghost' + (S.attach ? ' on' : '') + '" data-do="attach" aria-expanded="' + !!S.attach + '" aria-label="' + esc(T('Attach')) + '">' + ICON.clip + '</button>' +
        '<label class="wa-field"><span class="sr">' + esc(T('Your message')) + '</span><textarea id="msgText" rows="1" maxlength="' + lim.text + '" placeholder="' + esc(T('Write a message')) + '"></textarea></label>' +
        '<button type="button" class="wa-btn round wa-mic" data-do="rec-voice" aria-label="' + esc(T('Record a voice message')) + '">' + ICON.voice + '</button>' +
        '<button type="button" class="wa-btn round wa-send" data-do="send" aria-label="' + esc(S.busy ? T('Sending…') : T('Send')) + '"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '<span class="wa-busy">' + esc(T('Sending…')) + '</span>' : ICON.send) + '</button></div>';
    return '<section class="composer wa" aria-label="' + esc(T('Write to {name}', { name: who() })) + '">' +
      '<input type="file" id="pickPhoto" data-for="send" accept="image/*" hidden><input type="file" id="pickVideo" accept="video/mp4,video/webm,video/quicktime,video/*" hidden>' +
      top + bar + '<p class="fine wa-note">' + esc(T('Messages go straight to Bellatrix. No links.')) + '</p></section>';
  }
  function thumb(m, icon) {
    if (!m.hasPhoto) return '<span class="thumb t">' + icon + '</span>';
    return '<span class="thumb" data-thumb="' + esc(m.id) + '">' + (S.thumbs[m.id] ? '<img src="' + S.thumbs[m.id] + '" alt="">' : icon) + '</span>';
  }
  /* The recorder: a voice message or a video, recorded on this phone. 14 Nov (Rahma): no duration limit
     and no countdown, "let the person take their time". Only an invisible safety cap on the file size
     (the server's limits.voiceBytes / videoBytes): near it the recording stops by itself and is kept. */
  var MEDIA_CAP = 95 * 1024 * 1024;
  function mediaCap(kind) { var l = S.me && S.me.limits, b = l && (kind === 'voice' ? l.voiceBytes : l.videoBytes); return b > 0 ? b : MEDIA_CAP; }
  /* While recording: the live picture for a video (the bar below says "Recording…", no time, no countdown). */
  function recorderHtml(kind) {
    return kind === 'video' ? '<div class="wa-prev media"><video id="live" class="live" playsinline muted></video></div>' : '';
  }
  function pickMime(kind) {
    var list = kind === 'voice' ? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'] : ['video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function startRec(kind) {
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || !window.MediaRecorder) { toast(T('This phone cannot record here. Use the text or the photo.')); return; }
    var c = kind === 'voice' ? { audio: { echoCancellation: true, noiseSuppression: true } } : { audio: true, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } };
    md.getUserMedia(c).then(function (stream) {
      var mime = pickMime(kind), o = { audioBitsPerSecond: 64000 };
      if (mime) o.mimeType = mime;
      if (kind === 'video') o.videoBitsPerSecond = 900000;
      var mr;
      try { mr = new MediaRecorder(stream, o); } catch (e) { mr = new MediaRecorder(stream); }
      var chunks = [], r = { kind: kind, stream: stream, mr: mr, start: Date.now(), bytes: 0 }, cap = mediaCap(kind) - 2 * 1024 * 1024;
      /* No timer: only the size is watched, quietly (a very long recording stops near the cap and is kept). */
      mr.ondataavailable = function (e) { if (e.data && e.data.size) { chunks.push(e.data); r.bytes += e.data.size; if (r.bytes >= cap) stopRec(); } };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        var type = String(mr.mimeType || mime || (kind === 'voice' ? 'audio/webm' : 'video/webm')).split(';')[0];
        if (S.media && S.media.url) URL.revokeObjectURL(S.media.url);
        S.media = null;
        /* × while recording: nothing is kept */
        if (!r.cancel) { var blob = new Blob(chunks, { type: type }); S.media = { kind: kind, blob: blob, url: URL.createObjectURL(blob), type: type, secs: Math.round((Date.now() - r.start) / 1000) }; }
        S.rec = null;
        keepText(function () { render(); });
      };
      S.rec = r;
      mr.start(1000);
      keepText(function () { render(); });
      var live = $('live');
      if (live && kind === 'video') { live.hidden = false; try { live.srcObject = stream; quietPlay(live); } catch (e) { /* no preview */ } }
    }, function () { toast(T('The microphone or the camera is not allowed. Allow it in the browser settings, then try again.')); });
  }
  function stopRec() { var r = S.rec; if (r && r.mr && r.mr.state !== 'inactive') r.mr.stop(); }
  function stopLive() { /* a redraw keeps a running recording; leaving the screen stops it */ }
  /* An iPhone library video is often HEVC (H.265), which the robot (Chrome 95) cannot play: its 'hvc1' or
     'hev1' sample entry is looked for in the file. Videos filmed in the portal are H.264 or VP8. */
  function isHevc(file) {
    /* A long video: only its first and last 4 MB are read (the sample description is in the 'moov' box,
       at the start or at the end of the file), never the whole file into memory. */
    var part = 4 * 1024 * 1024, big = file.size > 2 * part && file.slice;
    var pieces = big ? [file.slice(0, part), file.slice(file.size - part)] : [file];
    function scan(blob) {
      return new Promise(function (ok) {
        if (!blob.arrayBuffer) { ok(false); return; }
        blob.arrayBuffer().then(function (buf) {
          var a = new Uint8Array(buf), n = a.length - 4;
          for (var i = 0; i < n; i++) if (a[i] === 0x68 && ((a[i + 1] === 0x76 && a[i + 2] === 0x63 && a[i + 3] === 0x31) || (a[i + 1] === 0x65 && a[i + 2] === 0x76 && a[i + 3] === 0x31))) { ok(true); return; }
          ok(false);
        }, function () { ok(false); });
      });
    }
    return Promise.all(pieces.map(scan)).then(function (r) { return r.indexOf(true) >= 0; });
  }
  function chooseVideo(file) {
    if (!file) return;
    var type = String(file.type || '').split(';')[0];
    if (file.size > mediaCap('video') || (type && !/^video\/(mp4|webm|quicktime)$/.test(type))) { toast(T(ERRORS['media-too-big'])); return; }
    isHevc(file).then(function (hevc) {
      if (hevc) { toast(T('This video is in the iPhone format (HEVC) that Bellatrix cannot play. Film it here with "Film".')); return; }
      useVideo(file, type);
    });
  }
  function useVideo(file, type) {
    var url = URL.createObjectURL(file), v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = function () {
      if (S.media && S.media.url) URL.revokeObjectURL(S.media.url);
      S.media = { kind: 'video', blob: file, url: url, type: type || 'video/mp4', secs: Math.round(v.duration || 0) };
      keepText(function () { render(); });
    };
    v.onerror = function () { S.media = { kind: 'video', blob: file, url: url, type: type || 'video/mp4', secs: 0 }; keepText(function () { render(); }); };
    v.src = url;
  }
  function send() {
    var text = val('msgText');
    if (/(https?:\/\/|www\.)/i.test(text)) { toast(T(ERRORS['no-links'])); return; }
    /* what is sent follows what is in the bar: a photo, a recording, else the text */
    var media = S.media || null, m = S.photo ? 'photo' : media ? media.kind : 'text';
    if (m === 'photo') media = null;
    if (m === 'text' && !text) { toast(T(ERRORS.empty)); return; }
    S.busy = true; S.draft = text; S.attach = false; render();
    var first = media ? uploadMedia(m, media).then(function (u) { return { text: text, upload: u.upload }; })
      : Promise.resolve({ text: text, photo: m === 'photo' && S.photo ? S.photo.data : undefined });
    first.then(function (body) { return fam('POST', 'message', body); }).then(function (out) {
      /* like a chat: the message is at once at the bottom of the thread, with one tick */
      S.busy = false; S.sent = false; S.photo = null; S.draft = '';
      if (S.media && S.media.url) URL.revokeObjectURL(S.media.url);
      S.media = null;
      if (S.me) S.me.messages.unshift(out.message);
      render();
      var th = app.querySelector('.bubbles li:last-child');
      if (th && th.scrollIntoView) th.scrollIntoView({ block: 'end' });
    }, function (e) { S.busy = false; render(); toast(errText(e)); });
  }
  /* A voice or video file: sent with XMLHttpRequest, which tells how far the upload is (a long video
     takes a while on a phone network): the Send button shows "Sending… 42 %". */
  function uploadMedia(kind, media) {
    if (!window.XMLHttpRequest) return fam('POST', 'upload?kind=' + kind, undefined, { raw: media.blob, type: media.type });
    return new Promise(function (ok, no) {
      var x = new XMLHttpRequest();
      x.open('POST', API + 'family/upload?kind=' + encodeURIComponent(kind));
      if (S.token) x.setRequestHeader('Authorization', 'Bearer ' + S.token);
      if (S.rid) x.setRequestHeader('X-Resident', S.rid);
      x.setRequestHeader('Content-Type', media.type || 'application/octet-stream');
      if (x.upload) x.upload.onprogress = function (e) {
        if (!e.lengthComputable || !e.total) return;
        var b = app.querySelector('[data-do="send"]');
        if (b) b.textContent = T('Sending… {p} %', { p: Math.min(99, Math.floor(100 * e.loaded / e.total)) });
      };
      x.onload = function () {
        var j = {};
        try { j = JSON.parse(x.responseText || '{}') || {}; } catch (e) { j = {}; }
        if (x.status >= 200 && x.status < 300) { ok(j); return; }
        var er = new Error(j.error || 'http-' + x.status);
        er.code = j.error || (x.status === 413 ? 'media-too-big' : ''); er.status = x.status;
        if (x.status === 401 && S.token) { signedOut(); render(); }
        no(er);
      };
      x.onerror = function () { var er = new Error('network'); er.code = 'network'; no(er); };
      x.send(media.blob);
    });
  }

  /* ---------- Album (BF-15, 16) ---------- */
  function albumTab() {
    var lim = (S.me && S.me.limits) || { caption: 90, question: 160, date: 30 };
    var open = S.aOpen || S.aPhoto || S.aSent || S.busy;
    var h = '<section class="thread albumhead"><h1>' + esc(T('Album')) + '</h1>' +
      (open ? '' : '<button type="button" class="link addphoto" data-do="album-open">' + esc(T('Add a photo')) + '</button>') + '</section>';
    if (open) {
      h += '<section class="composer addpanel"><h2>' + esc(T('Add to the album of {name}', { name: who() })) + '</h2>';
      if (S.aSent) {
        h += '<div class="sent"><span class="big">' + HEART + '</span><p><b>' + esc(T('Thank you! The photo goes into the album of {name}.', { name: who() })) + '</b></p>' +
          '<button type="button" class="btn primary" data-do="album-new">' + esc(T('Continue')) + '</button></div></section>';
      } else {
        h += '<input type="file" id="pickAlbum" data-for="album" accept="image/*" hidden>' +
          (S.aPhoto ? '<figure class="preview"><img src="' + S.aPhoto.url + '" alt=""></figure><button type="button" class="link" data-do="pick-album">' + esc(T('Choose another photo')) + '</button>'
            : '<button type="button" class="drop" data-do="pick-album">' + ICON.photo + '<span>' + esc(T('Choose a photo')) + '</span></button>') +
          '<label class="field"><span>' + esc(T('Short caption')) + '</span><input id="aCaption" maxlength="' + lim.caption + '" placeholder="' + esc(T('e.g. Paul’s wedding')) + '"></label>' +
          '<label class="field"><span>' + esc(T('Date (optional)')) + '</span><input id="aDate" type="date" min="1900-01-01" max="' + todayIso() + '"></label>' +
          '<fieldset class="themes"><legend>' + esc(T('Theme')) + '</legend><div class="chips" role="radiogroup">' + THEMES.map(function (t) {
            var on = S.aTheme === t[0];
            return '<button type="button" role="radio" aria-checked="' + on + '" class="tchip' + (on ? ' on' : '') + '" data-theme="' + t[0] + '">' + esc(T(t[1])) + '</button>';
          }).join('') + '</div></fieldset>' +
          '<label class="field"><span>' + esc(T('A question to start the conversation (optional)')) + '</span><input id="aQuestion" maxlength="' + lim.question + '" placeholder="' + esc(T('e.g. Do you remember the music that day?')) + '"></label>' +
          '<p class="fine">' + esc(T('Only photos you have the right to share.')) + '</p>' +
          '<button type="button" class="btn primary" data-do="album-send"' + (S.busy ? ' disabled' : '') + '>' + esc(S.busy ? T('Sending…') : T('Add to the album')) + '</button>' +
          '<button type="button" class="link" data-do="album-close">' + esc(T('Close')) + '</button></section>';
      }
    }
    var list = ((S.me && S.me.messages) || []).filter(function (m) { return m.kind === 'album'; }).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    if (list.length) {
      var name = (S.me && S.me.person && S.me.person.name) || '';
      h += '<div class="feedflat">' + list.map(function (m) {
        /* 14 Nov: a post as in the news feeds people know: who and when on top, the words, the photo, then "seen" */
        return '<article class="post fb' + (m.hidden ? ' dim' : '') + '"><header class="posthead"><span class="pavatar" aria-hidden="true">' + esc((name || '?').charAt(0).toUpperCase()) + '</span>' +
          '<span class="pwho"><b>' + esc(name) + '</b><small>' + esc(m.date || dateText(m.at)) + ' · ' + esc(themeName(m.theme)) + '</small></span>' +
          (m.hidden ? '<span class="chip s-not">' + esc(T('Hidden')) + '</span>' : '') + '</header>' +
          (m.text ? '<p class="postcap">' + esc(m.text) + '</p>' : '') + thumb(m, ICON.album) +
          (m.question ? '<p class="postq">' + esc(m.question) + '</p>' : '') +
          (m.hidden ? '' : '<p class="postseen">' + statusChip(m) + '<span>' + esc(tickState(m) === 'read' ? T('Seen by {name}', { name: who() }) : T(tickState(m) === 'delivered' ? 'On Bellatrix' : 'Sent')) + '</span></p>') +
          '<div class="row postacts"><button type="button" class="link small" data-do="' + (m.hidden ? 'album-show' : 'album-hide') + '" data-id="' + esc(m.id) + '">' + esc(T(m.hidden ? 'Show again' : 'Hide')) + '</button>' +
          '<button type="button" class="link small" data-do="album-del" data-id="' + esc(m.id) + '">' + esc(T('Delete')) + '</button></div></article>';
      }).join('') + '</div>';
    } else h += '<p class="muted">' + esc(T('Nothing sent yet.')) + '</p>';
    return h;
  }

  /* ---------- Premium (BF-20 to 24, 28) ---------- */
  function requests() { return (S.me && S.me.requests) || []; }
  function waitingRequests() { return requests().filter(function (q) { return q.state === 'awaiting_family'; }); }
  function productInfo(id) { return ((S.me && S.me.products) || []).filter(function (p) { return p.id === id; })[0] || { id: id, prices: [], currency: 'EUR' }; }
  function requestBanner() {
    var w = waitingRequests()[0];
    if (!w) return '';
    return '<section class="card ask"><div class="ghead"><span class="crown sm">' + ICON.crown + '</span><p><b>' + esc(T('The care team proposes {product} for {name}', { product: productName(w.product), name: who() })) + '</b></p></div>' +
      '<button type="button" class="btn primary" data-tab="premium">' + esc(T('See')) + '</button></section>';
  }
  function current(product) {
    var t = Date.now(), live = function (x) { return !x.until || Date.parse(x.until) > t; };
    var rq = requests().filter(function (q) { return q.product === product; }), of = ((S.me && S.me.offers) || []).filter(function (o) { return (o.product || 'play') === product; });
    var a = rq.filter(function (q) { return q.state === 'active' && live(q); })[0]; if (a) return { kind: 'request', state: 'active', x: a };
    var b = of.filter(function (o) { return o.state === 'active' && live(o); })[0]; if (b) return { kind: 'offer', state: 'active', x: b };
    var c = rq.filter(function (q) { return q.state === 'paid'; })[0]; if (c) return { kind: 'request', state: 'paid', x: c };
    var d = of.filter(function (o) { return o.state === 'paid'; })[0]; if (d) return { kind: 'offer', state: 'given', x: d };
    var e = rq.filter(function (q) { return q.state === 'awaiting_family'; })[0]; if (e) return { kind: 'request', state: 'awaiting_family', x: e };
    var f = rq[0]; if (f && (f.state === 'refused' || f.state === 'expired') && Date.now() - Date.parse(f.updatedAt || f.at) < 14 * 86400000) return { kind: 'request', state: f.state, x: f };
    return null;
  }
  function stateLine(c) {
    if (!c) return '<span class="chip s-not">' + esc(T('No subscription')) + '</span>';
    if (c.state === 'active') return '<span class="chip s-ok">' + esc(T('Paid / Active')) + '</span> <span class="chip s-ok">' + esc(T('Active until {date}', { date: dateText(c.x.until) })) + '</span>';
    if (c.state === 'paid') return '<span class="chip s-shown">' + esc(T('Paid · Bellatrix switches it on')) + '</span>';
    if (c.state === 'given') return '<span class="chip s-shown">' + esc(T('Given · the care team switches it on')) + '</span>';
    if (c.state === 'awaiting_family') return '<span class="chip s-rec">' + esc(T('Waiting for payment')) + '</span>';
    if (c.state === 'refused') return '<span class="chip s-not">' + esc(T('Refused')) + '</span>';
    return '<span class="chip s-not">' + esc(T('Ended')) + '</span>';
  }
  function payForm() {
    var p = S.pay, info = productInfo(p.product), pr = p.kind === 'request' ? { cents: p.cents } : (info.prices || []).filter(function (x) { return x.months === p.months; })[0] || { cents: 0 };
    return '<section class="card gift"><div class="pay"><h2>' + esc(T('Payment (demonstration)')) + '</h2>' +
      '<div class="sum"><span>' + esc(productName(p.product)) + ' · ' + esc(T('{n} month(s)', { n: p.months })) + '</span><b>' + price(pr.cents, info.currency) + '</b></div>' +
      testLine() +
      '<form id="payForm" autocomplete="off" onsubmit="return false">' +
      '<label class="field"><span>' + esc(T('Name on the card')) + '</span><input id="payName" autocomplete="off" spellcheck="false" maxlength="60"></label>' +
      '<label class="field"><span>' + esc(T('Card number')) + '</span><input id="payNum" class="masked" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="23" placeholder="4242 4242 4242 4242"></label>' +
      '<div class="two"><label class="field"><span>' + esc(T('Expiry (MM/YY)')) + '</span><input id="payExp" inputmode="numeric" autocomplete="off" maxlength="5" placeholder="12/28"></label>' +
      '<label class="field"><span>' + esc(T('Security code')) + '</span><input id="payCvc" class="masked" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="123"></label></div></form>' +
      '<p class="fine">' + esc(T('One payment, no automatic renewal. You can stop at any time.')) + '</p>' +
      '<button type="button" class="btn primary" data-do="pay"' + (S.busy ? ' disabled' : '') + '>' + esc(T('Pay (demo)')) + '</button>' +
      '<button type="button" class="link" data-do="pay-back">' + esc(T('Back')) + '</button></div></section>';
  }
  function giftChooser() {
    var g = S.gift, info = productInfo(g.product);
    return '<section class="card gift"><div class="ghead"><span class="crown">' + ICON.crown + '</span><h1>' + esc(T('Give {product} to {name}', { product: productName(g.product), name: who() })) + '</h1></div>' +
      '<div class="months" role="radiogroup" aria-label="' + esc(T('Duration')) + '">' + (info.prices || []).map(function (x) {
        var on = x.months === g.months;
        return '<button type="button" role="radio" aria-checked="' + on + '" class="month' + (on ? ' on' : '') + '" data-months="' + x.months + '"><b>' + esc(T('{n} month(s)', { n: x.months })) + '</b><span>' + esc(money(x.cents, info.currency)) + '</span></button>';
      }).join('') + '</div>' +
      testLine() +
      '<p class="fine">' + esc(T('One payment, no automatic renewal. You can stop at any time.')) + '</p>' +
      '<button type="button" class="btn primary" data-do="gift-next">' + esc(T('Continue')) + '</button>' +
      '<button type="button" class="link" data-do="gift-back">' + esc(T('Back')) + '</button></section>';
  }
  function premiumTab() {
    if (S.pay) return payForm();
    if (S.gift) return giftChooser();
    if (S.inListen) return listenView();
    var h = '';
    waitingRequests().forEach(function (q) {
      h += '<section class="card ask"><div class="ghead"><span class="crown">' + ICON.crown + '</span><h1>' + esc(T('The care team proposes {product} for {name}', { product: productName(q.product), name: who() })) + '</h1></div>' +
        '<p>' + esc(T('{n} month(s)', { n: q.months })) + ' · <b>' + price(q.cents, q.currency) + '</b></p>' + testLine() +
        '<div class="two"><button type="button" class="btn primary" data-do="req-pay" data-id="' + esc(q.id) + '">' + esc(T('Pay')) + '</button>' +
        '<button type="button" class="btn" data-do="req-refuse" data-id="' + esc(q.id) + '">' + esc(T('Refuse')) + '</button></div></section>';
    });
    if (S.me && S.me.listen && S.me.listen.available) {
      h += '<section class="card listen"><div class="ghead"><span class="crown">' + ICON.listen + '</span><h2>' + esc(T('Listen together with {name}', { name: who() })) + '</h2></div>' +
        '<button type="button" class="btn" data-do="listen-open">' + esc(T('Open')) + '</button></section>';
    }
    h += '<section class="card"><h1>' + esc(T('Subscriptions of {name}', { name: who() })) + '</h1><ul class="subs">' + PRODUCTS.map(function (p) {
      var c = current(p[0]), btn = '', mine = c && c.x && (c.x.paidByMe || c.x.mine);
      if (c && c.state === 'active') btn = '<button type="button" class="btn sm" data-do="' + (c.kind === 'request' ? 'req-stop' : 'stop-offer') + '" data-id="' + esc(c.x.id) + '">' + esc(T('Stop')) + '</button>';
      else if (c && c.state === 'given') btn = '<button type="button" class="btn sm" data-do="stop-offer" data-id="' + esc(c.x.id) + '">' + esc(T('Cancel')) + '</button>';
      else if (!c || c.state === 'refused' || c.state === 'expired') btn = '<button type="button" class="btn sm" data-do="gift" data-product="' + p[0] + '">' + esc(T('Give')) + '</button>';
      return '<li><span class="crown sm">' + ICON.crown + '</span><div class="hbody"><b>' + esc(T(p[1])) + '</b><small class="fine">' + esc(T(p[2])) + '</small><p class="chips">' + stateLine(c) +
        (mine && (c.state === 'active' || c.state === 'paid') ? ' <span class="chip s-shown">' + esc(T('Paid by you')) + '</span>' : '') + '</p></div>' + btn + '</li>';
    }).join('') + '</ul><p class="fine">' + esc(T('One payment, no automatic renewal. You can stop at any time.')) + '</p></section>';
    var pays = (S.me && S.me.payments) || [];
    if (pays.length) {
      h += '<section class="card"><h2>' + esc(T('My payments')) + '</h2><ul class="hist">' + pays.map(function (x) {
        return '<li><span class="thumb t">' + ICON.crown + '</span><div class="hbody"><b>' + esc(productName(x.product)) + ' · ' + esc(x.label) + '</b><p class="fine">' +
          esc(x.kind === 'gift' ? T('Gift from {name} on {date}', { name: x.from || '', date: dateText(x.at) }) : T('Paid by {name} on {date}', { name: x.paidBy || '', date: dateText(x.paidAt) })) +
          ' · ' + esc(T('{n} month(s)', { n: x.months })) + ' · ' + esc(money(x.cents, x.currency)) + '</p></div></li>';
      }).join('') + '</ul></section>';
    }
    h += installCard();
    h += '<button type="button" class="rowlink" data-do="notif-open"><span>' + esc(T('Notifications')) + '</span><i aria-hidden="true">›</i></button>';
    h += '<button type="button" class="rowlink" data-do="account"><span>' + esc(T('My account')) + '</span><i aria-hidden="true">›</i></button>';
    return h;
  }

  /* ---------- listen together (contract 3) ---------- */
  function listenView() {
    var L = S.listen;
    var h = '<button type="button" class="link back" data-do="listen-close">‹ ' + esc(T('Back')) + '</button><section class="card"><div class="ghead"><span class="crown">' + ICON.listen + '</span><h1>' + esc(T('Listen together')) + '</h1></div>';
    if (!L) return h + '<p class="muted">' + esc(T('One moment…')) + '</p></section>';
    if (!L.open) return h + '<p>' + esc(T('Bellatrix is not playing music for {name} right now.', { name: who() })) + '</p><button type="button" class="btn" data-do="listen-refresh">' + esc(T('Refresh')) + '</button></section>';
    var now = L.now;
    h += '<div class="nowplay"><span class="note">' + ICON.note + '</span><div><small>' + esc(T('Now for {name}', { name: who() })) + '</small>' +
      (now && now.title ? '<b>' + esc(now.title) + '</b><span>' + esc(now.artist || '') + '</span>' : '<b>' + esc(T('No song right now.')) + '</b>') + '</div></div>' +
      ((L.listeners || []).length ? '<p class="fine">' + esc(T('With you: {names}', { names: L.listeners.map(function (x) { return x.name; }).join(', ') })) + '</p>' : '') + '</section>';
    h += '<section class="card"><h2>' + esc(T('Next songs')) + '</h2>' + ((L.queue || []).length ? '<ol class="queue">' + L.queue.map(function (x) {
      return '<li><div class="hbody"><b>' + esc(x.title) + '</b><small class="fine">' + esc(x.artist || '') + ' · ' + esc(T('added by {name}', { name: x.by })) + '</small></div>' +
        (x.mine ? '<button type="button" class="link small" data-do="listen-remove" data-id="' + esc(x.qid) + '">' + esc(T('Remove')) + '</button>' : '') + '</li>';
    }).join('') + '</ol>' : '<p class="muted">' + esc(T('No song waiting.')) + '</p>') + '</section>';
    h += '<section class="card"><h2>' + esc(T('Add a song')) + '</h2><div class="searchrow"><label class="field"><span class="sr">' + esc(T('Title or singer')) + '</span><input id="songQuery" type="search" autocomplete="off" placeholder="' + esc(T('Title or singer')) + '" value="' + esc(S.query) + '"></label>' +
      '<button type="button" class="btn primary" data-do="listen-search">' + esc(T('Search')) + '</button></div>' +
      (S.found ? (S.found.length ? '<ul class="found">' + S.found.map(function (x) {
        return '<li><div class="hbody"><b>' + esc(x.title) + '</b><small class="fine">' + esc(x.artist || '') + (x.year ? ' · ' + x.year : '') + '</small></div><button type="button" class="btn sm" data-do="listen-add" data-id="' + esc(x.id) + '">' + esc(T('Add')) + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted">' + esc(T('No song found.')) + '</p>') : '') + '</section>';
    return h;
  }
  function loadListen() {
    return fam('GET', 'listen').then(function (l) {
      var was = S.listen && S.listen.open;
      S.listen = l;
      var typing = document.activeElement && document.activeElement.id === 'songQuery';
      if ($('songQuery')) S.query = $('songQuery').value;
      if (S.inListen && !typing) render();
      if (was && !l.open) toast(T('Listening together has ended.'));
    }, function () { /* kept as it was */ });
  }

  /* ---------- account page ---------- */
  function addResidentCard() {
    return '<section class="card"><h2>' + esc(T('Add a resident')) + '</h2><p class="fine">' + esc(T('With the invitation code the care team gives you.')) + '</p>' +
      '<div class="searchrow"><label class="field"><span class="sr">' + esc(T('Invitation code')) + '</span><input id="linkCode" autocomplete="off" autocapitalize="characters" placeholder="ABCD-EFGH" maxlength="12"></label>' +
      '<button type="button" class="btn primary" data-do="link">' + esc(T('Add')) + '</button></div></section>';
  }
  /* 24 Nov (Rahma): a password, so the next sign-in needs no code from the care team */
  function passwordCard() {
    var has = !!(S.me && S.me.person && S.me.person.hasPassword);
    return '<section class="card"><h2>' + esc(T('Password')) + '</h2>' +
      '<p class="fine">' + esc(T('With a password you sign in with your email address, without asking the care team for a code.')) + '</p>' +
      '<form onsubmit="return false" autocomplete="on"><input type="email" autocomplete="username" value="' + esc(S.me.person.email) + '" hidden>' +
      (has ? '<label class="field"><span>' + esc(T('Current password')) + '</span><input id="pwCur" type="password" autocomplete="current-password" maxlength="128"></label>' : '') +
      '<label class="field"><span>' + esc(T('New password')) + '</span><input id="pwNew" type="password" autocomplete="new-password" maxlength="128"></label>' +
      '<label class="field"><span>' + esc(T('New password again')) + '</span><input id="pwNew2" type="password" autocomplete="new-password" maxlength="128"></label>' +
      '<p class="fine">' + esc(T('At least 8 characters, with a letter and a digit.')) + '</p></form>' +
      '<button type="button" class="btn" data-do="set-password"' + (S.busy ? ' disabled' : '') + '>' + esc(T(has ? 'Change my password' : 'Create a password')) + '</button></section>';
  }
  function accountPage() {
    var p = S.me.person, r = S.me.resident, lvl = r && r.consent;
    return '<button type="button" class="link back" data-do="account-close">‹ ' + esc(T('Back')) + '</button>' +
      '<section class="card"><h1>' + esc(T('My account')) + '</h1>' +
      '<dl class="facts"><dt>' + esc(T('First name')) + '</dt><dd>' + esc(p.name) + '</dd><dt>' + esc(T('Email address')) + '</dt><dd>' + esc(p.email) + '</dd>' +
      '<dt>' + esc(T('Consent given on')) + '</dt><dd>' + esc(dateText(p.consentAt)) + '</dd></dl>' +
      (standalone() ? '' : '<button type="button" class="btn" data-do="install-open">' + esc(T('Install the app')) + '</button>') +
      '</section>' + passwordCard() +
      '<section class="card"><h2>' + esc(T('My residents')) + '</h2><ul class="subs">' + (S.me.residents || []).map(function (x) {
        return '<li><div class="hbody"><b>' + esc(x.label) + '</b>' + (x.relation ? '<small class="fine">' + esc(x.relation) + '</small>' : '') + '</div><span class="chip ' + (x.status === 'active' ? 's-ok' : 's-not') + '">' + esc(T(x.status === 'active' ? 'Active' : 'Suspended')) + '</span></li>';
      }).join('') + '</ul></section>' + addResidentCard() +
      (r ? '<section class="card"><h2>' + esc(T('What you see')) + '</h2><p><b>' + esc(T(lvl === 'all' ? 'Everything: messages, album, calls and activity' : 'Messages, calls and album')) + '</b></p>' +
        '<p class="fine">' + esc(T('The care team records the consent of {name} or of their representative.', { name: who() })) + '</p></section>' : '') +
      '<section class="card"><h2>' + esc(T('My data')) + '</h2>' +
      '<p class="fine">' + esc(T('Kept: your first name, your email address, your language and what you send.')) + ' ' + esc(T('Messages and photos are deleted 30 days after they were read, or earlier if you ask.')) + '</p>' +
      (S.confirmData ? '<div class="confirm"><p><b>' + esc(T('Delete all the messages and photos you sent? This cannot be undone.')) + '</b></p>' +
        '<button type="button" class="btn danger" data-do="data-delete">' + esc(T('Yes, delete them')) + '</button><button type="button" class="link" data-do="keep">' + esc(T('No, keep them')) + '</button></div>'
        : '<button type="button" class="btn" data-do="ask-data">' + esc(T('Delete all my messages and photos')) + '</button>') +
      (S.confirmDelete ? '<div class="confirm"><p><b>' + esc(T('Withdraw your consent? Your account and all your messages will be deleted. This cannot be undone.')) + '</b></p>' +
        '<button type="button" class="btn danger" data-do="revoke">' + esc(T('Yes, delete my account')) + '</button><button type="button" class="link" data-do="keep">' + esc(T('No, keep it')) + '</button></div>'
        : '<button type="button" class="btn" data-do="ask-revoke">' + esc(T('Withdraw my consent and delete my account')) + '</button>') +
      '</section><button type="button" class="btn ghost" data-do="logout">' + esc(T('Sign out')) + '</button>';
  }
  /* ---------- installing the app (14 Nov, Rahma: "the app is not added on the phone") ----------
     - Android Chrome: the browser's own install prompt (beforeinstallprompt) when it offers one, else
       the ⋮ menu steps.
     - iPhone Safari: Share › "Add to Home Screen". The installed app has its OWN storage (iOS), so it
       starts signed out: this signed-in page makes a one-time sign-in code (family/login/handoff) to
       type there with the email address, instead of asking the care team for a new code.
     - Inside Messenger, Instagram, Facebook… (in-app browsers) nothing can be installed: open the
       link in Chrome or Safari first (and a button copies the address).
     Plus tab: an "Install the app" card; once after the first sign-in: a short question on Messages. */
  function isIos() { return /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function isAndroid() { return /Android/i.test(navigator.userAgent || ''); }
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function inAppBrowser() { var u = navigator.userAgent || ''; return /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Line\/|MicroMessenger|Snapchat|musical_ly|TikTok/i.test(u) || (/Android/.test(u) && /; wv\)/.test(u)); }
  function installWhere() { return standalone() ? 'installed' : inAppBrowser() ? 'inapp' : isIos() ? 'ios' : isAndroid() ? 'android' : 'other'; }
  function appAddress() { return location.origin + location.pathname; }
  function installCard() {
    var w = installWhere();
    if (w === 'installed') return '<section class="card install"><h2>' + esc(T('Install the app')) + '</h2><p class="fine">' + esc(T('The app is installed on this phone.')) + '</p></section>';
    return '<section class="card install"><h2>' + esc(T('Install the app')) + '</h2><p class="fine">' + esc(T('Bellatrix on your home screen, like an app.')) + '</p>' +
      '<button type="button" class="btn" data-do="install-open" data-install="' + w + '">' + esc(T('Install the app')) + '</button></section>';
  }
  /* Once, after the first sign-in on this phone (not in the installed app). */
  function installOnce() {
    if (S.installOnce === undefined) { S.installOnce = !standalone() && !get(INSTALL_SEEN); if (S.installOnce) put(INSTALL_SEEN, '1'); }
    if (!S.installOnce || standalone()) return '';
    return '<section class="card installask"><p><b>' + esc(T('Install Bellatrix on this phone?')) + '</b></p><div class="two">' +
      '<button type="button" class="btn primary" data-do="install-open">' + esc(T('Install')) + '</button>' +
      '<button type="button" class="btn ghost" data-do="install-later">' + esc(T('Not now')) + '</button></div></section>';
  }
  function installPage() {
    var w = installWhere(), steps = [], h = '<button type="button" class="link back" data-do="install-close">‹ ' + esc(T('Back')) + '</button>' +
      '<section class="card installsheet" data-install="' + w + '"><h1>' + esc(T('Install the app')) + '</h1>';
    var copy = '<div class="copyrow"><input id="appAddr" readonly value="' + esc(appAddress()) + '" aria-label="' + esc(T('Copy the address')) + '"><button type="button" class="btn" data-do="install-copy">' + esc(T('Copy the address')) + '</button></div>';
    if (w === 'installed') h += '<p>' + esc(T('The app is installed on this phone.')) + '</p>';
    else if (w === 'inapp') {
      h += '<p>' + esc(T('You opened the link inside Messenger or another app. It cannot install Bellatrix.')) + '</p>';
      steps = [T('Tap ⋯ or ⋮, then "Open in browser" (Chrome or Safari).'), T('There, tap More › Install the app.')];
    } else if (w === 'android') {
      if (S.installEvt) h += '<button type="button" class="btn primary" data-do="install">' + esc(T('Install')) + '</button>';
      else steps = [T('Tap ⋮ at the top right of Chrome.'), T('Choose "Install app" or "Add to Home screen".'), T('Open Bellatrix from your home screen.')];
    } else if (w === 'ios') {
      steps = [T('Tap Share (the square with an arrow) in Safari.'), T('Choose "Add to Home Screen", then "Add".'), T('Open Bellatrix from the home screen and sign in with your email address and this code:')];
    } else {
      if (S.installEvt) h += '<button type="button" class="btn primary" data-do="install">' + esc(T('Install')) + '</button>';
      h += '<p class="fine">' + esc(T('On a computer: open this address on your phone.')) + '</p>';
    }
    if (steps.length) h += '<ol class="steps-install">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    if (w === 'ios') {
      var hc = S.handoff;
      h += hc && hc.code ? '<p class="handoff"><b class="code">' + esc(hc.code.slice(0, 3) + ' ' + hc.code.slice(3)) + '</b><small class="fine">' + esc(hc.email || '') + '</small><small class="fine">' + esc(T('Valid 15 minutes.')) + '</small></p>' +
        '<button type="button" class="link small" data-do="install-code">' + esc(T('New code')) + '</button>'
        : '<button type="button" class="btn" data-do="install-code">' + esc(T('Show my code')) + '</button>';
    }
    if (w === 'inapp' || w === 'other') h += copy;
    return h + '</section>';
  }
  function handoffCode() {
    fam('POST', 'login/handoff', {}).then(function (r) { S.handoff = { code: r.code, email: r.email, until: r.until }; if (S.sheet === 'install') render(); }, function (e) { toast(errText(e)); });
  }
  function copyAddress() {
    var a = appAddress(), done = function () { toast(T('Address copied.')); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(a).then(done, function () { selectAddr(); }); return; }
    selectAddr();
    function selectAddr() { var i = $('appAddr'); if (!i) return; i.focus(); i.select(); try { if (document.execCommand('copy')) done(); } catch (e) { /* selected: the person copies it */ } }
  }

  /* ---------- after drawing ---------- */
  /* Input checks (24 Nov, Rahma: "a very strict input check for every field"). Each field lets through only
     what it may hold while it is typed (or pasted), and is checked again when it is left and before sending;
     the server checks the same rules (labland/family-portal.mjs). */
  var LETTERS = 'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F';
  var NAME_RE = new RegExp('^[' + LETTERS + ']+(?:[ \'\u2019-][' + LETTERS + ']+)*$');
  var EMAIL_RE = /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;
  /* a name: letters (also accented), single spaces, hyphens or apostrophes between them, 2 to 40 characters */
  function nameOk(v) { v = String(v || '').trim(); return v.length >= 2 && v.length <= 40 && NAME_RE.test(v); }
  /* a phone number: digits and spaces only, one + at the very start, 8 to 15 digits */
  function phoneOk(v) { v = String(v || '').trim(); var n = v.replace(/\D/g, '').length; return /^\+?[0-9][0-9 ]*$/.test(v) && n >= 8 && n <= 15; }
  /* an e-mail address: name@domain.tld, no spaces, no double dots, at most 160 characters */
  function emailOk(v) { v = String(v || '').trim(); return v.length <= 160 && v.indexOf('@') <= 64 && EMAIL_RE.test(v); }
  function pwStrong(v) { return typeof v === 'string' && v.length >= 8 && v.length <= 128 && /[A-Za-z]/.test(v) && /\d/.test(v); }
  /* what each field lets through while typing */
  var CLEAN = {
    name: function (v) { return v.replace(new RegExp('[^' + LETTERS + ' \'\u2019-]', 'g'), '').replace(/^[ '\u2019-]+/, '').replace(/ {2,}/g, ' ').replace(/([-'\u2019])[-'\u2019 ]+/g, '$1').slice(0, 40); },
    phone: function (v) {
      var plus = /^\s*\+/.test(v), out = '', n = 0, i, c;
      v = v.replace(/^\s*\+/, '');
      for (i = 0; i < v.length; i++) { c = v.charAt(i); if (c >= '0' && c <= '9') { if (n >= 15) break; n++; out += c; } else if (c === ' ' && out && out.charAt(out.length - 1) !== ' ') out += ' '; }
      return (plus ? '+' : '') + out;
    },
    email: function (v) { var s = v.replace(/[^A-Za-z0-9._%+@-]/g, ''), i = s.indexOf('@'); if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/@/g, ''); return s.replace(/\.{2,}/g, '.').slice(0, 160); },
    code: function (v) { return v.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12); },
    digits: function (v) { return v.replace(/\D/g, '').slice(0, 6); }
  };
  var KIND = { reqFirst: 'name', reqLast: 'name', reqRel: 'name', reqRes: 'name', regName: 'name', regRel: 'name', payName: 'name',
    reqPhone: 'phone', reqEmail: 'email', regEmail: 'email', sinEmail: 'email', pwEmail: 'email', reqCode: 'code', invCode: 'code', linkCode: 'code', sinCode: 'digits' };
  /* the check when a field is left (an empty field is checked only when sending) */
  var LEAVE = {
    name: function (v) { return nameOk(v) ? '' : T('Letters only, please (2 to 40).'); },
    phone: function (v) { return phoneOk(v) ? '' : T(ERRORS['bad-phone']); },
    email: function (v) { return emailOk(v) ? '' : T('Please check the email address (e.g. name@example.com).'); }
  };
  /* marks the field that is wrong, with the reason under it (until it is typed in again), and puts the cursor there */
  function bad(id, msg, stay) {
    var el = $(id); if (!el) return;
    el.classList.add('bad'); el.setAttribute('aria-invalid', 'true');
    var lab = el.closest ? el.closest('.field') : null;
    if (lab && msg) { var s = lab.querySelector('.err'); if (!s) { s = document.createElement('small'); s.className = 'err'; s.setAttribute('role', 'alert'); lab.appendChild(s); } s.textContent = msg; }
    if (!stay) { try { el.focus(); } catch (e) { /* hidden */ } }
  }
  function unbad(el) { el.classList.remove('bad'); el.removeAttribute('aria-invalid'); var lab = el.closest ? el.closest('.field') : null, s = lab && lab.querySelector('.err'); if (s) s.parentNode.removeChild(s); }
  function after() {
    [].forEach.call(document.querySelectorAll('input.bad'), unbad);
    if (!document.__badWatch) {
      document.__badWatch = true;
      document.addEventListener('input', function (e) {
        var el = e.target, k = el && KIND[el.id];
        if (k && typeof el.value === 'string') { var c = CLEAN[k](el.value); if (c !== el.value) el.value = c; }
        if (el && el.classList && el.classList.contains('bad')) unbad(el);
      }, true);
      document.addEventListener('focusout', function (e) {
        var el = e.target, k = el && KIND[el.id], v = el && typeof el.value === 'string' ? el.value.trim() : '';
        if (!k || !LEAVE[k] || !v || (el.id === 'reqRel' || el.id === 'regRel') && !v) return;
        var why = LEAVE[k](v); if (why) bad(el.id, why, true);
      }, true);
    }
    /* the card number in groups of 4, the expiry with its slash, the code digits only */
    var pn = $('payNum'), pe = $('payExp'), pc = $('payCvc');
    if (pn) pn.addEventListener('input', function () { var d = pn.value.replace(/\D/g, '').slice(0, 19); pn.value = d.replace(/(\d{4})(?=\d)/g, '$1 '); });
    if (pe) pe.addEventListener('input', function (ev) { var d = pe.value.replace(/\D/g, '').slice(0, 4); pe.value = d.length > 2 || (d.length === 2 && ev.inputType !== 'deleteContentBackward') ? d.slice(0, 2) + '/' + d.slice(2) : d; });
    if (pc) pc.addEventListener('input', function () { pc.value = pc.value.replace(/\D/g, '').slice(0, 4); });
    var t = $('msgText'), c = $('msgCount'), bar = $('waBar');
    if (t) {
      if (S.draft) t.value = S.draft;
      /* the chat bar: the microphone turns into the send arrow as soon as something is written; the field grows */
      var upd = function () {
        S.draft = t.value;
        if (c) c.textContent = t.value.length + ' / ' + t.maxLength;
        if (bar) bar.classList.toggle('has', !!(t.value.trim() || S.photo || S.media));
        if (bar) { t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
      };
      t.addEventListener('input', upd); upd();
    }
    var da = $('draftAudio');
    if (da) wirePlayer(app.querySelector('.wa-prev .wa-vn'), da);
    ['pickPhoto', 'pickAlbum'].forEach(function (pid) {
      var pick = $(pid);
      if (pick) pick.addEventListener('change', function () { if (pick.files && pick.files[0]) readPhoto(pick.files[0], pick.getAttribute('data-for')); });
    });
    var pv = $('pickVideo');
    if (pv) pv.addEventListener('change', function () { if (pv.files && pv.files[0]) chooseVideo(pv.files[0]); });
    var live = $('live');
    if (live && S.rec && S.rec.kind === 'video') { live.hidden = false; try { live.srcObject = S.rec.stream; quietPlay(live); } catch (e) { /* no preview */ } }
    var sel = $('resSel');
    if (sel) sel.addEventListener('change', function () { chooseResident(sel.value); });
    Array.prototype.forEach.call(app.querySelectorAll('[data-thumb]'), function (el) {
      var id = el.getAttribute('data-thumb');
      if (S.thumbs[id]) return;
      fam('GET', 'photo?id=' + encodeURIComponent(id), undefined, { blob: true })
        .then(function (b) { S.thumbs[id] = URL.createObjectURL(b); el.innerHTML = '<img src="' + S.thumbs[id] + '" alt="">'; })
        .catch(function () { /* the icon stays */ });
    });
    var ext = $('extTab');
    if (ext) {
      var tab = TABS.filter(function (x) { return x.id === S.tab; })[0];
      if (tab) { try { tab.render(ext, ctx()); } catch (e) { if (window.console) console.error(e); } }
    }
  }

  /* ---------- photo: read, turn upright (the browser does it), resize to 1600 px, JPEG ---------- */
  function readPhoto(file, target) {
    if (!/^image\//.test(file.type || 'image/')) { toast(T(ERRORS['bad-photo'])); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      var g = cv.getContext('2d');
      g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cw, ch);
      g.drawImage(img, 0, 0, cw, ch);
      URL.revokeObjectURL(url);
      var q = 0.85, data = cv.toDataURL('image/jpeg', q);
      while (data.length > 2600000 && q > 0.5) { q -= 0.1; data = cv.toDataURL('image/jpeg', q); }
      var ph = { data: data, w: cw, h: ch, url: data };
      if (target === 'album') keepAlbumFields(function () { S.aPhoto = ph; render(); });
      else keepText(function () { S.photo = ph; render(); });
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast(T(ERRORS['bad-photo'])); };
    img.src = url;
  }

  /* ---------- actions ---------- */
  function keepAlbumFields(fn) { var c = val('aCaption'), q = val('aQuestion'), d = val('aDate'); fn(); if ($('aCaption')) { $('aCaption').value = c; $('aQuestion').value = q; $('aDate').value = d; } }
  function keepText(fn) { if ($('msgText')) S.draft = $('msgText').value; fn(); }
  function val(id) { var el = $(id); return el ? String(el.value || '').trim() : ''; }
  function busy(on) { S.busy = on; Array.prototype.forEach.call(app.querySelectorAll('.btn.primary'), function (b) { b.disabled = on; }); }
  function loadMe() {
    return fam('GET', 'me').then(function (me) {
      S.me = me;
      if (me.person && me.person.lang && !get(LANGKEY)) S.lang = I18N.valid(me.person.lang);
      if (me.resident) { S.rid = me.resident.rid; put(RESKEY, S.rid); }
      else if (!S.rid && me.residents && me.residents[0]) S.rid = me.residents[0].rid;
      S.screen = me.needsConsent ? 'consent' : 'home';
      if (S.wasPending && me.resident) { S.wasPending = false; toast(T('Access to {name} approved', { name: me.resident.label })); }
      /* Never redraw over a payment form, a recording or a text being typed. */
      var typing = document.activeElement && /^(msgText|aCaption|aQuestion|aDate|songQuery|linkCode)$/.test(document.activeElement.id || '');
      if (!S.pay && !S.rec && !typing) render();
      linkPending();
      return me;
    });
  }
  function chooseResident(rid) { S.rid = rid; put(RESKEY, rid); S.thumbs = {}; S.pay = null; S.gift = null; S.inListen = false; S.listen = null; S.sent = false; S.aSent = false; loadMe().catch(function (e) { toast(errText(e)); }); follow(); }
  /* An invitation opened while signed out, for someone who already has an account: added after sign-in. */
  function linkPending() {
    var code = get(INVKEY);
    if (!code || !S.token || !S.me || S.me.needsConsent) return;
    put(INVKEY, '');
    linkCode(code);
  }
  function linkCode(code) {
    fam('POST', 'link', { code: code }).then(function (r) { toast(T('{name} is now in your account.', { name: r.label })); S.sheet = ''; chooseResident(r.rid); }, function (e) { toast(errText(e)); });
  }
  function signedIn(out) {
    S.token = out.token; put(TOKEN, out.token);
    S.me = out.me; S.email = ''; S.busy = false;
    if (out.me.resident) { S.rid = out.me.resident.rid; put(RESKEY, S.rid); }
    S.screen = out.me.needsConsent ? 'consent' : 'home';
    S.tab = 'messages'; S.mode = 'text'; S.invite = null;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* only the address bar */ }
    render(); follow(); linkPending();
  }
  function act(what, el) {
    var id = el && el.getAttribute('data-id');
    if (what === 'retry-start') { start(); return; }
    if (what === 'to-signin') { S.screen = 'signin'; S.email = ''; S.signinCode = false; render(); return; }
    if (what === 'to-code') { S.signinCode = true; S.email = ''; render(); return; }
    if (what === 'to-password') { S.signinCode = false; S.email = ''; render(); return; }
    if (what === 'pw-login') {
      var pe = val('pwEmail'), pp = $('pwPass') ? $('pwPass').value : '';
      if (!emailOk(pe)) { bad('pwEmail', T('Please check the email address (e.g. name@example.com).')); return; }
      if (!pp) { bad('pwPass'); toast(T(ERRORS['bad-login'])); return; }
      busy(true);
      fam('POST', 'login/password', { email: pe, password: pp }).then(signedIn, function (e) { busy(false); if ($('pwPass')) $('pwPass').value = ''; toast(errText(e)); });
      return;
    }
    if (what === 'set-password') {
      var cur = $('pwCur') ? $('pwCur').value : '', np = $('pwNew') ? $('pwNew').value : '', np2 = $('pwNew2') ? $('pwNew2').value : '';
      if (!pwStrong(np)) { bad('pwNew'); toast(T(ERRORS['weak-password'])); return; }
      if (np !== np2) { bad('pwNew2'); toast(T('The two passwords are not the same.')); return; }
      busy(true);
      fam('POST', 'password', { password: np, current: cur }).then(function () {
        busy(false); if (S.me && S.me.person) S.me.person.hasPassword = true; render(); toast(T('Password saved.'));
      }, function (e) { busy(false); toast(errText(e)); });
      return;
    }
    if (what === 'to-request') { S.screen = 'request'; S.reqStep = 1; S.req = {}; render(); return; }
    if (what === 'req-next') { var st = S.reqStep || 1; if (!reqStepOk(st)) return; S.reqStep = st + 1; render(); return; }
    if (what === 'req-back') { keepReq(); if ((S.reqStep || 1) > 1) { S.reqStep--; render(); } else { S.req = {}; act('to-welcome'); } return; }
    if (what === 'request-access') {
      var R = keepReq();
      if (!reqStepOk(1)) { S.reqStep = 1; render(); reqStepOk(1); return; }
      if (!reqStepOk(2)) { S.reqStep = 2; render(); reqStepOk(2); return; }
      if (!$('reqConsent').checked) { toast(T(ERRORS['consent-needed'])); return; }
      busy(true);
      fam('POST', 'request-access', { first: R.first, last: R.last, relation: R.rel || '', phone: R.phone, email: R.email, code: R.code, resident: R.res, lang: S.lang, consent: true })
        .then(function (out) { S.req = {}; signedIn(out); }, function (e) {
          busy(false);
          /* back to the step with the field the server did not accept */
          var back = { 'bad-name': ['reqFirst', 1], 'bad-phone': ['reqPhone', 1], 'bad-email': ['reqEmail', 1], 'account-exists': ['reqEmail', 1], 'bad-relation': ['reqRel', 2], 'unknown-resident': ['reqCode', 2] }[e.code];
          if (back) { S.reqStep = back[1]; render(); bad(back[0], errText(e)); return; }
          toast(errText(e));
        });
      return;
    }
    if (what === 'to-welcome') { S.screen = 'welcome'; S.invite = null; put(INVKEY, ''); render(); return; }
    if (what === 'other-email') { S.email = ''; render(); return; }
    if (what === 'invite') { checkInvite(val('invCode')); return; }
    if (what === 'register') {
      if (!nameOk(val('regName'))) { bad('regName', T('Letters only, please (2 to 40).')); return; }
      if (val('regRel').trim() && !nameOk(val('regRel'))) { bad('regRel', T('Letters only, please (2 to 40).')); return; }
      if (!emailOk(val('regEmail'))) { bad('regEmail', T('Please check the email address (e.g. name@example.com).')); return; }
      if (!$('regConsent').checked) { toast(T(ERRORS['consent-needed'])); return; }
      busy(true);
      fam('POST', 'register', { code: S.invite.code, email: val('regEmail'), name: val('regName'), relation: val('regRel'), lang: S.lang, consent: true })
        .then(signedIn, function (e) {
          busy(false);
          if (e.code === 'account-exists') { put(INVKEY, S.invite.code); S.email = ''; S.screen = 'signin'; render(); toast(T('You already have an account. Sign in: {name} will be added to it.', { name: S.invite.label })); return; }
          toast(errText(e));
        });
      return;
    }
    if (what === 'ask-code') { var email = val('sinEmail'); if (!emailOk(email)) { bad('sinEmail', T('Please check the email address (e.g. name@example.com).')); return; } busy(true); fam('POST', 'login/start', { email: email }).then(function () { S.busy = false; S.email = email; render(); }, function (e) { busy(false); toast(errText(e)); }); return; }
    if (what === 'verify') { busy(true); fam('POST', 'login/verify', { email: S.email, code: val('sinCode') }).then(signedIn, function (e) { busy(false); toast(errText(e)); }); return; }
    if (what === 'consent') {
      if (!$('firstConsent').checked) { toast(T(ERRORS['consent-needed'])); return; }
      fam('POST', 'consent', { consent: true }).then(function (me) { S.me = me; S.screen = 'home'; render(); follow(); linkPending(); }, function (e) { toast(errText(e)); });
      return;
    }
    if (what === 'logout') { fam('POST', 'logout', {}).catch(function () { /* signed out here anyway */ }).then(function () { signedOut(); render(); }); return; }
    if (what === 'theme') { put(THEMEKEY, curTheme() === 'dark' ? 'light' : 'dark'); applyTheme(); render(); return; }
    if (what === 'account') { S.sheet = S.sheet === 'account' ? '' : 'account'; render(); return; }
    if (what === 'account-close') { S.sheet = ''; render(); return; }
    if (what === 'link') { var c = val('linkCode'); if (c) linkCode(c); return; }
    if (what === 'pick') { var f = $('pickPhoto'); if (f) f.click(); return; }
    if (what === 'pick-video') { var fv = $('pickVideo'); if (fv) fv.click(); return; }
    if (what === 'rec-start') { startRec(S.mode); return; }
    if (what === 'rec-stop') { stopRec(); return; }
    if (what === 'rec-again') { if (S.media && S.media.url) URL.revokeObjectURL(S.media.url); S.media = null; keepText(function () { render(); }); return; }
    /* the chat bar */
    if (what === 'attach') { S.attach = !S.attach; keepText(function () { render(); }); return; }
    if (what === 'rec-voice') { S.attach = false; S.mode = 'voice'; startRec('voice'); return; }
    if (what === 'rec-video') { S.attach = false; S.mode = 'video'; startRec('video'); return; }
    if (what === 'rec-cancel') { if (S.rec) { S.rec.cancel = true; stopRec(); } return; }
    if (what === 'photo-del') { S.photo = null; keepText(function () { render(); }); return; }
    if (what === 'new') { S.sent = false; S.mode = 'text'; render(); return; }
    if (what === 'send') { send(); return; }
    if (what === 'playmine') {
      var vn = el.closest ? el.closest('.wa-vn') : null;
      if (vn && vn.__audio) { toggleVoice(vn); return; }
      fam('GET', 'media?id=' + encodeURIComponent(id), undefined, { blob: true }).then(function (b) {
        var u = URL.createObjectURL(b), isV = /^video/.test(b.type || '');
        /* a voice note plays in its own bubble: play / pause and the wave fills up */
        if (!isV && vn) { var a = new Audio(); a.preload = 'auto'; a.src = u; wirePlayer(vn, a); toggleVoice(vn); return; }
        var host = el.parentNode, m = document.createElement(isV ? 'video' : 'audio');
        m.controls = true; m.src = u; if (isV) m.setAttribute('playsinline', ''); m.className = isV ? 'live' : '';
        host.replaceChild(m, el); try { quietPlay(m); } catch (e) { /* tap to play */ }
      }, function (e) { toast(errText(e)); });
      return;
    }
    if (what === 'pick-album') { var fa = $('pickAlbum'); if (fa) fa.click(); return; }
    if (what === 'album-new') { S.aSent = false; S.aPhoto = null; S.aOpen = false; render(); return; }
    if (what === 'album-open') { S.aOpen = true; render(); var fo = $('pickAlbum'); if (fo) fo.click(); return; }
    if (what === 'album-close') { S.aOpen = false; S.aPhoto = null; render(); return; }
    if (what === 'album-send') { sendAlbum(); return; }
    if (what === 'album-hide' || what === 'album-show') {
      fam('POST', 'message/hide', { id: id, hidden: what === 'album-hide' }).then(function () { toast(what === 'album-hide' ? T('Hidden: {name} no longer sees it.', { name: who() }) : T('Shown again.')); return loadMe(); }, function (e) { toast(errText(e)); });
      return;
    }
    if (what === 'album-del') { fam('POST', 'message/delete', { id: id }).then(function () { toast(T('Photo deleted.')); return loadMe(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'call') { var link = S.me && S.me.account && S.me.account.callLink; if (link) window.open(link, '_blank', 'noopener'); return; }
    if (what === 'gift') { S.gift = { product: el.getAttribute('data-product'), months: 3 }; render(); follow(); return; }
    if (what === 'gift-back') { S.gift = null; render(); follow(); return; }
    if (what === 'gift-next') { S.pay = { kind: 'gift', product: S.gift.product, months: S.gift.months }; render(); return; }
    if (what === 'req-pay') {
      var rq = requests().filter(function (q) { return q.id === id; })[0];
      if (rq) { S.pay = { kind: 'request', id: rq.id, product: rq.product, months: rq.months, cents: rq.cents }; render(); follow(); }
      return;
    }
    if (what === 'req-refuse') { fam('POST', 'premium-request/refuse', { id: id }).then(function () { toast(T('All right. Nothing is switched on.')); return loadMe(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'req-stop') { fam('POST', 'premium-request/stop', { id: id }).then(function () { toast(T('Stopped. Bellatrix switches it off.')); return loadMe(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'stop-offer') { fam('POST', 'offer/stop', { id: id }).then(function () { toast(T('Stopped. Bellatrix switches it off.')); return loadMe(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'pay-back') { S.pay = null; render(); follow(); return; }
    if (what === 'pay') { pay(); return; }
    if (what === 'listen-open') { S.inListen = true; S.listen = null; render(); follow(); return; }
    if (what === 'listen-close') { S.inListen = false; render(); follow(); return; }
    if (what === 'listen-refresh') { loadListen(); return; }
    if (what === 'listen-search') { searchSongs(); return; }
    if (what === 'listen-add') {
      fam('POST', 'listen', { add: id }).then(function (l) { S.listen = Object.assign({}, S.listen, l, { open: true }); S.found = null; S.query = ''; render(); toast(T('Added. Bellatrix plays it after the current song.')); },
        function (e) { toast(errText(e)); if (e.code === 'listen-closed') loadListen(); });
      return;
    }
    if (what === 'listen-remove') { fam('POST', 'listen', { remove: id }).then(function (l) { S.listen = Object.assign({}, S.listen, l, { open: true }); render(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'ask-revoke') { S.confirmDelete = true; render(); return; }
    if (what === 'ask-data') { S.confirmData = true; render(); return; }
    if (what === 'keep') { S.confirmDelete = false; S.confirmData = false; render(); return; }
    if (what === 'data-delete') { fam('POST', 'data/delete', {}).then(function () { S.confirmData = false; S.thumbs = {}; toast(T('Your messages and photos have been deleted.')); return loadMe(); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'revoke') { fam('POST', 'consent/revoke', {}).then(function () { S.confirmDelete = false; signedOut(); render(); toast(T('Your account and your messages have been deleted.')); }, function (e) { toast(errText(e)); }); return; }
    if (what === 'install-open') { S.sheet = 'install'; S.installOnce = false; if (installWhere() === 'ios' && !S.handoff) handoffCode(); render(); return; }
    if (what === 'install-close') { S.sheet = ''; render(); return; }
    if (what === 'install-later') { S.installOnce = false; render(); return; }
    if (what === 'install-code') { handoffCode(); return; }
    if (what === 'install-copy') { copyAddress(); return; }
    if (what === 'notif-open') { if (window.PortailCalls && PortailCalls.openSheet) PortailCalls.openSheet(); return; }
    if (what === 'install' && S.installEvt) {
      var ev = S.installEvt; S.installEvt = null;
      try { ev.prompt(); } catch (e) { /* the browser refused: the menu steps are shown */ }
      if (ev.userChoice && ev.userChoice.then) ev.userChoice.then(function () { render(); }, function () { render(); }); else render();
    }
  }
  /* The card form (24 Nov, Rahma: "it accepts everything"): the name (letters), the number (13 to 19 digits that pass the
     Luhn check), the expiry (a real month, not past) and the code (3 or 4 digits) are checked here; a wrong field is
     marked and keeps its value. Only the last 4 digits ever leave the phone; the fields are emptied after paying. */
  function luhn(d) { var s = 0, alt = false, i, n; for (i = d.length - 1; i >= 0; i--) { n = +d.charAt(i); if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; }
  function cardProblem(name, digits, exp, cvc) {
    if (!/^[A-Za-z\u00C0-\u024F' .\-]{2,60}$/.test(name) || (name.match(/[A-Za-z\u00C0-\u024F]/g) || []).length < 2) return ['payName', 'Please give the name on the card.'];
    if (!/^\d{13,19}$/.test(digits) || !luhn(digits)) return ['payNum', 'Please check the card number.'];
    var m = /^(0[1-9]|1[0-2])\/?(\d{2})$/.exec(exp);
    if (!m) return ['payExp', 'Please check the expiry date (MM/YY).'];
    var now = new Date(), y = 2000 + +m[2], mo = +m[1];
    if (y < now.getFullYear() || (y === now.getFullYear() && mo < now.getMonth() + 1)) return ['payExp', 'This card has expired.'];
    if (y > now.getFullYear() + 20) return ['payExp', 'Please check the expiry date (MM/YY).'];
    if (!/^\d{3,4}$/.test(cvc)) return ['payCvc', 'Please check the security code (3 or 4 digits).'];
    return null;
  }
  function pay() {
    var name = $('payName'), num = $('payNum'), exp = $('payExp'), cvc = $('payCvc');
    var digits = String(num ? num.value : '').replace(/[\s-]/g, ''), last4 = digits.slice(-4);
    var problem = cardProblem(String(name ? name.value : '').trim(), digits, String(exp ? exp.value : '').trim(), String(cvc ? cvc.value : '').trim());
    if (problem) { bad(problem[0]); toast(T(problem[1])); digits = ''; last4 = ''; return; }
    [name, num, exp, cvc].forEach(function (x) { if (x) x.value = ''; });
    digits = '';
    var p = S.pay;
    S.busy = true; render();
    var call = p.kind === 'request' ? fam('POST', 'premium-request/pay', { id: p.id, last4: last4 }) : fam('POST', 'offer', { product: p.product, months: p.months });
    last4 = '';
    call.then(function () {
      S.busy = false; S.pay = null; S.gift = null;
      toast(p.kind === 'request' ? T('Paid. Bellatrix switches it on for {name} in a moment.', { name: who() }) : T('Thank you! The care team will switch it on for {name}.', { name: who() }));
      return loadMe().then(follow);
    }, function (e) { S.busy = false; S.pay = null; render(); toast(errText(e)); loadMe().catch(function () {}); });
  }
  function searchSongs() {
    S.query = val('songQuery');
    fam('GET', 'listen/search?q=' + encodeURIComponent(S.query)).then(function (r) { S.found = r.items || []; render(); var i = $('songQuery'); if (i) i.focus(); }, function (e) { toast(errText(e)); });
  }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /* a real day from 1900 to today (the date field of the album) */
  function dateOk(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || '')); if (!m) return false;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] && +m[1] >= 1900 && v <= todayIso();
  }
  function sendAlbum() {
    var caption = val('aCaption'), question = val('aQuestion'), date = val('aDate');
    if (!S.aPhoto) { toast(T(ERRORS.empty)); return; }
    if (date && !dateOk(date)) { bad('aDate'); toast(T(ERRORS['bad-date'])); return; }
    var di = $('aDate'); if (di && di.validity && di.validity.badInput) { bad('aDate'); toast(T(ERRORS['bad-date'])); return; }
    if (/(https?:\/\/|www\.)/i.test(caption + ' ' + question + ' ' + date)) { toast(T(ERRORS['no-links'])); return; }
    S.busy = true; render();
    fam('POST', 'message', { text: caption, photo: S.aPhoto.data, album: { theme: S.aTheme, question: question, date: date } }).then(function (out) {
      S.busy = false; S.aSent = true; S.aPhoto = null;
      if (S.me) S.me.messages.unshift(out.message);
      render();
    }, function (e) { S.busy = false; render(); if ($('aCaption')) { $('aCaption').value = caption; $('aQuestion').value = question; $('aDate').value = date; } toast(errText(e)); });
  }
  function checkInvite(code) {
    if (!code) { toast(T(ERRORS['unknown-invite'])); return; }
    /* Already signed in: this resident is added to the account. */
    if (S.token && S.me && !S.me.needsConsent) { linkCode(code); return; }
    S.screen = 'loading'; render();
    fam('POST', 'invite', { code: code }).then(function (r) {
      S.invite = { code: code, label: r.label };
      if (!get(LANGKEY) && r.lang) S.lang = I18N.valid(r.lang);
      S.screen = 'invite'; render();
    }, function (e) { S.screen = 'welcome'; render(); toast(errText(e)); });
  }

  /* While a tab follows the robot it refreshes by itself: statuses (BF-14) every 15 s, Premium every
     10 s, listen together every 5 s. */
  var timers = [];
  function follow() {
    timers.forEach(clearInterval); timers = [];
    if (S.screen !== 'home' || !S.token) return;
    var vis = function () { return document.visibilityState !== 'hidden'; };
    if (S.inListen) { loadListen(); timers.push(setInterval(function () { if (vis()) loadListen(); }, 5000)); return; }
    var ms = S.me && !S.me.resident && S.wasPending ? 8000 : S.tab === 'premium' ? 10000 : (S.tab === 'messages' || S.tab === 'album') ? 15000 : 0;
    if (ms) timers.push(setInterval(function () { if (vis() && !S.pay && !S.gift && !S.rec && !S.sheet) loadMe().catch(function () { /* next time */ }); }, ms));
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-lang')) { setLang(b.getAttribute('data-lang')); return; }
    if (b.hasAttribute('data-tab')) {
      S.tab = b.getAttribute('data-tab'); S.pay = null; S.gift = null; S.inListen = false; S.confirmDelete = false; S.confirmData = false; S.sent = false; S.aSent = false; S.sheet = '';
      if (S.rec) stopRec();
      render();
      if (S.tab === 'premium' || S.tab === 'messages' || S.tab === 'album') loadMe().catch(function () { /* shown as it was */ });
      follow();
      return;
    }
    if (b.hasAttribute('data-mode')) { if (S.rec) return; S.mode = b.getAttribute('data-mode'); keepText(function () { render(); }); if (S.mode === 'photo' && !S.photo) { var f = $('pickPhoto'); if (f) f.click(); } return; }
    if (b.hasAttribute('data-theme')) { S.aTheme = b.getAttribute('data-theme'); keepAlbumFields(function () { render(); }); return; }
    if (b.hasAttribute('data-months')) { if (S.gift) S.gift.months = Number(b.getAttribute('data-months')); render(); return; }
    if (b.hasAttribute('data-del')) { fam('POST', 'message/delete', { id: b.getAttribute('data-del') }).then(function () { toast(T('Message removed.')); return loadMe(); }, function (err) { toast(errText(err)); }); return; }
    if (b.hasAttribute('data-do')) act(b.getAttribute('data-do'), b);
  });
  app.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target || e.target.tagName !== 'INPUT') return;
    var id = e.target.id;
    if (/^req/.test(id)) { e.preventDefault(); act((S.reqStep || 1) < 3 ? 'req-next' : 'request-access'); }
    else if (id === 'invCode') act('invite');
    else if (id === 'sinEmail') act('ask-code');
    else if (id === 'sinCode') act('verify');
    else if (id === 'linkCode') act('link');
    else if (id === 'songQuery') { e.preventDefault(); searchSongs(); }
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; if (S.sheet === 'account' || S.sheet === 'install') render(); });
  window.addEventListener('appinstalled', function () { S.installEvt = null; if (S.sheet === 'install') { S.sheet = ''; render(); } });

  /* ---------- start ---------- */
  function start() {
    var m = /[#&]i=([A-Za-z0-9-]{8,12})/.exec(location.hash || '');
    if (m) { if (S.token) put(INVKEY, m[1]); else { checkInvite(m[1]); return; } }
    if (S.token) {
      S.screen = 'loading'; render();
      var gone = setTimeout(function () { if (S.screen === 'loading') { S.screen = 'unreachable'; render(); } }, 8000);
      loadMe().then(function (x) { clearTimeout(gone); follow(x); }, function (e) {
        clearTimeout(gone);
        if (!S.token) { S.screen = 'welcome'; render(); return; }
        if (e.status !== 401 && (!e.status || e.status >= 500)) { S.screen = 'unreachable'; render(); return; }
        if (e.status !== 401) toast(errText(e));
      });
      return;
    }
    S.screen = 'welcome'; render();
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw-portail.js', { scope: 'portail.html' }).catch(function () { /* works without it */ }); });
  }
  window.addEventListener('hashchange', function () { if (/[#&]i=/.test(location.hash)) start(); });
  /* For the other portal modules (js/portail-feed.js, js/portail-calls.js). */
  window.Portail = { addTab: addTab, api: function (path, opts) { opts = opts || {}; return api(opts.method || (opts.body !== undefined ? 'POST' : 'GET'), path, opts.body, opts); },
    ctx: ctx, t: T, esc: esc, toast: toast, refresh: loadMe, render: render, icons: ICON, state: S,
    openInstall: function () { act('install-open'); } };
  window.BellatrixPortal = { state: S, render: render, loadMe: loadMe, loadListen: loadListen };
  start();
})();
