/* "Ajouter un jeu" in three languages: the head (js/games-staff.js), the patient screen (js/games.js) and
   the import page on the carer's phone or PC (jeu.html, js/jeu.js). English is the key, like everywhere
   else; a text another file already translates keeps that translation. ES5. */
(function () {
  'use strict';
  function addNew(l, table) {
    var have = I18N.dict[l] || {}, out = {};
    Object.keys(table).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = table[k]; });
    I18N.add(l, out);
  }
  addNew('fr', {
    /* the head */
    'Add a game': 'Ajouter un jeu', 'Scan with your phone, or open the address on your computer.': 'Scannez avec votre téléphone, ou ouvrez l’adresse sur votre ordinateur.',
    'Code': 'Code', 'Received: {name}': 'Reçu : {name}', 'Try': 'Essayer', 'Update': 'Mettre à jour', 'Remove': 'Retirer', 'Yes, remove': 'Oui, retirer',
    'Team games': 'Jeux de l’équipe', 'New': 'Nouveau', 'Updated.': 'Mis à jour.', 'Removed.': 'Retiré.', 'Updating…': 'Mise à jour…', 'For: {who}': 'Pour : {who}',
    'A game made by the care team.': 'Un jeu créé par l’équipe soignante.', 'The server does not answer.': 'Le serveur ne répond pas.',
    'This screen cannot add games: open it on the robot.': 'Cet écran ne peut pas ajouter de jeux : ouvrez-le sur le robot.',
    'This game was sent as a file: send the new file from the phone.': 'Ce jeu a été envoyé comme fichier : envoyez le nouveau fichier depuis le téléphone.',
    'Back': 'Retour', 'Close': 'Fermer', 'Finish': 'Terminer', 'Atelier': 'Atelier',
    /* the import page */
    'Add a game to the robot': 'Ajouter un jeu au robot', 'Code shown on the robot': 'Code affiché sur le robot', 'Your project': 'Votre projet',
    'Link to GitHub, GitLab or a .zip file': 'Lien GitHub, GitLab ou fichier .zip', 'or': 'ou', 'Choose a file (.zip or .html)': 'Choisir un fichier (.zip ou .html)',
    'The game': 'Le jeu', 'Name': 'Nom', 'For whom (optional)': 'Pour qui (facultatif)', 'Language of the game': 'Langue du jeu', 'Send': 'Envoyer',
    'Downloading': 'Téléchargement', 'Sending': 'Envoi', 'Checking': 'Vérification', 'Installing': 'Installation', 'Ready': 'Prêt',
    '{name} is on the robot.': '« {name} » est sur le robot.',
    'You find it on the robot under Team games. Tap Try before a resident plays.': 'Il est sur le robot, dans « Jeux de l’équipe ». Touchez « Essayer » avant de jouer avec un résident.',
    'Add another game': 'Ajouter un autre jeu', 'Try again': 'Réessayer', 'Paste a link or choose a file.': 'Collez un lien ou choisissez un fichier.',
    'Give the game a name.': 'Donnez un nom au jeu.', 'Type the code shown on the robot.': 'Tapez le code affiché sur le robot.', 'Remove the file': 'Retirer le fichier',
    /* what went wrong, in plain words */
    'This code is not right. Look at the code under the QR code on the robot.': 'Ce code ne convient pas. Regardez le code sous le QR code, sur le robot.',
    'Too many tries. Try again in 10 minutes.': 'Trop d’essais. Réessayez dans 10 minutes.',
    'We do not recognise this link. Paste the address of the GitHub or GitLab project, or a link to a .zip file.': 'Nous ne reconnaissons pas ce lien. Collez l’adresse du projet GitHub ou GitLab, ou un lien vers un fichier .zip.',
    'This link points to a device of the local network. Use an internet link, or send the file.': 'Ce lien pointe vers un appareil du réseau local. Utilisez un lien internet, ou envoyez le fichier.',
    'We did not find this project (tried: {detail}). Check the link, and that the project is public.': 'Nous n’avons pas trouvé ce projet (essayé : {detail}). Vérifiez le lien, et que le projet est public.',
    'The download did not work. Check the link and try again.': 'Le téléchargement n’a pas marché. Vérifiez le lien et réessayez.',
    'The download took too long. Try again, or send the .zip file.': 'Le téléchargement a pris trop de temps. Réessayez, ou envoyez le fichier .zip.',
    'The project is too big (more than {detail} MB).': 'Le projet est trop gros (plus de {detail} Mo).',
    'This link opens a web page, not a project. Paste the link of the GitHub or GitLab repository, or of a .zip file.': 'Ce lien ouvre une page web, pas un projet. Collez le lien du dépôt GitHub ou GitLab, ou d’un fichier .zip.',
    'We cannot open this .zip file. Make it again, without a password.': 'Nous n’arrivons pas à ouvrir ce fichier .zip. Créez-le à nouveau, sans mot de passe.',
    'This .zip file contains dangerous paths ({detail}). It was refused.': 'Ce fichier .zip contient des chemins dangereux ({detail}). Il a été refusé.',
    'This .zip file is not normal: it becomes far too big once opened. It was refused.': 'Ce fichier .zip est anormal : il devient beaucoup trop gros une fois ouvert. Il a été refusé.',
    'We did not find an index.html in your project (found: {detail}). The game must start with an index.html file.': 'Nous n’avons pas trouvé de fichier index.html dans votre projet (trouvé : {detail}). Le jeu doit commencer par un fichier index.html.',
    'This project must be built first ({detail}). Ask your assistant for a version in plain HTML, CSS and JavaScript, or add the built dist folder to the project.': 'Ce projet doit d’abord être construit ({detail}). Demandez à votre assistant une version en HTML, CSS et JavaScript simples, ou ajoutez le dossier dist construit au projet.',
    'The project has too many files (more than {detail}).': 'Le projet contient trop de fichiers (plus de {detail}).',
    'The robot already has {detail} games. Remove one on the robot first.': 'Le robot a déjà {detail} jeux. Retirez-en un sur le robot d’abord.',
    'This file is neither a .zip nor an .html page.': 'Ce fichier n’est ni un .zip ni une page .html.',
    'The robot does not answer. Check that the phone is on the same Wi-Fi as the robot.': 'Le robot ne répond pas. Vérifiez que le téléphone est sur le même Wi-Fi que le robot.',
    'Something went wrong on the robot. Try again.': 'Un problème est survenu sur le robot. Réessayez.',
    'Note: the game loads files from the internet ({detail}). They are blocked on the robot, so the game may look wrong.': 'Attention : le jeu charge des fichiers depuis internet ({detail}). Ils sont bloqués sur le robot ; le jeu peut mal s’afficher.'
  });
  addNew('de', {
    'Add a game': 'Spiel hinzufügen', 'Scan with your phone, or open the address on your computer.': 'Mit dem Handy scannen oder die Adresse am Computer öffnen.',
    'Code': 'Code', 'Received: {name}': 'Angekommen: {name}', 'Try': 'Ausprobieren', 'Update': 'Aktualisieren', 'Remove': 'Entfernen', 'Yes, remove': 'Ja, entfernen',
    'Team games': 'Spiele des Teams', 'New': 'Neu', 'Updated.': 'Aktualisiert.', 'Removed.': 'Entfernt.', 'Updating…': 'Wird aktualisiert …', 'For: {who}': 'Für: {who}',
    'A game made by the care team.': 'Ein Spiel, das das Pflegeteam erstellt hat.', 'The server does not answer.': 'Der Server antwortet nicht.',
    'This screen cannot add games: open it on the robot.': 'Dieser Bildschirm kann keine Spiele hinzufügen: Öffnen Sie ihn auf dem Roboter.',
    'This game was sent as a file: send the new file from the phone.': 'Dieses Spiel wurde als Datei gesendet: Senden Sie die neue Datei vom Handy.',
    'Back': 'Zurück', 'Close': 'Schließen', 'Finish': 'Fertig', 'Atelier': 'Atelier',
    'Add a game to the robot': 'Ein Spiel zum Roboter hinzufügen', 'Code shown on the robot': 'Code auf dem Roboter', 'Your project': 'Ihr Projekt',
    'Link to GitHub, GitLab or a .zip file': 'Link zu GitHub, GitLab oder einer .zip-Datei', 'or': 'oder', 'Choose a file (.zip or .html)': 'Datei wählen (.zip oder .html)',
    'The game': 'Das Spiel', 'Name': 'Name', 'For whom (optional)': 'Für wen (optional)', 'Language of the game': 'Sprache des Spiels', 'Send': 'Senden',
    'Downloading': 'Herunterladen', 'Sending': 'Hochladen', 'Checking': 'Prüfung', 'Installing': 'Installation', 'Ready': 'Bereit',
    '{name} is on the robot.': '„{name}“ ist auf dem Roboter.',
    'You find it on the robot under Team games. Tap Try before a resident plays.': 'Sie finden es auf dem Roboter unter „Spiele des Teams“. Tippen Sie auf „Ausprobieren“, bevor ein Bewohner spielt.',
    'Add another game': 'Weiteres Spiel hinzufügen', 'Try again': 'Erneut versuchen', 'Paste a link or choose a file.': 'Fügen Sie einen Link ein oder wählen Sie eine Datei.',
    'Give the game a name.': 'Geben Sie dem Spiel einen Namen.', 'Type the code shown on the robot.': 'Geben Sie den Code vom Roboter ein.', 'Remove the file': 'Datei entfernen',
    'This code is not right. Look at the code under the QR code on the robot.': 'Dieser Code stimmt nicht. Sehen Sie sich den Code unter dem QR-Code auf dem Roboter an.',
    'Too many tries. Try again in 10 minutes.': 'Zu viele Versuche. Versuchen Sie es in 10 Minuten erneut.',
    'We do not recognise this link. Paste the address of the GitHub or GitLab project, or a link to a .zip file.': 'Diesen Link kennen wir nicht. Fügen Sie die Adresse des GitHub- oder GitLab-Projekts ein, oder einen Link zu einer .zip-Datei.',
    'This link points to a device of the local network. Use an internet link, or send the file.': 'Dieser Link zeigt auf ein Gerät im lokalen Netz. Nehmen Sie einen Internet-Link oder senden Sie die Datei.',
    'We did not find this project (tried: {detail}). Check the link, and that the project is public.': 'Wir haben dieses Projekt nicht gefunden (versucht: {detail}). Prüfen Sie den Link und ob das Projekt öffentlich ist.',
    'The download did not work. Check the link and try again.': 'Das Herunterladen hat nicht geklappt. Prüfen Sie den Link und versuchen Sie es erneut.',
    'The download took too long. Try again, or send the .zip file.': 'Das Herunterladen hat zu lange gedauert. Versuchen Sie es erneut oder senden Sie die .zip-Datei.',
    'The project is too big (more than {detail} MB).': 'Das Projekt ist zu groß (mehr als {detail} MB).',
    'This link opens a web page, not a project. Paste the link of the GitHub or GitLab repository, or of a .zip file.': 'Dieser Link öffnet eine Webseite, kein Projekt. Fügen Sie den Link des GitHub- oder GitLab-Repositorys oder einer .zip-Datei ein.',
    'We cannot open this .zip file. Make it again, without a password.': 'Wir können diese .zip-Datei nicht öffnen. Erstellen Sie sie neu, ohne Passwort.',
    'This .zip file contains dangerous paths ({detail}). It was refused.': 'Diese .zip-Datei enthält gefährliche Pfade ({detail}). Sie wurde abgelehnt.',
    'This .zip file is not normal: it becomes far too big once opened. It was refused.': 'Diese .zip-Datei ist ungewöhnlich: Entpackt wird sie viel zu groß. Sie wurde abgelehnt.',
    'We did not find an index.html in your project (found: {detail}). The game must start with an index.html file.': 'Wir haben in Ihrem Projekt keine index.html gefunden (gefunden: {detail}). Das Spiel muss mit einer index.html-Datei beginnen.',
    'This project must be built first ({detail}). Ask your assistant for a version in plain HTML, CSS and JavaScript, or add the built dist folder to the project.': 'Dieses Projekt muss zuerst gebaut werden ({detail}). Bitten Sie Ihren Assistenten um eine Version in einfachem HTML, CSS und JavaScript, oder fügen Sie den gebauten Ordner dist zum Projekt hinzu.',
    'The project has too many files (more than {detail}).': 'Das Projekt hat zu viele Dateien (mehr als {detail}).',
    'The robot already has {detail} games. Remove one on the robot first.': 'Der Roboter hat schon {detail} Spiele. Entfernen Sie zuerst eines auf dem Roboter.',
    'This file is neither a .zip nor an .html page.': 'Diese Datei ist weder eine .zip-Datei noch eine .html-Seite.',
    'The robot does not answer. Check that the phone is on the same Wi-Fi as the robot.': 'Der Roboter antwortet nicht. Prüfen Sie, ob das Handy im selben WLAN ist wie der Roboter.',
    'Something went wrong on the robot. Try again.': 'Auf dem Roboter ist etwas schiefgelaufen. Versuchen Sie es erneut.',
    'Note: the game loads files from the internet ({detail}). They are blocked on the robot, so the game may look wrong.': 'Hinweis: Das Spiel lädt Dateien aus dem Internet ({detail}). Auf dem Roboter sind sie gesperrt, das Spiel kann falsch aussehen.'
  });
})();
/* The error codes of labland/games.mjs -> the sentence to show (English key). */
var GAME_ERRORS = {
  'bad-code': 'This code is not right. Look at the code under the QR code on the robot.',
  'slow-down': 'Too many tries. Try again in 10 minutes.',
  'bad-link': 'We do not recognise this link. Paste the address of the GitHub or GitLab project, or a link to a .zip file.',
  'local-link': 'This link points to a device of the local network. Use an internet link, or send the file.',
  'not-found': 'We did not find this project (tried: {detail}). Check the link, and that the project is public.',
  'download-failed': 'The download did not work. Check the link and try again.',
  'timeout': 'The download took too long. Try again, or send the .zip file.',
  'too-big': 'The project is too big (more than {detail} MB).',
  'web-page': 'This link opens a web page, not a project. Paste the link of the GitHub or GitLab repository, or of a .zip file.',
  'bad-zip': 'We cannot open this .zip file. Make it again, without a password.',
  'unsafe-zip': 'This .zip file contains dangerous paths ({detail}). It was refused.',
  'zip-bomb': 'This .zip file is not normal: it becomes far too big once opened. It was refused.',
  'no-index': 'We did not find an index.html in your project (found: {detail}). The game must start with an index.html file.',
  'needs-build': 'This project must be built first ({detail}). Ask your assistant for a version in plain HTML, CSS and JavaScript, or add the built dist folder to the project.',
  'too-many-files': 'The project has too many files (more than {detail}).',
  'full': 'The robot already has {detail} games. Remove one on the robot first.',
  'not-a-game': 'This file is neither a .zip nor an .html page.',
  'no-source': 'This game was sent as a file: send the new file from the phone.',
  'not-the-head': 'This screen cannot add games: open it on the robot.',
  'offline': 'The robot does not answer. Check that the phone is on the same Wi-Fi as the robot.',
  'server': 'Something went wrong on the robot. Try again.',
  'internet': 'Note: the game loads files from the internet ({detail}). They are blocked on the robot, so the game may look wrong.'
};
if (typeof window !== 'undefined') window.GAME_ERRORS = GAME_ERRORS;
