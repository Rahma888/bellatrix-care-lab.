# Brief de travail : Bellatrix 1.15.2 → 1.16 (retours du test robot du 10 nov. 2026)

Source : Rahma (testeuse, cheffe de produit de fait), 10 nov. 2026. Kuba = développeur de l'app des jeux.
Deux applications : **Care Team** (petit écran, équipe soignante non informaticienne, lit peu et vite) et **écran patient** (grand écran du robot : Play, karaoké, jeux, album, lecture). Langues FR / EN / DE, une seule langue visible à la fois. Rahma teste en anglais. « Gratuit » = le développeur ne paie AUCUN service (pas d'API payante, pas de prestataire de paiement, rien). Les FAMILLES voient le vrai prix (10,99 €/mois/résident, en configuration) ; le paiement est simulé, sans aucun débit réel (précision de Rahma, 10 nov.).

**Validé, ne pas casser** : en-tête Care Team, couleurs (crème / vert profond / abricot), bascule FR/EN/DE, catégories, favoris, aperçu/lancement, checklist de début de service, journal et réglages, règles de l'écran patient, tous les jeux (échecs, petits chevaux, paires…), Cartes postales souvenirs (dans leur principe), Bibliothèque (très appréciée), Bellatrix Play dans son principe.

## Règles globales
- Care Team = non-techniciens : peu de texte, phrases courtes, libellés clairs, une action évidente par écran. Si un écran a besoin d'un paragraphe d'explication, il est mal conçu.
- Une seule langue par fenêtre, aucun mot d'une autre langue (chaînes, menus, boutons, erreurs, voix de Bellatrix, démo). Audit des deux apps dans les 3 langues + test automatique qui repère les chaînes non traduites ou mélangées.
- Typographie cohérente dans TOUTES les pages des DEUX apps (chantier A).
- Côté patient : « un titre, une image, 3 boutons maximum, une phrase courte de Bellatrix ».

## Chantiers (même priorité, tout doit être fait)

**A. Style d'écriture.** « Je sens que l'écriture n'a pas changé. » Reproduire la typographie du site LabLand (https://labland.ai/office), mesurée le 10 nov. :
- Titres : Neue Montreal 400, 48 px, interligne 0,9, interlettrage −0,025 em.
- Texte courant : « JHA Times Now » (empattements) 300, 28 px, interligne ≈ 1,0–1,1, interlettrage −0,025 em, gras 700 pour les mots mis en avant.
- Petits libellés : Neue Montreal 300, 14 px, en MAJUSCULES ; libellés de section 20 px 400 majuscules ; petits textes 12 px 300.
- Courier Prime pour les rares citations « code ».
- Neue Montreal et Times Now sont sous licence LabLand : ne pas embarquer de fichiers ; alternative libre très proche derrière UNE variable de thème (changement en une ligne quand Kuba fournit les fichiers).
- Partout : Care Team, Play, karaoké, album, lecture, démo, Bibliothèque, outils, modales. Aucune police à empattements « décorative » restante (DM Serif). Captures comparées au site.

**B. Langues.** Audit FR/EN/DE complet des deux apps, voix et démo comprises ; corriger tout mélange ; test automatique.

**C. Care Team : simplification et repérage.**
- Trop de texte dans « Contenus » et ses 4 fenêtres (Musique, Album, Lecture, Karaoké) : réduire drastiquement. Rahma n'a pas compris à quoi sert « Contenus » : le repenser (nom, structure, rôle) pour qu'un soignant comprenne en 3 secondes ; refléter les fusions/suppressions des chantiers E/G/H.
- Playlists (test 7) : introuvables → chemin court, nom clair.
- Résultats (test 12) : page introuvable → vérifier qu'elle existe et est accessible.
- Ligne « À traiter » : Rahma ne l'a pas vue. Elle n'apparaît que s'il y a des éléments, mais dès qu'il y en a. Cas reproductible (demande Premium, message à valider, rappel de désinfection) : prouver qu'elle s'affiche, se déplie, se replie.
- Hygiène (test 2.2) : à tester de bout en bout après le karaoké.
- Fiche patient : retirer « pas de nom » (« Patient code (no names) » / « Code patient (pas de nom) ») — « ce n'est pas cool ». Libellé neutre et respectueux.

**D. Activités du jour : contenu nouveau chaque jour.** Proverbes, cartes souvenirs, quiz de la gentillesse sont toujours les mêmes → ennuyeux. Garder la personnalisation ET ajouter une génération de contenu « IA » nouvelle chaque jour : langue du patient ; adapté à l'âge et aux capacités ; ton bienveillant, quiz sans bonne/mauvaise réponse ; sans sujet anxiogène (deuil, maladie, politique, religion imposée) ; personnalisation par l'histoire de vie quand elle existe ; un lot par jour en cache ; repli hors ligne ; bouton équipe « ne plus proposer ». « Bonjour et programme du jour » : simplifier et en faire l'écran d'accueil quotidien (date, saison, heure) plutôt qu'une activité séparée — rien supprimer sans le dire.

**E. « Mon moment musical » et « Bouger assis ».** Supprimer « Mon moment musical » (doublon de Play) partout (catégories, démo, résultats, traductions, checklist). Refaire « Bouger assis » : nouveaux exercices chaque jour, choix de la zone (jambes / haut du corps / dos / …), option vidéos via le lecteur intégré officiel (jamais de téléchargement) avec repli illustré/animé local ; séances courtes, sûres assis, instructions très simples, « C'est fait » conservé.

**F. Karaoké : beaucoup plus de chansons.** INTERDIT : télécharger/convertir des vidéos YouTube (cnvmp3.com et équivalents). Voies : (1) lecteur YouTube intégré officiel pour des chaînes de karaoké officielles (réseau requis, CGU) ; (2) gros catalogue du domaine public (comptines, Volkslieder, traditionnels, Noël) avec accompagnement et paroles générés localement FR/DE/EN ; (3) catalogue sous licence, à chiffrer plus tard. Implémenter 1 et 2, catégories Populaires/Noël/Comptines, pagination « Plus de choix ». Aucune parole protégée dans l'app. Garder : paroles très grandes, boutons, arrêt immédiat, fin sans score. Décision en attente : « Oh! Susanna ».

**G. Album + Cartes postales souvenirs → une seule activité de souvenirs** (photos perso ou images génériques, thème, légende, question, histoire racontée, Précédente/Suivante/J'aime, fin « Merci pour ce beau moment », photo du jour). Migrer sans perte ; une seule entrée Care Team et patient ; contenu quotidien du chantier D sans photo perso.

**H. Lecture → application de lecture de livres uniquement.** Supprimer « Aujourd'hui » (jour/heure/météo), horoscope, « Il y a 50 ans », réglage de ville. Visuel : un livre ouvert ; en fin de page, animation réaliste de page qui se tourne (courbure, ombre, léger délai). Garder : lecture à voix haute, vitesse Lente/Normale/Rapide, pause, texte gros, page par page. Livres Premium = abonnement séparé (I). Décision en attente : « Le Petit Chaperon rouge ».

**I. Premium : règles, flux de paiement, persistance (critique).**
- Deux abonnements séparés, par patient : « Bellatrix Play Premium » et « Livres Premium ». L'un n'implique jamais l'autre. Paiements séparés.
- Paroles GRATUITES pour tous : retirer couronne et verrou des paroles dans Play.
- Gratuit (Play) : publicités (discrètes, internes/placeholder, jamais au milieu d'une interaction critique, aucun faux bouton), pas de téléchargement hors ligne de musique, qualité audio limitée (≈160 kbit/s), sauts limités et lecture souvent aléatoire, pas de fonctions sociales ; catalogue musique + podcasts + découverte accessibles. Podcasts : téléchargeables même en gratuit.
- Premium Play : zéro pub ; écoute hors ligne (musique et podcasts) ; meilleure qualité audio ; sauts illimités et choix libre du morceau ; fonctions sociales (écoute ensemble avec un proche Premium, file d'attente commune) ; podcasts enregistrables dans des playlists et téléchargeables.
- Ajouter les PODCASTS à Play (catalogue, écoute, playlists).
- Flux d'achat (démo, sans débit) : 1) l'équipe clique OK pour autoriser le Premium d'un patient (Play ou Livres) ; 2) une demande de paiement part vers l'application/portail de la famille ; 3) la famille autorise et saisit ses informations (formulaire simulé, aucune donnée de carte stockée) ; 4) activation automatique pour ce patient et ce produit ; 5) statuts visibles équipe et famille : demandée → en attente de la famille → payée/active (ou refusée/expirée).
- Persistance : l'abonnement reste valable jusqu'au terme/annulation, y compris en passant à un autre patient puis en revenant, après redémarrage de l'app/du robot, après changement de langue. Test automatisé : P2 Premium Play → P1 sans Premium → retour P2 : toujours « Premium actif » ; activer Play ne change rien pour Livres et inversement. Cadeaux famille : mêmes règles, par produit et par patient.

**J. Musique façon Spotify.** Recommandations, mixes, playlists générées, DJ, radio ; personnalisation surtout par écoute et favoris (avec consentement) ; histoire de vie = couche optionnelle activable par l'équipe, pas requise. Garder consentement et effacement des données d'écoute. Approbation des playlists : toute l'équipe. Appliquer aussi le fichier de retours Play de Rahma (à demander s'il manque).

