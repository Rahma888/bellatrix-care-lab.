# Briefing : verrouillage du joueur (« PlayerLock ») pour les jeux du robot

## Contexte
Jeux tactiles par caméra (Seifenblasen-und-Sterne, Frosch-und-Greifarm, Daten-Tunnel) pour l'événement Telekom, sur l'app Kotlin de Kuba (`LablandApp`). Problème constaté au lancement : plusieurs enfants devant le robot, et le robot ne sait pas quelle main utiliser.

## Règle à implémenter
1. La première personne qui choisit un jeu devient LE joueur. Un joueur = ses DEUX mains.
2. Tant que la partie dure, seules les mains de ce joueur comptent. Les autres mains détectées par la caméra sont ignorées.
3. Le robot garde en mémoire une empreinte du joueur, même quand ses mains sortent du champ. Quand elles reviennent, on les compare à l'empreinte : si ça correspond, le jeu reprend, sinon la main est ignorée.
4. Fin du verrou : fin de la partie, ou main non revue pendant 15 s (configurable). L'empreinte est alors supprimée et n'importe qui peut choisir un jeu.

## Pas une vraie empreinte digitale
Impossible avec cette caméra (crêtes de 0,5 mm, enfants qui bougent, flou) et problématique pour le RGPD (données biométriques d'enfants). On construit une signature temporaire de la personne, avec les critères ci-dessous.

## Critères d'identification, du plus au moins fiable
1. **Lien main ↔ corps (pose)** : si on a les points du corps (poignets, coudes, épaules), chaque main est rattachée à une personne. Deux mains reliées aux mêmes épaules = même joueur. Règle aussi le cas des deux mains.
2. **Suivi de position image par image** : tant qu'une main est visible, la nouvelle position la plus proche de l'ancienne est la même main. Refuser les sauts brusques (vitesse maximale plausible).
3. **Apparence du haut du corps** : histogramme de couleur des vêtements (zone torse/épaules) et zone de l'image où se tient l'enfant. Stable pendant la partie.
4. **Proportions de la main** : rapports de longueurs (chaque doigt / largeur de paume, écarts entre doigts) calculés à partir des 21 points de repère. Rapports et non tailles absolues, donc indépendants de la distance. Criterium d'appoint seulement : deux enfants du même âge ont des mains proches.
5. **Gauche/droite et rapport de taille entre les deux mains** : cohérence interne du joueur.
6. **Taille relative de la main dans l'image** (profondeur) : sert à rejeter une main trop éloignée du joueur.

## Création de l'empreinte
- Elle se crée seulement quand la main est ouverte et de face (sinon la qualité est mauvaise), au moment où le jeu est choisi.
- On mesure sur environ 1 s (30 images) et on garde la valeur médiane de chaque critère, pas une seule image.
- La 2e main est ajoutée quand elle apparaît, après vérification de cohérence (rapport de taille, droite/gauche, même corps).
- L'empreinte est affinée lentement pendant le jeu (moyenne glissante), seulement quand le match est très sûr.

## Décision de correspondance
- Chaque main détectée reçoit un score pondéré de tous les critères disponibles (poids : pose et suivi forts, couleur moyenne, proportions faibles).
- Si le score est au-dessus du seuil : main acceptée. Sinon : ignorée.
- **Cas ambigu** (deux mains avec un score presque égal) : ne donner le contrôle à aucune et attendre. Mieux vaut une courte pause qu'un mauvais joueur.
- Seuil plutôt tolérant (les enfants bougent), avec le suivi de position en renfort.
- Hystérésis : une main acceptée n'est retirée qu'après plusieurs images de mauvais score, pour éviter le clignotement.

## États à gérer
`LIBRE` (personne n'a choisi) → `VERROUILLE` (joueur actif) → `PAUSE_MAIN_PERDUE` (« Zeig deine Hand », déjà géré par l'app de Kuba) → retour à `VERROUILLE` si les mains correspondent, sinon `LIBRE` après le délai de 15 s ou fin de la partie.

## Cas limites à tester
- Deux enfants côte à côte avec les mains qui se croisent (le suivi ne doit pas « sauter »).
- Un autre enfant qui met sa main dans le jeu pendant que le joueur est sorti du champ.
- Le joueur sort, un autre enfant entre dans le champ, puis le joueur revient.
- Joueur avec une seule main visible, puis la deuxième.
- Main de profil, poing fermé, main partiellement cachée.
- Distance variable, éclairage différent, vêtements de même couleur.
- Un adulte qui passe derrière.

## Retour visuel (obligatoire)
Un anneau de couleur sur les mains du joueur, rien sur les autres. Sinon les enfants croiront que le robot est cassé. Dans les jeux, message court si une main ignorée essaie de jouer (optionnel).

## Vie privée (à reprendre dans la doc pour Telekom)
- L'empreinte reste en mémoire vive, uniquement pour la partie.
- Jamais écrite sur disque, jamais envoyée, jamais liée à une image enregistrée.
- Supprimée à la fin de la partie, au timeout, ou à l'arrêt du jeu.
- Aucune identification de la personne, seulement un verrou temporaire.

## Architecture
Un module commun `PlayerLock` (Kotlin, logique pure, sans dépendance Android autant que possible) utilisé par tous les jeux, pour ne pas le recopier dans chacun. Interface proposée :
- `onFrame(hands: List<DetectedHand>, pose: List<PoseLandmarks>?, frame colour data)` → renvoie la liste des mains autorisées.
- `lock(firstHand)`, `release()`, `state`.
- Tous les seuils et poids dans une config unique.

## À vérifier dans l'app de Kuba (ne pas deviner)
1. Reçoit-on seulement la position de la main, ou aussi les 21 points de repère (MediaPipe Hands) ?
2. Y a-t-il la pose du corps (MediaPipe Pose) ? Sinon, peut-on l'ajouter ?
3. A-t-on accès aux pixels de la caméra pour la couleur des vêtements ?
Plan B si on n'a que la position de la main : suivi de position + gauche/droite + délai, avec un résultat moins robuste quand la main sort du champ. À signaler clairement.

## Plan de travail
1. **Prototype PC** : en Python ou HTML/JS avec la webcam (MediaPipe Hands + Pose). Mêmes critères, mêmes états, mêmes seuils.
2. **Panneau de debug** : affiche pour chaque main son score par critère, la décision et l'état.
3. **Tests** avec 2-3 personnes : scénarios ci-dessus, réglage des poids et des seuils.
4. **Rapport** de ce qui marche et de ce qui échoue, avec les seuils retenus.
5. **Port Kotlin** pour Kuba seulement après validation sur PC, même format de livraison que Daten-Tunnel (dossier + zip + fichiers de textes DE/EN).
6. Brancher `PlayerLock` dans les 3 jeux.

## Livrable attendu en premier
Le prototype PC avec le panneau de debug, et une liste honnête des limites. Ne pas coder le Kotlin avant mon accord.