ok je pense la version perimeum pas pour les paraloes je penses que  les paroles doivent etre accesible pour tout le monde  je pense que la partie premium dois contenir ceci oici ce que Premium apporte en plus du compte gratuit :
Zéro pub : le gratuit t’impose des pubs, Premium les supprime. makeuseof
Écoute hors-ligne : le téléchargement de musique est réservé aux abonnés Premium. En gratuit, tu peux quand même télécharger des podcasts. makeuseof
Meilleure qualité audio : le streaming gratuit est limité à 160 kbit/s, alors que Premium propose une qualité plus haute. geeky-gadgets
Moins de contraintes de lecture : en gratuit, tu as une limite de sauts de morceaux et une lecture souvent en mode aléatoire, ce que Premium enlève.
Fonctions sociales en plus : tu peux inviter des amis Premium à écouter ensemble avec une file d’attente commune. beebom
Podcasts : tu peux les enregistrer dans des playlists et les télécharger.
En revanche, le catalogue de musique et de podcasts et les fonctions de découverte restent accessibles aux deux types de comptes +ajouter des podcasts +je sens que l'ecriture n'a pas changer make sure que t'as changer l'ecriture pas seulment pour cette page mais pour toute les deux applications

ok pour la demo je sens qu'elle a un rythme treeeess lent c'est pass humain je veux une demo dans un rythme normal qui contient tout les details en debut elle explisue qu'on a deux applications une pour le care team l'autre pour les patients ensuite on specifie que la petite ecran est pour le care team la grande display pour les patients apres on commence par la partie qui concerne le care team 
toute ces use cases qu'il peut faire et les personalisations et tousss n'oublie aucun details mais l'essennnntiel ne mais pas par exemple qui il peut ecrire un nom de patient 
car c"est evident mais surtout les fonctionnalitées critiques explique les jeux aussi breivement+ touttt n'ouble rien +je veux la demo en 
3 langues selon la langue qu'il a choisit au debut 

chech list:
# Checklist de test complète : Bellatrix 1.15.2 (robot)

Date : 10 novembre 2026 · Testeuse : Rahma · Robot : 192.168.69.157 · Version : **1.15.2**

**Comment remplir.** Pour chaque ligne, coche ☐ → ☑ si c'est OK, puis note :
- 👍 = ce que tu aimes ;
- ✏️ = ce que tu veux modifier, en écrivant **quoi** et **comment** ;
- 🐞 = un bug, en écrivant **ce que tu as fait** et **ce que tu as vu**.

Ces notes serviront à continuer le travail plus tard, même sans toi devant le robot. Plus elles sont précises (écran, bouton, mot exact), mieux c'est. Fais une capture ou une photo si c'est visuel.

Ordre conseillé : 0 → 1 → 2 → 3 … Les tests 13 et 14 (famille et appel) demandent le PC et un téléphone : garde-les pour la fin si le temps manque.

---

## 0. Préparation (5 min)

- ☐ Le robot est **sur sa base** et charge (la batterie était à 32 %, sans charger).
- ☐ Le Wi-Fi du robot est connecté.
- ☐ Care Team est ouvert. Touche **FR** en haut à droite : tout doit passer en français.
- ☐ Le patient de test est P1 ou P2, avec **Langue du patient = Français**.
- Notes :

## 1. Care Team : vue générale (10 min)

- ☐ **En-tête** : marque « Bellatrix · Équipe soignante » et 5 onglets (Activités · Résultats · Famille · Contenus · Bibliothèque), puis **Outils** et **FR / EN / DE**. Rien n'est coupé.
- ☐ **Polices** : style LabLand (fin, sans empattements), petits libellés en machine à écrire. Plus de police « à empattements ».
- ☐ **Couleurs** : crème, vert profond et abricot, pareil partout.
- ☐ **Ligne « À traiter »** : quand plusieurs choses attendent, une seule ligne. **Afficher** déplie la liste, une deuxième touche la replie.
- ☐ **EN** puis **DE** : toute la page change de langue, sans mot oublié. Reviens en **FR**.
- ☐ **Fiche patient** : code, langue, prénom pour l'accueil, la case **« Dernière activité »** (plus « Dernière humeur »), **Histoire de vie** et **Autres réglages**.
  - Dans Autres réglages : la case « Demander comment ça va » a disparu.
- ☐ **Catégories** (Toutes, Favoris, Mémoire, Musique, Mouvement, Jeux, Lien social, Quotidien) : les tuiles se filtrent bien, et Album, Lecture, Karaoké et Messages sont dans la bonne catégorie.
- ☐ **Favori** (étoile) sur une tuile, puis le filtre Favoris.
- ☐ **Aperçu** et **Lancer sur l'écran du patient** : le gros bouton vert avec son rond abricot.
- Notes 👍 / ✏️ / 🐞 :

## 2. Outils (15 min)

### 2.1 Checklist du début de service
- ☐ **Outils → Début de service** : 6 lignes (batterie, Wi-Fi, son, écran propre, contenus du jour, zone dégagée).
- ☐ **Batterie** : le pourcentage réel s'affiche. Sans seuil réglé, la ligne reste « à faire » ou demande « Vu ».
- ☐ **Tester le son** : 3 notes, puis **Entendu** / **Pas entendu**.
- ☐ **Écran propre** et **Zone dégagée** se cochent à la main.
- ☐ **Contenus du jour** : la liste du jour (demande Premium, messages à valider, playlists…).
- ☐ **On ne demande plus « Vos initiales »**, et il n'y a plus de bouton « Prêt » : à la fin, seulement **Terminer**.
- ☐ **Si une ligne bloque** : la liste en rouge et la proposition **« Personnel seulement »** ou **« Continuer quand même »**.
  - En « Personnel seulement », le bouton « Lancer sur l'écran du patient » est grisé.
  - Pour lever le mode, il faut une confirmation.
