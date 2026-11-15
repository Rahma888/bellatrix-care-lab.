# Tester Bellatrix avec un vrai téléphone (version 1.16)

Tu fais ce test seule. Il dure environ 45 minutes. Il faut le PC, le robot et ton téléphone (iPhone ou Android).

**Avant de commencer**
- Le PC et le robot sont sur **le même Wi-Fi**. Le téléphone peut être en Wi-Fi ou en 4G.
- Utilise seulement des **données de test** : un prénom inventé, un e-mail de test (par exemple `famille.test@exemple.fr`) et des photos **sans personne** (un paysage, un objet).
- **Pourquoi une adresse https ?** Le téléphone n'autorise la caméra, le micro et l'installation du portail que sur une adresse **https**. Le tunnel gratuit Cloudflare donne cette adresse au PC pour la durée du test.
- **Paiement :** le vrai prix s'affiche, mais le paiement est **un test** : rien n'est débité. N'entre jamais une vraie carte.

---

## 1. Démarrer, sur le PC
- Le PC a besoin d'**Internet** pendant tout le test (le tunnel, et le service de notifications d'Apple pour l'iPhone).
- **Garde le même tunnel pendant tout le test.** Le tunnel gratuit reçoit une **nouvelle adresse à chaque démarrage**, et l'app de l'écran d'accueil de l'iPhone est liée à cette adresse. Après un redémarrage du tunnel : recolle l'adresse sur le robot (étape 2.1), ajoute de nouveau l'app à l'écran d'accueil, et réactive les notifications.

1. Double-clique **`Start robot test server.bat`**. Si Windows le demande, autorise Node.js sur les **réseaux privés**. Laisse la fenêtre ouverte.
   - **Pour tester vite un appel manqué** (étape 10) : au lieu du double-clic, ouvre PowerShell dans le dossier de Bellatrix et tape :
     ```
     $env:FAMILY_CALL_WAIT_MIN = "2"; node labland\store-server.mjs 8765 --lan
     ```
     Une invitation d'appel que personne ne rejoint finit alors après 2 minutes.
2. Double-clique **`Start phone test.bat`**. Après quelques secondes, il affiche dans un cadre :
   - l'**adresse HTTPS du test** `https://….trycloudflare.com` ;
   - l'endroit où la coller sur le robot ;
   - l'adresse du portail `https://….trycloudflare.com/portail.html`.

## 2. Régler le robot
- **Le robot doit avoir l'app 1.16 du jour.** L'app construite le 10 novembre à 11 h 36 ne connaît pas encore ce portail (messages sans validation, « Message pour … »). Robot allumé sur le même Wi-Fi : double-clique **`Install on robot.bat`**. Il reconstruit l'app avec les fichiers actuels, puis l'installe.
- **Sans le robot :** sur le PC, ouvre dans Chrome `http://localhost:8765/staff.html` (Care Team) et `http://localhost:8765/patient.html` (écran patient). Fais quand même l'étape 2.1 : les QR codes pointent alors vers l'adresse du tunnel.

1. Care Team → **Famille** → **Appels** → **Réglages** (en bas) → **Adresse du serveur d'appel**. Colle l'adresse `https://….trycloudflare.com` (sans `/portail.html`), puis touche **Enregistrer**.
   Messages, album, Premium et appels du robot passent alors par cette adresse.
2. Choisis le patient **P1** dans Activités. Puis Care Team → **Famille** → **Comptes**. Entre le prénom que la famille utilise (par exemple « Marie »).
3. **Consentement de Marie** : choisis **Tout (messages, album, appels, activité et résumés)**, « Donné par : le résident », puis **Enregistrer le consentement**.
4. Touche **Nouvelle invitation (QR code)**.

## 3. Le portail sur le téléphone
1. Scanne le QR code avec l'appareil photo du téléphone. Sinon, ouvre l'adresse du portail et touche **J'ai un code d'invitation**.
2. Entre un prénom et l'e-mail de test. Lis la courte information, coche le **consentement RGPD**, puis touche **Créer mon compte**.
3. Installer le portail (facultatif) :
   - **iPhone (Safari)** : **Partager** → **Sur l'écran d'accueil**. Le portail le rappelle une fois en haut de la page (« Installer le portail… » → **OK**).
   - **Android (Chrome)** : menu ⋮ → **Installer l'application**.
