# Démo : Bellatrix Play, la chaîne personnelle de chaque résident

Un « YouTube / Spotify » pour la maison de soins : les **vrais enregistrements** de la jeunesse du résident, de la musique calme, de la musique pour danser, de la nature et les vidéos de la famille. Bellatrix **apprend ce que le résident aime**.

Tout tourne sur ce PC, et **rien n'est envoyé au robot**. Il faut une connexion internet, car les vidéos viennent de YouTube.

## Lancer

1. Double-clique sur **`start.bat`**. L'activité marche aussi avec les autres lanceurs.
2. Dans Care Team, choisis le patient (par exemple P1), sa langue, et l'activité **Bellatrix Play** (n° 13).
3. Ouvre **Personalise** :
   - **Year of birth** : par exemple 1945. Bellatrix prend les chansons de ses 10 à 30 ans, ici de 1955 à 1975.
   - **Favourite singers** : par exemple « Piaf, Aznavour ». Elles passent en premier.
   - **Music to avoid** : jamais jouée.
   - **Videos from the family** : une par ligne, sous la forme `Les premiers pas de Léo | https://youtu.be/…`, et seulement avec l'accord des personnes filmées.
   - **Start with** : la chaîne, la jeunesse, le calme ou la danse.
4. **Start on the patient screen**, puis **Commencer** et **Oui**.

## Le scénario (5 minutes)

1. **La chaîne** : des tuiles avec les miniatures, comme sur YouTube. Par exemple « Les chansons de 1955 à 1975 », « Pour se détendre », « Pour danser », « Nature et animaux », « Mes préférées » et « De ma famille ».
2. **Une chanson** : Bellatrix l'annonce (« Voici les chansons de votre jeunesse. Édith Piaf : … »), puis la vraie vidéo joue en grand. Les gros boutons se touchent ou se pointent à distance :
   - **❤️ J'aime** : « Avec plaisir, je la passerai plus souvent » ;
   - **Pas pour moi** : elle passe, et ne revient plus ;
   - **Suivant**, **Pause**, **Moins fort / Plus fort**, **Retour à ma chaîne**.
3. **Bellatrix apprend** : chaque cœur, chaque chanson écoutée jusqu'au bout et chaque chanson zappée change l'ordre des morceaux. « Mes préférées » apparaît dès le premier cœur.
4. **Côté soignants** : dans Care Team, la fiche Bellatrix Play montre « What P1 likes » et « Not for them ».
5. **Le bouton « 😌 Calm music now »** : pour un moment difficile, comme l'agitation en fin de journée. Il lance directement la musique calme, avec l'écran adouci.
6. **Results** : les minutes écoutées, le nombre de morceaux, les cœurs, et l'humeur avant et après.

## Les messages pour ton boss

- **Une vraie valeur, pas un gadget** : la musique personnelle de la jeunesse est l'une des aides sans médicament les plus utilisées contre l'agitation et l'anxiété dans la démence. Bellatrix la rend automatique et mesurable.
- **Personnalisé et apprenant** : comme Spotify, mais sans que le résident ait à parler. Il pointe, et Bellatrix comprend.
- **Les soignants y gagnent** : « ce qui calme Rose » est visible en un coup d'œil, et la musique calme se lance en un geste.
- **La famille contribue** : ses vidéos arrivent sur la chaîne du résident.
- **Mesuré** : temps d'écoute, cœurs, humeur avant et après. Ce sont des chiffres pour vendre le pack aux maisons de soins.
- **Respect de la vie privée** : le lecteur YouTube en mode confidentialité renforcée (youtube-nocookie). Les goûts du résident restent sur l'appareil.

## À savoir

- **Il faut internet.** Sans internet, Bellatrix le dit et joue sa propre musique calme.
- **Des publicités YouTube peuvent apparaître** sur certaines vidéos.
- **Les vidéos du catalogue** sont des vidéos officielles (artistes, maisons de disques, orchestres), vérifiées une à une. LabLand peut revérifier qu'elles sont toujours disponibles avec `node labland/play-check.mjs`.
- **Licence de diffusion :** diffuser de la musique dans une salle commune passe normalement par la licence de la maison (GEMA en Allemagne, SACEM en France). C'est à confirmer avec LabLand avant le pilote.
- **Plus tard :** remplacer YouTube par un catalogue sous licence professionnelle, et faire réagir la caméra aux sourires.