**K. Mode démo : à refaire entièrement.** Rythme naturel de présentateur humain, transitions rapides, aucune attente morte, ≈ 6–8 min. Commence par le choix de la langue FR/EN/DE ; tout suit ce choix. Ouverture : deux applications (Care Team pour l'équipe, une pour les patients) ; le petit écran = Care Team, le grand écran = patient. D'abord Care Team : tous les cas d'usage et personnalisations essentiels (pas les évidences comme saisir un nom), en insistant sur début de service, hygiène, validation des messages famille, Premium et son flux de paiement par la famille, consentements, journal/résultats, réglages, Bibliothèque. Puis patient : Play (paroles gratuites, DJ, playlist IA, recommandations, podcasts, Premium), karaoké, jeux (une phrase chacun), souvenirs fusionnés, lecture de livres avec page qui se tourne, messages et appels famille, activités quotidiennes. Refléter tous les changements de ce brief. Garder : avance automatique, pause/reprise, arrêt, rejouer, chapitres, quitter, voix coupable, aucune donnée réelle modifiée. Mesurer la durée dans chaque langue.

**L. Test sur téléphone réel (tests 13 et 14).** Guide pas-à-pas très court en français : prérequis (même Wi-Fi), serveur de test, script « téléphone » pour l'adresse https, portail sur le téléphone, RGPD, texte/photo/photo d'album, validation robot, statut côté famille, cadeau Premium, appel dans les deux sens. Pourquoi https (caméra/micro), 4G (TURN requis, sinon Wi-Fi), erreurs fréquentes (certificat, permissions, pare-feu, écho). Vérifier soi-même scripts et flux ; aligner `TEST-APPEL-1.15.md`.

**M. Décisions et reportés.** Aucun service payant pour le développeur (ni API, ni Stripe réel) ; les familles voient le prix (10,99 €/mois/résident) pris dans la CONFIGURATION, pas en dur ; paiement simulé, sans débit (précision du 10 nov. : ce n'est PAS « gratuit pour les familles »). Reportés : hébergement https, Stripe réel, e-mail des codes, TURN en production, licences par LabLand, Open-Meteo (vérifier si la météo est encore utilisée).

**N. Vérification finale.** Rejouer la checklist (y compris 2.2, 7, 12), parcours FR/EN/DE, cohérence visuelle, checklist de re-test courte centrée sur les changements.

## Ambiguïtés (interprétation retenue)
1. « Enlever pas de nom » = le libellé « Code patient (pas de nom) » : le remplacer par un libellé neutre et respectueux.
2. Musique sans consentement : voir J.
3. Neue Montreal : voir A.

## Interdits
Pas de téléchargement/conversion/embarquement de vidéo YouTube ; pas de paroles protégées ; pas de police sous licence sans fichiers ; aucun débit réel ni donnée de carte ; aucun mélange de langues ; pas de longs textes dans Care Team.

## Décisions de Rahma, 10 nov. après-midi (remplacent ce qui précède)
- **Prix :** « gratuit » = le développeur ne paie aucun service. Les familles voient le vrai prix (10,99 €/mois/résident/produit, configuration) ; paiement simulé, aucun débit.
- **Lecture (H) :** des ROMANS pour personnes âgées, pas des contes courts et simples. Chaque livre reprend, pour chaque patient, à la page où ce patient s'est arrêté (pour tous, pas seulement Premium). « Le Petit Chaperon rouge » disparaît avec les contes.
- **Messages famille (BF-11/12/13) :** aucune validation de l'équipe ; l'équipe reçoit une notification pour amener le robot au bon résident. Pas de navigation autonome pour l'instant.
- **Consentement (BF-27) :** l'équipe le note sur la fiche du patient ; la famille le voit sans pouvoir le changer.
- **Humeur (BF-08) :** aucune humeur dans le fil famille.
- **Karaoké :** « Oh! Susanna » retirée.
- **Test de demain :** sur iPhone (Safari), serveur sur le PC via le tunnel gratuit.
- **Style :** aucun look « vibe coding », y compris dans le portail famille ; même typographie LabLand partout.
