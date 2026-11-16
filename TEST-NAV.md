# Tester la navigation « itinéraire planifié par Bellatrix » sur le robot (lundi 16 novembre 2026)

Préparée le 15 novembre sur le PC, **pas encore installée**. Présentation : mardi 17 novembre.

Ce qui change (`PLAN-NAV.md`) :
- **Mode `route` (par défaut)** : avant chaque trajet, Bellatrix lit la carte du robot, planifie elle-même l'itinéraire
  (planificateur Vergil de LabLand) et donne au robot **un point de passage après l'autre**. Elle passe au point suivant
  pendant que le robot roule encore. Si une étape est bloquée, elle bloque l'endroit dans sa copie de la carte et
  replanifie (6 fois au plus).
- **Mode `place`** : la navigation d'aujourd'hui, inchangée (le robot va seul au lieu). C'est la solution de repli pour
  mardi : un interrupteur suffit.
- Les pages n'ont pas changé : `robotGo`, `robotStop`, `robotNav`… comme avant.

Sur le PC : l'APK est construit (`android\build.ps1`, contrôle `android\check-dex.ps1` : tout est ok, un seul dex),
les tests automatiques passent, et le trajet est simulé sur une carte de test et sur la carte du bureau de Vergil
(`tests/route-drive.test.mjs`). **Ce qui n'a encore jamais tourné sur ce LuckiBot Pro** : la lecture de la carte
(`getMapPgmPFD`) et `startNavigation` vers une pose. C'est le premier point du test.

Où tout se passe : **Care Team → Outils → Réglages → Lieux → Test de navigation**. En haut à droite, le grand **STOP**.

## 0. Installer et ouvrir le journal

1. Le robot est allumé, sur le Wi-Fi du bureau, **localisé** (au besoin : sur la station de charge, puis
   **Relocaliser à la station de charge** dans le panneau).
2. Sur le PC, double-clic sur **`Install on robot.bat`**.
3. Dans une fenêtre PowerShell sur le PC, ouvre le journal **à l'heure du robot** (le shell adb est réglé sur UTC+8
   par le fabricant) :

   ```
   adb -s 192.168.69.103:5555 shell 'TZ=$(getprop persist.sys.timezone) logcat -s RobotBridge:V RobotRoute:V'
   ```

   (Si le robot a une autre adresse, voir `tools/robot-address.txt`.) Laisse cette fenêtre ouverte pendant tout le test.
4. Avant chaque essai : le robot part d'une **position propre**. Après l'avoir poussé ou déplacé à la main
   (avancer, tourner), le robot refuse tout objectif avec `1020` : relocalise-le d'abord.

## 1. Mode `route`, un lieu : la carte et le plan

1. Panneau **Test de navigation** → **Mode de navigation** : **Itinéraire planifié par Bellatrix** (coché par défaut).
2. Touche **Y aller** à côté d'un lieu proche.
3. Dans le journal (`RobotRoute`), il faut voir, dans cet ordre :
   - `map read: "<nom de la carte>", <octets> bytes, <ms> ms` → **note le nombre d'octets et les ms** ;
   - `map parsed: <largeur>x<hauteur> cells of 0.05 m, <ms> ms with reading` (attendu : quelques centaines de ms) ;
   - `plan: <n> points, <m> m, <ms> ms` → **note le nombre de points** ;
   - puis pour chaque étape `leg 1/<n> start: …` et `leg 1/<n> end: arrived (…)`.
4. Dans le panneau : **En route vers …** avec **étape 1 sur n**, puis **Arrivé**. Le journal du panneau montre
   **Itinéraire Bellatrix · n/n** dans la colonne **Mode**.

**Si la carte ne se lit pas** (journal : `map: …` en avertissement, puis
`this drive runs in mode place: route: no map, robot navigation` ; panneau : « Le robot ne fournit pas de carte : ce
trajet utilise la navigation propre du robot. ») : le trajet part quand même, avec la navigation d'aujourd'hui.
**Pour mardi, alors : mode `place`** (point 5). Copie le journal (bouton **Copier** du panneau et la fenêtre adb) pour
Sebastian.