- [ ] Le compte est refusé tant que le consentement n'est pas coché.
- [ ] En haut, **FR · DE · EN** change toute la page tout de suite.
- [ ] Installé sur iPhone : l'icône Bellatrix est sur l'écran d'accueil et le portail s'ouvre sans barre Safari.
4. **Notifications** : ouvre le portail **depuis l'icône de l'écran d'accueil**, puis touche **Activer** (cloche en haut). Sur iPhone, cela ne marche que depuis l'app de l'écran d'accueil, avec **iOS 16.4 ou plus récent**. Sans notifications, la cloche du portail montre quand même les nouveautés.

## 4. Messages (ils arrivent directement sur le robot, sans validation)
Sur le téléphone, onglet **Messages** : **Texte · Photo · Voix · Vidéo**.
1. **Texte** : écris un mot → **Envoyer**.
2. **Photo** : **Choisir une photo** → **Envoyer**. Sur iPhone, une photo HEIC marche : le portail la convertit en JPEG (1600 px au plus).
3. **Voix** : **Enregistrer** → parle quelques secondes → **Arrêter** → écoute → **Envoyer** (60 s au plus).
4. **Vidéo** : **Filmer** → **Arrêter** → **Envoyer** (30 s au plus). Filme **dans le portail** : c'est le format que le robot lit.
   - **Choisir une vidéo** de la galerie de l'iPhone : si elle est au format iPhone (HEVC), le portail affiche une ligne « …au format iPhone (HEVC)… Filmez-la ici avec « Filmer » » et ne l'envoie pas. C'est normal.
5. Sur le robot : Care Team → **Famille** → **Messages**. Pour chaque envoi : **Message pour Marie (P1)**, le type (texte, photo, message vocal, vidéo), « de Sophie, aujourd'hui à … ».
6. Approche le robot de Marie, puis touche **Le robot est auprès de Marie** sur un message. L'écran patient s'ouvre : « Vous avez un message de Sophie… » → **Oui**. Bellatrix dit qui l'envoie, puis montre le texte ou la photo, ou joue le message vocal ou la vidéo. **Réécouter** rejoue.
   - Le robot ne se déplace pas seul : la navigation n'est pas encore branchée. Le déplacement demandé est noté sous « Déplacements demandés ».
