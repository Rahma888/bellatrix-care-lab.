# Tester la version 1.14 sur le robot

Installée le 9 novembre 2026 sur le robot (192.168.69.157). Les patients, réglages et résultats déjà enregistrés sont gardés.

Nouveau depuis la 1.13 :
- Bellatrix Play refait comme la démo Figma « Mélodie », avec les paroles ;
- 574 chansons de toutes les époques ;
- le Premium : le patient demande, l'équipe paie ;
- la Bibliothèque façon App Store.

Le reste (écrans légers, Care Team en FR / EN / DE) est expliqué dans `TEST-ROBOT-1.13.md`.

## 1. Bellatrix Play

1. Care Team → tuile **Bellatrix Play** → **Lancer sur l'écran du patient** → **Commencer** → **Oui**.
2. Le menu est à gauche : **Accueil**, **Mes favoris**, **Rechercher**, **Écoutés récemment**.
3. **Accueil** :
   - la grande carte « Les chansons qui vous font du bien », avec **Écouter maintenant** ;
   - « Vos recommandations » ;
   - la bannière Premium ;
   - « Explorez facilement ».
4. Pendant une chanson :
   - la vidéo reste visible en bas du menu ;
   - la barre en bas montre ❤️, ⏮ ⏯ ⏭, le temps écoulé, **Paroles**, **Clip**, le volume et la file d'attente.
5. **Rechercher** : tape par exemple « STROMAE » ou « ADELE » sur le grand clavier.

## 2. Le Premium (le patient demande, l'équipe paie)

1. **Sur l'écran du patient** : touche **Demander Premium** (dans le menu ou sur la bannière), puis encore **Demander Premium**.
   - Le message « Demande envoyée ! » s'affiche.
2. **Termine** la séance et reviens dans Care Team.
   - Une pastille rouge **1** est sur Activités, avec la bannière « P1 aimerait Bellatrix Play Premium ».
3. Touche **Voir la demande**, choisis une formule, puis **Payer en toute sécurité** et **Confirmer (démo)**.
   - C'est une démonstration : rien n'est payé.
4. Relance Bellatrix Play. Le menu affiche « Premium actif ».
5. Touche **Paroles** : les paroles défilent avec la chanson.
   - Elles viennent des chansons libres, puis de LRCLIB, puis des sous-titres YouTube.
   - LRCLIB se coupe par patient dans **Personnaliser**.
6. Pour recommencer la démo : Bibliothèque → **Bellatrix Play Premium** → **Désactiver**.

## 3. La Bibliothèque (App Store)

Onglet **Bibliothèque** :
- **À la une** : Bellatrix Play Premium ;
- les catégories Jeux, Musique et mouvement, Créativité, Souvenirs ;
- **Échecs** et **Petits chevaux** : **Ouvrir** ;
- Chef d'orchestre, Peinture dans l'air, Machine à remonter le temps et Le livre de ma vie : **Bientôt**.

Touche une app pour voir sa fiche.

## Si ça bloque

| Problème | À faire |
|---|---|
| Les vidéos ou les paroles ne chargent pas | Vérifie le Wi-Fi du robot. |
| Les polices de Play ressemblent à une police simple | Normal sans internet : elles viennent de Google Fonts. |
| Le robot ne répond pas à « Install on robot.bat » | Il est éteint, ou il a redémarré et l'ADB Wi-Fi est coupé. |
