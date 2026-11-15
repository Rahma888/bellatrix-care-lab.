/* Bellatrix Atelier in three languages: the Atelier page (atelier.html) and the few sentences the game
   engine itself says (js/atelier-engine.js). English is the key, like everywhere else. A text another
   file already translates keeps that translation. */
(function () {
  'use strict';
  function addNew(l, table) {
    var have = I18N.dict[l] || {}, out = {};
    Object.keys(table).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = table[k]; });
    I18N.add(l, out);
  }
  addNew('fr', {
    'Atelier': 'Atelier', 'Care Team': 'Équipe soignante', 'Back': 'Retour',
    'Describe the game': 'Décrivez le jeu',
    'For example: a quiz about Bavarian food': 'Par exemple : un quiz sur la cuisine bavaroise',
    'Create': 'Créer', 'Ideas': 'Idées', 'In the menu': 'Dans le menu', 'No game yet.': 'Aucun jeu pour le moment.',
    'Try': 'Essayer', 'Remove': 'Retirer', 'Yes, remove': 'Oui, retirer',
    'Title': 'Titre', 'Add to menu': 'Ajouter au menu', 'Another version': 'Autre version', 'Start again': 'Recommencer',
    'Added to the menu.': 'Ajouté au menu.', 'Removed from the menu.': 'Retiré du menu.',
    'I do not know this topic yet. Write the items, one per line.': 'Je ne connais pas encore ce sujet. Écrivez les éléments, un par ligne.',
    'Kind of game': 'Type de jeu',
    'Question | right answer | wrong answer | wrong answer': 'Question | bonne réponse | mauvaise réponse | mauvaise réponse',
    'Word | category (two categories in all)': 'Mot | catégorie (deux catégories en tout)',
    'One word per line, or: word | partner': 'Un mot par ligne, ou : mot | partenaire',
    'Start of the sentence | ending': 'Début de la phrase | fin',
    'Word | word | word | the odd one': 'Mot | mot | mot | l’intrus',
    'Title | first | second | third': 'Titre | premier | deuxième | troisième',
    'This does not make a game yet. Check the lines.': 'Cela ne fait pas encore un jeu. Vérifiez les lignes.',
    'A sorting game needs exactly two categories.': 'Un jeu de tri a besoin d’exactement deux catégories.',
    'Creating…': 'Création…', 'Write a few words first.': 'Écrivez d’abord quelques mots.',
    'This tablet could not save the game.': 'Cette tablette n’a pas pu enregistrer le jeu.',
    'The menu is full. Remove a game first.': 'Le menu est plein. Retirez d’abord un jeu.',
    'A quiz about music': 'Un quiz sur la musique', 'Sort fruit and vegetables': 'Trier les fruits et les légumes',
    'Pairs with flowers': 'Des paires avec des fleurs', 'Finish the sayings': 'Compléter les dictons',
    'Odd one out in the garden': 'L’intrus au jardin', 'The seasons in order': 'Les saisons dans l’ordre',
    /* the game engine */
    'Where does it belong?': 'Où va ce mot ?', 'Finish the sentence.': 'Terminez la phrase.',
    'Which one does not belong?': 'Quel est l’intrus ?', 'What comes first?': 'Qu’est-ce qui vient en premier ?', 'What comes next?': 'Et ensuite ?',
    'Card {n}': 'Carte {n}', 'A game made by the care team in the Atelier.': 'Un jeu créé par l’équipe soignante dans l’Atelier.',
    'Find the pairs': 'Trouvez les paires', 'Well done!': 'Bravo !', 'Not quite. Try again.': 'Pas tout à fait. Essayez encore.',
    'Show answer': 'Voir la réponse', 'The answer is {end}.': 'La réponse est : {end}.', 'Continue': 'Continuer',
    'Yes, that is right!': 'Oui, c’est exact !', 'Lovely, that is it!': 'Très bien, c’est ça !'
  });
  addNew('de', {
    'Atelier': 'Atelier', 'Care Team': 'Pflegeteam', 'Back': 'Zurück',
    'Describe the game': 'Beschreiben Sie das Spiel',
    'For example: a quiz about Bavarian food': 'Zum Beispiel: ein Quiz über bayerisches Essen',
    'Create': 'Erstellen', 'Ideas': 'Ideen', 'In the menu': 'Im Menü', 'No game yet.': 'Noch kein Spiel.',
    'Try': 'Ausprobieren', 'Remove': 'Entfernen', 'Yes, remove': 'Ja, entfernen',
    'Title': 'Titel', 'Add to menu': 'Zum Menü hinzufügen', 'Another version': 'Andere Version', 'Start again': 'Neu starten',
    'Added to the menu.': 'Zum Menü hinzugefügt.', 'Removed from the menu.': 'Aus dem Menü entfernt.',
    'I do not know this topic yet. Write the items, one per line.': 'Dieses Thema kenne ich noch nicht. Schreiben Sie die Einträge, einen pro Zeile.',
    'Kind of game': 'Spielart',
    'Question | right answer | wrong answer | wrong answer': 'Frage | richtige Antwort | falsche Antwort | falsche Antwort',
    'Word | category (two categories in all)': 'Wort | Kategorie (insgesamt zwei Kategorien)',
    'One word per line, or: word | partner': 'Ein Wort pro Zeile, oder: Wort | Partner',
    'Start of the sentence | ending': 'Satzanfang | Ende',
    'Word | word | word | the odd one': 'Wort | Wort | Wort | das Unpassende',
    'Title | first | second | third': 'Titel | erstes | zweites | drittes',
    'This does not make a game yet. Check the lines.': 'Das ergibt noch kein Spiel. Bitte die Zeilen prüfen.',
    'A sorting game needs exactly two categories.': 'Ein Sortierspiel braucht genau zwei Kategorien.',
    'Creating…': 'Wird erstellt …', 'Write a few words first.': 'Schreiben Sie zuerst ein paar Worte.',
    'This tablet could not save the game.': 'Dieses Tablet konnte das Spiel nicht speichern.',
    'The menu is full. Remove a game first.': 'Das Menü ist voll. Entfernen Sie zuerst ein Spiel.',
    'A quiz about music': 'Ein Quiz über Musik', 'Sort fruit and vegetables': 'Obst und Gemüse sortieren',
    'Pairs with flowers': 'Paare mit Blumen', 'Finish the sayings': 'Sprichwörter ergänzen',
    'Odd one out in the garden': 'Was passt nicht im Garten?', 'The seasons in order': 'Die Jahreszeiten in der richtigen Reihenfolge',
    /* the game engine */
    'Where does it belong?': 'Wohin gehört das?', 'Finish the sentence.': 'Beenden Sie den Satz.',
    'Which one does not belong?': 'Was passt nicht dazu?', 'What comes first?': 'Was kommt zuerst?', 'What comes next?': 'Was kommt danach?',
    'Card {n}': 'Karte {n}', 'A game made by the care team in the Atelier.': 'Ein Spiel, das das Pflegeteam im Atelier erstellt hat.',
    'Find the pairs': 'Finden Sie die Paare', 'Well done!': 'Gut gemacht!', 'Not quite. Try again.': 'Nicht ganz. Versuchen Sie es noch einmal.',
    'Show answer': 'Antwort zeigen', 'The answer is {end}.': 'Die Antwort ist: {end}.', 'Continue': 'Weiter',
    'Yes, that is right!': 'Ja, richtig!', 'Lovely, that is it!': 'Schön, genau so heißt es!'
  });
})();