7. **Masquer** : sur un autre message, touche **Masquer** → **Oui, masquer**. Il disparaît du robot.
- [ ] Sur le téléphone, chaque message passe **Envoyé → Reçu → Lu** (le point orange est sur l'étape actuelle). Le message masqué affiche « Retiré par l'équipe ».
- [ ] Le message vocal d'un iPhone (audio AAC/mp4) et la vidéo filmée sur iPhone **se jouent sur le robot**.

## 5. Album
1. Sur le téléphone, onglet **Album** : **Choisir une photo**, une **Légende courte**, une **Date (facultatif)** (par exemple « juin 1978 ») et un thème → **Ajouter à l'album**.
2. Sur le robot : l'album de P1 montre la photo avec sa légende et sa date.
3. Sur le téléphone, sous **Mes photos dans l'album** : **Masquer**, puis plus tard **Supprimer**.
- [ ] Masquée ou supprimée, la photo **disparaît aussi de l'album du robot** (au plus tard à la synchronisation suivante, environ 1 minute).

## 6. Accès de la famille
1. **Un deuxième proche, créé par l'équipe :** Famille → **Comptes** → **Créer un compte pour un membre de la famille** (ex. Paul, `paul.test@exemple.fr`). Un **code de connexion** s'affiche (15 minutes). Sur un deuxième téléphone ou une fenêtre privée : portail → **Me connecter** → e-mail → **Recevoir un code** → tape ce code.
2. **Deux résidents :** choisis **P2** dans Activités, puis Famille → **Comptes** → **Nouvelle invitation (QR code)**. Sur le téléphone : **Mon compte** (icône en haut à droite) → **Ajouter un résident** → tape le code. En haut, un menu permet de passer de Marie à P2.
3. **Suspendre :** dans Famille → **Comptes**, sur la ligne de Sophie, touche **Suspendre**.
- [ ] Le téléphone affiche « Votre accès à Marie est suspendu par l'équipe soignante. » Rien n'est supprimé.
- [ ] **Valider** rend l'accès tout de suite. **Retirer l'accès** l'enlève, sans effacer les données.
- [ ] Le téléphone ne voit que **ses** résidents : jamais les messages d'un autre résident ni ceux d'un autre proche.

## 7. Consentement (enregistré par l'équipe, la famille le voit seulement)
1. Famille → **Comptes** → **Consentement de Marie** → **Messages et album seulement** → **Enregistrer le consentement**.
2. Sur le téléphone, recharge la page.
- [ ] Les onglets **Suivi** et **Écouter ensemble** disparaissent tout de suite. Messages, Album, Appels et Premium restent.
- [ ] **Mon compte** → **Ce que vous voyez** affiche le niveau, sans bouton pour le changer.
3. Remets **Tout** pour la suite du test.

## 8. Premium : la demande de paiement (paiement test, rien n'est débité)
1. Sur le robot : Care Team → **Bibliothèque** → Premium : choisis P1, **Bellatrix Play Premium**, **3 mois** → **Autoriser**. La demande part vers la famille.
2. Sur le téléphone, onglet **Premium** : « L'équipe propose Bellatrix Play Premium pour Marie », **3 mois · 32,97 €** et la ligne « Paiement test : rien n'est débité. ».
3. Touche **Payer**. Remplis le formulaire **simulé** avec :
   - le numéro `4242 4242 4242 4242` ;
   - l'expiration `12/28` ;
   - le cryptogramme `123`.

   Touche ensuite **Payer (démo)**. Aucune donnée de carte n'est gardée.
4. Le téléphone affiche « Payé · Bellatrix l'active ». En moins d'une minute, le robot active tout seul le Premium de P1, pour ce produit seulement. Puis « Actif jusqu'au … ».
5. Sur le téléphone de **Paul** (autre proche de Marie), onglet **Premium**.
- [ ] Paul voit **« Payé / Actif »**, **sans le nom** de Sophie et **sans bouton Payer**.
- [ ] Seule Sophie voit « Payé par vous » et la ligne dans **Mes paiements**.
- [ ] N'importe quel proche lié peut payer une demande ouverte (refais l'étape 1 avec **Livres Premium** et paie depuis le téléphone de Paul).
- [ ] Play et Livres restent séparés. Le Premium reste celui de Marie quand on passe à P2 puis qu'on revient.
6. **Refuser** : refais l'étape 1, puis touche **Refuser**. Les deux côtés affichent « Refusé ».
7. **Cadeau de la famille :** onglet **Premium** → **Livres Premium** → **Offrir** → **1 mois** (10,99 €) → formulaire → **Payer (démo)**. Sur le robot, « La famille de P1 a offert Premium » apparaît : touche **Activer**.

## 9. Écouter ensemble (seulement si Play Premium est actif et le consentement est « Tout »)
1. Sur le robot : lance Play pour P1 et ouvre **Écouter ensemble**.
2. Sur le téléphone : **Premium** → **Écouter ensemble** montre la chanson en cours. Cherche une chanson, puis touche **Ajouter**.
- [ ] Le robot joue la chanson ajoutée après la chanson en cours.

