# Plan B1 bloc B : fonctions côté équipe (agent T)

## Fichiers
- `js/staff-tools.js` : tout le bloc B (journal, checklist, hygiène, verrou nettoyage, démo, réglages, menu « Outils »).
- `css/staff-tools.css` : styles du bloc B.
- `js/i18n-staff.js` : textes FR/DE ajoutés à la fin (l'anglais est la clé).
- `android/src/.../WebActivity.java` : `BellatrixApp.battery()` et `BellatrixApp.network()`.
- `android/AndroidManifest.xml` : permission `ACCESS_NETWORK_STATE`.
- `js/staff.js` : aucun crochet pour le bloc B (tout est monté depuis staff-tools.js) ; seulement les catégories des tuiles karaoké (Musique, demandé par K) et messages (Lien social), plus la phrase du karaoké.
- `tests/staff-tools.test.mjs` : tests node (verrou 60 s, Prêt/bloqué/personnel seulement, isolation démo).

## Données (localStorage, même origine que l'écran patient)
- `bellatrix-staff-journal` : tableau `{id, at, type, staff, kind, cleaning, result, detail}` ; types `hygiene`, `checklist`, `override`, `staff-only`. Export CSV.
- `bellatrix-staff-tools` : réglages `{lockSeconds: 60, batteryMin: null, critical: ['battery','wifi'], houseRule: ''}`.
- `bellatrix-staff-initials` : initiales du soignant (« Qui êtes-vous ? »).
- `bellatrix-staff-only` : `{on, at, by, missing}` ; lisible par les autres modules.
- `bellatrix-hygiene-due` : lu (écrit par le karaoké) ; effacé à « Fait ». `bellatrix-hygiene-later` : rappel reporté.
- Démo : aucun stockage (état en mémoire).

## Étapes (ordre B4)
1. B3 checklist : 6 lignes OK / à faire / non disponible, logique pure `evaluate()`, mode « personnel seulement » (bloque « Lancer sur l'écran patient »), passer outre journalisé, historique.
2. B1 hygiène : bandeau non bloquant (Nettoyer / Fait / Plus tard), verrou tactile 60 s configurable avec compte à rebours et appui long 3 s, journal, initiales, consigne maison vide par défaut.
3. B2 démo : séquence ~6 min (accueil, message, photo, chanson, fin) dans un lecteur isolé (iframe `srcdoc` avec core + karaoké, sans patient.js), `preview: true`, garde qui bloque toute écriture (localStorage, IndexedDB, POST, saveFile). Messages et album : écrans d'exemple statiques à remplacer.
4. Journal commun + CSV.
5. Pont Java batterie / réseau ; repli navigateur `navigator.getBattery` / `navigator.onLine`, sinon « non disponible ».

## Questions ouvertes
- La batterie Android du robot reflète-t-elle la batterie de la base LuckiBot ?
- Le mode « personnel seulement » ne peut pas bloquer les appels famille côté patient sans un crochet dans `patient.js` (non modifiable ici).
