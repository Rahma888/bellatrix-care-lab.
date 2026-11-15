/* Bellatrix Atelier - the offline generator: always there, free, no network.
   It reads the carer's short request by keywords (which kind of game, which topic) in French, German or
   English and builds a game spec (js/atelier-engine.js) from the bank of topics below. A topic it does
   not know is no problem: the Atelier then asks the carer to type the items, one per line
   (AtelierGen.fromLines).
   The bank, per topic and language:
     quiz    'Question|right answer|wrong|wrong'
     groups  'Category = word, word, …'   (two groups: sorting, odd one out, pairs)
     order   'Title|first|second|third…'
     sayings 'Start|ending|wrong|wrong'
   Plain ES5. Also loaded by Node for the tests. */
var AtelierGen = (function () {
  'use strict';
  var E = typeof AtelierEngine !== 'undefined' ? AtelierEngine : (typeof require !== 'undefined' ? require('./atelier-engine.js') : null);

  var TYPE_NAME = {
    quiz: { en: 'Quiz', fr: 'Quiz', de: 'Quiz' },
    sort: { en: 'Sorting', fr: 'Tri', de: 'Sortieren' },
    pairs: { en: 'Pairs', fr: 'Paires', de: 'Paare' },
    saying: { en: 'Sayings', fr: 'Dictons', de: 'Sprichwörter' },
    odd: { en: 'Odd one out', fr: 'L’intrus', de: 'Was passt nicht?' },
    order: { en: 'In order', fr: 'Dans l’ordre', de: 'Reihenfolge' }
  };
  /* Words that name a kind of game (lower case, no accents). The first kind that matches wins. */
  var TYPE_WORDS = [
    ['odd', ['odd', 'intrus', 'intruder', 'does not belong', 'doesnt belong', 'passt nicht', 'gehort nicht', 'aussenseiter']],
    ['order', ['order', 'ordre', 'reihenfolge', 'ordnen', 'ordne', 'sequence', 'chronologie', 'chronologique', 'etapes', 'schritte', 'steps']],
    ['pairs', ['pairs', 'pair', 'memory', 'memo', 'paires', 'paire', 'memoire', 'paare', 'paar', 'parchen', 'matching']],
    ['sort', ['sort', 'sorting', 'trier', 'trie', 'tri', 'classer', 'classe', 'classement', 'sortieren', 'sortiere', 'sortier', 'sortierspiel', 'zuordnen', 'categories', 'kategorien']],
    ['saying', ['saying', 'sayings', 'proverb', 'proverbs', 'proverbe', 'proverbes', 'dicton', 'dictons', 'sprichwort', 'sprichworter', 'redewendung', 'redewendungen',
      'complete', 'completer', 'finish', 'erganzen', 'erganze', 'vervollstandigen', 'luckentext']],
    ['quiz', ['quiz', 'quizz', 'question', 'questions', 'frage', 'fragen', 'ratespiel', 'raten', 'devinette', 'devinettes', 'wissen']]
  ];

  var BANK = [
    { id: 'bavaria', keys: 'bavaria bavarian bayern bayerisch bayerische bayerischen bayrisch baviere bavarois bavaroise munich munchen passau',
      title: { en: 'Bavaria', fr: 'La Bavière', de: 'Bayern' },
      quiz: {
        en: ['What is the capital of Bavaria?|Munich|Nuremberg|Augsburg', 'Which sausage is eaten with sweet mustard?|Weisswurst|Bratwurst|Salami',
          'What is the famous festival in Munich called?|Oktoberfest|Carnival|Christmas market', 'Which river flows through Passau?|The Danube|The Rhine|The Elbe',
          'Which baked good is twisted and salted?|The pretzel|The croissant|The doughnut', 'What is the highest mountain in Germany?|The Zugspitze|The Brocken|The Feldberg',
          'Which fairy-tale castle did King Ludwig II build?|Neuschwanstein|Sanssouci|Heidelberg'],
        fr: ['Quelle est la capitale de la Bavière ?|Munich|Nuremberg|Augsbourg', 'Quelle saucisse mange-t-on avec de la moutarde douce ?|La saucisse blanche|La saucisse grillée|Le salami',
          'Comment s’appelle la grande fête de Munich ?|La fête de la bière|Le carnaval|Le marché de Noël', 'Quel fleuve traverse Passau ?|Le Danube|Le Rhin|L’Elbe',
          'Quel pain est noué et salé ?|Le bretzel|Le croissant|Le beignet', 'Quelle est la plus haute montagne d’Allemagne ?|La Zugspitze|Le Brocken|Le Feldberg',
          'Quel château de conte de fées a fait bâtir Louis II ?|Neuschwanstein|Sans-Souci|Heidelberg'],
        de: ['Wie heißt die Hauptstadt von Bayern?|München|Nürnberg|Augsburg', 'Welche Wurst isst man mit süßem Senf?|Die Weißwurst|Die Bratwurst|Die Salami',
          'Wie heißt das berühmte Fest in München?|Oktoberfest|Fasching|Christkindlmarkt', 'Welcher Fluss fließt durch Passau?|Die Donau|Der Rhein|Die Elbe',
          'Welches Gebäck ist geschlungen und gesalzen?|Die Breze|Das Hörnchen|Der Krapfen', 'Wie heißt der höchste Berg Deutschlands?|Die Zugspitze|Der Brocken|Der Feldberg',
          'Welches Märchenschloss ließ König Ludwig II. bauen?|Neuschwanstein|Sanssouci|Heidelberg'] },
      groups: {
        en: ['Bavarian food = pretzel, Weisswurst, dumpling, Obatzda, Leberkäse, roast pork', 'Bavarian towns = Munich, Nuremberg, Passau, Regensburg, Augsburg, Würzburg'],
        fr: ['Spécialités bavaroises = bretzel, saucisse blanche, quenelle, obatzda, leberkäse, rôti de porc', 'Villes de Bavière = Munich, Nuremberg, Passau, Ratisbonne, Augsbourg, Wurtzbourg'],
        de: ['Bayerische Schmankerl = Breze, Weißwurst, Knödel, Obatzda, Leberkäse, Schweinsbraten', 'Bayerische Städte = München, Nürnberg, Passau, Regensburg, Augsburg, Würzburg'] },
      order: {
        en: ['Towns along the Danube, downstream|Ingolstadt|Regensburg|Straubing|Passau', 'A Weisswurst breakfast|Heat the sausages|Add sweet mustard|Take a pretzel|Enjoy'],
        fr: ['Villes le long du Danube, vers l’aval|Ingolstadt|Ratisbonne|Straubing|Passau', 'Un petit-déjeuner bavarois|Chauffer les saucisses|Ajouter la moutarde douce|Prendre un bretzel|Se régaler'],
        de: ['Städte an der Donau, flussabwärts|Ingolstadt|Regensburg|Straubing|Passau', 'Ein Weißwurstfrühstück|Würste erwärmen|Süßen Senf dazu|Eine Breze nehmen|Genießen'] } },

    { id: 'germany', keys: 'germany german deutschland deutsch deutsche deutschen allemagne allemand allemande allemands',
      title: { en: 'Germany', fr: 'L’Allemagne', de: 'Deutschland' },
      quiz: {
        en: ['What is the capital of Germany?|Berlin|Hamburg|Munich', 'Which river flows through Cologne?|The Rhine|The Danube|The Elbe',
          'Which city has a large port on the Elbe?|Hamburg|Stuttgart|Leipzig', 'Which sea lies to the north of Germany?|The North Sea|The Mediterranean|The Black Sea',
          'What are the colours of the German flag?|Black, red, gold|Blue, white, red|Green, white, red', 'Which forest is famous for its cuckoo clocks?|The Black Forest|The Bavarian Forest|The Harz'],
        fr: ['Quelle est la capitale de l’Allemagne ?|Berlin|Hambourg|Munich', 'Quel fleuve traverse Cologne ?|Le Rhin|Le Danube|L’Elbe',
          'Quelle ville a un grand port sur l’Elbe ?|Hambourg|Stuttgart|Leipzig', 'Quelle mer borde le nord de l’Allemagne ?|La mer du Nord|La Méditerranée|La mer Noire',
          'Quelles sont les couleurs du drapeau allemand ?|Noir, rouge, or|Bleu, blanc, rouge|Vert, blanc, rouge', 'Quelle forêt est célèbre pour ses coucous ?|La Forêt-Noire|La forêt de Bavière|Le Harz'],
        de: ['Wie heißt die Hauptstadt von Deutschland?|Berlin|Hamburg|München', 'Welcher Fluss fließt durch Köln?|Der Rhein|Die Donau|Die Elbe',
          'Welche Stadt hat einen großen Hafen an der Elbe?|Hamburg|Stuttgart|Leipzig', 'Welches Meer liegt im Norden Deutschlands?|Die Nordsee|Das Mittelmeer|Das Schwarze Meer',
          'Welche Farben hat die deutsche Fahne?|Schwarz, Rot, Gold|Blau, Weiß, Rot|Grün, Weiß, Rot', 'Welcher Wald ist für seine Kuckucksuhren bekannt?|Der Schwarzwald|Der Bayerische Wald|Der Harz'] },
      groups: {
        en: ['German cities = Berlin, Hamburg, Cologne, Dresden, Leipzig, Frankfurt', 'German rivers = Rhine, Danube, Elbe, Main, Moselle, Weser'],
        fr: ['Villes allemandes = Berlin, Hambourg, Cologne, Dresde, Leipzig, Francfort', 'Fleuves allemands = Rhin, Danube, Elbe, Main, Moselle, Weser'],
        de: ['Deutsche Städte = Berlin, Hamburg, Köln, Dresden, Leipzig, Frankfurt', 'Deutsche Flüsse = Rhein, Donau, Elbe, Main, Mosel, Weser'] },
      order: {
        en: ['From north to south|Hamburg|Hanover|Frankfurt|Munich', 'The colours of the flag, from top to bottom|Black|Red|Gold'],
        fr: ['Du nord au sud|Hambourg|Hanovre|Francfort|Munich', 'Les couleurs du drapeau, de haut en bas|Noir|Rouge|Or'],
        de: ['Von Norden nach Süden|Hamburg|Hannover|Frankfurt|München', 'Die Farben der Fahne, von oben nach unten|Schwarz|Rot|Gold'] } },

    { id: 'france', keys: 'france french frankreich franzosisch franzosische franzosischen francais francaise francaises paris',
      title: { en: 'France', fr: 'La France', de: 'Frankreich' },
      quiz: {
        en: ['What is the capital of France?|Paris|Lyon|Marseille', 'Which river flows through Paris?|The Seine|The Loire|The Rhône',
          'Which tower is the symbol of Paris?|The Eiffel Tower|The Leaning Tower|Big Ben', 'What are the colours of the French flag?|Blue, white, red|Black, red, gold|Green, white, red',
          'Which long loaf is typical of France?|The baguette|The pretzel|The rye loaf', 'Which sea lies to the south of France?|The Mediterranean|The North Sea|The Baltic Sea'],
        fr: ['Quelle est la capitale de la France ?|Paris|Lyon|Marseille', 'Quel fleuve traverse Paris ?|La Seine|La Loire|Le Rhône',
          'Quelle tour est le symbole de Paris ?|La tour Eiffel|La tour de Pise|Big Ben', 'Quelles sont les couleurs du drapeau français ?|Bleu, blanc, rouge|Noir, rouge, or|Vert, blanc, rouge',
          'Quel pain long est typique de la France ?|La baguette|Le bretzel|Le pain de seigle', 'Quelle mer borde le sud de la France ?|La Méditerranée|La mer du Nord|La mer Baltique'],
        de: ['Wie heißt die Hauptstadt von Frankreich?|Paris|Lyon|Marseille', 'Welcher Fluss fließt durch Paris?|Die Seine|Die Loire|Die Rhone',
          'Welcher Turm ist das Wahrzeichen von Paris?|Der Eiffelturm|Der Schiefe Turm|Big Ben', 'Welche Farben hat die französische Fahne?|Blau, Weiß, Rot|Schwarz, Rot, Gold|Grün, Weiß, Rot',
          'Welches lange Brot ist typisch für Frankreich?|Das Baguette|Die Breze|Das Roggenbrot', 'Welches Meer liegt im Süden Frankreichs?|Das Mittelmeer|Die Nordsee|Die Ostsee'] },
      groups: {
        en: ['French cities = Paris, Lyon, Marseille, Bordeaux, Strasbourg, Nice', 'French cheeses = Camembert, Brie, Roquefort, Comté, Munster, Reblochon'],
        fr: ['Villes françaises = Paris, Lyon, Marseille, Bordeaux, Strasbourg, Nice', 'Fromages français = camembert, brie, roquefort, comté, munster, reblochon'],
        de: ['Französische Städte = Paris, Lyon, Marseille, Bordeaux, Straßburg, Nizza', 'Französischer Käse = Camembert, Brie, Roquefort, Comté, Munster, Reblochon'] },
      order: {
        en: ['A French meal|Starter|Main course|Cheese|Dessert', 'The colours of the flag, from left to right|Blue|White|Red'],
        fr: ['Un repas français|L’entrée|Le plat|Le fromage|Le dessert', 'Les couleurs du drapeau, de gauche à droite|Bleu|Blanc|Rouge'],
        de: ['Ein französisches Essen|Vorspeise|Hauptgericht|Käse|Nachspeise', 'Die Farben der Fahne, von links nach rechts|Blau|Weiß|Rot'] } },

    { id: 'food', keys: 'food foods eat eating meal meals fruit fruits vegetable vegetables kitchen cooking essen lebensmittel obst gemuse kuche kochen speisen nourriture aliment aliments manger repas legume legumes cuisine',
      title: { en: 'Food', fr: 'À table', de: 'Essen' },
      quiz: {
        en: ['Which fruit is yellow and curved?|Banana|Cherry|Plum', 'What is bread made from?|Flour|Sugar|Butter', 'What do bees make?|Honey|Jam|Milk',
          'Which vegetable makes us cry when we cut it?|Onion|Carrot|Cucumber', 'What is cheese made from?|Milk|Eggs|Flour', 'Which drink is made from grapes?|Wine|Beer|Coffee'],
        fr: ['Quel fruit est jaune et courbé ?|La banane|La cerise|La prune', 'Avec quoi fait-on le pain ?|La farine|Le sucre|Le beurre', 'Que fabriquent les abeilles ?|Le miel|La confiture|Le lait',
          'Quel légume fait pleurer quand on le coupe ?|L’oignon|La carotte|Le concombre', 'Avec quoi fait-on le fromage ?|Le lait|Les œufs|La farine', 'Quelle boisson vient du raisin ?|Le vin|La bière|Le café'],
        de: ['Welche Frucht ist gelb und krumm?|Die Banane|Die Kirsche|Die Pflaume', 'Woraus wird Brot gebacken?|Aus Mehl|Aus Zucker|Aus Butter', 'Was machen die Bienen?|Honig|Marmelade|Milch',
          'Welches Gemüse bringt uns beim Schneiden zum Weinen?|Die Zwiebel|Die Karotte|Die Gurke', 'Woraus wird Käse gemacht?|Aus Milch|Aus Eiern|Aus Mehl', 'Welches Getränk wird aus Trauben gemacht?|Wein|Bier|Kaffee'] },
      groups: {
        en: ['Fruit = apple, pear, cherry, plum, strawberry, grape', 'Vegetables = carrot, potato, cabbage, onion, leek, bean'],
        fr: ['Fruits = pomme, poire, cerise, prune, fraise, raisin', 'Légumes = carotte, pomme de terre, chou, oignon, poireau, haricot'],
        de: ['Obst = Apfel, Birne, Kirsche, Pflaume, Erdbeere, Traube', 'Gemüse = Karotte, Kartoffel, Kohl, Zwiebel, Lauch, Bohne'] },
      order: {
        en: ['Baking a cake|Mix the batter|Fill the tin|Bake in the oven|Eat a slice', 'A meal|Starter|Main course|Dessert'],
        fr: ['Faire un gâteau|Mélanger la pâte|Remplir le moule|Cuire au four|Goûter une part', 'Un repas|L’entrée|Le plat|Le dessert'],
        de: ['Einen Kuchen backen|Teig rühren|Form füllen|Im Ofen backen|Ein Stück essen', 'Eine Mahlzeit|Vorspeise|Hauptgericht|Nachspeise'] } },

    { id: 'animals', keys: 'animal animals pets zoo farm tier tiere tieren haustier haustiere bauernhof animaux bete betes ferme',
      title: { en: 'Animals', fr: 'Les animaux', de: 'Tiere' },
      quiz: {
        en: ['Which animal gives us milk?|The cow|The hen|The cat', 'Which animal lays eggs?|The hen|The dog|The horse', 'Which animal says “meow”?|The cat|The cow|The duck',
          'Which animal has a long trunk?|The elephant|The giraffe|The lion', 'Which bird calls “cuckoo”?|The cuckoo|The owl|The swallow', 'Which animal carries its house on its back?|The snail|The mouse|The frog'],
        fr: ['Quel animal nous donne du lait ?|La vache|La poule|Le chat', 'Quel animal pond des œufs ?|La poule|Le chien|Le cheval', 'Quel animal fait « miaou » ?|Le chat|La vache|Le canard',
          'Quel animal a une longue trompe ?|L’éléphant|La girafe|Le lion', 'Quel oiseau chante « coucou » ?|Le coucou|La chouette|L’hirondelle', 'Quel animal porte sa maison sur le dos ?|L’escargot|La souris|La grenouille'],
        de: ['Welches Tier gibt uns Milch?|Die Kuh|Das Huhn|Die Katze', 'Welches Tier legt Eier?|Das Huhn|Der Hund|Das Pferd', 'Welches Tier macht „Miau“?|Die Katze|Die Kuh|Die Ente',
          'Welches Tier hat einen langen Rüssel?|Der Elefant|Die Giraffe|Der Löwe', 'Welcher Vogel ruft „Kuckuck“?|Der Kuckuck|Die Eule|Die Schwalbe', 'Welches Tier trägt sein Haus auf dem Rücken?|Die Schnecke|Die Maus|Der Frosch'] },
      groups: {
        en: ['On the farm = cow, pig, hen, horse, sheep, goat', 'In the forest = fox, deer, owl, squirrel, hedgehog, hare'],
        fr: ['À la ferme = vache, cochon, poule, cheval, mouton, chèvre', 'Dans la forêt = renard, chevreuil, chouette, écureuil, hérisson, lièvre'],
        de: ['Auf dem Bauernhof = Kuh, Schwein, Huhn, Pferd, Schaf, Ziege', 'Im Wald = Fuchs, Reh, Eule, Eichhörnchen, Igel, Hase'] },
      order: {
        en: ['From the smallest to the largest|Mouse|Cat|Dog|Horse', 'The life of a butterfly|Egg|Caterpillar|Chrysalis|Butterfly'],
        fr: ['Du plus petit au plus grand|La souris|Le chat|Le chien|Le cheval', 'La vie du papillon|L’œuf|La chenille|La chrysalide|Le papillon'],
        de: ['Vom kleinsten zum größten|Maus|Katze|Hund|Pferd', 'Das Leben des Schmetterlings|Ei|Raupe|Puppe|Schmetterling'] } },

    { id: 'seasons', keys: 'season seasons month months year weather spring summer autumn winter jahreszeit jahreszeiten monat monate jahr wetter fruhling sommer herbst saison saisons mois annee printemps ete automne hiver',
      title: { en: 'The seasons', fr: 'Les saisons', de: 'Jahreszeiten' },
      quiz: {
        en: ['In which season do the leaves fall?|Autumn|Spring|Summer', 'In which season does it snow?|Winter|Summer|Spring', 'Which month comes after March?|April|May|February',
          'In which season do the first flowers come out?|Spring|Autumn|Winter', 'In which month is Christmas?|December|October|January', 'How many seasons are there in a year?|Four|Three|Six'],
        fr: ['En quelle saison les feuilles tombent-elles ?|L’automne|Le printemps|L’été', 'En quelle saison neige-t-il ?|L’hiver|L’été|Le printemps', 'Quel mois vient après mars ?|Avril|Mai|Février',
          'En quelle saison sortent les premières fleurs ?|Le printemps|L’automne|L’hiver', 'En quel mois fête-t-on Noël ?|Décembre|Octobre|Janvier', 'Combien y a-t-il de saisons dans l’année ?|Quatre|Trois|Six'],
        de: ['In welcher Jahreszeit fallen die Blätter?|Im Herbst|Im Frühling|Im Sommer', 'In welcher Jahreszeit schneit es?|Im Winter|Im Sommer|Im Frühling', 'Welcher Monat kommt nach dem März?|April|Mai|Februar',
          'In welcher Jahreszeit blühen die ersten Blumen?|Im Frühling|Im Herbst|Im Winter', 'In welchem Monat ist Weihnachten?|Dezember|Oktober|Januar', 'Wie viele Jahreszeiten hat das Jahr?|Vier|Drei|Sechs'] },
      groups: {
        en: ['Summer = sun hat, ice cream, swimming, sandals, strawberries, hay', 'Winter = snow, scarf, gloves, sledge, frost, candle'],
        fr: ['L’été = chapeau de soleil, glace, baignade, sandales, fraises, foin', 'L’hiver = neige, écharpe, gants, luge, gel, bougie'],
        de: ['Sommer = Sonnenhut, Eis, Baden, Sandalen, Erdbeeren, Heu', 'Winter = Schnee, Schal, Handschuhe, Schlitten, Frost, Kerze'] },
      order: {
        en: ['The seasons, starting with spring|Spring|Summer|Autumn|Winter', 'The months|January|February|March|April', 'The day|Morning|Noon|Afternoon|Evening'],
        fr: ['Les saisons, à partir du printemps|Le printemps|L’été|L’automne|L’hiver', 'Les mois|Janvier|Février|Mars|Avril', 'La journée|Le matin|Le midi|L’après-midi|Le soir'],
        de: ['Die Jahreszeiten, beginnend mit dem Frühling|Frühling|Sommer|Herbst|Winter', 'Die Monate|Januar|Februar|März|April', 'Der Tag|Morgen|Mittag|Nachmittag|Abend'] } },

    { id: 'garden', keys: 'garden gardening flower flowers plant plants garten blume blumen pflanze pflanzen jardin jardinage fleur fleurs plante plantes',
      title: { en: 'The garden', fr: 'Le jardin', de: 'Garten' },
      quiz: {
        en: ['Which flower has thorns?|The rose|The tulip|The daisy', 'What do plants need to grow?|Water and light|Sand and wind|Salt and ice', 'Which tool do we dig with?|The spade|The rake|The watering can',
          'Which fruit grows on a tree?|The apple|The strawberry|The potato', 'Which flower turns towards the sun?|The sunflower|The violet|The snowdrop', 'Which animal loosens the soil?|The earthworm|The snail|The butterfly'],
        fr: ['Quelle fleur a des épines ?|La rose|La tulipe|La marguerite', 'De quoi les plantes ont-elles besoin pour pousser ?|D’eau et de lumière|De sable et de vent|De sel et de glace', 'Avec quel outil bêche-t-on ?|La bêche|Le râteau|L’arrosoir',
          'Quel fruit pousse sur un arbre ?|La pomme|La fraise|La pomme de terre', 'Quelle fleur se tourne vers le soleil ?|Le tournesol|La violette|Le perce-neige', 'Quel animal aère la terre ?|Le ver de terre|L’escargot|Le papillon'],
        de: ['Welche Blume hat Dornen?|Die Rose|Die Tulpe|Das Gänseblümchen', 'Was brauchen Pflanzen zum Wachsen?|Wasser und Licht|Sand und Wind|Salz und Eis', 'Mit welchem Werkzeug gräbt man um?|Mit dem Spaten|Mit dem Rechen|Mit der Gießkanne',
          'Welche Frucht wächst am Baum?|Der Apfel|Die Erdbeere|Die Kartoffel', 'Welche Blume dreht sich zur Sonne?|Die Sonnenblume|Das Veilchen|Das Schneeglöckchen', 'Welches Tier lockert die Erde?|Der Regenwurm|Die Schnecke|Der Schmetterling'] },
      groups: {
        en: ['Flowers = rose, tulip, daisy, sunflower, violet, lily', 'Garden tools = spade, rake, watering can, hoe, wheelbarrow, shears'],
        fr: ['Fleurs = rose, tulipe, marguerite, tournesol, violette, lys', 'Outils du jardin = bêche, râteau, arrosoir, binette, brouette, sécateur'],
        de: ['Blumen = Rose, Tulpe, Gänseblümchen, Sonnenblume, Veilchen, Lilie', 'Gartengeräte = Spaten, Rechen, Gießkanne, Hacke, Schubkarre, Gartenschere'] },
      order: {
        en: ['Growing a plant|Sow the seed|Water it|Watch it grow|Pick the flowers', 'An apple tree through the year|Buds|Blossom|Apples|Bare branches'],
        fr: ['Faire pousser une plante|Semer la graine|Arroser|Regarder pousser|Cueillir les fleurs', 'Le pommier au fil de l’année|Les bourgeons|Les fleurs|Les pommes|Les branches nues'],
        de: ['Eine Pflanze ziehen|Samen säen|Gießen|Wachsen sehen|Blumen pflücken', 'Der Apfelbaum im Jahr|Knospen|Blüten|Äpfel|Kahle Äste'] } },

    { id: 'music', keys: 'music instrument instruments song songs musik lied lieder musique chanson chansons',
      title: { en: 'Music', fr: 'La musique', de: 'Musik' },
      quiz: {
        en: ['Which instrument has black and white keys?|The piano|The violin|The drum', 'Which instrument do you play with a bow?|The violin|The trumpet|The flute', 'How many strings does a guitar usually have?|Six|Four|Ten',
          'Who leads an orchestra?|The conductor|The singer|The pianist', 'Which instrument do you blow into?|The trumpet|The harp|The drum', 'What do we call a group of singers?|A choir|A band|A team'],
        fr: ['Quel instrument a des touches noires et blanches ?|Le piano|Le violon|Le tambour', 'De quel instrument joue-t-on avec un archet ?|Le violon|La trompette|La flûte', 'Combien de cordes a une guitare en général ?|Six|Quatre|Dix',
          'Qui dirige un orchestre ?|Le chef d’orchestre|Le chanteur|Le pianiste', 'Dans quel instrument souffle-t-on ?|La trompette|La harpe|Le tambour', 'Comment appelle-t-on un groupe de chanteurs ?|Une chorale|Une fanfare|Une équipe'],
        de: ['Welches Instrument hat schwarze und weiße Tasten?|Das Klavier|Die Geige|Die Trommel', 'Welches Instrument spielt man mit einem Bogen?|Die Geige|Die Trompete|Die Flöte', 'Wie viele Saiten hat eine Gitarre meistens?|Sechs|Vier|Zehn',
          'Wer leitet ein Orchester?|Der Dirigent|Der Sänger|Der Pianist', 'In welches Instrument bläst man hinein?|In die Trompete|In die Harfe|In die Trommel', 'Wie nennt man eine Gruppe von Sängern?|Einen Chor|Eine Kapelle|Eine Mannschaft'] },
      groups: {
        en: ['String instruments = violin, guitar, harp, cello, double bass, zither', 'Wind instruments = trumpet, flute, clarinet, horn, trombone, tuba'],
        fr: ['Instruments à cordes = violon, guitare, harpe, violoncelle, contrebasse, cithare', 'Instruments à vent = trompette, flûte, clarinette, cor, trombone, tuba'],
        de: ['Saiteninstrumente = Geige, Gitarre, Harfe, Cello, Kontrabass, Zither', 'Blasinstrumente = Trompete, Flöte, Klarinette, Horn, Posaune, Tuba'] },
      order: {
        en: ['From quiet to loud|Whisper|Speak|Sing|Shout', 'The notes|Do|Re|Mi|Fa'],
        fr: ['Du plus doux au plus fort|Chuchoter|Parler|Chanter|Crier', 'Les notes|Do|Ré|Mi|Fa'],
        de: ['Von leise bis laut|Flüstern|Sprechen|Singen|Rufen', 'Die Töne|Do|Re|Mi|Fa'] } },

    { id: 'jobs', keys: 'job jobs trade trades profession professions craft crafts beruf berufe berufen handwerk metier metiers artisan artisans',
      title: { en: 'Jobs of the past', fr: 'Métiers d’autrefois', de: 'Alte Berufe' },
      quiz: {
        en: ['Who bakes the bread?|The baker|The butcher|The tailor', 'Who shoes the horses?|The blacksmith|The miller|The cooper', 'Who grinds the grain into flour?|The miller|The baker|The farmer',
          'Who brings the letters?|The postman|The teacher|The cobbler', 'Who repairs shoes?|The cobbler|The tailor|The carpenter', 'Who sews dresses and suits?|The tailor|The blacksmith|The miller'],
        fr: ['Qui fait le pain ?|Le boulanger|Le boucher|Le tailleur', 'Qui ferre les chevaux ?|Le maréchal-ferrant|Le meunier|Le tonnelier', 'Qui moud le grain en farine ?|Le meunier|Le boulanger|Le fermier',
          'Qui apporte les lettres ?|Le facteur|L’instituteur|Le cordonnier', 'Qui répare les chaussures ?|Le cordonnier|Le tailleur|Le menuisier', 'Qui coud les robes et les costumes ?|Le tailleur|Le forgeron|Le meunier'],
        de: ['Wer backt das Brot?|Der Bäcker|Der Metzger|Der Schneider', 'Wer beschlägt die Pferde?|Der Hufschmied|Der Müller|Der Küfer', 'Wer mahlt das Korn zu Mehl?|Der Müller|Der Bäcker|Der Bauer',
          'Wer bringt die Briefe?|Der Briefträger|Der Lehrer|Der Schuster', 'Wer repariert die Schuhe?|Der Schuster|Der Schneider|Der Zimmermann', 'Wer näht Kleider und Anzüge?|Der Schneider|Der Schmied|Der Müller'] },
      groups: {
        en: ['Working with food = baker, butcher, miller, cook, dairymaid, innkeeper', 'Wood and metal = carpenter, blacksmith, cooper, wheelwright, joiner, locksmith'],
        fr: ['Métiers de bouche = boulanger, boucher, meunier, cuisinier, crémière, aubergiste', 'Le bois et le fer = charpentier, forgeron, tonnelier, charron, menuisier, serrurier'],
        de: ['Rund ums Essen = Bäcker, Metzger, Müller, Koch, Sennerin, Wirt', 'Holz und Eisen = Zimmermann, Schmied, Küfer, Wagner, Schreiner, Schlosser'] },
      order: {
        en: ['From grain to bread|The farmer sows|The miller grinds|The baker bakes|We eat the bread', 'A letter|Write the letter|Put on a stamp|Post it|The postman delivers it'],
        fr: ['Du grain au pain|Le fermier sème|Le meunier moud|Le boulanger cuit|Nous mangeons le pain', 'Une lettre|Écrire la lettre|Coller le timbre|La poster|Le facteur la distribue'],
        de: ['Vom Korn zum Brot|Der Bauer sät|Der Müller mahlt|Der Bäcker backt|Wir essen das Brot', 'Ein Brief|Brief schreiben|Briefmarke aufkleben|Einwerfen|Der Briefträger bringt ihn'] } },

    { id: 'colours', keys: 'colour colours color colors farbe farben couleur couleurs',
      title: { en: 'Colours', fr: 'Les couleurs', de: 'Farben' },
      quiz: {
        en: ['What colour is the sky on a fine day?|Blue|Green|Red', 'What colour is a ripe tomato?|Red|Blue|White', 'What colour is snow?|White|Black|Yellow',
          'What colour is grass?|Green|Red|Blue', 'Which colour do yellow and blue make?|Green|Orange|Purple', 'What colour is a lemon?|Yellow|Brown|Pink'],
        fr: ['De quelle couleur est le ciel par beau temps ?|Bleu|Vert|Rouge', 'De quelle couleur est une tomate mûre ?|Rouge|Bleue|Blanche', 'De quelle couleur est la neige ?|Blanche|Noire|Jaune',
          'De quelle couleur est l’herbe ?|Verte|Rouge|Bleue', 'Quelle couleur donnent le jaune et le bleu ?|Le vert|L’orange|Le violet', 'De quelle couleur est un citron ?|Jaune|Marron|Rose'],
        de: ['Welche Farbe hat der Himmel bei schönem Wetter?|Blau|Grün|Rot', 'Welche Farbe hat eine reife Tomate?|Rot|Blau|Weiß', 'Welche Farbe hat der Schnee?|Weiß|Schwarz|Gelb',
          'Welche Farbe hat das Gras?|Grün|Rot|Blau', 'Welche Farbe ergeben Gelb und Blau?|Grün|Orange|Lila', 'Welche Farbe hat eine Zitrone?|Gelb|Braun|Rosa'] },
      groups: {
        en: ['Red = tomato, cherry, poppy, fire engine, ladybird, strawberry', 'Yellow = lemon, sun, banana, chick, sunflower, butter'],
        fr: ['Rouge = tomate, cerise, coquelicot, camion de pompiers, coccinelle, fraise', 'Jaune = citron, soleil, banane, poussin, tournesol, beurre'],
        de: ['Rot = Tomate, Kirsche, Mohnblume, Feuerwehrauto, Marienkäfer, Erdbeere', 'Gelb = Zitrone, Sonne, Banane, Küken, Sonnenblume, Butter'] },
      order: {
        en: ['The traffic light, from top to bottom|Red|Amber|Green', 'The rainbow|Red|Orange|Yellow|Green', 'From light to dark|White|Grey|Black'],
        fr: ['Le feu tricolore, de haut en bas|Rouge|Orange|Vert', 'L’arc-en-ciel|Rouge|Orange|Jaune|Vert', 'Du plus clair au plus foncé|Blanc|Gris|Noir'],
        de: ['Die Ampel, von oben nach unten|Rot|Gelb|Grün', 'Der Regenbogen|Rot|Orange|Gelb|Grün', 'Von hell nach dunkel|Weiß|Grau|Schwarz'] } },

    { id: 'numbers', keys: 'number numbers counting count maths sums zahl zahlen rechnen nombre nombres chiffre chiffres calcul compter',
      title: { en: 'Numbers', fr: 'Les nombres', de: 'Zahlen' },
      quiz: {
        en: ['How many days are there in a week?|7|5|10', 'How many months are there in a year?|12|10|24', 'How many eggs are there in a dozen?|12|6|10',
          'How many minutes are there in an hour?|60|100|30', 'How much is 3 + 4?|7|6|8', 'How much is 10 − 2?|8|7|12'],
        fr: ['Combien de jours compte une semaine ?|7|5|10', 'Combien de mois compte une année ?|12|10|24', 'Combien d’œufs y a-t-il dans une douzaine ?|12|6|10',
          'Combien de minutes y a-t-il dans une heure ?|60|100|30', 'Combien font 3 + 4 ?|7|6|8', 'Combien font 10 − 2 ?|8|7|12'],
        de: ['Wie viele Tage hat eine Woche?|7|5|10', 'Wie viele Monate hat ein Jahr?|12|10|24', 'Wie viele Eier sind ein Dutzend?|12|6|10',
          'Wie viele Minuten hat eine Stunde?|60|100|30', 'Wie viel ist 3 + 4?|7|6|8', 'Wie viel ist 10 − 2?|8|7|12'] },
      groups: {
        en: ['Even numbers = 2, 4, 6, 8, 10, 12', 'Odd numbers = 1, 3, 5, 7, 9, 11'],
        fr: ['Nombres pairs = 2, 4, 6, 8, 10, 12', 'Nombres impairs = 1, 3, 5, 7, 9, 11'],
        de: ['Gerade Zahlen = 2, 4, 6, 8, 10, 12', 'Ungerade Zahlen = 1, 3, 5, 7, 9, 11'] },
      order: {
        en: ['From the smallest to the largest|3|8|15|40', 'Counting in tens|10|20|30|40'],
        fr: ['Du plus petit au plus grand|3|8|15|40', 'Compter de dix en dix|10|20|30|40'],
        de: ['Von der kleinsten zur größten Zahl|3|8|15|40', 'In Zehnerschritten zählen|10|20|30|40'] } },

    { id: 'sayings', keys: 'saying sayings proverb proverbs sprichwort sprichworter redewendung redewendungen dicton dictons proverbe proverbes',
      title: { en: 'Sayings', fr: 'Dictons', de: 'Sprichwörter' },
      sayings: {
        en: ['Better late than|never|early|tomorrow', 'The early bird catches the|worm|train|fish', 'Many hands make light|work|bread|music', 'Every cloud has a silver|lining|spoon|coin',
          'Actions speak louder than|words|songs|bells', 'An apple a day keeps the doctor|away|busy|happy', 'All that glitters is not|gold|silver|glass', 'There is no place like|home|school|here'],
        fr: ['Mieux vaut tard que|jamais|demain|toujours', 'Après la pluie, le beau|temps|jour|ciel', 'Petit à petit, l’oiseau fait son|nid|chant|lit', 'Il n’y a pas de fumée sans|feu|bois|vent',
          'L’habit ne fait pas le|moine|roi|chat', 'La nuit porte|conseil|bonheur|chance', 'Qui vivra|verra|saura|rira', 'Tout est bien qui finit|bien|tard|vite'],
        de: ['Morgenstund hat Gold im|Mund|Haus|Sack', 'Übung macht den|Meister|Lehrer|Sieger', 'Besser spät als|nie|früh|morgen', 'Der Apfel fällt nicht weit vom|Stamm|Zaun|Dach',
          'Viele Köche verderben den|Brei|Kuchen|Tag', 'Ohne Fleiß kein|Preis|Brot|Glück', 'Ende gut, alles|gut|schön|aus', 'Aller guten Dinge sind|drei|zwei|sieben'] } }
  ];

  /* ---------- reading the request ---------- */
  function clean(raw) {
    return String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
      .replace(/[’'`]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function hasWord(t, w) { return (' ' + t + ' ').indexOf(' ' + w + ' ') >= 0; }
  function typeOf(prompt) {
    var t = clean(prompt);
    for (var i = 0; i < TYPE_WORDS.length; i++) {
      for (var k = 0; k < TYPE_WORDS[i][1].length; k++) if (hasWord(t, TYPE_WORDS[i][1][k])) return TYPE_WORDS[i][0];
    }
    return '';
  }
  function topicOf(prompt) {
    var words = clean(prompt).split(' '), best = null, top = 0;
    BANK.forEach(function (topic) {
      var keys = topic.keys.split(' '), n = 0;
      words.forEach(function (w) {
        if (keys.some(function (k) { return w === k || (k.length >= 5 && w.indexOf(k) === 0 && w.length <= k.length + 2); })) n++;
      });
      if (n > top) { top = n; best = topic; }
    });
    return best;
  }
  function detect(prompt) { var topic = topicOf(prompt); return { type: typeOf(prompt), topic: topic ? topic.id : '' }; }

  /* ---------- building a spec from the bank ---------- */
  function shuffled(list, rng) {
    var a = list.slice(), i, j, x;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function cells(line) { return line.split('|').map(function (s) { return s.trim(); }); }
  function group(line) { var p = line.split(' = '); return { name: p[0].trim(), words: p[1].split(',').map(function (s) { return s.trim(); }) }; }
  function topicById(id) { for (var i = 0; i < BANK.length; i++) if (BANK[i].id === id) return BANK[i]; return null; }
  function titleFor(type, lang, topic) {
    var t = TYPE_NAME[type][lang];
    return topic && topic.id !== 'sayings' ? t + ' · ' + topic.title[lang] : t;
  }
  /* The items of one kind of game for one topic, or null when the bank has none. */
  function itemsFor(type, topic, lang, rng) {
    var g, a, b;
    if (type === 'saying') {
      var src = (topic && topic.sayings) || topicById('sayings').sayings;
      return { items: shuffled(src[lang], rng).slice(0, 5).map(function (l) { var c = cells(l); return { start: c[0], end: c[1], wrong: c.slice(2, 4) }; }) };
    }
    if (!topic) return null;
    if (type === 'quiz') {
      if (!topic.quiz) return null;
      return { items: shuffled(topic.quiz[lang], rng).slice(0, 5).map(function (l) { var c = cells(l); return { q: c[0], a: c[1], wrong: c.slice(2) }; }) };
    }
    if (type === 'order') {
      if (!topic.order) return null;
      return { items: shuffled(topic.order[lang], rng).map(function (l) { var c = cells(l); return { q: c[0], steps: c.slice(1) }; }) };
    }
    if (!topic.groups) return null;
    g = topic.groups[lang].map(group); a = g[0]; b = g[1];
    if (type === 'sort') {
      var items = shuffled(a.words, rng).slice(0, 4).map(function (w) { return { t: w, c: 0 }; })
        .concat(shuffled(b.words, rng).slice(0, 4).map(function (w) { return { t: w, c: 1 }; }));
      return { cats: [a.name, b.name], items: shuffled(items, rng) };
    }
    if (type === 'odd') {
      var out = [];
      for (var i = 0; i < 4; i++) {
        var from = i % 2 ? b : a, other = i % 2 ? a : b;
        var set = shuffled(from.words, rng).slice(0, 3);
        out.push({ set: set, odd: shuffled(other.words, rng)[0], why: (from.name + ': ' + set.join(', ')).slice(0, 90) });
      }
      return { items: out };
    }
    if (type === 'pairs') {
      return { items: shuffled(a.words.concat(b.words).filter(function (w) { return w.length <= 22; }), rng).slice(0, 4).map(function (w) { return { a: w }; }) };
    }
    return null;
  }
  /* { spec } when the bank can build the game; { need: true, type, title } when the carer must type the items. */
  function offline(prompt, lang, o) {
    o = o || {};
    lang = E.LANGS.indexOf(lang) >= 0 ? lang : 'en';
    var rng = o.rng || Math.random, type = o.type || typeOf(prompt), topic = o.topic ? topicById(o.topic) : topicOf(prompt);
    if (topic && topic.id === 'sayings') type = 'saying';
    if (!type && topic) type = 'quiz';
    var title = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!type || (!topic && type !== 'saying')) return { need: true, type: type || 'quiz', title: title };
    var made = itemsFor(type, topic, lang, rng);
    if (!made) return { need: true, type: type, title: title };
    made.type = type; made.lang = lang; made.title = titleFor(type, lang, topic); made.source = 'offline';
    if (title) made.prompt = String(prompt).replace(/\s+/g, ' ').trim().slice(0, 200);
    var r = E.validate(made);
    return r.ok ? { spec: r.spec } : { need: true, type: type, title: title };
  }

  /* ---------- any topic, typed by the carer: one item per line, parts separated by a bar ---------- */
  function fromLines(type, title, lang, textIn) {
    var lines = String(textIn || '').split(/\r?\n/).map(function (l) { return cells(l).filter(Boolean); }).filter(function (c) { return c.length; });
    var raw = { type: type, lang: lang, title: String(title || '').trim() || TYPE_NAME[type] && TYPE_NAME[type][lang] || '', source: 'manual' }, short = false;
    if (type === 'quiz') {
      raw.items = lines.map(function (c, i) {
        if (c.length < 2) short = true;
        var wrong = c.slice(2, 5);
        /* only "question | answer": the other answers of the list are the wrong ones */
        lines.forEach(function (o, k) { if (wrong.length < 2 && k !== i && o[1] && o[1].toLowerCase() !== String(c[1]).toLowerCase() && wrong.map(function (w) { return w.toLowerCase(); }).indexOf(o[1].toLowerCase()) < 0) wrong.push(o[1]); });
        return { q: c[0], a: c[1], wrong: wrong };
      });
    } else if (type === 'sort') {
      var cats = [];
      lines.forEach(function (c) { if (c.length < 2) short = true; else if (cats.indexOf(c[1]) < 0) cats.push(c[1]); });
      if (cats.length !== 2) return { error: 'cats' };
      raw.cats = cats;
      raw.items = lines.map(function (c) { return { t: c[0], c: cats.indexOf(c[1]) }; });
    } else if (type === 'pairs') {
      raw.items = lines.map(function (c) { return c.length > 1 ? { a: c[0], b: c[1] } : { a: c[0] }; });
    } else if (type === 'saying') {
      raw.items = lines.map(function (c) { if (c.length < 2) short = true; return { start: c[0], end: c[1], wrong: c.slice(2, 4) }; });
    } else if (type === 'odd') {
      raw.items = lines.map(function (c) { if (c.length !== 4) short = true; return { set: c.slice(0, 3), odd: c[3] }; });
    } else if (type === 'order') {
      raw.items = lines.map(function (c) { if (c.length < 4) short = true; return { q: c[0], steps: c.slice(1, 6) }; });
    } else return { error: 'type' };
    if (short) return { error: 'format' };
    var r = E.validate(raw);
    return r.ok ? { spec: r.spec } : { error: 'invalid', detail: r.error };
  }

  return { offline: offline, fromLines: fromLines, detect: detect, typeOf: typeOf, TYPE_NAME: TYPE_NAME, topics: function () { return BANK.map(function (t) { return t.id; }); } };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AtelierGen;