## 10. Appels dans les deux sens
1. Sur le robot : Famille → **Appels** → ajoute un contact (par exemple Sophie) et coche **Accepter les appels maintenant**.
2. Dans Famille → **Comptes**, ligne de Sophie → **Lien d'appel vidéo** : choisis ce contact. Le portail affiche alors **Appel vidéo avec Marie**. Si l'adresse du tunnel a changé, choisis-le de nouveau.
3. **La famille appelle :** sur le téléphone, touche **Appel vidéo avec Marie**, puis **Appeler**. Le robot sonne : touche **Répondre**.
4. **L'équipe appelle :** sur le robot, touche **Appeler Sophie**. Scanne le QR code ou envoie le lien, puis touche **Rejoindre** sur le téléphone.
- [ ] Le son et la vidéo passent dans les deux sens, sans écho, et on peut raccrocher des deux côtés.
- [ ] **iPhone :** Safari ne joue le son qu'après un geste. Si le bouton **Toucher pour activer le son** apparaît sur l'image, touche-le une fois.
- [ ] **Appel manqué** (serveur lancé avec `FAMILY_CALL_WAIT_MIN = "2"`, étape 1) : l'équipe appelle et personne ne rejoint. Après 2 minutes, l'appel est noté comme manqué des deux côtés.

## 11. Arrêter
- Ferme la fenêtre du **tunnel**. Son adresse est publique tant qu'il tourne. Ferme aussi la fenêtre du serveur.
- Pour effacer les données de test : Care Team → Famille → **Comptes** → **Effacer toutes les données famille de P1** (et de P2).
- L'adresse du tunnel **change à chaque démarrage**. Au test suivant, recolle-la sur le robot (étape 2.1). Les comptes restent, et les codes d'invitation encore valables marchent avec la nouvelle adresse.

---

## iPhone : ce qui est différent
- **Installer :** seulement depuis **Safari** : Partager → Sur l'écran d'accueil (pas de bouton « Installer »).
- **Photos HEIC :** converties en JPEG par le portail avant l'envoi. Rien à faire.
- **Message vocal :** Safari enregistre en AAC (mp4) ; le robot le lit.
- **Vidéo :** filme **dans le portail** (H.264). Les vidéos de la galerie sont souvent en HEVC : le portail les refuse avec une ligne. Pour qu'elles passent quand même : Réglages → Appareil photo → Formats → **Le plus compatible**.
- **Caméra et micro :** Réglages → Safari → Caméra et Micro → **Demander**.
- **Appels :** touche **Toucher pour activer le son** si le son ne vient pas.
- **Notifications :** seulement depuis l'app de l'écran d'accueil (iOS 16.4+), après **Activer**. Le PC doit avoir Internet. Nouvelle adresse de tunnel = ajouter l'app de nouveau et réactiver.

## En 4G (Wi-Fi coupé sur le téléphone)
- Le portail, les messages et le paiement test marchent en 4G, grâce au tunnel https.
- Pour un **appel vidéo**, la 4G demande souvent un serveur **TURN**, et il n'y en a pas encore. Sans TURN, fais les appels en **Wi-Fi**. Pour ajouter un TURN plus tard, voir `TEST-APPEL-1.15.md`, étape C.

## Erreurs fréquentes
- **« Connexion non sécurisée » ou erreur de certificat :** utilise l'adresse `https://….trycloudflare.com` exactement comme elle est affichée, jamais `http://192.168…` sur le téléphone. Une adresse toute neuve peut demander environ 30 secondes : recharge la page.
- **Le robot ne reçoit rien :** vérifie l'adresse dans Famille → Appels → Réglages (https, sans `/portail.html` à la fin) et que le tunnel tourne encore. Famille → Messages doit afficher « Portail famille connecté ».
- **Caméra ou micro refusés :**
  - sur Android (Chrome) : touche le cadenas → **Autorisations** → Caméra et Micro → **Autoriser** ;
  - sur iPhone : **Réglages** → **Safari** → Caméra et Micro → **Demander**.

  Cela ne marche que sur https.
- **Pare-feu :** le robot ne joint pas le serveur. Ouvre le Pare-feu Windows → **Autoriser une application** → Node.js → coche **Privé**.
- **Écho ou larsen :** mets un casque, ou va dans une autre pièce. Ne pose pas le téléphone à côté du robot.
- **Code de connexion :** aucun e-mail n'est envoyé. Le code s'affiche dans Care Team → Famille → **Comptes**.
