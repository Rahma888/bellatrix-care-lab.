# Test au bureau avec le robot

L'écran de la tête du robot (Android 9, 1920 × 1080) a **deux applications** :

| Icône | Nom | Pour qui | Ce qu'on y fait |
|---|---|---|---|
| Presse-papiers vert (teal) | **Bellatrix Care Team** | l'équipe soignante | choisir le patient et l'activité, tout personnaliser, lire les résultats |
| Cœur rose | **Bellatrix Patient** | le patient | seulement l'activité, en plein écran |

Les deux partagent les patients, les images, les chansons et les résultats. Elles marchent **sans le laptop et sans internet**.

- **Trois langues** : anglais, français ou allemand, choisi par l'équipe pour chaque patient. Bellatrix parle avec sa propre voix pour chaque langue, installée sur le robot (hors ligne).
- **Un visage** : Bellatrix cligne des yeux, regarde autour d'elle et bouge la bouche quand elle parle.
- **L'humeur** : au début et à la fin de chaque activité, trois visages (Bien, Ça va, Pas très bien). Le graphique par patient est dans **Results**.

## 1. Installer ou mettre à jour (un clic)

1. Le laptop et le robot sont sur le **même Wi-Fi**.
2. Double-clique sur **Install on robot.bat**.
   - Il reconstruit l'application si le code a changé.
   - Il installe les deux applications et, la première fois, les trois voix (environ 250 Mo, deux à trois minutes).
   - Il ouvre **Bellatrix Care Team**.
3. Les patients et les résultats déjà sur le robot sont **gardés**.

Les patients se préparent directement sur le robot, dans Care Team.

## 2. Une séance

1. Ouvre **Bellatrix Care Team** depuis l'écran d'accueil du robot.
2. **1 · Patient** (la carte en haut) : le code (P1, P2…), la **langue** (English / Français / Deutsch) et le nom d'accueil. À droite : sa dernière humeur ou sa dernière activité. **More settings** : taille du texte, vitesse, volume, sous-titres, question d'humeur, export / import.
3. **2 · Choose an activity** : touche une **tuile** (comme une application). Les filtres en haut : Favourites, Memory, Music, Movement, Games, Social, Daily life. « Played today » montre ce que ce patient a déjà fait.
4. En dessous, la page de l'activité choisie : **☆ Add to favourites**, **How they answer** (Touch only, Hand signs, Point in the air), **Personalise** (textes, images, chansons, enregistrés pour ce patient), **Where and who**.
5. **Le consentement caméra se fait avec l'équipe, avant la séance** : l'écran ne pose plus la question au patient.
6. La barre **3** reste toujours en bas de l'écran, avec le résumé (patient · activité · langue · réponse). Touche **Start on the patient screen** : **Bellatrix Patient** s'ouvre sur l'écran « Commencer » (avec le visage). La caméra est déjà allumée : le patient peut **pointer le bouton à distance**, comme dans le jeu, ou le toucher. Puis « Oui, participons », l'humeur, et l'activité, tout à distance.
7. À la fin : « Thank you », puis l'écran d'attente.
8. Pour revenir à l'équipe : **3 touches rapides dans le coin en haut à gauche** (quand aucune séance ne tourne). Pendant une séance, ces 3 touches ouvrent le panneau staff (fin de séance, notes).
9. Onglet **Results** : la séance y est, avec l'humeur avant → après. Choisis le patient dans **Show** pour voir son graphique d'humeur. Touche **Add notes**.

Pour vérifier une activité sans rien enregistrer : **Preview (not saved)** au lieu de Start.

## 3. Les tests, dans cet ordre

