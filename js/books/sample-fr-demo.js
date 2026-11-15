/* SAMPLE (agent H, 1.16): a tiny made-up novel in the book file format, for the tests only.
   sample: true, so it is NEVER offered to residents and is not in js/books/index.js.
   Written for Bellatrix (no outside text). Format: BellatrixBooks.add({ id, lang, title, author, year,
   free, source, licence, chapters: [{ title, paras: ['plain text', …] }] }). */
BellatrixBooks.add({
  id: 'sample-fr-demo',
  sample: true,
  lang: 'fr',
  title: 'ÉCHANTILLON · Le jardin de la rue des Tilleuls',
  author: 'Bellatrix (texte d’essai)',
  year: 2026,
  free: true,
  source: 'https://app.bellatrix/books/sample',
  licence: 'Texte d’essai écrit pour Bellatrix, sans droits de tiers',
  chapters: [
    {
      title: 'Chapitre premier · Le portail vert',
      paras: [
        'Au bout de la rue des Tilleuls, il y avait un portail vert que personne ne fermait jamais. Derrière, un jardin un peu sauvage descendait doucement vers la rivière.',
        'Madame Hélène y venait chaque matin avec son panier. Elle saluait le merle du cerisier, qui ne répondait jamais, puis elle s’asseyait sur le banc de pierre pour regarder le jour se lever.',
        'Ce matin-là, une lettre attendait sur le banc, glissée sous un caillou rond. L’enveloppe était jaune, un peu froissée, et portait seulement ces mots : « Pour la dame du jardin ».',
        'Hélène tourna l’enveloppe entre ses doigts. Elle ne connaissait pas cette écriture, ronde et appliquée, comme celle d’un enfant qui a beaucoup travaillé ses lettres.',
        'Elle décida de ne pas l’ouvrir tout de suite. Une lettre trouvée dans un jardin, pensa-t-elle, mérite qu’on la lise avec une tasse de thé.'
      ]
    },
    {
      title: 'Chapitre deux · La lettre jaune',
      paras: [
        'La bouilloire chanta. Hélène posa la tasse sur la table de la cuisine, près de la fenêtre, et ouvrit enfin l’enveloppe avec le couteau à beurre.',
        '« Chère Madame, écrivait la lettre, je vous vois tous les matins depuis ma fenêtre. Vous parlez au merle. Moi aussi, je lui parle, mais il ne me répond pas non plus. »',
        'Hélène rit doucement. Il y avait donc, quelque part dans la rue, une autre personne qui parlait aux oiseaux.',
        'Plus bas, la lettre disait encore : « Si vous voulez bien, laissez-moi une réponse sous le caillou rond. Je m’appelle Louis. J’ai neuf ans et je collectionne les feuilles d’arbres. »',
        'Elle chercha du papier, trouva une carte postale d’un lac de montagne et réfléchit longtemps à ce qu’elle allait écrire.'
      ]
    },
    {
      title: 'Chapitre trois · La réponse',
      paras: [
        'Le lendemain, la carte attendait sous le caillou. Hélène avait écrit qu’elle aussi aimait les feuilles, surtout celles du tilleul, qui sentent bon en juin.',
        'Elle avait ajouté un petit poème, appris autrefois à l’école :\nLe vent passe dans les branches,\nLes feuilles dansent sans bruit,\nEt le jardin, le dimanche,\nGarde le soleil pour la nuit.',
        'Quand elle revint le soir, la carte avait disparu. À sa place, sous le caillou, il y avait une feuille de tilleul, bien à plat, toute verte.',
        'Hélène la rangea dans son livre préféré. Le merle, sur le cerisier, la regardait faire. Il ne dit rien, comme d’habitude, mais elle eut l’impression qu’il souriait.'
      ]
    }
  ]
});
