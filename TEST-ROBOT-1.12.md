# Tester la version 1.12 sur le robot

Installée le 9 novembre 2026 sur le robot (192.168.69.157). Les patients, réglages et résultats déjà enregistrés sont gardés. Ouvre **Bellatrix Care Team** sur le robot.

## 1. Ce qui marche tout de suite (sans le PC)

**Préparer le patient**
- Choisis le patient, puis ouvre **Life story** (sur la fiche patient).
- Remplis l'année de naissance, l'anniversaire (mets la date du jour pour voir la surprise), l'endroit où la personne a grandi et ses chanteurs préférés.
- Ces informations servent ensuite à toutes les activités.

**Les activités à tester (13 tuiles)**

| Activité | Ce qu'il faut voir |
|---|---|
| Hello & Today | Le jour, la date, la saison et l'heure. Le jour de son anniversaire : un gâteau et la chanson, avec les paroles à l'écran. |
| Memory Postcards | Un zoom lent sur la photo, puis une question à pointer (Oui / Non / Je ne sais pas). |
| Guess the Song | Après la réponse, **Chanter ensemble** affiche les paroles ligne par ligne. |
| Daily Choice | Le choix apparaît en haut de Care Team. **Passed on ✓** le retire. |
| My Music Moment | Choisis **Calme** : des formes douces, un écran plus sombre, le son qui baisse doucement à la fin. |
| Chess | **Medium** par défaut, et Bellatrix ne fait plus de coups bêtes. **On continue demain** : quitte une partie et relance-la. Pour les énigmes, choisis **Who plays → Short puzzles** dans Personalise. |
| Ludo | En mode **Point in the air**, un mouvement rapide de la main lance le dé. Règle aussi le nombre de pions (1, 2 ou 4). |
| Bellatrix Play (n° 13) | Voir ci-dessous. Le robot a bien internet : les vidéos YouTube se chargent. |

**Bellatrix Play**
1. **Start on the patient screen**, puis **Commencer** et **Oui**.
2. La chaîne s'ouvre :
   - le **mix du moment** est en premier ;
   - « Les chansons de 19.. à 19.. » sont calculées à partir de l'année de naissance ;
   - viennent ensuite « Pour se détendre », « Pour danser » et « Nature et animaux ».
3. Pendant une chanson :
   - **❤️ J'aime** ;
   - **Pas pour moi** (la chanson ne revient plus) ;
   - **Plus comme ça** lance la radio de cette chanson ;
   - **Suivant**, **Pause**, et **Moins fort / Plus fort**.
4. De retour dans Care Team, la tuile Bellatrix Play montre « What P1 likes », et le bouton **😌 Calm music now** lance directement la musique calme.

**Le résumé du mois**
- Onglet **Results** → **Monthly summary for the family** : la page est dans la langue du patient.
- **Download** l'enregistre sur le robot, et `Collect results from robot.bat` la récupère sur le PC.

## 2. L'appel vidéo de la famille (le PC joue la famille)

1. **Sur le PC**, double-clique sur **`Start robot test server.bat`**.
   - Windows demande si Node.js peut utiliser le réseau : clique **Autoriser** (réseau privé).
   - La fenêtre affiche une adresse, par exemple `http://192.168.69.167:8765`.
2. **Sur le robot** : Care Team → onglet **Family** → **Call server**. Tape cette adresse, puis **Save**.
3. **Ajoute un contact** :
   - Maria ;
   - « votre fille » ;
   - « Maman » ;
   - la langue de la page.

   Enregistre, puis coche **Accept calls now**.
4. **La fenêtre du serveur sur le PC** affiche alors : `family page on this PC: http://localhost:8765/famille.html#t=…`. Ouvre ce lien dans Chrome sur le PC.
   - S'il n'apparaît pas (lien créé avant), fais **Revoke link** puis **Make a new link** sur le robot.
5. **Sur le robot**, ouvre l'écran patient (**Open the patient screen**, ou l'icône **Bellatrix Patient**) et laisse-le en attente.
6. **Sur le PC**, clique **Appeler Maman**.
   - Le robot sonne, montre la photo et dit « Maria, votre fille, vous appelle ».
   - Réponds en pointant ou en touchant **Répondre**.
7. **Pendant l'appel**, **Jouer ensemble** lance une partie de petits chevaux entre le robot et le PC.
8. **Raccroche.** Bellatrix pose la question de l'humeur, puis l'appel apparaît dans **Results**.

**À savoir :** le micro du robot marche dans Bellatrix (mesuré le 9 novembre : la voix entre bien dans l'appel). Pas besoin de micro USB ni d'AirPods. Ce qui reste à vérifier dans un vrai appel, c'est le volume du son côté robot et l'écho : voir **TEST-APPEL-1.15.md**.

## 3. La Bibliothèque sur le robot (facultatif)

Avec `Start robot test server.bat` lancé : sur le robot, onglet **Library**. Mets l'adresse du serveur dans **Library address** et le code **DEMO-2026**, puis **Connect**.
- Les packs, l'essai gratuit et les demandes d'activation marchent comme dans la démo sur PC (voir `DEMO-STORE.md`).
- La page admin LabLand ne s'ouvre que sur le PC : `http://localhost:8765/labland/admin.html`.

## Si ça bloque

| Problème | À faire |
|---|---|
| Le robot ne répond pas à « Install on robot.bat » | Il est éteint, ou il a redémarré et l'ADB Wi-Fi est coupé. Rallume-le ; sinon il faut le câble USB pour réactiver l'ADB Wi-Fi. |
| « The call server does not answer » | `Start robot test server.bat` est-il ouvert ? L'adresse dans Family → Call server est-elle la bonne ? Windows a-t-il autorisé Node.js ? |
| Bellatrix Play dit « besoin d'internet » | Vérifie le Wi-Fi du robot. |
