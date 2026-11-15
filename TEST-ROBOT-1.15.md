# Tester la version 1.15 sur le robot (10 novembre 2026)

Préparée le 9 novembre au soir sur le PC, **pas encore installée**. Elle contient :
- les deux briefings b1 (karaoké gratuit, outils de l'équipe, recommandation musicale) ;
- Care V1 (messages de la famille, portail famille, album de vie, lecture gratuite) ;
- Play (images, vidéo agrandie, IA, grands boutons) ;
- l'appel famille dans les deux sens ;
- **un nouveau visuel partout**, dans le style de ta démo Figma (crème, vert profond, abricot, titres en serif) ;
- **Care Team en 5 onglets** : Activités · Résultats · **Famille** (À valider · Comptes famille · Appels) · **Contenus** (Musique · Album · Lecture · Karaoké) · Bibliothèque. Ce qui attend l'équipe est regroupé sur une ligne **« À traiter »** : touche **Afficher** pour voir le détail.

Sur le PC, tout est testé : 91 tests automatiques et un test d'ensemble en portrait et en paysage, sans erreur. Il reste à voir tout cela sur le vrai robot.

## 0. Installer (au bureau, 2 minutes)

1. Le robot est allumé et sur le Wi-Fi du bureau.
2. Sur le PC, double-clic sur **`Install on robot.bat`**. Les patients et les résultats déjà sur le robot sont gardés.
3. Le robot ouvre **Bellatrix Care Team**. Touche **FR** en haut à droite si la page est en anglais.

## 1. Le début du service (Outils)

1. La ligne **« À traiter »** contient **« Début de service : checklist »**. Touche **Afficher**, puis **Commencer** (ou ouvre **Outils → Début de service**).
2. Six lignes : batterie, Wi-Fi, son (**Tester le son**), écran propre, contenus du jour, zone dégagée.
   - Le seuil de batterie n'a pas de valeur par défaut : règle-le dans **Outils → Réglages**.
3. Le résultat est **« Prêt »** en vert, ou une liste en rouge de ce qui bloque, avec le mode **« Personnel seulement »**.
4. Dans **Outils**, essaie aussi :
   - **Mode nettoyage** : l'écran se verrouille 60 s avec un compte à rebours. Un appui de 3 s le termine plus tôt.
   - **Mode démo** : environ 6 minutes avec des données inventées. Le badge « Mode démo » reste affiché. Termine avec **Quitter le mode démo**.

## 2. Bellatrix Play

1. Tuile **Bellatrix Play** → **Lancer sur l'écran du patient**.
2. À vérifier :
   - **chaque chanson a une image**, plus de couverture blanche ;
   - **touche la vidéo** en bas du menu : elle s'affiche en grand, et **Réduire** la remet en petit ;
   - **DJ Bellatrix**, **Playlist IA** (par exemple « Chansons joyeuses des années 60 ») et **Plus comme ça** marchent ;
   - à la fin d'une chanson, **3 propositions** pour la suivante.
3. Côté équipe, onglet **Contenus → Musique** :
   - coche le consentement du patient (« Personnalisation musicale ») ;
   - choisis 3 à 5 chansons préférées ;
   - regarde la playlist de la semaine en brouillon, puis **Approuver** (avec tes initiales). Elle apparaît alors dans Play.

## 3. Karaoké gratuit (salle commune)

1. Tuile **Karaoké de groupe** (catégorie Musique).
2. Choisis une langue, puis une chanson, par exemple **Au clair de la lune**.
3. À vérifier :
   - la ligne chantée en abricot, très grande, sur fond vert profond ;
   - les boutons Pause, Volume, Plus lent / Plus rapide, Refrain seulement, Une autre !, Arrêter ;
   - à la fin : « Merci à tous, c'était un beau moment ».
4. Ensuite, la ligne **« À traiter »** de Care Team commence par **« Désinfecter l'écran »**.
5. **Écoute une fois les mélodies sur le haut-parleur du robot** : elles sont jouées par le robot lui-même.

## 4. Album de vie et lecture

- Onglet **Contenus → Album** et **Contenus → Lecture** :
  - ajoute une photo pour le patient, avec un thème et une légende ;
  - règle la ville pour la météo.
- Tuile **Album de vie** : 3 thèmes, une photo en grand, Précédente / Suivante / J'aime.
- Tuile **Lecture gratuite** :
  - **Aujourd'hui** : la date, l'heure et la météo ;
  - **Histoires courtes** : lues à voix haute, page par page ;
  - **Horoscope** « pour le plaisir » ;
  - **Il y a 50 ans**.
  - Les livres Premium ont une couronne.

## 5. La famille : messages, album, Premium

1. Sur le PC, double-clic sur **`Start robot test server.bat`**. Note l'adresse affichée, par exemple `http://192.168.69.167:8765`.
2. Sur le robot : **Famille → Appels → réglages → adresse du serveur**. Mets cette adresse.
3. Onglet **Famille → Comptes famille** → crée une invitation pour le patient. Un code et un QR code apparaissent.
4. **Côté famille, sur le PC** : ouvre `http://localhost:8765/portail.html` dans Chrome et inscris-toi avec le code.
   - Pour **un vrai téléphone**, il faut une adresse https : lance **`Start phone test.bat`** et ouvre l'adresse `https://….trycloudflare.com/portail.html` qu'il affiche.
5. La famille envoie une photo et un texte. Elle peut aussi ajouter une photo à l'album et **offrir Premium** (paiement de démonstration).
6. Sur le robot, onglet **Famille → À valider** : **Examiner** puis **Valider**. Un message offert Premium montre la bannière **« La famille de P1 a offert Premium »** avec **Activer**.
7. Sur l'écran du patient : **« Vous avez un message de… Voulez-vous le voir ? »**, puis la photo en grand et le texte lu à voix haute.
8. Le portail de la famille affiche alors **« Montré »**.

## 6. L'appel vidéo dans les deux sens

Suis **`TEST-APPEL-1.15.md`**. En résumé :
- **la famille appelle** avec son lien ;
- **Care Team appelle la famille** : Famille → Appels → contact → **Appeler**, puis un lien, un QR code, WhatsApp ou SMS ; la famille touche **Rejoindre**.
- **Important** : le PC doit être dans une autre pièce, ou avec un casque, sinon il y a de l'écho.

---

## Ce qui demande une décision (toi ou ton boss)

| Sujet | Question |
|---|---|
| Playlists | Qui les approuve ? Aujourd'hui, la personne tape ses initiales. |
| Consentement musique | Sans consentement, faut-il quand même utiliser l'histoire de vie (année de naissance, chanteurs) pour choisir la musique ? Aujourd'hui : oui. |
| Karaoké | Garder « Oh! Susanna » ? Elle vient des spectacles de « minstrels » du XIXe siècle. Garder la question « Comment vous sentez-vous ? » après un karaoké en groupe ? |
| Lecture | « Le Petit Chaperon rouge » (fin sombre) dans les histoires gratuites ? L'équipe peut la décocher par patient. |
| Photo du jour | Montrer des photos personnelles sur l'écran d'attente ? Aujourd'hui, c'est désactivé par défaut. |
| Licences | Les registres (`data/karaoke-licences.json`, `data/reading-licences.json`) sont vérifiés par Claude. Une personne de LabLand doit les confirmer. |
| Météo | Open-Meteo est gratuit pour un usage non commercial. Il faut revérifier ses conditions avant de vendre. |
| Hébergement | Pour la famille sur téléphone, il faut une adresse https fixe (serveur LabLand). |
| Paiement | Il faut un compte Stripe pour encaisser vraiment. |
| E-mail | Il faut un service d'e-mail pour envoyer les codes de connexion. |
| Conseil juridique | Il faut faire relire le texte RGPD et les conditions de vente par un juriste. |
| TURN | Il faut un serveur TURN pour que l'appel passe partout en 4G. |
| Personnel seulement | Les appels de la famille doivent-ils encore sonner dans ce mode ? Aujourd'hui : oui. |

## Pas encore vérifié

- Tout ce qui précède sur le **vrai robot**.
- La lecture de la **batterie** et du **Wi-Fi** par le robot : cela demande la nouvelle application.
- Le **son du karaoké** et le **volume pendant un appel** sur le haut-parleur du robot.
- Le portail famille **hors connexion** sur un vrai téléphone.

## Si ça bloque

| Problème | À faire |
|---|---|
| `Install on robot.bat` ne trouve pas le robot | Le robot est éteint ou a redémarré. Rallume-le ; sinon il faut le câble USB pour réactiver l'ADB Wi-Fi. |
| La page Care Team montre l'ancienne version | Ferme et rouvre Bellatrix Care Team. |
| Messages : « le serveur ne répond pas » | Vérifie que `Start robot test server.bat` est ouvert, que l'adresse dans Famille est la bonne, et que Windows a autorisé Node.js. |
