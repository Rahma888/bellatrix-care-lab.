# Tester la version 1.13 sur le robot

Installée le 9 novembre 2026 sur le robot (192.168.69.157). Les patients, réglages et résultats déjà enregistrés sont gardés.

Ce qui change : une interface plus légère, Bellatrix parle moins, Care Team en 3 langues, et un nouveau Bellatrix Play.

## 1. Care Team

1. Ouvre **Bellatrix Care Team**.
2. En haut à droite, choisis **FR**, **EN** ou **DE**. Toute la page change de langue.
   - La langue du patient (sur la fiche patient) ne change pas. Elle se règle à part.
3. Les onglets **Power log** et **Test matrix** ont disparu, comme les longues explications.

## 2. Écran du patient

Lance n'importe quelle activité avec **Lancer sur l'écran du patient**.

À vérifier :
- chaque écran a un titre, une image et 3 boutons au plus ;
- Bellatrix dit une seule phrase courte, par exemple « Bonjour, Maria ! On commence ? » ;
- si le patient ne répond pas, elle relance une seule fois : « Prenez votre temps. Je suis toujours là. »

L'activité « Family Call Dry Run » n'existe plus. L'appel vidéo avec la famille sera repris plus tard (voir `TEST-ROBOT-1.12.md`, partie 2).

## 3. Bellatrix Play

Pour que l'accueil soit personnel, remplis d'abord **Histoire de vie** sur la fiche patient : l'année de naissance et les chanteurs préférés.

1. Choisis la tuile **Bellatrix Play**, puis **Lancer sur l'écran du patient**, **Commencer** et **Oui**.
2. Bellatrix dit seulement « Voici votre musique. ». En bas, trois onglets : **Accueil**, **Rechercher**, **Ma musique**.
3. **Accueil** :
   - **Pour vous** : le mix du chanteur préféré, puis « Votre jeunesse », les décennies et les succès internationaux ;
   - **Écoutés récemment** ;
   - **Vos artistes** (photos rondes) ;
   - **Ambiances** : Calme, Danser, Nature.
4. **Rechercher** :
   - tape « PIA » sur le grand clavier : Édith Piaf, puis ses chansons ;
   - sans rien taper, tu peux aussi parcourir par **Artistes**, **Années** et **Styles**.
5. **Le lecteur** : la vidéo en grand, le **cœur**, ⏮ ⏯ ⏭, moins fort et plus fort.
   - Reviens sur Accueil : la chanson continue, et une petite barre « en cours » reste en bas.
6. **Ma musique** montre les chansons avec un cœur et les artistes préférés.
7. **Terminer** (en bas à droite) termine la séance.

Le catalogue compte 205 vidéos officielles : 169 chansons en français, allemand et anglais, de la musique classique, des valses et des films de nature. Le bouton **Calm music now** dans Care Team ouvre directement le lecteur sur une musique calme.

## Si ça bloque

| Problème | À faire |
|---|---|
| Le robot ne répond pas à « Install on robot.bat » | Il est éteint, ou il a redémarré et l'ADB Wi-Fi est coupé. Rallume-le ; sinon il faut le câble USB pour réactiver l'ADB Wi-Fi. |
| Bellatrix Play ne charge pas les vidéos | Vérifie le Wi-Fi du robot. |
| La page Care Team montre encore l'ancienne version sur le PC | Appuie une fois sur Ctrl+F5. |
