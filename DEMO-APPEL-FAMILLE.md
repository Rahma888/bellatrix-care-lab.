# Démo : l'appel vidéo de la famille

Tout tourne sur ce PC. **Rien n'est envoyé au robot.** Le PC joue le robot, et une deuxième fenêtre joue la famille.

## Lancer

1. Ferme les autres serveurs s'ils tournent (`start.bat`, `Start store demo.bat`) : ils utilisent le même port 8765.
2. Double-clique sur **`Start family call demo.bat`**. Care Team s'ouvre.
3. La fenêtre noire du serveur doit rester ouverte. La fermer arrête la démo.

## Le parcours (environ 3 minutes)

1. **Le patient.** Dans **Activities**, choisis le patient (par exemple P1) et sa langue (Français).
2. **Inviter la famille.** Dans l'onglet **Family**, clique **Add a contact** :
   - Maria ;
   - « votre fille » : c'est ce que Bellatrix dira ;
   - « Maman » : c'est le mot de la famille ;
   - la page en français ;
   - une photo, seulement avec l'accord de la personne.

   Enregistre, puis coche **Accept calls now**.
3. **L'écran du robot.** Clique **Open the patient screen**, puis clique une fois dans cette fenêtre : le navigateur a besoin d'un clic pour autoriser le son.
4. **La famille.** Clique **Open the family page in a new window** (ou **Copy link**). La page dit « Maman est disponible ». Touche **Appeler Maman** et accepte la caméra et le micro.
5. **Ça sonne.** Sur l'écran du robot : la grande photo, et Bellatrix dit « Maria, votre fille, vous appelle ». Clique **Répondre**. Au robot, on peut aussi pointer le bouton ou montrer la main ouverte.
6. **L'appel.** On se voit et on s'entend des deux côtés.
   - L'image de la résidente est cachée par défaut, car elle peut dérouter une personne avec démence. **Me voir** l'affiche.
   - **Plus fort** monte le son.
   - Le bouton rouge raccroche.
7. **Après.** Bellatrix demande « Comment vous sentez-vous maintenant ? ». Dans Care Team → **Results**, l'appel apparaît : de qui, combien de temps, qui a raccroché.

**À montrer aussi :**
- **Un appel manqué :** personne ne répond pendant 45 secondes, et la famille voit « Maman n'a pas répondu ».
- **« Pas maintenant » :** Bellatrix dit que Maria pourra rappeler.
- **Les plages d'appel :** décoche *Accept calls now*, et la famille voit la prochaine plage.
- **Retirer le lien :** il ne marche plus tout de suite.

## Les messages pour ton boss

- **Pour la famille, rien à installer** : un lien suffit.
- **Pensé pour la démence** : grande photo, la relation annoncée à voix haute, très gros boutons, pas d'image de soi, et la possibilité de décrocher à distance.
- **L'équipe soignante garde le contrôle** : contacts approuvés, plages d'appel, liens qu'on peut retirer.
- **Vie privée** : le nom et la photo restent sur le robot. Le serveur ne connaît que le code du lien. L'image et le son vont directement d'un écran à l'autre, chiffrés, et rien n'est enregistré.

## Ce qui reste pour la suite

- **Sur un téléphone :** il faut une connexion sécurisée (HTTPS) et un relais (TURN) pour appeler depuis n'importe quel réseau.
- **Sur le robot :** le micro marche dans Bellatrix (mesuré le 9 novembre avec l'appel `getUserMedia` de l'appel : la voix entre bien dans l'appel). L'ancienne remarque « l'assistant d'Orionstar garde le micro » venait d'un test avec l'ancienne app 1.3.1 : elle est fausse. Le vrai appel avec le robot se teste avec **TEST-APPEL-1.15.md**.
- **En production :** il faut un serveur LabLand avec authentification, plutôt que ce PC.
