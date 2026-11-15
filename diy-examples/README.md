# Comment créer et ajouter votre jeu

Le robot peut montrer des jeux que l’équipe soignante a créés elle-même, par exemple avec ChatGPT ou Claude.
Le jeu s’affiche en grand sur la tablette du patient. Le résident joue en touchant l’écran, ou en montrant du doigt en l’air (il garde la main immobile environ une seconde sur un bouton).

Exemple prêt à l’emploi : **`memory.zip`**, dans ce dossier. C’est un jeu de memory (6, 8 ou 12 cartes, fleurs, animaux ou Bavière, en allemand, français et anglais). Vous pouvez l’envoyer tel quel au robot (étape 3), ou vous en servir comme modèle.

---

## 1. Demander le jeu à votre IA

Copiez le texte ci-dessous dans ChatGPT, Claude ou une autre IA. Remplacez seulement la ligne entre crochets par votre idée. Ces règles garantissent que le jeu marche sur le robot.

```text
Crée-moi un petit jeu pour des personnes âgées, dans une maison de soins. Il sera affiché
sur une grande tablette tactile en format portrait (environ 1080 × 1580 pixels).

Le jeu : [DÉCRIVEZ VOTRE JEU ICI, par exemple « un memory avec des fleurs du jardin »
ou « un quiz sur les chansons d'autrefois »].

Règles techniques (obligatoires) :
1. Un seul fichier index.html, avec le HTML, le CSS et le JavaScript dedans.
   Pas de React, pas de Vite, pas de npm, pas d'étape de construction (build).
2. Aucune connexion à internet : pas de CDN, pas de Google Fonts, pas d'images ni de sons
   pris sur internet. Dessine les images en SVG directement dans le fichier.
   Police : Arial ou la police du système.
3. N'utilise pas localStorage, sessionStorage, les cookies ni IndexedDB : garde tout en mémoire.
   Pas de alert(), confirm() ni prompt(), pas de nouvelle fenêtre, pas de lien vers
   d'autres sites, pas de formulaire.
4. Tout ce qu'on peut toucher est un vrai élément <button>, d'au moins 120 pixels de haut,
   avec un texte d'au moins 40 pixels. Le jeu réagit seulement à l'événement "click" :
   pas de survol (hover) nécessaire, pas de glisser-déposer, pas de double-clic, pas de clavier.
5. La page remplit tout l'écran, sans défilement, et s'adapte à la taille de la fenêtre.
6. JavaScript simple, qui marche dans Chrome 95 (pas de fonctions très récentes).

Pour les personnes âgées :
7. Fond blanc, couleurs calmes, fort contraste, coins peu arrondis (5 pixels au plus),
   pas de dégradés, pas d'emoji.
8. Pas de chronomètre, pas de points perdus, jamais « perdu » ni « faux » :
   seulement des encouragements doux.
9. Très peu de texte. En allemand par défaut, avec des boutons DE / FR / EN pour changer de langue.

Donne-moi le fichier index.html complet.
```

Ouvrez le fichier reçu sur votre ordinateur (double-clic) pour le regarder. Si quelque chose ne va pas, dites-le simplement à l’IA (« les boutons sont trop petits », « enlève le chronomètre »).
Si l’IA donne plusieurs fichiers (`index.html`, `style.css`, `game.js`…), c’est bien aussi : gardez-les ensemble dans un même dossier.

## 2. Mettre le jeu sur GitHub, ou faire un fichier .zip

**Le plus simple : un fichier.** Un jeu d’un seul fichier `index.html` peut être envoyé directement.
Plusieurs fichiers : mettez-les dans un dossier, puis clic droit sur le dossier → **Envoyer vers** → **Dossier compressé** (sur Mac : **Compresser**). Vous obtenez un fichier `.zip`.

**Ou sur GitHub** (pratique pour faire des mises à jour) :
1. Créez un compte gratuit sur github.com.
2. En haut à droite, **+** → **New repository**. Donnez un nom (par exemple `memory-fleurs`), choisissez **Public**, puis **Create repository**.
3. Cliquez sur **uploading an existing file**, glissez vos fichiers dans la page, puis **Commit changes**.
4. Copiez l’adresse de la page dans le navigateur, par exemple `https://github.com/votre-nom/memory-fleurs`.

Le projet doit être **public** : le robot le télécharge sans mot de passe.

## 3. Envoyer le jeu au robot

1. Sur l’écran de la tête du robot (Care Team), à côté de **Choisir une activité**, touchez **Ajouter un jeu**. Un QR code et un code apparaissent.
2. Scannez le QR code avec votre téléphone (ou ouvrez l’adresse affichée sur votre ordinateur, et tapez le code).
3. Collez le lien GitHub, **ou** touchez **Choisir un fichier (.zip ou .html)**.
4. Donnez un **Nom** au jeu. **Pour qui** est facultatif. Dans **Langue du jeu**, choisissez la langue du jeu : l’écran du patient autour du jeu (le bouton **Terminer**) parlera cette langue.
5. Touchez **Envoyer**. Attendez : Téléchargement → Vérification → Installation → **Prêt**.

Le robot vérifie le jeu. S’il manque quelque chose, il le dit en mots simples (voir plus bas).
Pour une nouvelle version : envoyez de nouveau le même lien (ou le même fichier avec le même nom). L’ancienne version est remplacée, il n’y a pas de doublon. Un jeu venant de GitHub peut aussi être mis à jour sur la tête : **Mettre à jour**.

## 4. Essayer, puis jouer avec un résident

1. Sur la tête du robot, le jeu apparaît sous **Jeux de l’équipe**, avec **Nouveau**. Touchez-le.
2. Touchez **Essayer** : le jeu s’affiche comme sur la tablette. Vérifiez que tout se lit bien et que les boutons répondent. Fermez.
3. Choisissez le résident (et la chambre), puis **Lancer sur l’écran du patient**, comme pour les autres activités.
4. Sur la tablette, le jeu prend tout l’écran. Le grand bouton **Terminer**, en bas, termine la séance. Elle apparaît ensuite dans les résultats.

Pour retirer un jeu : touchez-le dans la liste, puis **Retirer** (deux fois, pour confirmer).

## Si le robot refuse le jeu

| Le robot dit… | Que faire |
| --- | --- |
| Ce projet doit d’abord être construit | Demandez à l’IA : « Donne-moi une version en HTML, CSS et JavaScript simples, sans build. » |
| Nous n’avons pas trouvé de fichier index.html | Le fichier principal doit s’appeler `index.html`. |
| Le jeu charge des fichiers depuis internet | Demandez à l’IA d’enlever les liens vers internet (CDN, Google Fonts, images en ligne). |
| Nous n’avons pas trouvé ce projet | Vérifiez le lien et que le projet GitHub est **Public**. |
| Ce code ne convient pas | Retapez le code affiché sous le QR code, sur le robot. |

Un bouton ne réagit pas quand on le montre du doigt en l’air ? Demandez à l’IA que tout ce qui se touche soit un vrai `<button>`.

---

**Pour l’équipe technique.** Les fichiers du memory sont dans `memory/` (`index.html`, `style.css`, `game.js`, `pictures.js`, et la police Roboto Condensed dans `fonts/`). Après une modification : `node diy-examples/make-zip.mjs` refait `memory.zip`. Test complet (import réel, jeu joué avec le pointage en l’air) : `node tests/diy-memory.test.mjs`.