- Notes :

### 2.2 Hygiène de l'écran
- ☐ Après un karaoké (test 6), **« Désinfecter l'écran »** apparaît dans « À traiter ».
- ☐ **Mode nettoyage** : l'écran se verrouille 60 s avec un compte à rebours, et un simple toucher ne fait rien.
- ☐ Un **appui de 3 s** sort du mode avant la fin.
- ☐ **Fait** enregistre dans le journal ; **Plus tard** cache le rappel.
- Notes :

### 2.3 Journal et réglages
- ☐ **Outils → Journal** : les lignes du jour (checklist, nettoyage) et l'export **CSV**.
- ☐ **Outils → Réglages** :
  - durée du nettoyage (60 s) ;
  - seuil de batterie (vide au départ) ;
  - lignes critiques ;
  - « Consigne de nettoyage de la maison » (vide au départ).
- Notes :

### 2.4 Mode démo (10 min, laisse-la tourner)
- ☐ Elle **avance toute seule**, sans « Suivant ».
- ☐ **Mode démo** reste affiché tout le temps.
- ☐ **Voix** : Bellatrix dit une phrase par scène. Le bouton la coupe et la remet.
- ☐ **Pause / Reprendre**, **Arrêter**, **Rejouer**, les **points de chapitres** (saut) et **Quitter le mode démo**.
- ☐ Les 18 scènes. Pour chacune, note si c'est clair et beau :
  - ☐ 1 Accueil
  - ☐ 2 Care Team
  - ☐ 3 Play, l'accueil
  - ☐ 4 Play, une chanson qui joue puis la vidéo en grand
  - ☐ 5 Les 3 propositions pour la suite
  - ☐ 6 Les paroles (Premium)
  - ☐ 7 La playlist de la semaine
  - ☐ 8 Le karaoké
  - ☐ 9 L'album
  - ☐ 10 La lecture
  - ☐ 11 Le portail de la famille
  - ☐ 12 L'équipe valide
  - ☐ 13 Le message sur le robot
  - ☐ 14 L'appel vidéo
  - ☐ 15 Le Premium pour un seul résident
  - ☐ 16 La Bibliothèque
  - ☐ 17 Les outils
  - ☐ 18 La fin
- ☐ **Durée totale** : environ 10 min. Trop long ? Trop court ?
- ☐ **Après la démo**, les vrais patients et résultats sont **inchangés** : rien n'a été enregistré.
- Notes (scène par scène si besoin) :

## 3. Écran du patient : règles générales (à regarder pendant tous les tests)

- ☐ Plus de fenêtre **« Comment allez-vous ? »**, ni avant ni après.
- ☐ Chaque écran : **un titre, une image, 3 boutons au maximum**, pas de petits textes.
- ☐ Bellatrix dit **une seule phrase courte** par écran.
- ☐ **Aide** et **Arrêter** sont toujours en bas et marchent.
- ☐ Le **visage de Bellatrix** sur l'écran d'attente : le médaillon vert.
- ☐ Les boutons se touchent bien **assis**, et se visent en **pointant de loin** si la caméra est en mode pointage.
- Notes :

## 4. Activités de base (20 min, 2 min chacune)

