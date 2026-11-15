# Démo : la Bibliothèque Bellatrix (le store de jeux)

Tout tourne sur ce PC. **Rien n'est envoyé au robot** (le robot garde la version 1.8).

## Lancer

1. Si **start.bat** tourne, ferme d'abord sa fenêtre (même port 8765).
2. Double-clic sur **Start store demo.bat**. Deux pages s'ouvrent :
   - **LabLand admin** (notre côté) : `http://localhost:8765/labland/admin.html`
   - **Bellatrix Care Team** (côté maison de soins) : `http://localhost:8765/staff.html`
3. La fenêtre noire « Bellatrix Library server » doit rester ouverte. La fermer arrête la démo.

Il faut Node.js sur le PC (il est installé sur celui-ci).

## Le scénario (environ 5 minutes)

1. **Se connecter.** Dans Care Team → onglet **Library**, tape le code **DEMO-2026** puis **Connect**. Laisse l'adresse vide sur ce PC.
   - La maison « Demo care home » apparaît avec ses packs. **Bellatrix Basics** est inclus. **Memory**, **Movement** et **Music** sont actifs pendant un an. **Board games** n'est pas actif.
2. **Une fiche de jeu.** Clique sur « Picture Pair › ». Elle montre :
   - ce que le jeu fait travailler ;
   - les **6 contrôles faits par LabLand** : grands boutons, pointage à distance, pas de pression de temps, 3 langues, aucune donnée patient ne quitte le robot, hors ligne ;
   - **ce qui a été mesuré dans cette maison** : séances, humeur avant et après. Ces chiffres viennent des vraies séances enregistrées sur ce PC.
   - La fiche dit bien « bien-être et activation, pas un traitement médical ».
3. **Essai gratuit.** Sur Board games, clique **Start a free trial (30 days)**.
   - Dans l'admin, le tableau passe à « Trial until … » et « What happened » le note.
4. **Téléchargement signé.** Clique **Download and install (130 KB)** → « Installed 1.2.0 · signed by LabLand ».
   - Dans **Activities**, les échecs et les petits chevaux apparaissent. On peut lancer une partie (Preview).
5. **Demande d'activation.** Clique **Ask LabLand to activate**.
   - Dans l'admin, la demande apparaît en orange : clique **Approve (12 months)**.
   - Dans Care Team, **Check for updates** → « Active until … ».
6. **Verrouillage.** Dans l'admin, ligne Demo care home, colonne Memory, clique **Off**. Dans Care Team, **Check for updates**.
   - Les 3 activités Memory sont verrouillées 🔒 dans Activities, et « Start » est grisé.
   - Remets-les avec **12 months**.
7. **Sécurité.** Dans l'admin, coche **Security test**.
   - Dans Care Team → Library → Board games, clique **Remove from this robot**, puis **Download and install**.
   - Résultat : **« Refused: Its code was changed after LabLand signed it. Nothing was installed; this robot is safe. »**
   - Décoche ensuite Security test, puis réinstalle.

Pour recommencer : dans l'admin, bouton **Start the demo again**, puis **Check for updates** dans Care Team.

## Les messages pour ton boss

- **Qui paie** : l'établissement, jamais le patient. Ce sont des packs (Mémoire, Mouvement, Musique, Jeux de société) avec un essai gratuit de 30 jours. Les prix sont « sur demande » dans cette démo.
- **Des jeux vérifiés** : chaque jeu passe 6 contrôles avant publication, et la fiche les montre.
- **Montrer l'effet** : l'humeur avant et après est mesurée sur place, et rien ne sort du robot (RGPD).
- **Signés et hors ligne** : un jeu est signé par LabLand. Le robot refuse tout code modifié, et le jeu marche ensuite sans internet.
- **Prudence MDR** : on parle de « bien-être » et d'« activation », pas de thérapie.
- **Commencer petit** : cette « bibliothèque » est gérée par LabLand. Un vrai store ouvert aux créateurs viendra ensuite.

## Ce que la démo ne fait pas encore

- **Pas de vrai serveur LabLand** : il faudrait un serveur sur internet en HTTPS, un login pour l'admin et une base de données. Ici, tout est sur ce PC, et seul ce PC peut ouvrir l'admin.
- **Pas de paiement ni de factures.**
- **Pas de portail créateurs** : soumettre un jeu, checklist de revue, partage des revenus.
- **Une seule clé de signature, gardée sur ce PC** : `labland\keys`, jamais copiée sur un robot. En vrai, cette clé devrait rester dans un coffre sécurisé chez LabLand.
- **Rien n'est installé sur le robot.** Pour la version 1.9 sur le robot, il faudra que le robot puisse joindre le serveur de la Bibliothèque. Les échecs et les petits chevaux viendront alors du pack téléchargé.