## 2. Chaque lieu de la présentation, une fois

1. Pour chaque lieu de la présentation : **Y aller**, attendre la fin.
2. Résultat attendu à chaque fois : **Arrivé**, en principe **sans essai 2**.
3. Regarde le robot entre les points :
   - **il continue de rouler d'un point à l'autre**. Au passage d'un point, un court freinage est normal (le robot
     refuse un nouvel objectif tant qu'il roule : arrêt, 150 ms, nouveau départ) ; il ne doit **pas s'arrêter pour
     tourner sur place à chaque point** ;
   - au dernier point, il s'arrête au lieu et se tourne dans l'orientation enregistrée du lieu.
4. Dans le journal, aux passages : `leg i/n end: arrived (handover … m before the point)`.
5. Note pour chaque lieu : arrivé oui/non, durée (colonne **Durée**), nombre d'étapes.

## 3. Un carton dans le couloir

1. Pose un carton (ou une chaise) au milieu du couloir, sur le trajet d'un lieu. Laisse de la place pour passer à côté
   si le couloir le permet.
2. **Y aller** vers ce lieu.
3. Attendu :
   - le robot s'arrête devant le carton ou l'évite ; s'il ne passe pas, après **8 s sans avancer** (ou **12 s
     d'évitement sans fin**), le panneau affiche **« Bloqué : recherche d'un chemin pour contourner. »** et **essai 2** ;
   - dans le journal : `leg … end: blocked (standstill …)` ou `(avoiding for 12 s …)`, puis
     `block (x, y) from route at (…), robot at (…)` (ou `from robot at (…)` si le robot n'était jamais sur
     l'itinéraire) et `replan 1 of 6` ;
   - ensuite **il arrive par un autre chemin**, ou il termine dans les limites avec **Échec** et
     « Pas de passage pendant 5 minutes. » (`blocked`) ou « Aucun chemin sur la carte : porte fermée ou obstacle. »
     (`no-route`).
4. Les limites : au plus **6 replanifications** (essai 7 au plus), et le trajet ne dure pas plus de **5 minutes**
   (plus au maximum une étape, 35 s).
5. Si les blocages ne laissent plus aucun chemin, le journal dit `the … block(s) leave no route: all dropped, planning
   once more` : c'est voulu (Bellatrix oublie ses blocages et replanifie une fois).
6. Mise à jour 1 (16 novembre) : si ce point 3 a déjà été fait avant la mise à jour, refais-le une fois après.

## 3 bis. Un carton que le robot ne peut pas passer (mise à jour 1)

1. Pose un carton **en travers d'un couloir étroit**, sur le trajet d'un lieu, pour que le robot ne puisse pas passer
   et que sa propre navigation tourne et s'éloigne.
2. **Y aller** vers ce lieu.
3. Attendu :
   - dans le journal : `block (x, y) from route at (…), robot at (…)` ;
   - le centre du blocage (`block (x, y)`) est **de 0,6 m à environ 1 m après** le point `at (…)`, c'est-à-dire sur
     le carton, et non là où le robot se trouve après avoir tourné ;
   - après `replanning`, le robot **prend un autre chemin** et **ne revient pas** vers le même carton.
4. Note : la position du carton, les lignes `block …` du journal, et si le robot est revenu vers le carton (oui/non).

## 4. STOP, puis l'arrêt d'urgence, pendant un trajet

1. Lance un trajet long. Au milieu, touche le grand **STOP** :
   - le robot s'arrête **tout de suite** et **ne repart pas** ;
   - le panneau dit **Arrêté** (« Arrêté par l'équipe. ») ;
   - dans le journal : plus aucun `startNavigation` après le STOP.
2. Relance un trajet. Au milieu, appuie sur **l'arrêt d'urgence** du robot :
   - le robot s'arrête tout de suite ;
   - le panneau dit **Échec** avec « Arrêt d'urgence enfoncé. » ;
   - plus aucun `startNavigation` dans le journal. Libère l'arrêt d'urgence : le robot ne repart pas tout seul.

## 5. Mode `place`, un trajet : le comportement d'aujourd'hui

1. **Mode de navigation** → **Navigation propre du robot**. Le toast « Enregistré. » apparaît.
2. **Y aller** vers un lieu : le robot y va comme avant (le journal `RobotBridge` montre
   `startNavigation("<lieu>") try 1`, **pas** de lignes `RobotRoute`).
3. Le journal du panneau montre **Navigation du robot** dans la colonne **Mode**.
4. Remets **Itinéraire planifié par Bellatrix** après ce test (sauf si on choisit `place` pour mardi). Le choix est
   gardé sur la tête du robot, aussi après un redémarrage de l'application.

## 6. Le parcours complet de la présentation, deux fois de suite

1. Fais tout le parcours de mardi, dans l'ordre, deux fois sans rien redémarrer (avec les activités comme mardi, ou
   avec **Y aller** et **Retour à la base**).
2. Attendu : chaque trajet **Arrivé** ; le deuxième tour aussi bien que le premier (la carte est relue à chaque trajet,
   les blocages d'un trajet ne restent pas).
3. Touche **Copier** dans le panneau et garde le texte, avec la fenêtre adb, pour Sebastian.

---

## La décision pour mardi

| Résultat du test | Mardi |
|---|---|
| Points 1 à 4 et 6 bons | mode **route** (Itinéraire planifié par Bellatrix) |
| La carte ne se lit pas, ou le robot s'arrête à chaque point, ou des **Échec** sur des trajets libres | mode **place** (Navigation propre du robot), comme aujourd'hui |
| Un doute | mode **place** : c'est la navigation déjà montrée |

## Les nombres (pour lire le journal)

| Quoi | Valeur |
|---|---|
| Marge autour des obstacles | 0,32 m (0,35 m sur la grille de 5 cm) |
| Étape la plus longue | 10 m |
| Atteint à | 0,3 m |
| Passage au point suivant | 1,2 m avant le point, au plus la moitié de l'étape |
| Temps d'une étape | 6 s + 4 s par mètre, au plus 30 s (+ 5 s de marge) |
| Immobile | moins de 0,10 m en 8 s |
| Évitement sans fin | 12 s après le premier `1018` |
| Blocage | cercle de 0,6 m, 0,9 m devant le robot |
| Replanifications | 6 au plus |
| Durée d'un trajet | 5 min |
| Départs par étape | 3 (arrêt, puis 150 ms, puis 400 ms) |
| Vitesse | celle du robot (environ 0,7 m/s) |

## Si ça bloque

| Problème | À faire |
|---|---|
| Le panneau n'a pas l'interrupteur **Mode de navigation** | L'ancienne application tourne encore : ferme et rouvre Bellatrix Care Team, sinon réinstalle. |
| `map: no map loaded` ou `map: the robot hands out no file` | Le robot n'a pas de carte chargée, ou ne la donne pas : mode **place** pour mardi, journal à Sebastian. |
| Tous les départs refusés avec `1020` | Le robot a été déplacé à la main : relocalise-le à la station de charge. |
| Presque tout refusé, `-116` | Le robot n'est pas localisé : relocalise-le. |
| `Échec` avec « Une autre action est encore en cours… » (code `-1`) | La navigation est restée occupée 3 fois : touche STOP, attends 2 s, réessaie. Si ça revient : mode **place**. |
| Sur la station de charge, **Mis en pause par le système du robot.** | Normal : RobotOS a la main. Après la reprise, Bellatrix attend 1,5 s et replanifie. |
| Le robot tourne et s'arrête à chaque point | Note-le avec le journal : mode **place** pour mardi. |