1. **Sécurité (brief §11)** : inspecte le robot éteint, repère l'**arrêt d'urgence**, confirme qui est le responsable robotique.
2. **Power log** : double-clique sur **Power log.bat**. Il note la batterie, la luminosité et le Wi-Fi toutes les 30 minutes. Laisse sa fenêtre ouverte.
3. **NAV-01** : un trajet « golden route » avec l'application Orionstar du robot (pas avec cette application).
4. **DSP-01** : avec **Preview**, ouvre chaque activité. Est-ce lisible depuis une chaise ? Est-ce que quelque chose est coupé ? La voix est-elle assez forte ?
5. **Activity 1 Hello & Today** avec 2 ou 3 collègues : distance d'approche, première impression, toucher, sortie.
6. **CAM-01** : le consentement est demandé par l'équipe avant la séance ; sur l'écran, le voyant rouge « Camera on » s'allume dès « Commencer ».
7. **Activity 5 Seated Move Along**, avec « Movement camera » coché. Le compteur compte-t-il chaque mouvement ? Touche **Attempt seen** dans le panneau staff à chaque vrai mouvement, pour vérifier la caméra.
8. **Activity 6 Picture Pair** en pointant en l'air, à la vraie distance de l'écran.
9. **Activity 9 Family Call** : la caméra, la voix et le bouton raccrocher.
10. **Activity 11 Chess (échecs)** : contre Bellatrix (Easy, Medium, Harder) ou à deux joueurs, en pointant à distance. Les points montrent où une pièce peut aller ; **Tipp / Un conseil** propose un coup, **Take back** reprend le dernier coup. Réglages dans Personalise : qui joue, niveau, couleur du patient, points.
11. **Activity 12 Ludo (petits chevaux)** : 2, 4 ou 6 joueurs (plateau en croix, ou hexagone pour 6). Dans Personalise :
    - **Where the players are** : tous sur ce robot ; ou chacun à son robot, avec un robot qui **crée** la partie (salle d'attente) et les autres qui la **rejoignent** depuis la liste (même Wi-Fi). Bellatrix joue toutes les places libres, et reprend la place d'un robot qui ne répond plus (40 s).
    - **Tokens per player** : 1 pion (partie courte), 2 (moyenne, par défaut) ou 4 (partie complète). À 6 joueurs avec 4 pions, une partie dure plus d'une heure et demie.
    - **Rules** faciles (sortir avec 6 ou 1) ou classiques, et **How Bellatrix plays** (doucement ou bien).
    - Test à deux robots sans second robot : sur le laptop, ouvre `staff.html?ludohost=<adresse du robot>` (par exemple `?ludohost=192.168.69.157`), choisis Ludo → « join a game » → Start.

Après chaque séance, ajoute les notes dans **Results** (résultat, score 0–3, les 5 questions).

## 4. À la fin

1. Dans **Bellatrix Care Team** → **Results** : **Download all as one report** et **Download the summary table**. Fais pareil dans **Test matrix** et **Power log**. Le message « Saved on the robot » confirme chaque fichier.
2. Sur le laptop : double-clique sur **Collect results from robot.bat**. Les fichiers arrivent dans `from-robot\<date>`.
3. Le power log du laptop se trouve dans `from-robot\power-<date>.csv`.
4. Envoie le point de fin de journée (brief §11.5) : ce qui a marché, ce qui a semblé humain, ce qui a cassé ou dérouté, les relevés de batterie, et le changement le plus utile pour la suite.

## À savoir sur cet écran

- **Les voix** : anglaise (femme, « lessac »), française (femme, « siwis ») et allemande (homme, « thorsten »), hors ligne. Le volume se règle dans la barre du robot (glisser depuis le haut) et, pour chaque patient, dans **Volume**.
- **Pas de réponses à la voix** : la WebView du robot n'a pas de service de reconnaissance vocale. Bellatrix ne demande donc jamais de parler (le micro, lui, marche : il sert à l'appel vidéo de la famille, mesuré le 9 novembre) : le patient répond au toucher, par signes de la main ou en pointant en l'air.
- **Glisser depuis le haut** ouvre la barre du robot, et le bouton d'accueil quitte l'application. Pour revenir, touche l'icône : la séance reprend où elle était.

## Si ça bloque

| Problème | À faire |
|---|---|
| « Could not connect » | Le robot est-il allumé, sur le même Wi-Fi ? Son adresse a peut-être changé : regarde-la dans les réglages Wi-Fi du robot, et écris-la dans `tools\robot-address.txt` (par exemple `192.168.69.157:5555`). |
| « Webpage not available » | Relance **Install on robot.bat**. |
| Bellatrix ne parle pas | Monte le volume du robot. Si l'onglet Session dit « no voice yet », relance **Install on robot.bat** : il remet la voix. |
| La caméra ne s'allume pas | Relance **Install on robot.bat** (il redonne l'autorisation). Le patient doit répondre **Yes** à la question caméra. |
| Pas de barre bleue « Load them » | Refais l'export sur le laptop, puis relance **Install on robot.bat**. |
| Ludo : la partie d'un autre robot n'apparaît pas | Les deux robots doivent être sur le même Wi-Fi, et la partie doit être dans sa salle d'attente (pas encore commencée). Attends 5 secondes, la liste se met à jour seule. |
| L'écran d'accueil du robot revient | Quelqu'un a touché le haut de l'écran ou le bouton d'accueil. Touche à nouveau l'icône Bellatrix. |

L'écran 32" à l'avant (Chrome) marche aussi, avec **Deploy to robot.bat**. Il faut d'abord déverrouiller ses réglages (mot de passe LabLand) pour activer le débogage USB.