Pour chacune, vérifie que ça démarre, que c'est beau, que la parole est courte et que la fin est propre.
- ☐ **Bonjour et programme du jour** : la date, la saison et l'heure, le menu (programme, image, musique).
- ☐ **Cartes postales souvenirs** : 3 images, l'histoire, Continuer / Réécouter.
- ☐ **Complétez le proverbe** : 3 mots et « Voir la réponse ».
- ☐ **Devinez la chanson** : un extrait, 3 titres, « Réécouter », « Chanter ensemble ».
- ☐ **Bouger assis** : le mouvement, « C'est fait », les dessins.
- ☐ **Paires d'images** : regarder, retourner, trouver les paires.
- ☐ **Choix du jour** : déjeuner et après-midi, puis le bandeau côté équipe et **Transmis ✓**.
- ☐ **Mon moment musical** : calme, joyeux ou classique ; l'écran s'assombrit pour « calme ».
- ☐ **Quiz de la gentillesse** : 3 réponses, pas de bonne ni de mauvaise réponse.
- ☐ **Échecs** : contre Bellatrix (niveau Moyen), la reprise d'une partie, les énigmes.
- ☐ **Petits chevaux** : lancer le dé (d'un geste si pointage), les pions.
- Notes :

## 5. Bellatrix Play (20 min)

- ☐ **Accueil** :
  - le grand bandeau « Les chansons qui vous font du bien » et **Écouter maintenant** ;
  - en haut : **Hits du moment**, puis **Années 2000** et **Années 2010**, chacune avec **Tout écouter** ;
  - DJ Bellatrix et Playlist IA ;
  - **Vos recommandations** (badge IA), avec un mélange d'époques ;
  - **Explorez facilement**.
- ☐ **Pochettes** : chaque chanson a sa vraie image, plus de case blanche.
- ☐ **Polices LabLand** dans Play aussi (libellés en machine à écrire).
- ☐ **Grands boutons** : menu, ⏮ ⏯ ⏭, cœur, ⊘, ✦, Paroles, Clip, − et +, et la file d'attente.
- ☐ **Vidéo** : en bas du menu, elle se met en grand quand on la touche ; **Réduire** la remet en petit.
- ☐ **✦ Chanson suivante** : 3 propositions, et **Plus comme ça** lance une radio sans fin.
- ☐ **⊘ Pas cette chanson** : elle ne revient plus.
- ☐ **Cœur**, puis **Mes favoris** : la chanson y est.
- ☐ **Écoutés récemment** : « À l'instant », « Hier »…
- ☐ **Rechercher** : le grand clavier ; essaie « STROMAE », « ADELE », « HELENE ».
- ☐ **Rechercher → Artistes / Années / Styles**.
- ☐ **DJ Bellatrix** : la musique enchaîne avec une petite phrase entre les chansons ; **Voix du DJ** coupe la phrase.
- ☐ **Playlist IA** : une idée proposée, puis une phrase tapée, par exemple « MUSIQUE CALME », « ANNÉES 80 », « COMME CÉLINE DION ».
- ☐ **Paroles** : la couronne si le patient n'a pas Premium.
- ☐ **Volume − / +** : le son de la vidéo change.
- ☐ **Terminer** ferme Play proprement.
- ☐ **Chansons qui ne se lancent pas** : note le titre et l'artiste de chacune, pour que je les retire.
- ☐ **Chansons à retirer** (contenu) : par exemple « Havana », « Old Town Road », les schlagers qui parlent d'alcool… Note celles qui ne conviennent pas.
- Notes :

## 6. Karaoké de groupe (15 min) 🔊 écoute bien

- ☐ **Le choix** : FR / DE / EN / Toutes, puis Populaires, Noël, Comptines.
- ☐ **Les chansons** : 3 par écran et « Plus de choix ».
- ☐ **Paroles** : très grandes, la ligne en cours en abricot, lisibles **à 3–4 mètres**.
- ☐ **Le son** : est-ce que la mélodie est juste, agréable, au bon volume ?
- ☐ **Boutons** :
  - Pause / Reprendre ;
  - Volume − et + ;
  - Plus lent / Plus rapide ;
  - Refrain seulement ;
  - Une autre ! ;
  - Chanson suivante ;
  - Arrêter : le son doit se couper tout de suite.
- ☐ **La fin** : « Merci à tous, c'était un beau moment », sans score.
- ☐ **Ensuite**, « Désinfecter l'écran » arrive dans Care Team (voir 2.2).
- ☐ **Contenus → Karaoké** : préparer une playlist et des chansons à éviter.
- ☐ **Décision** : on garde « Oh! Susanna » ? Note-le.
- Notes :

## 7. Contenus → Musique : playlists (10 min)

- ☐ Choisis le résident et coche le **consentement « Personnalisation musicale »**.
- ☐ **Chansons de départ** : 3 à 5 chansons préférées, ou une époque et une langue.
- ☐ **Chercher de nouvelles playlists** : un brouillon « semaine » et un brouillon « mois ».
- ☐ **Modifier la playlist** : ajouter, retirer, monter, descendre.
- ☐ **Approuver** : il n'y a plus d'initiales à taper.
- ☐ **Côté patient**, dans Play : « Votre playlist de la semaine » apparaît en haut.
- ☐ **Effacer les données d'écoute** du patient.
- ☐ Est-ce qu'il y a **trop de texte d'explication** dans cet onglet ?
- Notes :

## 8. Premium par patient (10 min)

- ☐ Dans Play, patient P2 : **Demander Premium**, puis « Demande envoyée ! ».
- ☐ Dans Care Team : « P2 aimerait Premium » dans « À traiter », puis **Voir la demande**.
- ☐ **La fenêtre** dit « Bellatrix Play Premium **pour P2** » et propose 1, 3 ou 12 mois avec le total, puis **Payer en toute sécurité** et **Confirmer (démo)**.
- ☐ **Pour P2** : Play affiche « Premium actif » et les paroles marchent.
- ☐ **Pour P1** : encore la couronne. Le Premium est seulement pour P2.
- ☐ **Bibliothèque** : « ✓ Actif pour P2 », puis la fiche, puis **Désactiver** pour P2 seulement.
- ☐ **Lecture** : un livre Premium s'ouvre pour P2 et est verrouillé pour P1.
- Notes :

## 9. Album de vie (10 min)

- ☐ **Contenus → Album** :
  - ajouter une photo depuis le robot, avec un thème, une légende et une question ;
  - masquer un thème ;
  - écrire une note.
- ☐ **Photo du jour** : à activer, puis à vérifier sur l'écran d'attente du patient.
- ☐ **Côté patient** :
  - 3 thèmes, une photo en grand avec sa légende ;
  - Précédente / Suivante / J'aime ;
  - la fin « Merci pour ce beau moment ».
- ☐ **Les dessins génériques** (sans photo personnelle) : est-ce qu'ils te plaisent ?
- Notes :

## 10. Lecture gratuite (10 min)

- ☐ **Contenus → Lecture** : règle la ville pour la météo.
- ☐ **Aujourd'hui** : le jour, l'heure, le moment de la journée et la météo.
- ☐ **Histoires courtes** :
  - en gros, page par page, lues à voix haute ;
  - la vitesse Lente / Normale / Rapide, et la pause ;
  - l'orthographe ancienne de Perrault (1697) : ça va ?
- ☐ **Horoscope « pour le plaisir »** : le signe vient de l'histoire de vie.
- ☐ **Il y a 50 ans** : un fait vérifié.
- ☐ **Livres Premium** avec couronne (voir 8).
- ☐ **Décision** : on garde « Le Petit Chaperon rouge » ?
- Notes :

## 11. Bibliothèque (App Store) (5 min)

- ☐ **À la une** : Bellatrix Play Premium.
- ☐ **Catégories** : Tout, Jeux, Musique et mouvement, Créativité, Souvenirs.
- ☐ **Échecs** et **Petits chevaux** : « Ouvrir » emmène à l'activité.
- ☐ **Les 4 apps « Bientôt »** et leur fiche (aperçus, joueurs, minutes, langues).
- ☐ **Compte** (en haut à droite) : la connexion à la Bibliothèque.
- Notes :

## 12. Résultats (5 min)

- ☐ La liste des séances du jour.
- ☐ Ouvre une séance : les compteurs ont des noms clairs, plus de noms techniques.
- ☐ **Résumé du mois pour la famille** et **Télécharger**.
- Notes :

## 13. La famille : portail et messages (20 min · PC nécessaire)

1. ☐ Sur le PC : `Start robot test server.bat`. Note l'adresse.
2. ☐ Sur le robot : **Famille → Appels → réglages** : l'adresse du serveur.
3. ☐ **Famille → Comptes famille** : créer une invitation, avec son code et son QR code.
4. ☐ Sur le PC : `http://localhost:8765/portail.html`. Inscription avec le code et accord RGPD.
5. ☐ **Le portail** : envoyer un **texte**, puis une **photo**, puis **une photo pour l'album**.
6. ☐ **Envoyés** : les statuts Reçu → Validé → Montré.
7. ☐ **Côté robot**, Famille → À valider :
   - la pastille et le compteur ;
   - **Examiner**, puis l'aperçu exact ;
   - **Valider**, **Reporter**, **Refuser** (avec un motif) ;
   - **Programmer** à une heure ;
   - « À annoncer par l'équipe ».
8. ☐ **L'écran du patient** : « Vous avez un message de… Voulez-vous le voir ? », puis Oui, la photo et le texte lu, Réécouter / Suivant.
9. ☐ **Portail** : le message passe à « Montré ». Un message refusé affiche seulement « Non affiché », sans le motif.
10. ☐ **Portail → Offrir Premium** pour 3 mois : dans Care Team, « La famille de P1 a offert Premium », puis **Activer**. Le Premium vaut pour P1 seulement.
11. ☐ **Portail → Compte** : supprimer mes messages, retirer mon accord.
12. ☐ **(Facultatif) Vrai téléphone** : `Start phone test.bat`, puis l'adresse https qu'il affiche, suivie de `/portail.html`.
- Notes :

## 14. Appel vidéo dans les deux sens (20 min · PC dans une autre pièce ou avec un casque)

Suis aussi `TEST-APPEL-1.15.md`.
- ☐ **La famille appelle** : depuis le lien famille sur le PC, **Appeler**. Le robot sonne, puis Répondre.
- ☐ **On s'entend dans les deux sens.** Le robot est-il assez fort ? Y a-t-il de l'écho ?
- ☐ **La vidéo passe dans les deux sens.**
- ☐ **Raccrocher** des deux côtés, puis l'appel apparaît dans Résultats.
- ☐ **L'équipe appelle** : Famille → Appels → contact → **Appeler**. Le lien, le QR code, Copier, WhatsApp, SMS. Sur le PC, **Rejoindre**, et ça connecte.
- ☐ **Annuler** un appel sortant.
- ☐ **Jouer ensemble** (petits chevaux) pendant l'appel.
- Notes (son, volume, écho, qualité) :

## 15. Impression générale (5 min)

- ☐ Est-ce que ça fait encore **« vibe coding »** quelque part ? Où ?
- ☐ Reste-t-il **trop de texte** quelque part ? Où ?
- ☐ Le robot **parle-t-il trop** quelque part ? Où ?
- ☐ Reste-t-il un **mot en anglais** dans l'interface en français ? Où ?
- ☐ **Lenteur ou blocage** quelque part ? Où ?
- ☐ **Tes 3 écrans préférés**.
- ☐ **Les 3 choses à changer en priorité**.

## 16. Décisions à prendre (pour toi et Kuba)

- ☐ **Playlists** : qui les approuve ? Aujourd'hui, tout le monde dans l'équipe.
- ☐ **Musique sans consentement** : faut-il utiliser l'histoire de vie pour choisir la musique ? Aujourd'hui, oui.
- ☐ **Neue Montreal** : Kuba peut-il donner les fichiers de la police (licence LabLand) ?
- ☐ **Hébergement** https pour le portail famille, **Stripe** pour le vrai paiement, **service e-mail** pour les codes de connexion.
- ☐ **Serveur TURN** pour les appels en 4G.
- ☐ **Licences** : une personne de LabLand vérifie les registres du karaoké et de la lecture.
- ☐ **Open-Meteo** (météo) : conditions commerciales à revérifier avant la vente.
- ☐ **Prix du Premium** : 10,99 € par mois et par résident, c'est bien ?

---

### Mes notes libres

(écris ici tout le reste)


 on commence la checklist : 
 
## 0. Préparation (5 min)

- ☐ Le robot est **sur sa base** et charge (la batterie était à 32 %, sans charger).
- ☐ Le Wi-Fi du robot est connecté.
- ☐ Care Team est ouvert. Touche **FR** en haut à droite : tout doit passer en français.
- ☐ Le patient de test est P1 ou P2, avec **Langue du patient = Français**.
- Notes : tout ca ok mais je vais faire  le test en anglais car c'est comme comme francais ou anglais 
1. Care Team : vue générale (10 min)

- ☐ **En-tête** : marque « Bellatrix · Équipe soignante » et 5 onglets (Activités · Résultats · Famille · Contenus · Bibliothèque), puis **Outils** et **FR / EN / DE**. Rien n'est coupé.
cv pour l'entete 
- ☐ **Polices** : style LabLand (fin, sans empattements), petits libellés en machine à écrire. Plus de police « à empattements ».
non paas tout le menu refias cette phase 
- ☐ **Couleurs** : crème, vert profond et abricot, pareil partout.//oui cbon 
- ☐ **Ligne « À traiter »** : quand plusieurs choses attendent, une seule ligne. **Afficher** déplie la liste, une deuxième touche la replie.///  j'ai pas touver cette ligne 
- ☐ **EN** puis **DE** : toute la page change de langue, sans mot oublié. Reviens en **FR**.//ca marche
- ☐ **, la casFiche patient** : code, langue, prénom pour l'accueile **« Dernière activité »** (plus « Dernière humeur »), //ca marche mais je veux enlever pas de nom car c'est pas cool 
  - Dans Autres réglages : la case « Demander comment ça va » a disparu.
- ☐ **Catégories** (Toutes, Favoris, Mémoire, Musique, Mouvement, Jeux, Lien social, Quotidien) : les tuiles se filtrent bien, et Album, Lecture, Karaoké et Messages sont dans la bonne catégorie.
- ☐ **Favori** (étoile) sur une tuile, puis le filtre Favoris.
- ☐ **Aperçu** et **Lancer sur l'écran du patient** : le gros bouton vert avec son rond abricot.
tout ca marche 
# 2. Outils (15 min)

### 2.1 Checklist du début de service
- ☐ **Outils → Début de service** : 6 lignes (batterie, Wi-Fi, son, écran propre, contenus du jour, zone dégagée).
- ☐ **Batterie** : le pourcentage réel s'affiche. Sans seuil réglé, la ligne reste « à faire » ou demande « Vu ».
- ☐ **Tester le son** : 3 notes, puis **Entendu** / **Pas entendu**.
- ☐ **Écran propre** et **Zone dégagée** se cochent à la main.
- ☐ **Contenus du jour** : la liste du jour (demande Premium, messages à valider, playlists…).
- ☐ **On ne demande plus « Vos initiales »**, et il n'y a plus de bouton « Prêt » : à la fin, seulement **Terminer**.
- ☐ **Si une ligne bloque** : la liste en rouge et la proposition **« Personnel seulement »** ou **« Continuer quand même »**.
  - En « Personnel seulement », le bouton « Lancer sur l'écran du patient » est grisé.
  - Pour lever le mode, il faut une confirmation.
  //tout ceci marche 
  ### 2.2 Hygiène de l'écran
- ☐ Après un karaoké (test 6), **« Désinfecter l'écran »** apparaît dans « À traiter ».
- ☐ **Mode nettoyage** : l'écran se verrouille 60 s avec un compte à rebours, et un simple toucher ne fait rien.
- ☐ Un **appui de 3 s** sort du mode avant la fin.
- ☐ **Fait** enregistre dans le journal ; **Plus tard** cache le rappel.
- Notes :
// ca marche mais j'ai pas encore tester la phase de karaoke donc c'est pour ca je ne peux pas savoir si ca marche ou pas pour le moment
### 2.3 Journal et réglages
- ☐ **Outils → Journal** : les lignes du jour (checklist, nettoyage) et l'export **CSV**.
- ☐ **Outils → Réglages** :
  - durée du nettoyage (60 s) ;
  - seuil de batterie (vide au départ) ;
  - lignes critiques ;
  - « Consigne de nettoyage de la maison » (vide au départ).
- Notes : ouii tout ca marche 
### 2.4 Mode démo (10 min, laisse-la tourner)
- ☐ Elle **avance toute seule**, sans « Suivant ».
- ☐ **Mode démo** reste affiché tout le temps.
- ☐ **Voix** : Bellatrix dit une phrase par scène. Le bouton la coupe et la remet.
- ☐ **Pause / Reprendre**, **Arrêter**, **Rejouer**, les **points de chapitres** (saut) et **Quitter le mode démo**.
- ☐ Les 18 scènes. Pour chacune, note si c'est clair et beau :
  - ☐ 1 Accueil
  - ☐ 2 Care Team
  - ☐ 3 Play, l'accueil
  - ☐ 4 Play, une chanson qui joue puis la vidéo en grand
  - ☐ 5 Les 3 propositions pour la suite
  - ☐ 6 Les paroles (Premium)
  - ☐ 7 La playlist de la semaine
  - ☐ 8 Le karaoké
  - ☐ 9 L'album
  - ☐ 10 La lecture
  - ☐ 11 Le portail de la famille
  - ☐ 12 L'équipe valide
  - ☐ 13 Le message sur le robot
  - ☐ 14 L'appel vidéo
  - ☐ 15 Le Premium pour un seul résident
  - ☐ 16 La Bibliothèque
  - ☐ 17 Les outils
  - ☐ 18 La fin
- ☐ **Durée totale** : environ 10 min. Trop long ? Trop court ?
- ☐ **Après la démo**, les vrais patients et résultats sont **inchangés** : rien n'a été enregistré.
- Notes (scène par scène si besoin) : 
///ok je t'ai donée mon feedback pour la demo elle doit etre refaite 

3. Écran du patient : règles générales (à regarder pendant tous les tests)

- ☐ Plus de fenêtre **« Comment allez-vous ? »**, ni avant ni après.
- ☐ Chaque écran : **un titre, une image, 3 boutons au maximum**, pas de petits textes.
- ☐ Bellatrix dit **une seule phrase courte** par écran.
- ☐ **Aide** et **Arrêter** sont toujours en bas et marchent.
- ☐ Le **visage de Bellatrix** sur l'écran d'attente : le médaillon vert.
- ☐ Les boutons se touchent bien **assis**, et se visent en **pointant de loin** si la caméra est en mode pointage.
- Notes :## 
 //oui ca marche 


 ## 4. Activités de base (20 min, 2 min chacune)

Pour chacune, vérifie que ça démarre, que c'est beau, que la parole est courte et que la fin est propre.
- ☐ **Bonjour et programme du jour** : la date, la saison et l'heure, le menu (programme, image, musique).
/// ok ca marche tout mais tu penses que c'eest vraiment a une valeur ajoute ou on peut le supprimer 
- ☐ **Cartes postales souvenirs** : 3 images, l'histoire, Continuer / Réécouter.
/// oui tout marche ici 
- ☐ **Complétez le proverbe** : 3 mots et « Voir la réponse ».

- ☐ **Devinez la chanson** : un extrait, 3 titres, « Réécouter », « Chanter ensemble ».
- ☐ **Bouger assis** : le mouvement, « C'est fait », les dessins.
- ☐ **Paires d'images** : regarder, retourner, trouver les paires.
- ☐ **Choix du jour** : déjeuner et après-midi, puis le bandeau côté équipe et **Transmis ✓**.
- ☐ **Mon moment musical** : calme, joyeux ou classique ; l'écran s'assombrit pour « calme ».
- ☐ **Quiz de la gentillesse** : 3 réponses, pas de bonne ni de mauvaise réponse.
- ☐ **Échecs** : contre Bellatrix (niveau Moyen), la reprise d'une partie, les énigmes.
- ☐ **Petits chevaux** : lancer le dé (d'un geste si pointage), les pions.
- Notes :
oky tous les jeux marches parfaitement mais pour les tous les programmes sauf les jeux c'est ennuyant de les trouver les memes proverbes /cartes souvenirs/ quiz de la gentillesse c'est ennuyant d'avoir les memes informations tous les jjous ok on garde la facon personnalisé mais on peut faire une partie ia qui genere un nouveau contenu chaque jour +je penses qu'on doit supprimer "mon moment musical car j'ai deja fait bellatrix play + bouger assis je penses qu'on ameliorer cette feature par mettre des nouveaux activiites chaque jours ou des videos youtube ou un choix de l'activité physique par exemple legs/haut body/ dos ....
## 5. Bellatrix Play (20 min)

- ☐ **Accueil** :
  - le grand bandeau « Les chansons qui vous font du bien » et **Écouter maintenant** ;
  - en haut : **Hits du moment**, puis **Années 2000** et **Années 2010**, chacune avec **Tout écouter** ;
  - DJ Bellatrix et Playlist IA ;
  - **Vos recommandations** (badge IA), avec un mélange d'époques ;
  - **Explorez facilement**.
- ☐ **Pochettes** : chaque chanson a sa vraie image, plus de case blanche.
- ☐ **Polices LabLand** dans Play aussi (libellés en machine à écrire).
- ☐ **Grands boutons** : menu, ⏮ ⏯ ⏭, cœur, ⊘, ✦, Paroles, Clip, − et +, et la file d'attente.
- ☐ **Vidéo** : en bas du menu, elle se met en grand quand on la touche ; **Réduire** la remet en petit.
- ☐ **✦ Chanson suivante** : 3 propositions, et **Plus comme ça** lance une radio sans fin.
- ☐ **⊘ Pas cette chanson** : elle ne revient plus.
- ☐ **Cœur**, puis **Mes favoris** : la chanson y est.
- ☐ **Écoutés récemment** : « À l'instant », « Hier »…
- ☐ **Rechercher** : le grand clavier ; essaie « STROMAE », « ADELE », « HELENE ».
- ☐ **Rechercher → Artistes / Années / Styles**.
- ☐ **DJ Bellatrix** : la musique enchaîne avec une petite phrase entre les chansons ; **Voix du DJ** coupe la phrase.
- ☐ **Playlist IA** : une idée proposée, puis une phrase tapée, par exemple « MUSIQUE CALME », « ANNÉES 80 », « COMME CÉLINE DION ».
- ☐ **Paroles** : la couronne si le patient n'a pas Premium.
- ☐ **Volume − / +** : le son de la vidéo change.
- ☐ **Terminer** ferme Play proprement.
- ☐ **Chansons qui ne se lancent pas** : note le titre et l'artiste de chacune, pour que je les retire.
- ☐ **Chansons à retirer** (contenu) : par exemple « Havana », « Old Town Road », les schlagers qui parlent d'alcool… Note celles qui ne conviennent pas.
- Notes :


 pour la partie bellatrix play j'ai bien specifier ce que j'aime modiifer et ce que je veux ajouter 
 ## 6. Karaoké de groupe (15 min) 🔊 écoute bien

- ☐ **Le choix** : FR / DE / EN / Toutes, puis Populaires, Noël, Comptines.
- ☐ **Les chansons** : 3 par écran et « Plus de choix ».
- ☐ **Paroles** : très grandes, la ligne en cours en abricot, lisibles **à 3–4 mètres**.
- ☐ **Le son** : est-ce que la mélodie est juste, agréable, au bon volume ?
- ☐ **Boutons** :
  - Pause / Reprendre ;
  - Volume − et + ;
  - Plus lent / Plus rapide ;
  - Refrain seulement ;
  - Une autre ! ;
  - Chanson suivante ;
  - Arrêter : le son doit se couper tout de suite.
- ☐ **La fin** : « Merci à tous, c'était un beau moment », sans score.
- ☐ **Ensuite**, « Désinfecter l'écran » arrive dans Care Team (voir 2.2).
- ☐ **Contenus → Karaoké** : préparer une playlist et des chansons à éviter.
- ☐ **Décision** : on garde « Oh! Susanna » ? Note-le.
- Notes :
///ok tout marche mais c'esttres peu de chansons ajoute d'autre chansons inspire de youtube il ya des milliers de videos de karaoke you can use this link to upload des videos de karaoke https://cnvmp3.com/v55
## 7. Contenus → Musique : playlists (10 min)

- ☐ Choisis le résident et coche le **consentement « Personnalisation musicale »**.
- ☐ **Chansons de départ** : 3 à 5 chansons préférées, ou une époque et une langue.
- ☐ **Chercher de nouvelles playlists** : un brouillon « semaine » et un brouillon « mois ».
- ☐ **Modifier la playlist** : ajouter, retirer, monter, descendre.
- ☐ **Approuver** : il n'y a plus d'initiales à taper.
- ☐ **Côté patient**, dans Play : « Votre playlist de la semaine » apparaît en haut.
- ☐ **Effacer les données d'écoute** du patient.
- ☐ Est-ce qu'il y a **trop de texte d'explication** dans cet onglet ?
- Notes :j'ai pas trouver cette cette phases pour la tester 

## 8. Premium par patient (10 min)

- ☐ Dans Play, patient P2 : **Demander Premium**, puis « Demande envoyée ! ».
- ☐ Dans Care Team : « P2 aimerait Premium » dans « À traiter », puis **Voir la demande**.
- ☐ **La fenêtre** dit « Bellatrix Play Premium **pour P2** » et propose 1, 3 ou 12 mois avec le total, puis **Payer en toute sécurité** et **Confirmer (démo)**.
- ☐ **Pour P2** : Play affiche « Premium actif » et les paroles marchent.
- ☐ **Pour P1** : encore la couronne. Le Premium est seulement pour P2.
- ☐ **Bibliothèque** : « ✓ Actif pour P2 », puis la fiche, puis **Désactiver** pour P2 seulement.
- ☐ **Lecture** : un livre Premium s'ouvre pour P2 et est verrouillé pour P1.
- Notes :


 je veux preciser que la permuim de bellatrix et la premium des livres sont separee   donc pas forcement qu'un patient a un premuim dans bellatrix play il a un dans la lecture car les deux ont un paiement separe +verifie que le paiement reste valable toujours  je vais t'expliquer comment quand je passe un premuim pour un patient et le care team l'autorise je veux tout un procedure se passe quand le care team clique sur ok une requeste de paiement sera envoyer a l'application de sa famille et quand ils autorisent la faire et entrer tout leurs donées cet pffre sera active automatiquement et quand j'accede depuis l'applicaation de care team a un autre patient qui n'a pas de compte premuim et apres je reaccede au compte de patient qui a un compte premuim je veux que je vois que l'abonnement premuim pour lui il reste valable 

 ## 9. Album de vie (10 min)

- ☐ **Contenus → Album** :
  - ajouter une photo depuis le robot, avec un thème, une légende et une question ;
  - masquer un thème ;
  - écrire une note.
- ☐ **Photo du jour** : à activer, puis à vérifier sur l'écran d'attente du patient.
- ☐ **Côté patient** :
  - 3 thèmes, une photo en grand avec sa légende ;
  - Précédente / Suivante / J'aime ;
  - la fin « Merci pour ce beau moment ».
- ☐ **Les dessins génériques** (sans photo personnelle) : est-ce qu'ils te plaisent ?
- Notes : // je penses qu'on peut combiner cette application avec celle de cartes postales souvenirs car ils ont le meme fonctionnalité

## 10. Lecture gratuite (10 min)

- ☐ **Contenus → Lecture** : règle la ville pour la météo.
- ☐ **Aujourd'hui** : le jour, l'heure, le moment de la journée et la météo.
- ☐ **Histoires courtes** :
  - en gros, page par page, lues à voix haute ;
  - la vitesse Lente / Normale / Rapide, et la pause ;
  - l'orthographe ancienne de Perrault (1697) : ça va ?
- ☐ **Horoscope « pour le plaisir »** : le signe vient de l'histoire de vie.
- ☐ **Il y a 50 ans** : un fait vérifié.
- ☐ **Livres Premium** avec couronne (voir 8).
- ☐ **Décision** : on garde « Le Petit Chaperon rouge » ?
- Notes :

ok je veux enlever ceci et  l convertir en une application de lecture des livres seulment et pour le visuel je veux qu'on voit un livre et qu'on il termine la lecture d'une page la page se trournee avec un effet visuel comme une vrai personne a tourner la page 

## 11. Bibliothèque (App Store) (5 min)

- ☐ **À la une** : Bellatrix Play Premium.
- ☐ **Catégories** : Tout, Jeux, Musique et mouvement, Créativité, Souvenirs.
- ☐ **Échecs** et **Petits chevaux** : « Ouvrir » emmène à l'activité.
- ☐ **Les 4 apps « Bientôt »** et leur fiche (aperçus, joueurs, minutes, langues).
- ☐ **Compte** (en haut à droite) : la connexion à la Bibliothèque.
- Notes :
ok j'aime cette  page 
## 12. Résultats (5 min)

- ☐ La liste des séances du jour.
- ☐ Ouvre une séance : les compteurs ont des noms clairs, plus de noms techniques.
- ☐ **Résumé du mois pour la famille** et **Télécharger**.
- Notes :
## 12. Résultats (5 min)

- ☐ La liste des séances du jour.
- ☐ Ouvre une séance : les compteurs ont des noms clairs, plus de noms techniques.
- ☐ **Résumé du mois pour la famille** et **Télécharger**.
- Notes :
 j'ai pas trouver cette page 

 j'ai pas comprendre l'utilité de la page contenus


 ## 13. La famille : portail et messages (20 min · PC nécessaire)

1. ☐ Sur le PC : `Start robot test server.bat`. Note l'adresse.
2. ☐ Sur le robot : **Famille → Appels → réglages** : l'adresse du serveur.
3. ☐ **Famille → Comptes famille** : créer une invitation, avec son code et son QR code.
4. ☐ Sur le PC : `http://localhost:8765/portail.html`. Inscription avec le code et accord RGPD.
5. ☐ **Le portail** : envoyer un **texte**, puis une **photo**, puis **une photo pour l'album**.
6. ☐ **Envoyés** : les statuts Reçu → Validé → Montré.
7. ☐ **Côté robot**, Famille → À valider :
   - la pastille et le compteur ;
   - **Examiner**, puis l'aperçu exact ;
   - **Valider**, **Reporter**, **Refuser** (avec un motif) ;
   - **Programmer** à une heure ;
   - « À annoncer par l'équipe ».
8. ☐ **L'écran du patient** : « Vous avez un message de… Voulez-vous le voir ? », puis Oui, la photo et le texte lu, Réécouter / Suivant.
9. ☐ **Portail** : le message passe à « Montré ». Un message refusé affiche seulement « Non affiché », sans le motif.
10. ☐ **Portail → Offrir Premium** pour 3 mois : dans Care Team, « La famille de P1 a offert Premium », puis **Activer**. Le Premium vaut pour P1 seulement.
11. ☐ **Portail → Compte** : supprimer mes messages, retirer mon accord.
12. ☐ **(Facultatif) Vrai téléphone** : `Start phone test.bat`, puis l'adresse https qu'il affiche, suivie de `/portail.html`.
- Notes :
ok je veux le tester avec le telephone donc donne moi comment faire ca avec mon  telephone 
de meme pour ceci  je veux le tester avec le telephone # 14. Appel vidéo dans les deux sens (20 min · PC dans une autre pièce ou avec un casque)

Suis aussi `TEST-APPEL-1.15.md`.
- ☐ **La famille appelle** : depuis le lien famille sur le PC, **Appeler**. Le robot sonne, puis Répondre.
- ☐ **On s'entend dans les deux sens.** Le robot est-il assez fort ? Y a-t-il de l'écho ?
- ☐ **La vidéo passe dans les deux sens.**
- ☐ **Raccrocher** des deux côtés, puis l'appel apparaît dans Résultats.
- ☐ **L'équipe appelle** : Famille → Appels → contact → **Appeler**. Le lien, le QR code, Copier, WhatsApp, SMS. Sur le PC, **Rejoindre**, et ça connecte.
- ☐ **Annuler** un appel sortant.
- ☐ **Jouer ensemble** (petits chevaux) pendant l'appel.
- Notes (son, volume, écho, qualité) :
//je veux le tester sur mon telephone 

# 15. Impression générale (5 min)

- ☐ Est-ce que ça fait encore **« vibe coding »** quelque part ? Où ?///oui dans style de l'ecriture c'est pas le meme qu'on utilise pour le site web que je t'ai donée
- ☐ Reste-t-il **trop de texte** quelque part ? Où ?//oui quelque part par exemple dans "contenus" et dans les 4fenetre musique+album+lecture+karaoke trop de texte et trop d'information n'oublie pas que le care team ne sont pas des informaticien et ils ne vont pas passée beaucoup de temps dans la lecture des texte 
- ☐ Le robot **parle-t-il trop** quelque part ? Où ? non cv 
- ☐ Reste-t-il un **mot en anglais** dans l'interface en français ? Où ? non je ne peux faire ceci par moi meme essaye de le faire toi meme je ne veux pas avoir deux langues dans la meme fenetre garde que la langues choisit par la personne 
- ☐ **Lenteur ou blocage** quelque part ? Où ?//oui dans la video de la demo qu'on va la refaire 
- ☐ **Tes 3 écrans préférés**. j'ai une seul pour le moment le bellatrix play 
- ☐ **Les 3 choses à changer en priorité**. tout ce que tu dis qu'on doit le changer il doit etre changer  tous ont la memepriorite 

## 16. Décisions à prendre (pour toi et Kuba)

- ☐ **Playlists** : qui les approuve ? Aujourd'hui, tout le monde dans l'équipe.
- ☐ **Musique sans consentement** : faut-il utiliser l'histoire de vie pour choisir la musique ? Aujourd'hui, oui.//pas forcement je veux quelque chose comme spotify mais j'aime bien cette idée 
- ☐ **Neue Montreal** : Kuba peut-il donner les fichiers de la police (licence LabLand) ?//pourquoi ceci
- ☐ **Hébergement** https pour le portail famille, **Stripe** pour le vrai paiement, **service e-mail** pour les codes de connexion.
- ☐ **Serveur TURN** pour les appels en 4G.
- ☐ **Licences** : une personne de LabLand vérifie les registres du karaoké et de la lecture.
- ☐ **Open-Meteo** (météo) : conditions commerciales à revérifier avant la vente.
- ☐ **Prix du Premium** : 10,99 € par mois et par résident, c'est bien ?
///on garde pour le moment tout est gratuit 