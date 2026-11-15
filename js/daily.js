/* Bellatrix 1.16 (workstream D): new content every day for the daily activities.
   Contract 4: window.Daily, used by "Finish the Saying" and the Kindness Quiz (js/activities.js),
   the merged memories album (agent G, kind 'memories') and "Bouger assis" (agent E, kind 'move').

   What "AI" means here, honestly: there is NO language model, no paid service, no key, no account
   and nothing leaves the robot. This file is an on-device generator: large hand-written banks
   (traditional proverbs and similes, which are folk sayings and in the public domain; kindness-quiz
   questions with answer pools; memory themes with openings, details and questions; seated
   exercises; orientation lines for the welcome), combined with templates and picked by a seeded,
   per-resident daily selection that avoids repeats for as long as the bank allows. The life story
   (Care Team, patient card) steers what is picked and fills a few templates (home town, favourite
   music, the decade of their youth). An optional hook can ask a LabLand AI server later
   (setConfig({ remote: true, url })): it is OFF by default, sends no name, no resident code and no
   free text, and its answers go through the same checks, the same cache and the same fallback.

   API
   - Daily.get(kind, { lang, code, life, level, own, date, zone }) → today's batch for that resident
     and language: an Array of items (also .items), with .kind .date .lang .code .src
     ('local' | 'remote' | 'fallback'). One batch per day, resident, language and kind, kept in
     localStorage ('bellatrix-daily-v1'): opening the activity again the same day gives the same
     batch; it is made again only when the inputs change (level, life story, the team's own list).
     Called without life / level / own (for example by the Care Team to show today's items), it
     returns the day's batch as it is.
       kind 'sayings':  { id, start, end, wrong: [1 or 2 other endings], why }
       kind 'quiz':     { id, q, a: [3 answers, or 2 when level is 'gentle'], r } (no right answer)
       kind 'memories': { id, topic, theme (album theme id), card (album generic card id), title,
                          story, question (yes / no / not sure), words (voice keywords), why }
       kind 'move':     { id, zone ('legs' | 'upper' | 'back' | 'hands' | 'breath'), title, how, reps,
                          figure (one | both | cross | out | rest, for ART.figure) }; 3 per zone (2 gentle);
                          o.zone returns only that zone
       kind 'welcome':  { id, line, season }; Daily.welcome(o) adds the greeting, date, season, time
     why: '' | 'life' (chosen from the life story) | 'team' (the team's own list) | 'remote'.
     o.level 'gentle': fewer, very well-known sayings with two choices, shorter memories, fewer reps.
     o.own (sayings): the team's own sayings [{ start, end }]; up to two are mixed in each day.
   - Daily.block(kind, itemId, code): "ne plus proposer". The item never comes back for that resident
     (for memories the whole theme, for the quiz the whole question) and leaves today's batch.
     Daily.unblock(kind, itemId, code), Daily.blocked(kind, code) → [{ id, label, at }].
   - Daily.peek(kind, o): the day's batch if it exists (null otherwise), without making one.
   - Daily.welcome(o) → { greeting, say, line, weekday, day, monthYear, date, time, season,
     seasonName, birthday, card (HTML of the date card, same classes as Hello & Today) }.
   - Daily.config() / Daily.setConfig({ remote, url, timeoutMs }), Daily.prefetch(o) → Promise.
   - Daily.safe(text, lang): false when a text touches an anxious subject (grief, illness, politics,
     religion, fear…). Every generated, personalised or received text goes through it.
   Offline: everything here works without a network. If a bank is empty or something fails, the
   batch falls back to the content of 1.15 (kind src 'fallback'); if this file is missing, each
   activity keeps its own built-in content.
   ES5 only (the robot's WebView is Chrome 95). Its French and German Care Team labels are added
   with I18N.add at the end of the file. */
var Daily = (function () {
  'use strict';
  var KEY = 'bellatrix-daily-v1';
  var KINDS = ['sayings', 'quiz', 'memories', 'welcome', 'move'];
  var ZONES = ['legs', 'upper', 'back', 'hands', 'breath'];
  /* Items per day: [usual, gentle]; for 'move' per zone. */
  var COUNT = { sayings: [6, 4], quiz: [5, 3], memories: [4, 3], welcome: [1, 1], move: [3, 2] };
  /* A personalised item comes back at the earliest after this many days. */
  var LIFE_GAP = 14;
  var KEEP_DAYS = 400;
  var forced, mem = null, asked = {};
  /* The page's storage, read at each use (the Care Team demo swaps in a memory storage). */
  function S() {
    if (forced !== undefined) return forced;
    try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; }
  }

  /* ---------- small helpers ---------- */
  function str(s) { return s == null ? '' : String(s); }
  function lang(l) { return l === 'fr' || l === 'de' ? l : 'en'; }
  function clip(s, n) { return str(s).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n); }
  function hash(s) {
    var h = 0x811c9dc5;
    s = str(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function hid(s) { return ('000000' + hash(s).toString(36)).slice(-6); }
  /* mulberry32: the same seed gives the same numbers, on the robot and in the tests. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function norm(s) {
    s = str(s).toLowerCase().replace(/[’'`]/g, ' ');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[^a-z0-9ß]+/g, ' ').trim();
  }
  /* French: a no-break space before ? ! : ; so a big title never wraps a lone "?". */
  function frSpace(s) { return str(s).replace(/ ([?!:;»])/g, ' $1').replace(/« /g, '« '); }
  function pick(v, l) { var x = v && typeof v === 'object' && !Array.isArray(v) ? (v[l] !== undefined ? v[l] : v.en) : v; return l === 'fr' && typeof x === 'string' ? frSpace(x) : x; }
  function listOr(a, l) { var or = { en: 'or', fr: 'ou', de: 'oder' }[l]; return a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' ' + or + ' ' + a[a.length - 1]; }
  function words(text) { return str(text).split(/[,;\n\/]+/).map(function (w) { return clip(w, 40); }).filter(function (w) { return w.length > 1; }); }

  /* ---------- dates ---------- */
  function dateOf(v) {
    var d;
    if (v instanceof Date) d = new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12);
    else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) d = new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10), 12);
    else { var n = new Date(); d = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); }
    return { date: d, key: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), day: Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) };
  }
  function seasonOf(d) { var md = (d.getMonth() + 1) * 100 + d.getDate(); return md >= 1221 || md < 320 ? 'winter' : md < 621 ? 'spring' : md < 922 ? 'summer' : 'autumn'; }

  /* ---------- nothing anxious ----------
     Words (after lower case and without accents) that are never shown: grief and death, illness,
     war and violence, politics, religion, fear, loneliness. Checked per language, on whole words
     (a pattern ending in * also covers longer words). */
  var UNSAFE_WORDS = {
    en: 'death* dead die dies died dying kill* murder* grave graves funeral* cemeter* widow* grief griev* mourn* bereave* coffin* sick* ill illness* disease* hospital* cancer dementia alzheimer* pain painful hurt* injur* doctor* medicine* pill pills nurse* war wars soldier* gun guns bomb* weapon* army armies battle* sword* politic* election* government* president* parliament* minister* god gods lord jesus christ church* pray* bible devil* hell sin sins heaven* angel* saint saints lonely loneliness fear* afraid frighten* scared terror* blood* poison* cry crying tears sad sadness sorrow* loss lose losing poverty beggar* thief thieves',
    fr: 'mort morte morts mourir meurt meurent tue tuer tuent assassin* tombeau* cimetiere* enterrement* funerai* cercueil* veuf veuve* deuil chagrin* malade* maladie* hopita* cancer demence alzheimer douleur* souffr* blesse* medecin* medicament* infirmi* guerre* soldat* fusil* bombe* arme armes armee* bataille* politi* election* gouvernement* president* parlement* ministre* dieu dieux seigneur jesus christ eglise* prie prier priere* bible diable* enfer paradis ange anges saint sainte saints solitude peur* effray* terreur* sang poison* pleur* larme* triste* malheur* misere* pauvre* voleur*',
    de: 'tod tode todes tot tote toten sterb* stirbt starb gestorben totet toten getotet mord* grab graber friedhof* beerdigung* begrabnis* sarg witwe* witwer trauer* traurig* krank* spital* klinik* krebs demenz alzheimer schmerz* verletz* arzt arzte medizin* tablette* pflegeheim* krieg* soldat* gewehr* bombe bomben waffe waffen armee* schlacht* politi* bundestag* regierung* prasident* parlament* minister* kanzler* gott gotter herrgott jesus christus kirche* beten betet gebet* bibel teufel* holle sunde* engel heilige* einsam* angst angste angstlich* furcht* schreck* blut blutig blutet bluten gift giftig weinen tranen leid ungluck* elend* armut* dieb*'
  };
  var UNSAFE = {};
  Object.keys(UNSAFE_WORDS).forEach(function (l) {
    var alt = UNSAFE_WORDS[l].split(' ').map(function (w) { var star = /\*$/.test(w); w = norm(w.replace(/\*$/, '')).replace(/ /g, ''); return w + (star ? '[a-z0-9ß]*' : ''); });
    UNSAFE[l] = new RegExp('(^| )(' + alt.join('|') + ')( |$)');
  });
  /* Spaces doubled, so that two words in a row can both be tested. */
  function safe(text, l) { return !UNSAFE[lang(l)].test(' ' + norm(text).replace(/ /g, '  ') + ' '); }
  function safeAll(obj, l) {
    var ok = true;
    (function walk(x) {
      if (!ok || x == null) return;
      if (typeof x === 'string') { if (!safe(x, l)) ok = false; return; }
      if (typeof x === 'object') Object.keys(x).forEach(function (k) { if (k !== 'id' && k !== 'words') walk(x[k]); });
    })(obj);
    return ok;
  }

  /* ---------- the life story → topics ----------
     What the resident loves to talk about, their favourite music and where they grew up become a
     few topics; the generators then prefer sayings, questions and memories about them. */
  var TOPIC_WORDS = {
    garden: 'garden* flower* rose roses tulip* plant* vegetable* allotment* jardin* potager* fleur* plante* legume* garten* blume* rosen beet beete pflanze* gemuse* schrebergarten*',
    animals: 'dog dogs puppy cat cats kitten* bird birds horse* animal* pet pets cow cows hen hens chien* chiot* chat chats oiseau* cheval chevaux animaux vache* poule* hund hunde katze* kater vogel vogel pferd* tier tiere kuh kuhe huhn huhner',
    sea: 'sea seaside beach* boat* sailing fishing ocean coast* mer plage* bateau* voile peche ocean cote meer strand* boot boote segeln angeln kuste ostsee nordsee',
    mountain: 'mountain* hiking hike ski skiing alps montagne* randonnee* alpes berg berge wandern alpen skifahren',
    food: 'cooking cook baking bake cake cakes bread kitchen recipe* jam cuisine cuisiner patisserie* gateau* confiture* recette* kochen backen kuchen brot kuche rezept* marmelade*',
    music: 'music* singing sing song songs dance* dancing waltz* accordion* piano choir opera musique* chant chanter chanson* danse* danser valse* accordeon* chorale* opera musik* singen lied lieder tanz* tanzen walzer akkordeon chor klavier schlager volksmusik',
    crafts: 'sewing knitting embroider* knit sew woodwork* carpentry workshop* tools couture tricot* broderie* coudre bricol* menuiserie atelier* nahen stricken sticken handarbeit* werkstatt* basteln tischler* schreiner*',
    travel: 'travel* trip trips train trains holiday* voyage* vacances reise* urlaub* zug zuge eisenbahn*',
    town: 'market* cafe* shop shops shopping marche* boutique* markt* kaffeehaus* einkaufen',
    sport: 'football soccer cycling bike bicycle* swimming tennis sport* foot velo* cyclisme natation fussball radfahren fahrrad* schwimmen',
    reading: 'book books reading poem* poetry livre* lecture lire poesie* buch bucher lesen gedicht*',
    nature: 'forest* wood woods walk walks walking mushroom* tree trees nature foret* bois promenade* champignon* arbre* wald walder spaziergang* spazieren pilze baum baume natur',
    games: 'cards chess game games puzzle* crossword* bingo cartes echecs jeu jeux belote mots croises karten schach spiel spiele kreuzwort* skat'
  };
  var TOPIC_RE = {};
  Object.keys(TOPIC_WORDS).forEach(function (t) {
    var alt = TOPIC_WORDS[t].split(' ').map(function (w) { var star = /\*$/.test(w); w = norm(w.replace(/\*$/, '')).replace(/ /g, ''); return w + (star ? '[a-z0-9ß]*' : ''); });
    TOPIC_RE[t] = new RegExp('(^| )(' + alt.join('|') + ')( |$)');
  });
  function topicsIn(text) {
    var t = ' ' + norm(text).replace(/ /g, '  ') + ' ';
    return Object.keys(TOPIC_RE).filter(function (k) { return TOPIC_RE[k].test(t); });
  }
  function topicsOf(life) {
    life = life || {};
    var out = topicsIn([life.talk, life.loves].join(' '));
    if (words(life.loves).length && out.indexOf('music') < 0) out.push('music');
    if (clip(life.home, 40) && out.indexOf('town') < 0) out.push('town');
    return out.sort();
  }

  /* ---------- bank 1: sayings ----------
     Traditional proverbs, sayings and similes: folk wisdom, in the public domain. One per line:
     the beginning | the ending to find. A leading * marks the very well-known ones (used first at
     the gentle level). Chosen to be cheerful or neutral: no death, illness, war, religion, fear. */
  var SAYINGS = {
    en: [
      '*Better late than|never', '*A stitch in time saves|nine', '*Actions speak louder than|words', '*The early bird catches the|worm',
      '*Many hands make light|work', '*Every cloud has a silver|lining', '*Practice makes|perfect', '*Where there’s a will, there’s a|way',
      '*Two heads are better than|one', '*Birds of a feather flock|together', '*Don’t count your chickens before they|hatch', '*Rome wasn’t built in a|day',
      '*When in Rome, do as the Romans|do', '*The grass is always greener on the other|side', '*Don’t put all your eggs in one|basket', '*A picture is worth a thousand|words',
      '*All good things come to those who|wait', '*Make hay while the sun|shines', '*There’s no place like|home', '*Home is where the heart|is',
      '*A friend in need is a friend|indeed', '*Honesty is the best|policy', '*Easy come, easy|go', '*Slow and steady wins the|race',
      '*Look before you|leap', '*Patience is a|virtue', '*Great minds think|alike', '*Time flies when you’re having|fun',
      '*Out of sight, out of|mind', '*The more, the|merrier', '*Waste not, want|not', '*Every dog has its|day',
      '*You can’t judge a book by its|cover', '*A penny saved is a penny|earned', '*All’s well that ends|well', '*Beauty is in the eye of the|beholder',
      '*It’s raining cats and|dogs', '*The apple doesn’t fall far from the|tree', '*Still waters run|deep', '*Too many cooks spoil the|broth',
      '*A watched pot never|boils', '*Necessity is the mother of|invention', '*Knowledge is|power', '*Strike while the iron is|hot',
      '*Variety is the spice of|life', '*Silence is|golden', '*Good things come in small|packages', '*Two wrongs don’t make a|right',
      '*Fortune favours the|bold', '*First come, first|served', '*April showers bring May|flowers', '*A rolling stone gathers no|moss',
      '*One good turn deserves|another', '*Great oaks from little acorns|grow', '*The best things in life are|free', '*Time is|money',
      '*Live and|learn', '*Better safe than|sorry', '*There’s no time like the|present', '*Haste makes|waste',
      '*All that glitters is not|gold', '*A bird in the hand is worth two in the|bush', '*It takes two to|tango', '*Like father, like|son',
      '*You reap what you|sow', '*Charity begins at|home', '*The proof of the pudding is in the|eating', '*Half a loaf is better than|none',
      '*You can lead a horse to water, but you can’t make it|drink', '*Don’t look a gift horse in the|mouth', '*When the cat’s away, the mice will|play', '*Let sleeping dogs|lie',
      '*Tomorrow is another|day', '*A journey of a thousand miles begins with a single|step', '*Where there’s smoke, there’s|fire', '*Good fences make good|neighbours',
      '*Early to bed and early to rise makes a man healthy, wealthy and|wise', '*The customer is always|right', '*Money doesn’t grow on|trees', '*Two’s company, three’s a|crowd',
      '*All roads lead to|Rome', '*Don’t make a mountain out of a|molehill', '*A cat has nine|lives', '*If at first you don’t succeed, try, try|again',
      '*It is never too late to|learn', '*What’s done is|done', '*A smile costs|nothing', '*Kind words cost|nothing',
      '*Don’t put the cart before the|horse', '*One swallow does not make a|summer', '*Seeing is|believing', '*Easier said than|done',
      '*No news is good|news', '*Nothing ventured, nothing|gained', '*Put your best foot|forward', '*Keep your chin|up',
      '*All work and no play makes Jack a dull|boy', '*Empty vessels make the most|noise', '*Never put off till tomorrow what you can do|today', '*Share and share|alike',
      '*The best is yet to|come', '*You can’t have your cake and eat|it', '*You can’t make an omelette without breaking|eggs', '*It’s a small|world',
      '*The way to a man’s heart is through his|stomach', '*Make new friends, but keep the old; one is silver and the other|gold', '*Every rose has its|thorn', '*Barking dogs seldom|bite',
      '*As busy as a|bee', '*As light as a|feather', '*As good as|gold', '*As cool as a|cucumber',
      '*As fresh as a|daisy', '*As snug as a bug in a|rug', '*As quiet as a|mouse', '*As happy as a|lark',
      '*As bright as a|button', '*As sweet as|honey', '*As white as|snow', '*As brave as a|lion',
      '*As proud as a|peacock', '*As warm as|toast', '*As right as|rain', '*As easy as|pie',
      '*As fit as a|fiddle', '*As pleased as|Punch', '*As safe as|houses', '*As strong as an|ox',
      '*As wise as an|owl', '*As free as a|bird', '*As smooth as|silk', '*As flat as a|pancake',
      '*As good as|new', '*As cold as|ice', '*As clear as|crystal', '*As red as a|cherry',
      'As gentle as a|lamb', 'As slow as a|snail', 'As neat as a|pin', 'As sound as a|bell',
      'As keen as|mustard', 'As steady as a|rock', 'As green as|grass', 'As soft as|velvet',
      'As clean as a|whistle', 'As cheap as|chips', 'As dry as a|bone', 'As sharp as a|tack',
      'As happy as a|clam', 'As light as|air', 'As hard as|nails',
      'Little strokes fell great|oaks', 'Every little|helps', 'A good beginning makes a good|ending', 'Fine feathers make fine|birds',
      'Clothes make the|man', 'Manners maketh|man', 'A change is as good as a|rest', 'Hunger is the best|sauce',
      'Red sky at night, shepherd’s|delight', 'Rain before seven, fine by|eleven', 'March comes in like a lion and goes out like a|lamb', 'Ne’er cast a clout till May be|out',
      'Many a true word is spoken in|jest', 'Talk is|cheap', 'Opportunity knocks but|once', 'A good name is better than|riches',
      'Good company makes the road seem|shorter', 'After rain comes|sunshine', 'Great things have small|beginnings', 'He who laughs last laughs|best',
      'If the cap fits, wear|it', 'Jack of all trades, master of|none', 'Least said, soonest|mended', 'Little and often fills the|purse',
      'Make do and|mend', 'More haste, less|speed', 'Once bitten, twice|shy', 'People who live in glass houses shouldn’t throw|stones',
      'Time and tide wait for no|man', 'Truth will|out', 'What’s sauce for the goose is sauce for the|gander', 'A good laugh is sunshine in the|house',
      'A friend’s eye is a good|mirror', 'Every bird loves to hear itself|sing', 'Laugh and the world laughs with|you', 'Do as you would be|done by',
      'A trouble shared is a trouble|halved', 'Cut your coat according to your|cloth', 'Walk a mile in someone else’s|shoes', 'Don’t throw the baby out with the|bathwater',
      'The squeaky wheel gets the|grease', 'A leopard can’t change its|spots', 'Every Jack has his|Jill',
      'Forewarned is|forearmed', 'Don’t bite the hand that|feeds you', 'Don’t cross your bridges before you come to|them', 'A merry heart goes all the|day', 'Many drops make a|shower',
      'Every path has its|puddle', 'You never know what you can do till you|try',
      'Kindness begets|kindness', 'A light heart lives|long', 'Well begun is half|done', 'Small rain lays great|dust',
      'Better a small fish than an empty|dish', 'A handful of patience is worth more than a bushel of|brains', 'Cheerful company shortens the|miles'
    ],
    fr: [
      '*Mieux vaut tard que|jamais', '*Petit à petit, l’oiseau fait son|nid', '*Après la pluie, le beau|temps', '*Il n’y a pas de fumée sans|feu',
      '*L’habit ne fait pas le|moine', '*La nuit porte|conseil', '*Qui vivra|verra', '*Tout vient à point à qui sait|attendre',
      '*Les petits ruisseaux font les grandes|rivières', '*Chose promise, chose|due', '*Qui ne risque rien n’a|rien', '*L’union fait la|force',
      '*Pierre qui roule n’amasse pas|mousse', '*Qui va à la chasse perd sa|place', '*Rien ne sert de courir, il faut partir à|point', '*Il faut battre le fer pendant qu’il est|chaud',
      '*Chat échaudé craint l’eau|froide', '*Quand le chat n’est pas là, les souris|dansent', '*Une hirondelle ne fait pas le|printemps', '*En avril, ne te découvre pas d’un|fil',
      '*En mai, fais ce qu’il te|plaît', '*Qui se ressemble s’|assemble', '*Les bons comptes font les bons|amis', '*Qui trop embrasse mal|étreint',
      '*À cœur vaillant rien d’|impossible', '*Vouloir, c’est|pouvoir', '*C’est en forgeant qu’on devient|forgeron', '*Paris ne s’est pas fait en un|jour',
      '*Tel père, tel|fils', '*Les chiens aboient, la caravane|passe', '*L’appétit vient en|mangeant', '*Qui dort|dîne',
      '*Le temps, c’est de l’|argent', '*Un tiens vaut mieux que deux tu l’|auras', '*L’argent ne fait pas le|bonheur', '*Il n’est jamais trop tard pour bien|faire',
      '*La fortune sourit aux|audacieux', '*Les murs ont des|oreilles', '*Qui veut voyager loin ménage sa|monture', '*Tout est bien qui finit|bien',
      '*Rira bien qui rira le|dernier', '*Plus on est de fous, plus on|rit', '*Le soleil brille pour tout le|monde', '*Petit poisson deviendra|grand',
      '*Les grands esprits se|rencontrent', '*Il ne faut pas mettre tous ses œufs dans le même|panier', '*Il ne faut pas mettre la charrue avant les|bœufs', '*On récolte ce que l’on|sème',
      '*Tous les chemins mènent à|Rome', '*Le jeu n’en vaut pas la|chandelle', '*Il faut laisser le temps au|temps', '*Qui cherche|trouve',
      '*La parole est d’argent, mais le silence est d’|or', '*L’avenir appartient à ceux qui se lèvent|tôt', '*Le mieux est l’ennemi du|bien', '*Comme on fait son lit, on se|couche',
      '*Mains froides, cœur|chaud', '*Après l’effort, le|réconfort', '*Chaque chose en son|temps', '*Un homme averti en vaut|deux',
      '*Il n’y a pas de rose sans|épines', '*Qui casse les verres les|paie', '*Pas de nouvelles, bonnes|nouvelles', '*Il faut de tout pour faire un|monde',
      '*Les amis de nos amis sont nos|amis', '*Jamais deux sans|trois', '*À chacun son|goût', '*Des goûts et des couleurs, on ne discute|pas',
      '*On ne fait pas d’omelette sans casser des|œufs', '*C’est la goutte d’eau qui fait déborder le|vase', '*Il faut prendre le taureau par les|cornes', '*Avoir le cœur sur la|main',
      '*Avoir la main|verte', '*Avoir un cœur d’|or', '*Quand les poules auront des|dents', '*Il fait un froid de|canard',
      '*Être comme un poisson dans l’|eau', '*Donner sa langue au|chat', '*Chercher une aiguille dans une botte de|foin', '*Il pleut des|cordes',
      '*Faire d’une pierre deux|coups', '*Mettre son grain de|sel', '*Avoir la tête dans les|nuages', '*Être dans la|lune',
      '*Avoir du pain sur la|planche', '*Ce n’est pas la mer à|boire', '*Coûter les yeux de la|tête', '*Revenons à nos|moutons',
      '*Appeler un chat un|chat', '*Mettre la main à la|pâte', '*Avoir les yeux plus gros que le|ventre', '*Une fois n’est pas|coutume',
      '*Haut comme trois|pommes', '*Bavard comme une|pie', '*Doux comme un|agneau', '*Fier comme un|paon',
      '*Malin comme un|singe', '*Rusé comme un|renard', '*Gai comme un|pinson', '*Frais comme un|gardon',
      '*Muet comme une|carpe', '*Têtu comme une|mule', '*Fort comme un|bœuf', '*Lent comme une|tortue',
      '*Léger comme une|plume', '*Rapide comme l’|éclair', '*Blanc comme|neige', '*Rouge comme une|tomate',
      '*Sage comme une|image', '*Simple comme|bonjour', '*Bon comme le|pain', '*Libre comme l’|air',
      '*Dormir comme un|loir', '*Chanter comme un|rossignol', '*Rire comme une|baleine', '*Copains comme|cochons',
      'Clair comme de l’eau de|roche', 'Propre comme un sou|neuf', 'Beau comme un|cœur', 'Riche comme|Crésus',
      'Connu comme le loup|blanc', 'Serrés comme des|sardines', 'Fier comme|Artaban', 'Sobre comme un|chameau',
      'Frisé comme un|mouton', 'Rouge comme une|pivoine', 'Nager comme un|poisson', 'Avoir une faim de|loup',
      'Chacun son métier, les vaches seront bien|gardées', 'Il faut tourner sept fois sa langue dans sa bouche avant de|parler', 'Ce n’est pas à un vieux singe qu’on apprend à faire la|grimace', 'Il faut que jeunesse se|passe',
      'Les cordonniers sont toujours les plus mal|chaussés', 'Il ne faut jamais dire : fontaine, je ne boirai pas de ton|eau', 'La vérité sort de la bouche des|enfants', 'Faute de grives, on mange des|merles',
      'À bon chat, bon|rat', 'Qui paie ses dettes s’|enrichit', 'Qui ne dit mot|consent', 'Abondance de biens ne nuit|pas',
      'Patience et longueur de temps font plus que force ni que|rage', 'On a souvent besoin d’un plus petit que|soi', 'Il faut cultiver notre|jardin', 'Un bienfait n’est jamais|perdu',
      'À l’impossible nul n’est|tenu', 'Qui s’y frotte s’y|pique', 'Mettre de l’eau dans son|vin', 'Il y a anguille sous|roche',
      'Ce sont les tonneaux vides qui font le plus de|bruit', 'Les conseilleurs ne sont pas les|payeurs', 'Petite pluie abat grand|vent', 'Il faut prendre le temps comme il|vient',
      'Doucement le matin, pas trop vite le|soir', 'Chacun voit midi à sa|porte', 'Les jours se suivent et ne se ressemblent|pas', 'Il ne faut pas réveiller le chat qui|dort',
      'Le linge sale se lave en|famille', 'Il n’y a que les montagnes qui ne se rencontrent|pas', 'L’exactitude est la politesse des|rois', 'Les petits cadeaux entretiennent l’|amitié',
      'Qui vole un œuf vole un|bœuf', 'La critique est aisée, mais l’art est|difficile', 'Qui veut la fin veut les|moyens', 'Être né sous une bonne|étoile',
      'Prendre la clé des|champs', 'Mettre du beurre dans les|épinards', 'Couper la poire en|deux', 'Raconter des|salades',
      'Poser un|lapin', 'Avoir des fourmis dans les|jambes', 'Rouler sur l’|or', 'Se lever du pied|gauche',
      'Mettre les pieds dans le|plat', 'Ça ne mange pas de|pain', 'Faire la pluie et le beau|temps', 'Tirer les vers du|nez',
      'Avoir un appétit d’|oiseau', 'Il fait un temps de|chien', 'Il n’y a pas le feu au|lac', 'Les doigts dans le|nez',
      'Être tiré à quatre|épingles', 'Sauter du coq à l’|âne', 'Ménager la chèvre et le|chou', 'Avoir un poil dans la|main', 'Il vaut mieux tenir que|courir',
      'Bien faire et laisser|dire', 'De la discussion jaillit la|lumière', 'Le cœur a ses raisons que la raison ne connaît|point', 'Il faut manger pour vivre, et non vivre pour|manger',
      'L’erreur est|humaine', 'Toute peine mérite|salaire',
      'Qui peut le plus peut le|moins', 'Il faut se méfier de l’eau qui|dort', 'Il ne faut pas courir deux lièvres à la|fois', 'La pomme ne tombe jamais loin de l’|arbre', 'Il faut joindre l’utile à l’|agréable', 'Il ne faut pas jeter le bébé avec l’eau du|bain', 'Les apparences sont|trompeuses', 'Avoir plusieurs cordes à son|arc', 'Être sur son trente-et-|un', 'Avoir le compas dans l’|œil', 'Mettre la puce à l’|oreille', 'Ne pas y aller par quatre|chemins', 'Avoir la|pêche', 'Être une fine|mouche', 'Faire la grasse|matinée', 'Il faut garder une poire pour la|soif', 'C’est la cerise sur le|gâteau', 'Haut les|cœurs', 'Il n’y a pas de sot|métier', 'Mon petit doigt me l’a|dit'
    ],
    de: [
      '*Morgenstund hat Gold im|Mund', '*Übung macht den|Meister', '*Besser spät als|nie', '*Der Apfel fällt nicht weit vom|Stamm',
      '*Reden ist Silber, Schweigen ist|Gold', '*Viele Köche verderben den|Brei', '*Aller Anfang ist|schwer', '*Ende gut, alles|gut',
      '*Was du heute kannst besorgen, das verschiebe nicht auf|morgen', '*Ohne Fleiß kein|Preis', '*Kleider machen|Leute', '*Lügen haben kurze|Beine',
      '*Wer zuletzt lacht, lacht am|besten', '*Hunde, die bellen, beißen|nicht', '*Einem geschenkten Gaul schaut man nicht ins|Maul', '*Wo ein Wille ist, ist auch ein|Weg',
      '*Gut Ding will Weile|haben', '*Rom wurde nicht an einem Tag|erbaut', '*Eile mit|Weile', '*Doppelt hält|besser',
      '*Steter Tropfen höhlt den|Stein', '*Wer rastet, der|rostet', '*Ordnung ist das halbe|Leben', '*Zeit ist|Geld',
      '*Geteilte Freude ist doppelte|Freude', '*Der frühe Vogel fängt den|Wurm', '*Es ist noch kein Meister vom Himmel|gefallen', '*Wie man in den Wald hineinruft, so schallt es|heraus',
      '*Die Katze lässt das Mausen|nicht', '*Wenn die Katze aus dem Haus ist, tanzen die Mäuse auf dem|Tisch', '*Mit Speck fängt man|Mäuse', '*Der Klügere gibt|nach',
      '*Kommt Zeit, kommt|Rat', '*Wer nicht wagt, der nicht|gewinnt', '*Ein Spatz in der Hand ist besser als eine Taube auf dem|Dach', '*Viele Wege führen nach|Rom',
      '*Ausnahmen bestätigen die|Regel', '*Gleich und Gleich gesellt sich|gern', '*Wer im Glashaus sitzt, sollte nicht mit Steinen|werfen', '*Stille Wasser sind|tief',
      '*Kleinvieh macht auch|Mist', '*Hunger ist der beste|Koch', '*Liebe geht durch den|Magen', '*Der Ton macht die|Musik',
      '*Handwerk hat goldenen|Boden', '*Man soll den Tag nicht vor dem Abend|loben', '*Unverhofft kommt|oft', '*Was lange währt, wird endlich|gut',
      '*Wer sucht, der|findet', '*Jeder ist seines Glückes|Schmied', '*Scherben bringen|Glück', '*Eine Schwalbe macht noch keinen|Sommer',
      '*April, April, der macht, was er|will', '*Alte Liebe rostet|nicht', '*Andere Länder, andere|Sitten', '*In der Kürze liegt die|Würze',
      '*Probieren geht über|Studieren', '*Neue Besen kehren|gut', '*Einmal ist|keinmal', '*Aller guten Dinge sind|drei',
      '*Ehrlich währt am|längsten', '*Ein Bild sagt mehr als tausend|Worte', '*Man lernt nie|aus', '*Auf Regen folgt|Sonnenschein',
      '*Es ist nicht alles Gold, was|glänzt', '*Wer zuerst kommt, mahlt|zuerst', '*Morgen ist auch noch ein|Tag', '*Das Auge isst|mit',
      '*Wissen ist|Macht', '*Alles hat seine|Zeit', '*Der Appetit kommt beim|Essen', '*Alles neu macht der|Mai',
      '*Abwarten und Tee|trinken', '*Ein Mann, ein|Wort', '*Wer will, der|kann', '*Erst die Arbeit, dann das|Vergnügen',
      '*Klein, aber|fein', '*Wo Rauch ist, ist auch|Feuer', '*Pech im Spiel, Glück in der|Liebe', '*Der Weg ist das|Ziel',
      '*Gesagt,|getan', '*Lange Rede, kurzer|Sinn', '*Wie gewonnen, so|zerronnen', '*Aus den Augen, aus dem|Sinn',
      '*Fleißig wie eine|Biene', '*Schlau wie ein|Fuchs', '*Flink wie ein|Wiesel', '*Stark wie ein|Bär',
      '*Weiß wie|Schnee', '*Rot wie eine|Tomate', '*Schnell wie der|Blitz', '*Leicht wie eine|Feder',
      '*Sanft wie ein|Lamm', '*Stumm wie ein|Fisch', '*Glatt wie ein|Aal', '*Klar wie|Kloßbrühe',
      '*Hart wie|Stahl', '*Kalt wie|Eis', '*Süß wie|Honig', '*Stolz wie|Oskar',
      '*Schlafen wie ein|Murmeltier', '*Wie ein Fisch im|Wasser', '*Leben wie die Made im|Speck', '*Wie Hund und|Katze',
      '*Wie aus dem Ei|gepellt', '*Sich freuen wie ein|Schneekönig', '*Ein Herz und eine|Seele', '*Alles in|Butter',
      '*Ich verstehe nur|Bahnhof', '*Da steppt der|Bär', '*Die Daumen|drücken', '*Den Nagel auf den Kopf|treffen',
      '*Das Gelbe vom|Ei', '*Unter vier|Augen', '*Alles hat ein Ende, nur die Wurst hat|zwei', '*Jetzt geht’s um die|Wurst',
      'Treu wie|Gold', 'Frech wie ein|Spatz', 'Hungrig wie ein|Wolf', 'Neugierig wie eine|Katze',
      'Was du nicht willst, dass man dir tu, das füg auch keinem andern|zu', 'Vorsicht ist die Mutter der|Porzellankiste', 'Viele Hände, schnelles|Ende', 'Selbst ist der|Mann',
      'Kinder und Narren sagen die|Wahrheit', 'Was sich liebt, das neckt|sich', 'Gut gekaut ist halb|verdaut', 'Wer ernten will, muss|säen',
      'Wie die Saat, so die|Ernte', 'Ein gutes Gewissen ist ein sanftes|Ruhekissen', 'Morgen, morgen, nur nicht heute, sagen alle faulen|Leute', 'Wer den Pfennig nicht ehrt, ist des Talers nicht|wert',
      'Aus Schaden wird man|klug', 'Den Wald vor lauter Bäumen nicht|sehen', 'Was nicht ist, kann noch|werden', 'Kleine Geschenke erhalten die|Freundschaft',
      'Je später der Abend, desto schöner die|Gäste', 'Ein voller Bauch studiert nicht|gern', 'Bescheidenheit ist eine|Zier', 'Jedem Tierchen sein|Pläsierchen',
      'Ohne Moos nix|los', 'Wo gehobelt wird, da fallen|Späne', 'Das Glück ist mit den|Tüchtigen', 'Dem Mutigen gehört die|Welt',
      'Pünktlichkeit ist die Höflichkeit der|Könige', 'Ein Lächeln kostet|nichts', 'Freundlichkeit kostet|nichts', 'Man muss die Feste feiern, wie sie|fallen',
      'Das Ei will klüger sein als die|Henne', 'Man soll den Bogen nicht|überspannen', 'Die Axt im Haus erspart den|Zimmermann', 'Mehr Schein als|Sein',
      'Es ist noch nicht aller Tage|Abend', 'Ein Esel schimpft den anderen|Langohr', 'Wer schreibt, der|bleibt', 'Unkraut vergeht|nicht',
      'Kleine Ursache, große|Wirkung', 'Schuster, bleib bei deinem|Leisten', 'Wie der Herr, so’s|Gescherr', 'Das ist nicht mein|Bier',
      'Tomaten auf den Augen|haben', 'Schwein|haben', 'Ins Fettnäpfchen|treten', 'Auf Wolke|sieben',
      'Eulen nach Athen|tragen', 'Den Braten|riechen', 'Sich die Rosinen aus dem Kuchen|picken', 'Um den heißen Brei|herumreden',
      'Mit jemandem Pferde stehlen|können', 'Ich glaub, mein Schwein|pfeift', 'Gemeinsam sind wir|stark', 'Lachen ist|gesund',
      'Wer die Wahl hat, hat die|Qual', 'Ein blindes Huhn findet auch mal ein|Korn', 'Wer A sagt, muss auch|B sagen',
      'Viel Lärm um|nichts', 'Not macht|erfinderisch', 'Wer zahlt, schafft|an',
      'Aus einer Mücke einen Elefanten|machen', 'Hans im|Glück', 'Wer Ordnung hält, ist nur zu faul zum|Suchen',
      'Man soll das Eisen schmieden, solange es heiß|ist', 'Den Kopf nicht hängen|lassen', 'Aufgeschoben ist nicht|aufgehoben', 'Gut gebrüllt,|Löwe', 'Eine Hand wäscht die|andere', 'Es ist nicht alle Tage|Sonntag', 'Bei Nacht sind alle Katzen|grau', 'Jemandem einen Bären|aufbinden', 'Auf großem Fuß|leben', 'Das ist ein|Kinderspiel', 'Etwas auf die lange Bank|schieben', 'Zwei Fliegen mit einer Klappe|schlagen', 'Hinz und|Kunz', 'Mit Kind und|Kegel', 'Klappern gehört zum|Handwerk', 'Von nichts kommt|nichts', 'Spaß muss|sein', 'Alles für die|Katz', 'Mit dem linken Fuß zuerst|aufgestanden'
    ]
  };

  /* ---------- bank 2: the kindness quiz ----------
     A question, a pool of answers (three are drawn each day, so the same question comes back with
     other answers) and what Bellatrix says after ANY answer. Every answer is a good one: there is
     no right or wrong answer anywhere in this bank. o: { s: simple (gentle level), season, topics }. */
  function Q(id, cat, o, q, a, r) { return { id: 'q-' + id, cat: cat, s: !!o.s, season: o.season || '', topics: o.topics || [], q: q, a: a, r: r }; }
  var QUIZ = [
    Q('brighter', 'kindness', { s: 1 },
      { en: 'What can make someone’s day brighter?', fr: 'Qu’est-ce qui peut égayer la journée de quelqu’un ?', de: 'Was kann den Tag eines Menschen schöner machen?' },
      { en: ['A smile', 'A kind word', 'A small surprise', 'A cup of tea together', 'A song', 'A helping hand', 'A compliment'],
        fr: ['Un sourire', 'Un mot gentil', 'Une petite surprise', 'Un thé partagé', 'Une chanson', 'Un coup de main', 'Un compliment'],
        de: ['Ein Lächeln', 'Ein freundliches Wort', 'Eine kleine Überraschung', 'Eine Tasse Tee zusammen', 'Ein Lied', 'Eine helfende Hand', 'Ein Kompliment'] },
      { en: 'All of those are lovely. Small kindnesses make a big difference.', fr: 'Tout cela est très beau. Les petites attentions font une grande différence.', de: 'Das ist alles wunderbar. Kleine Freundlichkeiten bewirken viel.' }),
    Q('neighbour', 'kindness', {},
      { en: 'What is a kind thing to do for a neighbour?', fr: 'Quelle gentillesse peut-on faire pour un voisin ?', de: 'Was ist eine nette Geste für einen Nachbarn?' },
      { en: ['Say good morning', 'Share a cake', 'Help carry a bag', 'Water their flowers', 'Lend a book', 'Ask how they are'],
        fr: ['Dire bonjour', 'Partager un gâteau', 'Aider à porter un sac', 'Arroser ses fleurs', 'Prêter un livre', 'Demander de ses nouvelles'],
        de: ['Guten Morgen sagen', 'Einen Kuchen teilen', 'Beim Tragen helfen', 'Die Blumen gießen', 'Ein Buch leihen', 'Fragen, wie es geht'] },
      { en: 'Wonderful ideas. Small things often mean the most.', fr: 'De belles idées. Ce sont souvent les petites attentions qui comptent le plus.', de: 'Wunderbare Ideen. Kleine Dinge bedeuten oft am meisten.' }),
    Q('words', 'kindness', { s: 1 },
      { en: 'Which kind words do you like to hear?', fr: 'Quels mots gentils aimez-vous entendre ?', de: 'Welche freundlichen Worte hören Sie gern?' },
      { en: ['Thank you', 'Well done', 'Good to see you', 'You look lovely today', 'I am glad you are here', 'You made me laugh'],
        fr: ['Merci', 'Bravo', 'Quel plaisir de vous voir', 'Vous êtes très élégant aujourd’hui', 'Je suis content que vous soyez là', 'Vous m’avez fait rire'],
        de: ['Danke', 'Gut gemacht', 'Schön, Sie zu sehen', 'Sie sehen heute schön aus', 'Wie gut, dass Sie da sind', 'Sie haben mich zum Lachen gebracht'] },
      { en: 'Lovely. Kind words stay with people for a long time.', fr: 'C’est beau. Les mots gentils restent longtemps dans le cœur.', de: 'Wie schön. Freundliche Worte bleiben lange in Erinnerung.' }),
    Q('welcome', 'kindness', {},
      { en: 'How can we welcome someone new?', fr: 'Comment accueillir quelqu’un de nouveau ?', de: 'Wie können wir jemanden willkommen heißen, der neu ist?' },
      { en: ['Learn their name', 'Show them around', 'Invite them for tea', 'Offer them a seat', 'Smile at them', 'Introduce them to friends'],
        fr: ['Retenir son prénom', 'Lui faire visiter les lieux', 'L’inviter à prendre un café', 'Lui proposer une chaise', 'Lui sourire', 'Le présenter à des amis'],
        de: ['Sich den Namen merken', 'Alles zeigen', 'Zum Kaffee einladen', 'Einen Platz anbieten', 'Freundlich lächeln', 'Freunden vorstellen'] },
      { en: 'Great choices. Feeling welcome makes a new place feel like home.', fr: 'Excellentes idées. Quand on se sent bienvenu, un nouveau lieu devient vite un chez-soi.', de: 'Gute Ideen. Wer sich willkommen fühlt, ist an einem neuen Ort schnell zu Hause.' }),
    Q('together', 'group', { s: 1 },
      { en: 'What could we do together as a group?', fr: 'Que pourrions-nous faire ensemble, en groupe ?', de: 'Was könnten wir gemeinsam als Gruppe tun?' },
      { en: ['Sing a song', 'Share a story', 'Plant some flowers', 'Bake a cake', 'Play cards', 'Listen to music'],
        fr: ['Chanter une chanson', 'Partager une histoire', 'Planter des fleurs', 'Faire un gâteau', 'Jouer aux cartes', 'Écouter de la musique'],
        de: ['Ein Lied singen', 'Eine Geschichte erzählen', 'Blumen pflanzen', 'Einen Kuchen backen', 'Karten spielen', 'Musik hören'] },
      { en: 'Lovely. Doing things together brings people closer.', fr: 'C’est beau. Faire des choses ensemble rapproche les gens.', de: 'Schön. Gemeinsame Erlebnisse bringen Menschen näher zusammen.' }),
    Q('thanks', 'kindness', {},
      { en: 'Who would you like to say thank you to today?', fr: 'À qui aimeriez-vous dire merci aujourd’hui ?', de: 'Bei wem möchten Sie sich heute bedanken?' },
      { en: ['A friend', 'The care team', 'A neighbour', 'Someone who made me smile', 'The cook', 'Everyone here'],
        fr: ['Un ami', 'L’équipe soignante', 'Un voisin', 'Quelqu’un qui m’a fait sourire', 'Le cuisinier', 'Tout le monde ici'],
        de: ['Bei einem Freund', 'Beim Pflegeteam', 'Bei einem Nachbarn', 'Bei jemandem, der mich zum Lächeln gebracht hat', 'Beim Koch', 'Bei allen hier'] },
      { en: 'A thank you warms two hearts: yours and theirs.', fr: 'Un merci réchauffe deux cœurs : le vôtre et celui de l’autre.', de: 'Ein Dankeschön wärmt zwei Herzen: Ihres und das des anderen.' }),
    Q('gift', 'kindness', { s: 1 },
      { en: 'Which small gift would make someone happy?', fr: 'Quel petit cadeau ferait plaisir à quelqu’un ?', de: 'Welches kleine Geschenk würde jemandem Freude machen?' },
      { en: ['A flower', 'A handwritten card', 'A homemade biscuit', 'A nice photo', 'A song', 'A warm scarf'],
        fr: ['Une fleur', 'Une carte écrite à la main', 'Un biscuit fait maison', 'Une jolie photo', 'Une chanson', 'Une écharpe chaude'],
        de: ['Eine Blume', 'Eine handgeschriebene Karte', 'Ein selbst gebackener Keks', 'Ein schönes Foto', 'Ein Lied', 'Ein warmer Schal'] },
      { en: 'What a lovely idea. The best gifts come from the heart.', fr: 'Quelle jolie idée. Les plus beaux cadeaux viennent du cœur.', de: 'Was für eine schöne Idee. Die besten Geschenke kommen von Herzen.' }),
    Q('cheer', 'kindness', {},
      { en: 'How can we cheer up a friend?', fr: 'Comment remonter le moral d’un ami ?', de: 'Wie können wir einen Freund aufmuntern?' },
      { en: ['Sit with them', 'Tell a funny story', 'Bring a cup of tea', 'Hold their hand', 'Sing together', 'Go for a little walk together'],
        fr: ['S’asseoir près de lui', 'Raconter une histoire drôle', 'Lui apporter une tasse de thé', 'Lui tenir la main', 'Chanter ensemble', 'Faire une petite promenade ensemble'],
        de: ['Sich zu ihm setzen', 'Eine lustige Geschichte erzählen', 'Eine Tasse Tee bringen', 'Die Hand halten', 'Zusammen singen', 'Einen kleinen Spaziergang zusammen machen'] },
      { en: 'Lovely. Being there for someone is a wonderful gift.', fr: 'C’est beau. Être là pour quelqu’un est un merveilleux cadeau.', de: 'Schön. Für jemanden da zu sein, ist ein wunderbares Geschenk.' }),
    Q('smile', 'pleasure', { s: 1 },
      { en: 'What makes you smile?', fr: 'Qu’est-ce qui vous fait sourire ?', de: 'Was bringt Sie zum Lächeln?' },
      { en: ['Sunshine', 'A good joke', 'Music', 'Flowers', 'A friendly face', 'Animals', 'A nice meal'],
        fr: ['Le soleil', 'Une bonne blague', 'La musique', 'Les fleurs', 'Un visage aimable', 'Les animaux', 'Un bon repas'],
        de: ['Sonnenschein', 'Ein guter Witz', 'Musik', 'Blumen', 'Ein freundliches Gesicht', 'Tiere', 'Ein gutes Essen'] },
      { en: 'How nice. A smile is a gift anyone can give.', fr: 'Comme c’est agréable. Un sourire est un cadeau que chacun peut offrir.', de: 'Wie schön. Ein Lächeln ist ein Geschenk, das jeder machen kann.' }),
    Q('morning', 'pleasure', { s: 1 },
      { en: 'What is a lovely way to start the day?', fr: 'Quelle est une belle façon de commencer la journée ?', de: 'Wie beginnt ein Tag besonders schön?' },
      { en: ['A good breakfast', 'Opening the curtains', 'A cup of coffee', 'A cheerful song', 'A friendly hello', 'Looking at the sky'],
        fr: ['Un bon petit-déjeuner', 'Ouvrir les rideaux', 'Une tasse de café', 'Une chanson joyeuse', 'Un bonjour amical', 'Regarder le ciel'],
        de: ['Ein gutes Frühstück', 'Die Vorhänge öffnen', 'Eine Tasse Kaffee', 'Ein fröhliches Lied', 'Ein freundliches Hallo', 'In den Himmel schauen'] },
      { en: 'Lovely. A good start makes the whole day brighter.', fr: 'C’est beau. Un bon début rend toute la journée plus belle.', de: 'Schön. Ein guter Anfang macht den ganzen Tag heller.' }),
    Q('pleasure', 'pleasure', {},
      { en: 'Which small pleasure do you enjoy?', fr: 'Quel petit plaisir appréciez-vous ?', de: 'Welche kleine Freude genießen Sie?' },
      { en: ['A good cup of coffee', 'A piece of chocolate', 'The smell of fresh bread', 'A sunny window', 'A comfortable chair', 'A nice letter'],
        fr: ['Un bon café', 'Un carré de chocolat', 'L’odeur du pain frais', 'Une fenêtre au soleil', 'Un fauteuil confortable', 'Une jolie lettre'],
        de: ['Eine gute Tasse Kaffee', 'Ein Stück Schokolade', 'Der Duft von frischem Brot', 'Ein sonniges Fenster', 'Ein bequemer Sessel', 'Ein schöner Brief'] },
      { en: 'Wonderful. Small pleasures make life sweet.', fr: 'Merveilleux. Les petits plaisirs rendent la vie douce.', de: 'Wunderbar. Kleine Freuden machen das Leben süß.' }),
    Q('treat', 'pleasure', { s: 1, topics: ['food'] },
      { en: 'Which treat would you share with a friend?', fr: 'Quelle douceur partageriez-vous avec un ami ?', de: 'Welche Leckerei würden Sie mit einem Freund teilen?' },
      { en: ['A slice of cake', 'Some chocolate', 'Fresh strawberries', 'A biscuit', 'An ice cream', 'Warm waffles'],
        fr: ['Une part de gâteau', 'Du chocolat', 'Des fraises fraîches', 'Un biscuit', 'Une glace', 'Des gaufres chaudes'],
        de: ['Ein Stück Kuchen', 'Etwas Schokolade', 'Frische Erdbeeren', 'Einen Keks', 'Ein Eis', 'Warme Waffeln'] },
      { en: 'Delicious. Sharing makes everything taste better.', fr: 'Délicieux. Partager rend tout meilleur.', de: 'Lecker. Geteilt schmeckt alles noch besser.' }),
    Q('flower', 'nature', { s: 1, topics: ['garden'] },
      { en: 'Which flower would you give to a friend?', fr: 'Quelle fleur offririez-vous à un ami ?', de: 'Welche Blume würden Sie einem Freund schenken?' },
      { en: ['A rose', 'A tulip', 'A sunflower', 'Lily of the valley', 'A daisy', 'Some lavender', 'A violet'],
        fr: ['Une rose', 'Une tulipe', 'Un tournesol', 'Du muguet', 'Une marguerite', 'Un brin de lavande', 'Une violette'],
        de: ['Eine Rose', 'Eine Tulpe', 'Eine Sonnenblume', 'Maiglöckchen', 'Ein Gänseblümchen', 'Etwas Lavendel', 'Ein Veilchen'] },
      { en: 'Flowers are a lovely way to say: I am thinking of you.', fr: 'Les fleurs sont une jolie façon de dire : je pense à vous.', de: 'Blumen sind eine schöne Art zu sagen: Ich denke an Sie.' }),
    Q('plant', 'nature', { topics: ['garden'] },
      { en: 'What would you plant in a little garden?', fr: 'Que planteriez-vous dans un petit jardin ?', de: 'Was würden Sie in einem kleinen Garten pflanzen?' },
      { en: ['Tomatoes', 'Roses', 'Strawberries', 'Herbs', 'Sunflowers', 'Beans', 'Lettuce'],
        fr: ['Des tomates', 'Des roses', 'Des fraises', 'Des herbes aromatiques', 'Des tournesols', 'Des haricots', 'De la salade'],
        de: ['Tomaten', 'Rosen', 'Erdbeeren', 'Kräuter', 'Sonnenblumen', 'Bohnen', 'Salat'] },
      { en: 'What a lovely garden that would be. Watching things grow is a joy.', fr: 'Quel beau jardin ce serait. Voir pousser les plantes est une joie.', de: 'Was für ein schöner Garten das wäre. Es ist eine Freude, Pflanzen wachsen zu sehen.' }),
    Q('animal', 'nature', { s: 1, topics: ['animals'] },
      { en: 'Which animal makes you smile?', fr: 'Quel animal vous fait sourire ?', de: 'Welches Tier bringt Sie zum Lächeln?' },
      { en: ['A puppy', 'A kitten', 'A little bird', 'A rabbit', 'A horse', 'A duckling', 'A squirrel'],
        fr: ['Un chiot', 'Un chaton', 'Un petit oiseau', 'Un lapin', 'Un cheval', 'Un caneton', 'Un écureuil'],
        de: ['Ein Welpe', 'Ein Kätzchen', 'Ein kleiner Vogel', 'Ein Hase', 'Ein Pferd', 'Ein Entenküken', 'Ein Eichhörnchen'] },
      { en: 'Lovely. Animals bring so much joy.', fr: 'C’est beau. Les animaux apportent tant de joie.', de: 'Schön. Tiere schenken so viel Freude.' }),
    Q('pets', 'kindness', { topics: ['animals'] },
      { en: 'How can we be kind to animals?', fr: 'Comment être gentil avec les animaux ?', de: 'Wie können wir freundlich zu Tieren sein?' },
      { en: ['Give them fresh water', 'Feed the birds in winter', 'Stroke them gently', 'Speak softly', 'Give them a cosy place', 'Take the dog for a walk'],
        fr: ['Leur donner de l’eau fraîche', 'Nourrir les oiseaux en hiver', 'Les caresser doucement', 'Leur parler gentiment', 'Leur offrir un coin douillet', 'Promener le chien'],
        de: ['Frisches Wasser geben', 'Im Winter die Vögel füttern', 'Sanft streicheln', 'Leise mit ihnen sprechen', 'Einen gemütlichen Platz geben', 'Mit dem Hund spazieren gehen'] },
      { en: 'Wonderful. Animals feel kindness too.', fr: 'Merveilleux. Les animaux sentent aussi la gentillesse.', de: 'Wunderbar. Auch Tiere spüren Freundlichkeit.' }),
    Q('music', 'music', { s: 1, topics: ['music'] },
      { en: 'Which music would make a lovely afternoon?', fr: 'Quelle musique ferait un bel après-midi ?', de: 'Welche Musik würde einen schönen Nachmittag machen?' },
      { en: ['A waltz', 'A cheerful song', 'Some classical music', 'A song to sing along to', 'Accordion music', 'A brass band'],
        fr: ['Une valse', 'Une chanson joyeuse', 'De la musique classique', 'Une chanson à chanter ensemble', 'De l’accordéon', 'Une fanfare'],
        de: ['Ein Walzer', 'Ein fröhliches Lied', 'Klassische Musik', 'Ein Lied zum Mitsingen', 'Akkordeonmusik', 'Eine Blaskapelle'] },
      { en: 'Lovely choice. Music makes any afternoon brighter.', fr: 'Très bon choix. La musique égaye n’importe quel après-midi.', de: 'Schöne Wahl. Musik macht jeden Nachmittag heller.' }),
    Q('musicwhen', 'music', { topics: ['music'] },
      { en: 'When is music especially lovely?', fr: 'Quand la musique est-elle particulièrement agréable ?', de: 'Wann ist Musik besonders schön?' },
      { en: ['In the morning', 'At a party', 'While cooking', 'While dancing', 'With friends', 'On a Sunday'],
        fr: ['Le matin', 'Pendant une fête', 'En cuisinant', 'En dansant', 'Entre amis', 'Le dimanche'],
        de: ['Am Morgen', 'Auf einem Fest', 'Beim Kochen', 'Beim Tanzen', 'Mit Freunden', 'Am Sonntag'] },
      { en: 'Yes. Music goes with every good moment.', fr: 'Oui. La musique accompagne tous les bons moments.', de: 'Ja. Musik passt zu jedem schönen Moment.' }),
    Q('kitchen', 'food', { topics: ['food'] },
      { en: 'Which smell from the kitchen do you like?', fr: 'Quelle odeur de cuisine aimez-vous ?', de: 'Welchen Duft aus der Küche mögen Sie?' },
      { en: ['Fresh bread', 'Apple pie', 'Coffee', 'Soup on the stove', 'Cinnamon', 'Waffles'],
        fr: ['Le pain frais', 'La tarte aux pommes', 'Le café', 'La soupe qui mijote', 'La cannelle', 'Les gaufres'],
        de: ['Frisches Brot', 'Apfelkuchen', 'Kaffee', 'Suppe auf dem Herd', 'Zimt', 'Waffeln'] },
      { en: 'Mmm, lovely. Good smells make a house feel like home.', fr: 'Mmm, délicieux. Les bonnes odeurs rendent une maison chaleureuse.', de: 'Mmm, herrlich. Gute Düfte machen ein Haus gemütlich.' }),
    Q('cook', 'food', { topics: ['food'] },
      { en: 'What would be nice to cook for friends?', fr: 'Que serait-il agréable de cuisiner pour des amis ?', de: 'Was könnte man Schönes für Freunde kochen?' },
      { en: ['A big soup', 'A cake', 'Pancakes', 'A stew', 'A fruit tart', 'Homemade biscuits'],
        fr: ['Une grande soupe', 'Un gâteau', 'Des crêpes', 'Un pot-au-feu', 'Une tarte aux fruits', 'Des biscuits maison'],
        de: ['Eine große Suppe', 'Einen Kuchen', 'Pfannkuchen', 'Einen Eintopf', 'Einen Obstkuchen', 'Selbst gebackene Kekse'] },
      { en: 'Delicious. Cooking for others is a kind gift.', fr: 'Délicieux. Cuisiner pour les autres est un beau cadeau.', de: 'Köstlich. Für andere zu kochen ist ein schönes Geschenk.' }),
    Q('seaside', 'places', { topics: ['sea'] },
      { en: 'What is nice to do by the sea?', fr: 'Qu’est-ce qu’il est agréable de faire au bord de la mer ?', de: 'Was macht man gern am Meer?' },
      { en: ['Walk on the sand', 'Listen to the waves', 'Watch the boats', 'Eat an ice cream', 'Collect shells', 'Feel the breeze'],
        fr: ['Marcher sur le sable', 'Écouter les vagues', 'Regarder les bateaux', 'Manger une glace', 'Ramasser des coquillages', 'Sentir la brise'],
        de: ['Am Strand spazieren', 'Den Wellen zuhören', 'Die Boote beobachten', 'Ein Eis essen', 'Muscheln sammeln', 'Die frische Brise spüren'] },
      { en: 'Lovely. The sea has a calm all of its own.', fr: 'C’est beau. La mer a un calme bien à elle.', de: 'Schön. Das Meer hat eine ganz eigene Ruhe.' }),
    Q('mountains', 'places', { topics: ['mountain'] },
      { en: 'What is nice to do in the mountains?', fr: 'Qu’est-ce qu’il est agréable de faire à la montagne ?', de: 'Was macht man gern in den Bergen?' },
      { en: ['Breathe the fresh air', 'Enjoy the view', 'Have a picnic', 'Listen to the cowbells', 'Drink a hot chocolate', 'Pick wild flowers'],
        fr: ['Respirer l’air pur', 'Admirer la vue', 'Pique-niquer', 'Écouter les cloches des vaches', 'Boire un chocolat chaud', 'Cueillir des fleurs sauvages'],
        de: ['Die frische Luft atmen', 'Die Aussicht genießen', 'Picknicken', 'Den Kuhglocken lauschen', 'Eine heiße Schokolade trinken', 'Wildblumen pflücken'] },
      { en: 'Wonderful. The mountains make us feel light.', fr: 'Merveilleux. La montagne nous rend légers.', de: 'Wunderbar. Die Berge machen das Herz leicht.' }),
    Q('woods', 'nature', { topics: ['nature'] },
      { en: 'What do you like about a walk in the woods?', fr: 'Qu’aimez-vous dans une promenade en forêt ?', de: 'Was mögen Sie an einem Spaziergang im Wald?' },
      { en: ['The smell of the trees', 'The birdsong', 'The quiet', 'The soft path', 'Finding mushrooms', 'The sunlight through the leaves'],
        fr: ['L’odeur des arbres', 'Le chant des oiseaux', 'Le calme', 'Le chemin tout doux', 'Trouver des champignons', 'Le soleil entre les feuilles'],
        de: ['Den Duft der Bäume', 'Den Vogelgesang', 'Die Stille', 'Den weichen Weg', 'Pilze finden', 'Das Sonnenlicht zwischen den Blättern'] },
      { en: 'Lovely. A walk in the woods is good for the soul.', fr: 'C’est beau. Une promenade en forêt fait du bien.', de: 'Schön. Ein Waldspaziergang tut einfach gut.' }),
    Q('sunny', 'pleasure', { s: 1 },
      { en: 'What is lovely on a sunny day?', fr: 'Qu’est-ce qui est agréable par une journée ensoleillée ?', de: 'Was ist an einem sonnigen Tag schön?' },
      { en: ['Sitting outside', 'A cool drink', 'A little walk', 'Looking at the flowers', 'An ice cream', 'Opening the window'],
        fr: ['S’asseoir dehors', 'Une boisson fraîche', 'Une petite promenade', 'Regarder les fleurs', 'Une glace', 'Ouvrir la fenêtre'],
        de: ['Draußen sitzen', 'Ein kühles Getränk', 'Ein kleiner Spaziergang', 'Die Blumen betrachten', 'Ein Eis', 'Das Fenster öffnen'] },
      { en: 'Yes. Sunshine makes everyone a little happier.', fr: 'Oui. Le soleil rend chacun un peu plus heureux.', de: 'Ja. Sonnenschein macht alle ein bisschen fröhlicher.' }),
    Q('rainy', 'pleasure', {},
      { en: 'What is cosy to do on a rainy day?', fr: 'Que faire de douillet par un jour de pluie ?', de: 'Was ist an einem Regentag gemütlich?' },
      { en: ['Read a book', 'Drink a hot tea', 'Listen to the rain', 'Play cards', 'Look at photos', 'Listen to the radio'],
        fr: ['Lire un livre', 'Boire un thé chaud', 'Écouter la pluie', 'Jouer aux cartes', 'Regarder des photos', 'Écouter la radio'],
        de: ['Ein Buch lesen', 'Einen heißen Tee trinken', 'Dem Regen lauschen', 'Karten spielen', 'Fotos anschauen', 'Radio hören'] },
      { en: 'Lovely. A rainy day can be very cosy.', fr: 'C’est agréable. Un jour de pluie peut être très douillet.', de: 'Schön. Ein Regentag kann sehr gemütlich sein.' }),
    Q('daytrip', 'places', { topics: ['travel'] },
      { en: 'Where would you like to go for a day trip?', fr: 'Où aimeriez-vous aller pour une excursion d’une journée ?', de: 'Wohin würden Sie gern einen Tagesausflug machen?' },
      { en: ['To the sea', 'To the mountains', 'To a lake', 'To a pretty village', 'To a big market', 'To a flower garden'],
        fr: ['À la mer', 'À la montagne', 'Au bord d’un lac', 'Dans un joli village', 'Dans un grand marché', 'Dans un jardin fleuri'],
        de: ['Ans Meer', 'In die Berge', 'An einen See', 'In ein hübsches Dorf', 'Auf einen großen Markt', 'In einen Blumengarten'] },
      { en: 'What a lovely trip that would be.', fr: 'Quelle belle sortie ce serait.', de: 'Was für ein schöner Ausflug das wäre.' }),
    Q('travelhow', 'places', { s: 1, topics: ['travel'] },
      { en: 'How do you like to travel best?', fr: 'Comment préférez-vous voyager ?', de: 'Wie reisen Sie am liebsten?' },
      { en: ['By train', 'By car', 'By bus', 'By boat', 'On foot', 'By bicycle'],
        fr: ['En train', 'En voiture', 'En car', 'En bateau', 'À pied', 'À vélo'],
        de: ['Mit dem Zug', 'Mit dem Auto', 'Mit dem Bus', 'Mit dem Schiff', 'Zu Fuß', 'Mit dem Fahrrad'] },
      { en: 'Lovely. Every way of travelling has its charm.', fr: 'C’est bien. Chaque façon de voyager a son charme.', de: 'Schön. Jede Art zu reisen hat ihren Reiz.' }),
    Q('market', 'places', { topics: ['town'] },
      { en: 'What do you like at the market?', fr: 'Qu’aimez-vous au marché ?', de: 'Was mögen Sie auf dem Markt?' },
      { en: ['The fruit and vegetables', 'The flowers', 'The cheese', 'The friendly stallholders', 'The good smells', 'The bustle'],
        fr: ['Les fruits et légumes', 'Les fleurs', 'Le fromage', 'Les marchands sympathiques', 'Les bonnes odeurs', 'L’animation'],
        de: ['Obst und Gemüse', 'Die Blumen', 'Den Käse', 'Die freundlichen Händler', 'Die guten Düfte', 'Das bunte Treiben'] },
      { en: 'Lovely. A market is full of colours and good cheer.', fr: 'C’est beau. Un marché est plein de couleurs et de bonne humeur.', de: 'Schön. Ein Markt ist voller Farben und guter Laune.' }),
    Q('cafe', 'places', { s: 1, topics: ['town', 'food'] },
      { en: 'What would you order at a café?', fr: 'Que commanderiez-vous dans un café ?', de: 'Was würden Sie in einem Café bestellen?' },
      { en: ['A coffee', 'A hot chocolate', 'A tea', 'A slice of cake', 'A croissant', 'An ice cream'],
        fr: ['Un café', 'Un chocolat chaud', 'Un thé', 'Une part de gâteau', 'Un croissant', 'Une glace'],
        de: ['Einen Kaffee', 'Eine heiße Schokolade', 'Einen Tee', 'Ein Stück Kuchen', 'Ein Croissant', 'Ein Eis'] },
      { en: 'Delicious. A café is a lovely place to meet.', fr: 'Délicieux. Un café est un bel endroit pour se retrouver.', de: 'Lecker. Ein Café ist ein schöner Ort, um sich zu treffen.' }),
    Q('handmade', 'crafts', { topics: ['crafts'] },
      { en: 'Which handmade thing is a lovely gift?', fr: 'Quel objet fait main est un beau cadeau ?', de: 'Welches selbst gemachte Geschenk ist besonders schön?' },
      { en: ['A knitted scarf', 'A drawing', 'A wooden toy', 'Homemade jam', 'A sewn cushion', 'A birthday card'],
        fr: ['Une écharpe tricotée', 'Un dessin', 'Un jouet en bois', 'De la confiture maison', 'Un coussin cousu', 'Une carte d’anniversaire'],
        de: ['Ein gestrickter Schal', 'Ein Bild', 'Ein Holzspielzeug', 'Selbst gemachte Marmelade', 'Ein genähtes Kissen', 'Eine Geburtstagskarte'] },
      { en: 'Wonderful. Something made by hand carries a lot of care.', fr: 'Merveilleux. Un objet fait main contient beaucoup d’attention.', de: 'Wunderbar. In etwas Selbstgemachtem steckt viel Liebe.' }),
    Q('cosy', 'home', { s: 1 },
      { en: 'What makes a room feel cosy?', fr: 'Qu’est-ce qui rend une pièce chaleureuse ?', de: 'Was macht ein Zimmer gemütlich?' },
      { en: ['A warm blanket', 'Soft light', 'Flowers on the table', 'Nice photos', 'A comfortable armchair', 'Music'],
        fr: ['Une couverture chaude', 'Une lumière douce', 'Des fleurs sur la table', 'De jolies photos', 'Un fauteuil confortable', 'De la musique'],
        de: ['Eine warme Decke', 'Sanftes Licht', 'Blumen auf dem Tisch', 'Schöne Fotos', 'Ein bequemer Sessel', 'Musik'] },
      { en: 'Lovely. A cosy room is a happy room.', fr: 'C’est beau. Une pièce chaleureuse est une pièce heureuse.', de: 'Schön. Ein gemütliches Zimmer ist ein fröhliches Zimmer.' }),
    Q('friend', 'kindness', {},
      { en: 'What makes a good friend?', fr: 'Qu’est-ce qui fait un bon ami ?', de: 'Was macht einen guten Freund aus?' },
      { en: ['Listening', 'Making us laugh', 'Being honest', 'Helping', 'Remembering our birthday', 'Being patient'],
        fr: ['Savoir écouter', 'Nous faire rire', 'Être sincère', 'Rendre service', 'Se souvenir de notre anniversaire', 'Être patient'],
        de: ['Zuhören können', 'Uns zum Lachen bringen', 'Ehrlich sein', 'Helfen', 'An unseren Geburtstag denken', 'Geduldig sein'] },
      { en: 'Yes. Good friends are a real treasure.', fr: 'Oui. Les bons amis sont un vrai trésor.', de: 'Ja. Gute Freunde sind ein echter Schatz.' }),
    Q('laugh', 'group', {},
      { en: 'What makes people laugh together?', fr: 'Qu’est-ce qui fait rire les gens ensemble ?', de: 'Was bringt Menschen gemeinsam zum Lachen?' },
      { en: ['A funny story', 'A silly hat', 'A good joke', 'Playing a game', 'Dancing', 'Happy memories'],
        fr: ['Une histoire drôle', 'Un chapeau rigolo', 'Une bonne blague', 'Un jeu', 'La danse', 'Les bons souvenirs'],
        de: ['Eine lustige Geschichte', 'Ein komischer Hut', 'Ein guter Witz', 'Ein Spiel', 'Tanzen', 'Schöne Erinnerungen'] },
      { en: 'Wonderful. Laughing together is good for everyone.', fr: 'Merveilleux. Rire ensemble fait du bien à tout le monde.', de: 'Wunderbar. Gemeinsam lachen tut allen gut.' }),
    Q('compliment', 'kindness', {},
      { en: 'Which compliment would you like to give today?', fr: 'Quel compliment aimeriez-vous faire aujourd’hui ?', de: 'Welches Kompliment möchten Sie heute machen?' },
      { en: ['What a lovely smile', 'You are very kind', 'Your hair looks nice', 'Thank you for your help', 'You have good taste', 'It is nice to talk with you'],
        fr: ['Quel joli sourire', 'Vous êtes très gentil', 'Votre coiffure est jolie', 'Merci pour votre aide', 'Vous avez bon goût', 'C’est agréable de parler avec vous'],
        de: ['Was für ein schönes Lächeln', 'Sie sind sehr freundlich', 'Ihre Frisur sieht schön aus', 'Danke für Ihre Hilfe', 'Sie haben einen guten Geschmack', 'Es ist schön, mit Ihnen zu sprechen'] },
      { en: 'Lovely. A compliment can brighten a whole day.', fr: 'C’est beau. Un compliment peut illuminer toute une journée.', de: 'Schön. Ein Kompliment kann einen ganzen Tag erhellen.' }),
    Q('helphere', 'kindness', { s: 1 },
      { en: 'How can we help each other here?', fr: 'Comment pouvons-nous nous entraider ici ?', de: 'Wie können wir uns hier gegenseitig helfen?' },
      { en: ['Pass the salt', 'Hold the door', 'Share a story', 'Keep a seat free', 'Say good morning', 'Listen well'],
        fr: ['Passer le sel', 'Tenir la porte', 'Partager une histoire', 'Garder une place', 'Dire bonjour', 'Bien écouter'],
        de: ['Das Salz reichen', 'Die Tür aufhalten', 'Eine Geschichte erzählen', 'Einen Platz frei halten', 'Guten Morgen sagen', 'Gut zuhören'] },
      { en: 'Wonderful. Little gestures make a warm home.', fr: 'Merveilleux. Les petits gestes font une maison chaleureuse.', de: 'Wunderbar. Kleine Gesten machen ein Zuhause warm.' }),
    Q('games', 'group', { s: 1, topics: ['games'] },
      { en: 'Which game is fun to play together?', fr: 'Quel jeu est amusant à plusieurs ?', de: 'Welches Spiel macht zusammen Spaß?' },
      { en: ['Cards', 'Dominoes', 'Bingo', 'Chess', 'A puzzle', 'Ludo'],
        fr: ['Les cartes', 'Les dominos', 'Le loto', 'Les échecs', 'Un puzzle', 'Les petits chevaux'],
        de: ['Karten', 'Domino', 'Bingo', 'Schach', 'Ein Puzzle', 'Mensch ärgere dich nicht'] },
      { en: 'Great choice. Games bring people together.', fr: 'Très bon choix. Les jeux rassemblent les gens.', de: 'Gute Wahl. Spiele bringen Menschen zusammen.' }),
    Q('read', 'pleasure', { topics: ['reading'] },
      { en: 'What is nice to read on a quiet afternoon?', fr: 'Qu’est-il agréable de lire par un après-midi tranquille ?', de: 'Was liest man gern an einem ruhigen Nachmittag?' },
      { en: ['A good story', 'Poems', 'A cookbook', 'A magazine', 'Postcards', 'A letter'],
        fr: ['Une belle histoire', 'Des poèmes', 'Un livre de cuisine', 'Un magazine', 'Des cartes postales', 'Une lettre'],
        de: ['Eine schöne Geschichte', 'Gedichte', 'Ein Kochbuch', 'Eine Zeitschrift', 'Postkarten', 'Einen Brief'] },
      { en: 'Lovely. Reading takes us on little journeys.', fr: 'C’est beau. La lecture nous emmène en voyage.', de: 'Schön. Lesen nimmt uns mit auf kleine Reisen.' }),
    Q('sport', 'pleasure', { topics: ['sport'] },
      { en: 'Which sport is lovely to watch?', fr: 'Quel sport est agréable à regarder ?', de: 'Welchen Sport schaut man gern an?' },
      { en: ['Football', 'Cycling', 'Tennis', 'Ice skating', 'Swimming', 'Skiing'],
        fr: ['Le football', 'Le cyclisme', 'Le tennis', 'Le patinage', 'La natation', 'Le ski'],
        de: ['Fußball', 'Radsport', 'Tennis', 'Eiskunstlauf', 'Schwimmen', 'Skifahren'] },
      { en: 'Great choice. It is fun to cheer together.', fr: 'Très bon choix. C’est amusant d’encourager ensemble.', de: 'Gute Wahl. Gemeinsam mitfiebern macht Spaß.' }),
    Q('dance', 'music', { topics: ['music'] },
      { en: 'Which dance would you choose at a party?', fr: 'Quelle danse choisiriez-vous à une fête ?', de: 'Welchen Tanz würden Sie auf einem Fest wählen?' },
      { en: ['A waltz', 'A tango', 'A foxtrot', 'Rock and roll', 'A polka', 'A slow dance'],
        fr: ['Une valse', 'Un tango', 'Un fox-trot', 'Un rock', 'Une polka', 'Un slow'],
        de: ['Einen Walzer', 'Einen Tango', 'Einen Foxtrott', 'Rock ’n’ Roll', 'Eine Polka', 'Einen langsamen Tanz'] },
      { en: 'Lovely. Dancing is joy you can see.', fr: 'C’est beau. La danse, c’est de la joie qui se voit.', de: 'Schön. Tanzen ist Freude, die man sehen kann.' }),
    Q('picnic', 'pleasure', {},
      { en: 'What would you take on a picnic?', fr: 'Qu’emporteriez-vous pour un pique-nique ?', de: 'Was würden Sie zu einem Picknick mitnehmen?' },
      { en: ['Sandwiches', 'Fruit', 'A blanket', 'A flask of coffee', 'A cake', 'A ball'],
        fr: ['Des sandwichs', 'Des fruits', 'Une couverture', 'Un thermos de café', 'Un gâteau', 'Un ballon'],
        de: ['Belegte Brote', 'Obst', 'Eine Decke', 'Eine Thermoskanne Kaffee', 'Einen Kuchen', 'Einen Ball'] },
      { en: 'That sounds like a perfect picnic.', fr: 'Cela ressemble à un pique-nique parfait.', de: 'Das klingt nach einem perfekten Picknick.' }),
    Q('birds', 'nature', { topics: ['animals', 'garden'] },
      { en: 'Which bird would you like to see at the window?', fr: 'Quel oiseau aimeriez-vous voir à la fenêtre ?', de: 'Welchen Vogel würden Sie gern am Fenster sehen?' },
      { en: ['A robin', 'A blue tit', 'A blackbird', 'A sparrow', 'A swallow', 'A woodpecker'],
        fr: ['Un rouge-gorge', 'Une mésange', 'Un merle', 'Un moineau', 'Une hirondelle', 'Un pic-vert'],
        de: ['Ein Rotkehlchen', 'Eine Blaumeise', 'Eine Amsel', 'Einen Spatz', 'Eine Schwalbe', 'Einen Specht'] },
      { en: 'Lovely. Birds bring a little song to the day.', fr: 'C’est beau. Les oiseaux apportent une petite chanson à la journée.', de: 'Schön. Vögel bringen ein kleines Lied in den Tag.' }),
    Q('colour', 'pleasure', { s: 1 },
      { en: 'Which colour makes you happy?', fr: 'Quelle couleur vous rend joyeux ?', de: 'Welche Farbe macht Sie fröhlich?' },
      { en: ['Sunny yellow', 'Sky blue', 'Leaf green', 'Rose pink', 'Warm orange', 'Lavender purple'],
        fr: ['Le jaune soleil', 'Le bleu ciel', 'Le vert feuille', 'Le rose', 'L’orange', 'Le mauve lavande'],
        de: ['Sonnengelb', 'Himmelblau', 'Blattgrün', 'Rosa', 'Warmes Orange', 'Lavendellila'] },
      { en: 'What a cheerful choice. Colours can lift the heart.', fr: 'Quel choix joyeux. Les couleurs mettent du baume au cœur.', de: 'Was für eine fröhliche Wahl. Farben machen das Herz leicht.' }),
    Q('sound', 'pleasure', {},
      { en: 'Which sound is pleasant to hear?', fr: 'Quel son est agréable à entendre ?', de: 'Welches Geräusch hört man gern?' },
      { en: ['Birdsong', 'Rain on the window', 'A favourite song', 'Children laughing', 'The sea', 'A crackling fireplace'],
        fr: ['Le chant des oiseaux', 'La pluie sur la fenêtre', 'Une chanson préférée', 'Les rires d’enfants', 'La mer', 'Un feu qui crépite dans la cheminée'],
        de: ['Vogelgesang', 'Regen am Fenster', 'Ein Lieblingslied', 'Kinderlachen', 'Das Meer', 'Ein knisterndes Kaminfeuer'] },
      { en: 'Lovely. Some sounds feel like a warm blanket.', fr: 'C’est beau. Certains sons sont comme une couverture chaude.', de: 'Schön. Manche Geräusche sind wie eine warme Decke.' }),
    Q('surprise', 'pleasure', { s: 1 },
      { en: 'What would be a nice surprise today?', fr: 'Quelle serait une jolie surprise aujourd’hui ?', de: 'Was wäre heute eine schöne Überraschung?' },
      { en: ['A letter', 'A visit', 'A flower', 'A song', 'A cake', 'A sunny afternoon'],
        fr: ['Une lettre', 'Une visite', 'Une fleur', 'Une chanson', 'Un gâteau', 'Un après-midi ensoleillé'],
        de: ['Ein Brief', 'Ein Besuch', 'Eine Blume', 'Ein Lied', 'Ein Kuchen', 'Ein sonniger Nachmittag'] },
      { en: 'What a lovely surprise that would be.', fr: 'Quelle belle surprise ce serait.', de: 'Was für eine schöne Überraschung das wäre.' }),
    Q('selfcare', 'kindness', {},
      { en: 'How can we be kind to ourselves?', fr: 'Comment être gentil avec soi-même ?', de: 'Wie können wir freundlich zu uns selbst sein?' },
      { en: ['Rest a little', 'Enjoy a treat', 'Listen to music', 'Take a deep breath', 'Look out of the window', 'Smile'],
        fr: ['Se reposer un peu', 'Savourer une douceur', 'Écouter de la musique', 'Respirer profondément', 'Regarder par la fenêtre', 'Sourire'],
        de: ['Ein wenig ausruhen', 'Sich etwas Gutes gönnen', 'Musik hören', 'Tief durchatmen', 'Aus dem Fenster schauen', 'Lächeln'] },
      { en: 'Yes. Being kind to ourselves matters too.', fr: 'Oui. Être gentil avec soi-même compte aussi.', de: 'Ja. Freundlich zu sich selbst zu sein, ist auch wichtig.' }),
    Q('hands', 'kindness', {},
      { en: 'What kind things can our hands do?', fr: 'Quels gestes gentils nos mains peuvent-elles faire ?', de: 'Was können unsere Hände Freundliches tun?' },
      { en: ['Wave hello', 'Hold a hand', 'Pour a cup of tea', 'Pick flowers', 'Clap for someone', 'Write a card'],
        fr: ['Faire un signe de la main', 'Tenir une main', 'Servir une tasse de thé', 'Cueillir des fleurs', 'Applaudir quelqu’un', 'Écrire une carte'],
        de: ['Zum Gruß winken', 'Eine Hand halten', 'Eine Tasse Tee einschenken', 'Blumen pflücken', 'Für jemanden klatschen', 'Eine Karte schreiben'] },
      { en: 'Wonderful. Kind hands make kind days.', fr: 'Merveilleux. Des mains gentilles font de belles journées.', de: 'Wunderbar. Freundliche Hände machen schöne Tage.' }),
    Q('sunday', 'pleasure', {},
      { en: 'What is a nice thing to do on a Sunday?', fr: 'Qu’est-il agréable de faire le dimanche ?', de: 'Was macht man gern an einem Sonntag?' },
      { en: ['A big lunch', 'A walk', 'Calling a friend', 'Listening to music', 'A little nap', 'A slice of cake'],
        fr: ['Un bon déjeuner', 'Une promenade', 'Appeler un ami', 'Écouter de la musique', 'Une petite sieste', 'Une part de gâteau'],
        de: ['Ein schönes Mittagessen', 'Ein Spaziergang', 'Einen Freund anrufen', 'Musik hören', 'Ein kleines Nickerchen', 'Ein Stück Kuchen'] },
      { en: 'Lovely. Sundays are for taking it easy.', fr: 'C’est beau. Le dimanche, on prend son temps.', de: 'Schön. Sonntags lässt man es ruhig angehen.' }),
    Q('teach', 'group', {},
      { en: 'What could you teach someone?', fr: 'Que pourriez-vous apprendre à quelqu’un ?', de: 'Was könnten Sie jemandem beibringen?' },
      { en: ['A recipe', 'A song', 'A card game', 'A saying', 'How to knit', 'A dance step'],
        fr: ['Une recette', 'Une chanson', 'Un jeu de cartes', 'Un proverbe', 'À tricoter', 'Un pas de danse'],
        de: ['Ein Rezept', 'Ein Lied', 'Ein Kartenspiel', 'Ein Sprichwort', 'Stricken', 'Einen Tanzschritt'] },
      { en: 'Wonderful. What we know is a gift to share.', fr: 'Merveilleux. Ce que l’on sait est un cadeau à partager.', de: 'Wunderbar. Was wir wissen, ist ein Geschenk zum Teilen.' }),
    Q('breakfast', 'food', { s: 1, topics: ['food'] },
      { en: 'What would you like for a special breakfast?', fr: 'Que voudriez-vous pour un petit-déjeuner de fête ?', de: 'Was hätten Sie gern zu einem besonderen Frühstück?' },
      { en: ['Fresh rolls', 'Croissants', 'A boiled egg', 'Jam and butter', 'Fruit', 'Pancakes'],
        fr: ['Des petits pains frais', 'Des croissants', 'Un œuf à la coque', 'Du beurre et de la confiture', 'Des fruits', 'Des crêpes'],
        de: ['Frische Brötchen', 'Croissants', 'Ein gekochtes Ei', 'Butter und Marmelade', 'Obst', 'Pfannkuchen'] },
      { en: 'Delicious. A good breakfast is a happy start.', fr: 'Délicieux. Un bon petit-déjeuner, c’est un beau départ.', de: 'Lecker. Ein gutes Frühstück ist ein fröhlicher Start.' }),
    /* One question for each season (only offered in that season). */
    Q('spring', 'season', { s: 1, season: 'spring' },
      { en: 'What do you like about spring?', fr: 'Qu’aimez-vous au printemps ?', de: 'Was mögen Sie am Frühling?' },
      { en: ['The first flowers', 'Birdsong', 'Longer days', 'Fresh green leaves', 'Lambs in the fields', 'Opening the windows'],
        fr: ['Les premières fleurs', 'Le chant des oiseaux', 'Les jours plus longs', 'Les jeunes feuilles vertes', 'Les agneaux dans les prés', 'Ouvrir les fenêtres'],
        de: ['Die ersten Blumen', 'Den Vogelgesang', 'Die längeren Tage', 'Das frische Grün', 'Die Lämmer auf der Weide', 'Die Fenster öffnen'] },
      { en: 'Lovely. Spring brings everything back to life.', fr: 'C’est beau. Le printemps réveille la nature.', de: 'Schön. Im Frühling erwacht die Natur.' }),
    Q('springtreat', 'season', { season: 'spring', topics: ['food'] },
      { en: 'Which spring treat would you share?', fr: 'Quelle douceur de printemps partageriez-vous ?', de: 'Welche Frühlingsleckerei würden Sie teilen?' },
      { en: ['Rhubarb tart', 'Fresh radishes', 'Asparagus', 'The first strawberries', 'A fresh salad', 'Honey on bread'],
        fr: ['Une tarte à la rhubarbe', 'Des radis frais', 'Des asperges', 'Les premières fraises', 'Une salade fraîche', 'Du miel sur une tartine'],
        de: ['Rhabarberkuchen', 'Frische Radieschen', 'Spargel', 'Die ersten Erdbeeren', 'Ein frischer Salat', 'Honigbrot'] },
      { en: 'Delicious. Spring has such fresh flavours.', fr: 'Délicieux. Le printemps a des saveurs si fraîches.', de: 'Lecker. Der Frühling schmeckt so frisch.' }),
    Q('summer', 'season', { s: 1, season: 'summer' },
      { en: 'What do you like about summer?', fr: 'Qu’aimez-vous en été ?', de: 'Was mögen Sie am Sommer?' },
      { en: ['Warm evenings', 'Ice cream', 'Strawberries', 'Swimming', 'Holidays', 'Sitting in the shade'],
        fr: ['Les soirées douces', 'Les glaces', 'Les fraises', 'La baignade', 'Les vacances', 'S’asseoir à l’ombre'],
        de: ['Die lauen Abende', 'Eis', 'Erdbeeren', 'Baden gehen', 'Die Ferien', 'Im Schatten sitzen'] },
      { en: 'Lovely. Summer days are long and bright.', fr: 'C’est beau. Les jours d’été sont longs et lumineux.', de: 'Schön. Sommertage sind lang und hell.' }),
    Q('summertreat', 'season', { season: 'summer', topics: ['food'] },
      { en: 'Which summer treat would you share?', fr: 'Quelle douceur d’été partageriez-vous ?', de: 'Welche Sommerleckerei würden Sie teilen?' },
      { en: ['An ice cream', 'Cherries', 'Lemonade', 'Watermelon', 'A fruit tart', 'Fresh peaches'],
        fr: ['Une glace', 'Des cerises', 'De la limonade', 'De la pastèque', 'Une tarte aux fruits', 'Des pêches fraîches'],
        de: ['Ein Eis', 'Kirschen', 'Limonade', 'Wassermelone', 'Einen Obstkuchen', 'Frische Pfirsiche'] },
      { en: 'Delicious. Summer tastes like sunshine.', fr: 'Délicieux. L’été a le goût du soleil.', de: 'Lecker. Der Sommer schmeckt nach Sonne.' }),
    Q('autumn', 'season', { s: 1, season: 'autumn' },
      { en: 'What do you like about autumn?', fr: 'Qu’aimez-vous en automne ?', de: 'Was mögen Sie am Herbst?' },
      { en: ['The golden leaves', 'Apples', 'Mushrooms', 'Chestnuts', 'Cosy evenings', 'Pumpkin soup'],
        fr: ['Les feuilles dorées', 'Les pommes', 'Les champignons', 'Les châtaignes', 'Les soirées douillettes', 'La soupe au potiron'],
        de: ['Die goldenen Blätter', 'Äpfel', 'Pilze', 'Kastanien', 'Gemütliche Abende', 'Kürbissuppe'] },
      { en: 'Lovely. Autumn is full of warm colours.', fr: 'C’est beau. L’automne est plein de couleurs chaudes.', de: 'Schön. Der Herbst ist voller warmer Farben.' }),
    Q('autumntreat', 'season', { season: 'autumn', topics: ['food'] },
      { en: 'Which autumn treat would you share?', fr: 'Quelle douceur d’automne partageriez-vous ?', de: 'Welche Herbstleckerei würden Sie teilen?' },
      { en: ['Apple pie', 'Roasted chestnuts', 'Plum cake', 'Pumpkin soup', 'Grapes', 'Walnuts'],
        fr: ['Une tarte aux pommes', 'Des châtaignes grillées', 'Une tarte aux prunes', 'Une soupe au potiron', 'Du raisin', 'Des noix'],
        de: ['Apfelkuchen', 'Geröstete Kastanien', 'Pflaumenkuchen', 'Kürbissuppe', 'Weintrauben', 'Walnüsse'] },
      { en: 'Delicious. Autumn is a season of good things.', fr: 'Délicieux. L’automne est la saison des bonnes choses.', de: 'Lecker. Der Herbst ist eine Zeit voller guter Dinge.' }),
    Q('winter', 'season', { s: 1, season: 'winter' },
      { en: 'What do you like about winter?', fr: 'Qu’aimez-vous en hiver ?', de: 'Was mögen Sie am Winter?' },
      { en: ['Snow', 'Hot chocolate', 'A warm scarf', 'Little lights in the windows', 'Biscuits in the oven', 'Cosy blankets'],
        fr: ['La neige', 'Le chocolat chaud', 'Une écharpe chaude', 'Les petites lumières aux fenêtres', 'Les biscuits au four', 'Les couvertures douillettes'],
        de: ['Den Schnee', 'Heiße Schokolade', 'Einen warmen Schal', 'Die kleinen Lichter in den Fenstern', 'Plätzchen im Ofen', 'Kuschelige Decken'] },
      { en: 'Lovely. Winter is the season of warm and cosy things.', fr: 'C’est beau. L’hiver est la saison de la douceur et de la chaleur.', de: 'Schön. Der Winter ist die Zeit für warme, gemütliche Dinge.' }),
    Q('wintertreat', 'season', { season: 'winter', topics: ['food'] },
      { en: 'Which winter treat would you share?', fr: 'Quelle douceur d’hiver partageriez-vous ?', de: 'Welche Winterleckerei würden Sie teilen?' },
      { en: ['Hot chocolate', 'Gingerbread', 'Oranges', 'Biscuits', 'Baked apples', 'A warm soup'],
        fr: ['Un chocolat chaud', 'Du pain d’épices', 'Des oranges', 'Des biscuits', 'Des pommes au four', 'Une soupe chaude'],
        de: ['Heiße Schokolade', 'Lebkuchen', 'Orangen', 'Plätzchen', 'Bratäpfel', 'Eine warme Suppe'] },
      { en: 'Delicious. Winter treats warm us up.', fr: 'Délicieux. Les douceurs d’hiver nous réchauffent.', de: 'Lecker. Winterleckereien wärmen uns auf.' })
  ];
  /* Questions made from the life story: the place they grew up and their favourite music. */
  var QUIZ_LIFE = {
    home: {
      q: { en: 'What do you like most about {home}?', fr: '{home} : qu’aimez-vous le plus là-bas ?', de: '{home}: Was mögen Sie dort am meisten?' },
      a: { en: ['The landscape', 'The food', 'The people', 'The festivals', 'The market', 'The walks'],
        fr: ['Les paysages', 'La cuisine', 'Les gens', 'Les fêtes', 'Le marché', 'Les promenades'],
        de: ['Die Landschaft', 'Das Essen', 'Die Menschen', 'Die Feste', 'Den Markt', 'Die Spaziergänge'] },
      r: { en: 'Thank you. It is lovely to think of {home}.', fr: 'Merci. C’est un plaisir d’en parler.', de: 'Danke. Es ist schön, daran zu denken.' } },
    loves: {
      q: { en: 'Which music would you enjoy this afternoon?', fr: 'Quelle musique aimeriez-vous écouter cet après-midi ?', de: 'Welche Musik würden Sie heute Nachmittag gern hören?' },
      a: { en: ['A waltz', 'A cheerful song', 'A song to sing along to'], fr: ['Une valse', 'Une chanson joyeuse', 'Une chanson à chanter ensemble'], de: ['Einen Walzer', 'Ein fröhliches Lied', 'Ein Lied zum Mitsingen'] },
      r: { en: 'Lovely choice. Good music is always welcome.', fr: 'Très bon choix. La bonne musique est toujours la bienvenue.', de: 'Schöne Wahl. Gute Musik ist immer willkommen.' } }
  };
  /* The decade of their youth (year of birth + 15): dances and singers everybody knew then. */
  var QUIZ_ERA = {
    dance: {
      q: { en: 'Which dance from your young days would you choose?', fr: 'Quelle danse de votre jeunesse choisiriez-vous ?', de: 'Welchen Tanz aus Ihrer Jugend würden Sie wählen?' },
      a: {
        1940: { en: ['A waltz', 'A foxtrot', 'A tango', 'A polka', 'A swing'], fr: ['Une valse', 'Un fox-trot', 'Un tango', 'Une polka', 'Un swing'], de: ['Einen Walzer', 'Einen Foxtrott', 'Einen Tango', 'Eine Polka', 'Einen Swing'] },
        1950: { en: ['A waltz', 'Rock and roll', 'A cha-cha-cha', 'A tango', 'A swing'], fr: ['Une valse', 'Un rock', 'Un cha-cha-cha', 'Un tango', 'Un swing'], de: ['Einen Walzer', 'Rock ’n’ Roll', 'Einen Cha-Cha-Cha', 'Einen Tango', 'Einen Swing'] },
        1960: { en: ['The twist', 'Rock and roll', 'A waltz', 'A cha-cha-cha', 'A slow dance'], fr: ['Le twist', 'Un rock', 'Une valse', 'Un cha-cha-cha', 'Un slow'], de: ['Den Twist', 'Rock ’n’ Roll', 'Einen Walzer', 'Einen Cha-Cha-Cha', 'Einen langsamen Tanz'] },
        1970: { en: ['Disco', 'Rock and roll', 'A slow dance', 'A waltz', 'The twist'], fr: ['Le disco', 'Un rock', 'Un slow', 'Une valse', 'Le twist'], de: ['Disco', 'Rock ’n’ Roll', 'Einen langsamen Tanz', 'Einen Walzer', 'Den Twist'] },
        1980: { en: ['Disco', 'Pop', 'A slow dance', 'Rock and roll', 'A waltz'], fr: ['Le disco', 'La pop', 'Un slow', 'Un rock', 'Une valse'], de: ['Disco', 'Pop', 'Einen langsamen Tanz', 'Rock ’n’ Roll', 'Einen Walzer'] }
      },
      r: { en: 'Lovely. Dancing brings back happy feelings.', fr: 'C’est beau. La danse fait revenir de jolis souvenirs.', de: 'Schön. Tanzen weckt fröhliche Gefühle.' } },
    singer: {
      q: { en: 'Which singer from your young days would you enjoy hearing?', fr: 'Quel chanteur de votre jeunesse aimeriez-vous entendre ?', de: 'Welchen Sänger aus Ihrer Jugend würden Sie gern hören?' },
      a: {
        1940: { en: ['Bing Crosby', 'Frank Sinatra', 'Ella Fitzgerald', 'Judy Garland'], fr: ['Charles Trenet', 'Tino Rossi', 'Édith Piaf', 'Yves Montand'], de: ['Rudi Schuricke', 'Margot Eskens', 'Vico Torriani', 'Caterina Valente'] },
        1950: { en: ['Frank Sinatra', 'Doris Day', 'Elvis Presley', 'Nat King Cole'], fr: ['Édith Piaf', 'Yves Montand', 'Georges Brassens', 'Dalida'], de: ['Caterina Valente', 'Freddy Quinn', 'Peter Alexander', 'Conny Froboess'] },
        1960: { en: ['The Beatles', 'Elvis Presley', 'Cliff Richard', 'Dusty Springfield'], fr: ['Charles Aznavour', 'Sylvie Vartan', 'Johnny Hallyday', 'Françoise Hardy'], de: ['Peter Alexander', 'Udo Jürgens', 'Roy Black', 'Peter Kraus'] },
        1970: { en: ['ABBA', 'Elton John', 'The Carpenters', 'Rod Stewart'], fr: ['Claude François', 'Joe Dassin', 'Mireille Mathieu', 'Nana Mouskouri'], de: ['Udo Jürgens', 'Katja Ebstein', 'Howard Carpendale', 'Rex Gildo'] },
        1980: { en: ['Michael Jackson', 'Madonna', 'Phil Collins', 'Whitney Houston'], fr: ['Jean-Jacques Goldman', 'Céline Dion', 'Francis Cabrel', 'Michel Berger'], de: ['Nena', 'Herbert Grönemeyer', 'Peter Maffay', 'Nicole'] }
      },
      r: { en: 'Wonderful. Their songs are part of so many happy moments.', fr: 'Merveilleux. Leurs chansons font partie de tant de beaux moments.', de: 'Wunderbar. Ihre Lieder gehören zu so vielen schönen Momenten.' } }
  };

  /* ---------- bank 3: memories (the album's daily cards without personal photos) ----------
     A theme, two openings, five details ("Perhaps you remember …" draws three, two when gentle) and
     questions answered by yes / no / not sure. About places, senses and small pleasures, never
     about particular people (who may be missed). theme: the album theme (js/album-data.js);
     card: the album's generic card or postcard that fits; scene: a drawing of js/art.js;
     when: the seasons it is offered in (empty: all year). Blocking an item blocks its theme. */
  function M(topic, theme, card, scene, when, tags, title, opens, bits, qs, words) {
    return { topic: topic, theme: theme, card: card, scene: scene, when: when, tags: tags, title: title, opens: opens, bits: bits, qs: qs, words: words };
  }
  var PERHAPS = { en: 'Perhaps you remember ', fr: 'Vous vous souvenez peut-être ', de: 'Vielleicht erinnern Sie sich ' };
  var MEMORIES = [
    M('sea', 'travel', 'postcard-sea', 'sea', [], ['sea'], { en: 'The sea', fr: 'La mer', de: 'Das Meer' },
      { en: ['Imagine a warm day at the seaside. The sun is bright and the waves roll in slowly.', 'Picture a quiet beach in the early morning. The sand is cool and the water sparkles.'],
        fr: ['Imaginez une belle journée au bord de la mer. Le soleil brille et les vagues arrivent doucement.', 'Imaginez une plage tranquille, tôt le matin. Le sable est frais et l’eau scintille.'],
        de: ['Stellen Sie sich einen warmen Tag am Meer vor. Die Sonne scheint, und die Wellen rollen langsam heran.', 'Stellen Sie sich einen ruhigen Strand am frühen Morgen vor. Der Sand ist kühl, und das Wasser glitzert.'] },
      { en: ['the smell of salt in the air', 'a walk along the sand', 'a small boat far away', 'the call of the seagulls', 'an ice cream on the promenade'],
        fr: ['de l’odeur du sel dans l’air', 'd’une promenade sur le sable', 'd’un petit bateau au loin', 'du cri joyeux des mouettes', 'd’une glace sur la promenade'],
        de: ['an den Duft von Salz in der Luft', 'an einen Spaziergang am Strand', 'an ein kleines Boot in der Ferne', 'an das Rufen der Möwen', 'an ein Eis auf der Promenade'] },
      { en: ['Have you ever spent time at the seaside?', 'Do you like the sound of the waves?', 'Have you ever been on a boat?'],
        fr: ['Avez-vous déjà passé du temps au bord de la mer ?', 'Aimez-vous le bruit des vagues ?', 'Êtes-vous déjà monté sur un bateau ?'],
        de: ['Waren Sie schon einmal am Meer?', 'Mögen Sie das Rauschen der Wellen?', 'Sind Sie schon einmal mit einem Boot gefahren?'] },
      ['sea', 'ocean', 'beach', 'water', 'boat', 'mer', 'plage', 'bateau', 'meer', 'strand', 'boot']),
    M('mountain', 'travel', 'postcard-mountain', 'mountain', [], ['mountain'], { en: 'The mountains', fr: 'La montagne', de: 'Die Berge' },
      { en: ['Picture a clear morning in the mountains. The air is fresh and quiet.', 'Imagine a path high up in the mountains, with a wide view over the valley.'],
        fr: ['Imaginez un matin clair à la montagne. L’air est frais et calme.', 'Imaginez un sentier en haut de la montagne, avec une grande vue sur la vallée.'],
        de: ['Stellen Sie sich einen klaren Morgen in den Bergen vor. Die Luft ist frisch und still.', 'Stellen Sie sich einen Weg hoch in den Bergen vor, mit weitem Blick über das Tal.'] },
      { en: ['the snow shining on the peaks', 'a picnic by a lake', 'something warm to drink at the end of the path', 'the sound of cowbells', 'wild flowers in the meadows'],
        fr: ['de la neige qui brille sur les sommets', 'd’un pique-nique au bord d’un lac', 'd’une boisson chaude au bout du chemin', 'du son des cloches des vaches', 'des fleurs sauvages dans les prés'],
        de: ['an den Schnee, der auf den Gipfeln glänzt', 'an ein Picknick an einem See', 'an etwas Warmes zu trinken am Ende des Weges', 'an den Klang der Kuhglocken', 'an Wildblumen auf den Wiesen'] },
      { en: ['Have you ever spent time in the mountains?', 'Do you like a wide view?', 'Have you ever seen snow on the mountain tops?'],
        fr: ['Avez-vous déjà passé du temps à la montagne ?', 'Aimez-vous les grands panoramas ?', 'Avez-vous déjà vu de la neige sur les sommets ?'],
        de: ['Waren Sie schon einmal in den Bergen?', 'Mögen Sie einen weiten Blick?', 'Haben Sie schon einmal Schnee auf den Gipfeln gesehen?'] },
      ['mountain', 'mountains', 'hills', 'snow', 'alps', 'montagne', 'neige', 'berge', 'berg', 'alpen']),
    M('forest', 'nature', 'postcard-forest', 'forest', [], ['nature'], { en: 'The forest', fr: 'La forêt', de: 'Der Wald' },
      { en: ['Imagine a soft path through the forest. The trees are tall and the light comes through the leaves.', 'Picture a quiet wood after a little rain. Everything smells fresh and green.'],
        fr: ['Imaginez un chemin doux à travers la forêt. Les arbres sont grands et la lumière passe entre les feuilles.', 'Imaginez un bois tranquille après une petite pluie. Tout sent bon le frais et le vert.'],
        de: ['Stellen Sie sich einen weichen Weg durch den Wald vor. Die Bäume sind hoch, und das Licht fällt durch die Blätter.', 'Stellen Sie sich einen stillen Wald nach einem kleinen Regen vor. Alles duftet frisch und grün.'] },
      { en: ['picking mushrooms', 'the smell of the woods', 'birdsong high in the trees', 'a squirrel running up a trunk', 'berries along the path'],
        fr: ['de la cueillette des champignons', 'de l’odeur des bois', 'du chant des oiseaux en haut des arbres', 'd’un écureuil qui grimpe à un tronc', 'des baies le long du chemin'],
        de: ['ans Pilzesammeln', 'an den Duft des Waldes', 'an Vogelgesang hoch in den Bäumen', 'an ein Eichhörnchen, das einen Stamm hinaufläuft', 'an Beeren am Wegesrand'] },
      { en: ['Do you like walking in the forest?', 'Have you ever picked mushrooms or berries?', 'Do you like the smell of the woods?'],
        fr: ['Aimez-vous vous promener en forêt ?', 'Avez-vous déjà cueilli des champignons ou des baies ?', 'Aimez-vous l’odeur des bois ?'],
        de: ['Gehen Sie gern im Wald spazieren?', 'Haben Sie schon einmal Pilze oder Beeren gesammelt?', 'Mögen Sie den Duft des Waldes?'] },
      ['forest', 'trees', 'woods', 'wood', 'foret', 'bois', 'arbres', 'wald', 'baume']),
    M('garden', 'nature', 'postcard-forest', 'garden', [], ['garden'], { en: 'The garden', fr: 'Le jardin', de: 'Der Garten' },
      { en: ['Imagine a sunny garden. The flowers are open and the bees are busy.', 'Picture a vegetable garden early in the morning, with dew on the leaves.'],
        fr: ['Imaginez un jardin ensoleillé. Les fleurs sont ouvertes et les abeilles s’affairent.', 'Imaginez un potager tôt le matin, avec de la rosée sur les feuilles.'],
        de: ['Stellen Sie sich einen sonnigen Garten vor. Die Blumen sind offen, und die Bienen sind fleißig.', 'Stellen Sie sich einen Gemüsegarten am frühen Morgen vor, mit Tau auf den Blättern.'] },
      { en: ['the smell of roses', 'tomatoes ripe in the sun', 'watering the flowers in the evening', 'a bench in the shade', 'the first strawberries of the year'],
        fr: ['du parfum des roses', 'des tomates mûres au soleil', 'de l’arrosage des fleurs le soir', 'd’un banc à l’ombre', 'des premières fraises de l’année'],
        de: ['an den Duft der Rosen', 'an Tomaten, die in der Sonne reifen', 'ans Blumengießen am Abend', 'an eine Bank im Schatten', 'an die ersten Erdbeeren des Jahres'] },
      { en: ['Do you like flowers?', 'Have you ever grown vegetables?', 'Do you like to sit in a garden?'],
        fr: ['Aimez-vous les fleurs ?', 'Avez-vous déjà fait pousser des légumes ?', 'Aimez-vous vous asseoir dans un jardin ?'],
        de: ['Mögen Sie Blumen?', 'Haben Sie schon einmal Gemüse angebaut?', 'Sitzen Sie gern im Garten?'] },
      ['garden', 'flowers', 'roses', 'jardin', 'fleurs', 'garten', 'blumen']),
    M('market', 'town', 'town-market', '', [], ['town', 'food'], { en: 'Market day', fr: 'Le jour du marché', de: 'Der Markttag' },
      { en: ['Imagine a busy market in the morning. The stalls are full of colours.', 'Picture the market square on a sunny day, with baskets of fruit everywhere.'],
        fr: ['Imaginez un marché animé le matin. Les étals sont pleins de couleurs.', 'Imaginez la place du marché par une belle journée, avec des paniers de fruits partout.'],
        de: ['Stellen Sie sich einen belebten Markt am Morgen vor. Die Stände sind voller Farben.', 'Stellen Sie sich den Marktplatz an einem sonnigen Tag vor, mit Obstkörben überall.'] },
      { en: ['the smell of fresh bread', 'shiny red apples', 'a bunch of flowers to take home', 'a chat with the stallholders', 'cheese to taste'],
        fr: ['de l’odeur du pain frais', 'des pommes rouges et brillantes', 'd’un bouquet de fleurs à rapporter', 'd’une petite discussion avec les marchands', 'du fromage à goûter'],
        de: ['an den Duft von frischem Brot', 'an glänzende rote Äpfel', 'an einen Blumenstrauß für zu Hause', 'an einen Plausch mit den Händlern', 'an Käse zum Probieren'] },
      { en: ['Did you like going to the market?', 'Do you like fresh fruit?', 'Did you ever buy flowers at the market?'],
        fr: ['Aimiez-vous aller au marché ?', 'Aimez-vous les fruits frais ?', 'Achetiez-vous parfois des fleurs au marché ?'],
        de: ['Sind Sie gern auf den Markt gegangen?', 'Mögen Sie frisches Obst?', 'Haben Sie auf dem Markt manchmal Blumen gekauft?'] },
      ['market', 'marche', 'markt', 'fruit', 'fruits', 'obst']),
    M('bakery', 'work', 'work-baker', '', [], ['food'], { en: 'The bakery', fr: 'La boulangerie', de: 'Die Bäckerei' },
      { en: ['Imagine opening the door of a bakery early in the morning. It is warm inside.', 'Picture a little bakery with a window full of bread and cakes.'],
        fr: ['Imaginez que vous poussez la porte d’une boulangerie, tôt le matin. Il fait bon à l’intérieur.', 'Imaginez une petite boulangerie avec une vitrine pleine de pains et de gâteaux.'],
        de: ['Stellen Sie sich vor, Sie öffnen früh am Morgen die Tür einer Bäckerei. Drinnen ist es warm.', 'Stellen Sie sich eine kleine Bäckerei vor, mit einem Schaufenster voller Brot und Kuchen.'] },
      { en: ['the smell of warm bread', 'a crusty loaf under your arm', 'a sweet treat on Sundays', 'the little bell on the door', 'flour on the counter'],
        fr: ['de l’odeur du pain chaud', 'd’une baguette croustillante sous le bras', 'd’une gourmandise le dimanche', 'de la petite clochette de la porte', 'de la farine sur le comptoir'],
        de: ['an den Duft von warmem Brot', 'an ein knuspriges Brot unter dem Arm', 'an etwas Süßes am Sonntag', 'an die kleine Glocke an der Tür', 'an Mehl auf der Theke'] },
      { en: ['Do you like fresh bread?', 'Did you have a favourite cake?', 'Did you ever bake bread or cakes?'],
        fr: ['Aimez-vous le pain frais ?', 'Aviez-vous un gâteau préféré ?', 'Avez-vous déjà fait du pain ou des gâteaux ?'],
        de: ['Mögen Sie frisches Brot?', 'Hatten Sie einen Lieblingskuchen?', 'Haben Sie schon einmal Brot oder Kuchen gebacken?'] },
      ['bakery', 'bread', 'cake', 'boulangerie', 'pain', 'gateau', 'backerei', 'brot', 'kuchen']),
    M('sunday', 'family', 'family-lunch', '', [], ['food'], { en: 'Sunday lunch', fr: 'Le repas du dimanche', de: 'Das Sonntagsessen' },
      { en: ['Imagine a Sunday morning. Something good is cooking in the kitchen.', 'Picture a table laid for Sunday, with a white tablecloth and the best plates.'],
        fr: ['Imaginez un dimanche matin. Quelque chose de bon mijote dans la cuisine.', 'Imaginez une table mise pour le dimanche, avec une nappe blanche et les belles assiettes.'],
        de: ['Stellen Sie sich einen Sonntagmorgen vor. In der Küche kocht etwas Gutes.', 'Stellen Sie sich einen Tisch vor, der für Sonntag gedeckt ist, mit weißer Tischdecke und dem guten Geschirr.'] },
      { en: ['the smell of a roast in the oven', 'a dessert waiting on the side', 'the clink of glasses', 'a walk after the meal', 'coffee and cake in the afternoon'],
        fr: ['de l’odeur d’un rôti au four', 'd’un dessert qui attend sur le buffet', 'du tintement des verres', 'd’une promenade après le repas', 'du café et du gâteau l’après-midi'],
        de: ['an den Duft eines Bratens im Ofen', 'an einen Nachtisch, der schon bereitsteht', 'an das Klingen der Gläser', 'an einen Spaziergang nach dem Essen', 'an Kaffee und Kuchen am Nachmittag'] },
      { en: ['Did you like Sunday lunch?', 'Did you have a favourite dessert?', 'Do you like a walk after a good meal?'],
        fr: ['Aimiez-vous le repas du dimanche ?', 'Aviez-vous un dessert préféré ?', 'Aimez-vous marcher un peu après un bon repas ?'],
        de: ['Mochten Sie das Sonntagsessen?', 'Hatten Sie einen Lieblingsnachtisch?', 'Gehen Sie nach einem guten Essen gern ein Stück spazieren?'] },
      ['sunday', 'lunch', 'meal', 'dimanche', 'repas', 'sonntag', 'essen']),
    M('dance', 'celebrations', 'feast-fair', '', [], ['music'], { en: 'The dance', fr: 'Le bal', de: 'Der Tanzabend' },
      { en: ['Imagine a dance on a summer evening. The band is playing and the lights are on.', 'Picture a big room with a polished floor, ready for an evening of dancing.'],
        fr: ['Imaginez un bal par un soir d’été. L’orchestre joue et les lampions sont allumés.', 'Imaginez une grande salle au parquet ciré, prête pour une soirée dansante.'],
        de: ['Stellen Sie sich einen Tanzabend im Sommer vor. Die Kapelle spielt, und die Lichter leuchten.', 'Stellen Sie sich einen großen Saal mit glänzendem Parkett vor, bereit für einen Abend voller Tanz.'] },
      { en: ['a waltz that went round and round', 'your best shoes', 'an accordion playing', 'laughing with friends', 'a cool drink between two dances'],
        fr: ['d’une valse qui tournait, tournait', 'de vos plus belles chaussures', 'd’un accordéon qui jouait', 'des rires avec les amis', 'd’une boisson fraîche entre deux danses'],
        de: ['an einen Walzer, der sich immer weiter drehte', 'an Ihre besten Schuhe', 'an ein Akkordeon, das spielte', 'an das Lachen mit Freunden', 'an ein kühles Getränk zwischen zwei Tänzen'] },
      { en: ['Did you like to dance?', 'Do you like waltz music?', 'Did you go to dances when you were young?'],
        fr: ['Aimiez-vous danser ?', 'Aimez-vous la musique de valse ?', 'Alliez-vous au bal quand vous étiez jeune ?'],
        de: ['Haben Sie gern getanzt?', 'Mögen Sie Walzermusik?', 'Sind Sie in jungen Jahren zum Tanzen gegangen?'] },
      ['dance', 'dancing', 'waltz', 'bal', 'danse', 'valse', 'tanz', 'tanzen', 'walzer']),
    M('cinema', 'town', 'town-cafe', '', [], ['town'], { en: 'The cinema', fr: 'Le cinéma', de: 'Das Kino' },
      { en: ['Imagine the lights going down in a cinema. Everyone is waiting for the film.', 'Picture a cinema on a Saturday evening, with a big poster outside.'],
        fr: ['Imaginez les lumières qui s’éteignent dans un cinéma. Tout le monde attend le film.', 'Imaginez un cinéma un samedi soir, avec une grande affiche à l’entrée.'],
        de: ['Stellen Sie sich vor, im Kino geht das Licht aus. Alle warten auf den Film.', 'Stellen Sie sich ein Kino an einem Samstagabend vor, mit einem großen Plakat am Eingang.'] },
      { en: ['the red velvet seats', 'an ice cream during the break', 'a funny film that made everyone laugh', 'the big screen lighting up', 'buying the tickets at the counter'],
        fr: ['des fauteuils de velours rouge', 'd’une glace pendant l’entracte', 'd’un film drôle qui faisait rire toute la salle', 'du grand écran qui s’allumait', 'des billets achetés au guichet'],
        de: ['an die roten Samtsessel', 'an ein Eis in der Pause', 'an einen lustigen Film, über den alle lachten', 'an die große Leinwand, die aufleuchtete', 'an den Kauf der Karten an der Kasse'] },
      { en: ['Did you like going to the cinema?', 'Do you like funny films?', 'Do you remember a film you liked?'],
        fr: ['Aimiez-vous aller au cinéma ?', 'Aimez-vous les films drôles ?', 'Vous souvenez-vous d’un film que vous aimiez ?'],
        de: ['Sind Sie gern ins Kino gegangen?', 'Mögen Sie lustige Filme?', 'Erinnern Sie sich an einen Film, der Ihnen gefallen hat?'] },
      ['cinema', 'film', 'movie', 'cinema', 'kino']),
    M('radio', 'childhood', 'childhood-toys', '', [], ['music'], { en: 'Evenings by the radio', fr: 'Les soirées autour de la radio', de: 'Abende am Radio' },
      { en: ['Imagine a cosy evening at home. The radio is playing softly.', 'Picture an old radio with big round buttons, warm to the touch.'],
        fr: ['Imaginez une soirée douillette à la maison. La radio joue doucement.', 'Imaginez un vieux poste de radio avec de gros boutons ronds, tout chaud sous la main.'],
        de: ['Stellen Sie sich einen gemütlichen Abend zu Hause vor. Das Radio spielt leise.', 'Stellen Sie sich ein altes Radio mit großen runden Knöpfen vor, warm unter der Hand.'] },
      { en: ['a favourite song coming on', 'turning the dial to find a station', 'a radio play that everyone listened to', 'humming along in the kitchen', 'the music on a Sunday morning'],
        fr: ['d’une chanson préférée qui passait', 'du bouton qu’on tournait pour trouver une station', 'd’une pièce radiophonique que tout le monde écoutait', 'des airs fredonnés dans la cuisine', 'de la musique du dimanche matin'],
        de: ['an ein Lieblingslied, das gespielt wurde', 'an den Knopf, mit dem man einen Sender suchte', 'an ein Hörspiel, das alle hörten', 'ans Mitsummen in der Küche', 'an die Musik am Sonntagmorgen'] },
      { en: ['Did you like listening to the radio?', 'Did you sing along to songs on the radio?', 'Do you still like the radio?'],
        fr: ['Aimiez-vous écouter la radio ?', 'Chantiez-vous avec les chansons de la radio ?', 'Aimez-vous toujours la radio ?'],
        de: ['Haben Sie gern Radio gehört?', 'Haben Sie bei Liedern im Radio mitgesungen?', 'Hören Sie immer noch gern Radio?'] },
      ['radio', 'music', 'songs', 'musique', 'musik']),
    M('snow', 'childhood', 'childhood-toys', '', ['winter'], ['nature'], { en: 'A snowy day', fr: 'Un jour de neige', de: 'Ein Schneetag' },
      { en: ['Imagine waking up and seeing everything white with snow.', 'Picture a snowy street, quiet and bright, with little footprints everywhere.'],
        fr: ['Imaginez qu’en vous réveillant, vous voyez tout blanc de neige.', 'Imaginez une rue enneigée, calme et lumineuse, avec de petites traces de pas partout.'],
        de: ['Stellen Sie sich vor, Sie wachen auf, und alles ist weiß vom Schnee.', 'Stellen Sie sich eine verschneite Straße vor, still und hell, mit kleinen Fußspuren überall.'] },
      { en: ['a sledge on a little hill', 'building a snowman', 'warm gloves and a woolly hat', 'a hot drink after playing outside', 'the crunch of snow under your boots'],
        fr: ['d’une luge sur une petite colline', 'd’un bonhomme de neige', 'de gants chauds et d’un bonnet de laine', 'd’une boisson chaude après les jeux dehors', 'de la neige qui crisse sous les bottes'],
        de: ['an einen Schlitten auf einem kleinen Hügel', 'an einen Schneemann', 'an warme Handschuhe und eine Wollmütze', 'an ein heißes Getränk nach dem Spielen draußen', 'an das Knirschen des Schnees unter den Stiefeln'] },
      { en: ['Did you like snowy days?', 'Have you ever built a snowman?', 'Did you ever go sledging?'],
        fr: ['Aimiez-vous les jours de neige ?', 'Avez-vous déjà fait un bonhomme de neige ?', 'Avez-vous déjà fait de la luge ?'],
        de: ['Mochten Sie Schneetage?', 'Haben Sie schon einmal einen Schneemann gebaut?', 'Sind Sie schon einmal Schlitten gefahren?'] },
      ['snow', 'winter', 'snowman', 'neige', 'hiver', 'schnee', 'winter']),
    M('lake', 'travel', 'travel-sea', 'sea', ['spring', 'summer'], ['sea', 'nature'], { en: 'By the lake', fr: 'Au bord du lac', de: 'Am See' },
      { en: ['Imagine a calm lake on a warm afternoon. The water is smooth like a mirror.', 'Picture a little jetty by a lake, with a rowing boat tied up.'],
        fr: ['Imaginez un lac calme par un après-midi chaud. L’eau est lisse comme un miroir.', 'Imaginez un petit ponton au bord d’un lac, avec une barque attachée.'],
        de: ['Stellen Sie sich einen ruhigen See an einem warmen Nachmittag vor. Das Wasser ist glatt wie ein Spiegel.', 'Stellen Sie sich einen kleinen Steg am See vor, mit einem Ruderboot daneben.'] },
      { en: ['ducks swimming by', 'a swim in the cool water', 'a rowing boat on the lake', 'a picnic on the grass', 'the sun going down over the water'],
        fr: ['des canards qui passaient', 'd’une baignade dans l’eau fraîche', 'd’une promenade en barque', 'd’un pique-nique sur l’herbe', 'du soleil qui se couchait sur l’eau'],
        de: ['an Enten, die vorbeischwammen', 'ans Baden im kühlen Wasser', 'an eine Fahrt mit dem Ruderboot', 'an ein Picknick auf der Wiese', 'an die Sonne, die über dem Wasser unterging'] },
      { en: ['Do you like lakes?', 'Did you like swimming?', 'Have you ever rowed a boat?'],
        fr: ['Aimez-vous les lacs ?', 'Aimiez-vous nager ?', 'Avez-vous déjà ramé dans une barque ?'],
        de: ['Mögen Sie Seen?', 'Sind Sie gern geschwommen?', 'Sind Sie schon einmal Ruderboot gefahren?'] },
      ['lake', 'swim', 'swimming', 'boat', 'lac', 'barque', 'see', 'baden']),
    M('picnic', 'family', 'family-picnic', 'garden', ['spring', 'summer'], ['nature', 'food'], { en: 'A picnic', fr: 'Un pique-nique', de: 'Ein Picknick' },
      { en: ['Imagine a picnic in a green meadow. A blanket is spread out on the grass.', 'Picture a sunny day in the country, with a basket full of good things.'],
        fr: ['Imaginez un pique-nique dans une prairie verte. Une couverture est étendue sur l’herbe.', 'Imaginez une belle journée à la campagne, avec un panier plein de bonnes choses.'],
        de: ['Stellen Sie sich ein Picknick auf einer grünen Wiese vor. Eine Decke liegt im Gras.', 'Stellen Sie sich einen sonnigen Tag auf dem Land vor, mit einem Korb voller guter Sachen.'] },
      { en: ['sandwiches wrapped in paper', 'a flask of coffee', 'fresh fruit in a basket', 'lying in the grass looking at the clouds', 'a ball game after lunch'],
        fr: ['des sandwichs enveloppés dans du papier', 'd’un thermos de café', 'des fruits frais dans un panier', 'des nuages regardés, allongé dans l’herbe', 'd’une partie de ballon après le repas'],
        de: ['an belegte Brote in Papier', 'an eine Thermoskanne Kaffee', 'an frisches Obst im Korb', 'ans Liegen im Gras und Wolkenschauen', 'an ein Ballspiel nach dem Essen'] },
      { en: ['Did you like picnics?', 'Do you like eating outside?', 'Did you have a favourite place for a picnic?'],
        fr: ['Aimiez-vous les pique-niques ?', 'Aimez-vous manger dehors ?', 'Aviez-vous un endroit préféré pour pique-niquer ?'],
        de: ['Haben Sie gern Picknick gemacht?', 'Essen Sie gern draußen?', 'Hatten Sie einen Lieblingsplatz für ein Picknick?'] },
      ['picnic', 'pique nique', 'picknick', 'meadow', 'prairie', 'wiese']),
    M('fair', 'celebrations', 'feast-fair', '', [], [], { en: 'The fair', fr: 'La fête foraine', de: 'Der Jahrmarkt' },
      { en: ['Imagine a fair in the evening, with music and colourful lights.', 'Picture a merry-go-round turning slowly, with painted horses going up and down.'],
        fr: ['Imaginez une fête foraine le soir, avec de la musique et des lumières de toutes les couleurs.', 'Imaginez un manège qui tourne doucement, avec des chevaux de bois qui montent et descendent.'],
        de: ['Stellen Sie sich einen Jahrmarkt am Abend vor, mit Musik und bunten Lichtern.', 'Stellen Sie sich ein Karussell vor, das sich langsam dreht, mit bemalten Pferden, die auf und ab gehen.'] },
      { en: ['candyfloss', 'the smell of roasted almonds', 'a ride on the big wheel', 'winning a little prize', 'the music of the merry-go-round'],
        fr: ['de la barbe à papa', 'de l’odeur des amandes grillées', 'd’un tour de grande roue', 'd’un petit lot gagné', 'de la musique du manège'],
        de: ['an Zuckerwatte', 'an den Duft gebrannter Mandeln', 'an eine Fahrt mit dem Riesenrad', 'an einen kleinen Gewinn', 'an die Musik des Karussells'] },
      { en: ['Did you like going to the fair?', 'Have you ever ridden a merry-go-round?', 'Do you like candyfloss?'],
        fr: ['Aimiez-vous aller à la fête foraine ?', 'Êtes-vous déjà monté sur un manège ?', 'Aimez-vous la barbe à papa ?'],
        de: ['Sind Sie gern auf den Jahrmarkt gegangen?', 'Sind Sie schon einmal Karussell gefahren?', 'Mögen Sie Zuckerwatte?'] },
      ['fair', 'merry go round', 'fete foraine', 'manege', 'jahrmarkt', 'karussell', 'kirmes']),
    M('orchard', 'work', 'work-fields', 'garden', ['summer', 'autumn'], ['garden', 'food'], { en: 'Fruit picking', fr: 'La cueillette des fruits', de: 'Die Obsternte' },
      { en: ['Imagine an orchard in late summer. The trees are heavy with fruit.', 'Picture a ladder against an apple tree and a basket waiting below.'],
        fr: ['Imaginez un verger à la fin de l’été. Les arbres sont chargés de fruits.', 'Imaginez une échelle contre un pommier et un panier qui attend en bas.'],
        de: ['Stellen Sie sich einen Obstgarten im Spätsommer vor. Die Bäume hängen voller Früchte.', 'Stellen Sie sich eine Leiter an einem Apfelbaum vor, unten wartet ein Korb.'] },
      { en: ['the first bite of a fresh apple', 'plums warm from the sun', 'making jam in big pots', 'a basket full of cherries', 'apple pie after the harvest'],
        fr: ['de la première bouchée d’une pomme fraîche', 'des prunes tièdes de soleil', 'de la confiture préparée dans de grandes marmites', 'd’un panier plein de cerises', 'd’une tarte aux pommes après la récolte'],
        de: ['an den ersten Biss in einen frischen Apfel', 'an sonnenwarme Pflaumen', 'ans Marmeladekochen in großen Töpfen', 'an einen Korb voller Kirschen', 'an Apfelkuchen nach der Ernte'] },
      { en: ['Have you ever picked fruit from a tree?', 'Do you like apples?', 'Did you ever make jam?'],
        fr: ['Avez-vous déjà cueilli des fruits sur un arbre ?', 'Aimez-vous les pommes ?', 'Avez-vous déjà fait de la confiture ?'],
        de: ['Haben Sie schon einmal Obst vom Baum gepflückt?', 'Mögen Sie Äpfel?', 'Haben Sie schon einmal Marmelade gekocht?'] },
      ['apple', 'apples', 'fruit', 'orchard', 'pomme', 'pommes', 'verger', 'apfel', 'apfel', 'obst']),
    M('school', 'childhood', 'childhood-school', '', [], ['reading'], { en: 'The school', fr: 'L’école', de: 'Die Schule' },
      { en: ['Imagine a classroom on a sunny morning, with rows of wooden desks.', 'Picture a school playground at break time, full of games.'],
        fr: ['Imaginez une salle de classe par un matin ensoleillé, avec des rangées de pupitres en bois.', 'Imaginez une cour d’école à la récréation, pleine de jeux.'],
        de: ['Stellen Sie sich ein Klassenzimmer an einem sonnigen Morgen vor, mit Reihen von Holzbänken.', 'Stellen Sie sich einen Schulhof in der Pause vor, voller Spiele.'] },
      { en: ['the smell of chalk', 'a satchel on your back', 'skipping ropes and marbles', 'learning to write nicely', 'the bell at the end of the day'],
        fr: ['de l’odeur de la craie', 'd’un cartable sur le dos', 'des cordes à sauter et des billes', 'de l’apprentissage de la belle écriture', 'de la sonnerie à la fin de la journée'],
        de: ['an den Geruch von Kreide', 'an einen Schulranzen auf dem Rücken', 'an Springseile und Murmeln', 'ans Schönschreiben', 'an die Glocke am Ende des Tages'] },
      { en: ['Did you like school?', 'Did you play marbles or skip rope?', 'Did you have a favourite subject?'],
        fr: ['Aimiez-vous l’école ?', 'Jouiez-vous aux billes ou à la corde à sauter ?', 'Aviez-vous une matière préférée ?'],
        de: ['Sind Sie gern zur Schule gegangen?', 'Haben Sie Murmeln oder Seilspringen gespielt?', 'Hatten Sie ein Lieblingsfach?'] },
      ['school', 'class', 'ecole', 'classe', 'schule', 'klasse']),
    M('bicycle', 'childhood', 'childhood-bicycle', '', ['spring', 'summer', 'autumn'], ['sport'], { en: 'The bicycle', fr: 'Le vélo', de: 'Das Fahrrad' },
      { en: ['Imagine a ride on a bicycle along a quiet country road.', 'Picture a shiny bicycle with a bell and a little basket.'],
        fr: ['Imaginez une balade à vélo sur une petite route de campagne.', 'Imaginez un beau vélo brillant, avec une sonnette et un petit panier.'],
        de: ['Stellen Sie sich eine Fahrradtour auf einer ruhigen Landstraße vor.', 'Stellen Sie sich ein glänzendes Fahrrad mit Klingel und kleinem Korb vor.'] },
      { en: ['the wind in your hair', 'ringing the bell', 'riding to the next village', 'a stop for a cool drink', 'learning to ride for the first time'],
        fr: ['du vent dans les cheveux', 'de la sonnette qu’on faisait tinter', 'd’une balade jusqu’au village voisin', 'd’une pause pour boire quelque chose de frais', 'de la première fois à vélo'],
        de: ['an den Wind in den Haaren', 'ans Klingeln', 'an eine Fahrt ins Nachbardorf', 'an eine Pause mit einem kühlen Getränk', 'an das erste Mal auf dem Fahrrad'] },
      { en: ['Did you like riding a bicycle?', 'Did your bicycle have a bell?', 'Do you like the countryside?'],
        fr: ['Aimiez-vous faire du vélo ?', 'Votre vélo avait-il une sonnette ?', 'Aimez-vous la campagne ?'],
        de: ['Sind Sie gern Fahrrad gefahren?', 'Hatte Ihr Fahrrad eine Klingel?', 'Mögen Sie das Land?'] },
      ['bicycle', 'bike', 'velo', 'bicyclette', 'fahrrad', 'rad']),
    M('train', 'travel', 'travel-train', '', [], ['travel'], { en: 'A train journey', fr: 'Un voyage en train', de: 'Eine Zugfahrt' },
      { en: ['Imagine sitting by the window of a train. The fields go by slowly.', 'Picture a railway station in the morning, with a train waiting at the platform.'],
        fr: ['Imaginez-vous assis près de la fenêtre d’un train. Les champs défilent doucement.', 'Imaginez une gare le matin, avec un train qui attend sur le quai.'],
        de: ['Stellen Sie sich vor, Sie sitzen am Fenster eines Zuges. Die Felder ziehen langsam vorbei.', 'Stellen Sie sich einen Bahnhof am Morgen vor, mit einem Zug, der am Bahnsteig wartet.'] },
      { en: ['the whistle before leaving', 'a sandwich on your lap', 'villages and rivers going by', 'the gentle rocking of the carriage', 'arriving somewhere new'],
        fr: ['du coup de sifflet du départ', 'd’un sandwich sur les genoux', 'des villages et des rivières qui défilaient', 'du doux balancement du wagon', 'de l’arrivée dans un endroit nouveau'],
        de: ['an den Pfiff vor der Abfahrt', 'an ein Brot auf dem Schoß', 'an Dörfer und Flüsse, die vorbeizogen', 'an das sanfte Schaukeln des Wagens', 'an die Ankunft an einem neuen Ort'] },
      { en: ['Did you like travelling by train?', 'Do you like looking out of the window on a journey?', 'Did you ever take a long train journey?'],
        fr: ['Aimiez-vous voyager en train ?', 'Aimez-vous regarder par la fenêtre en voyage ?', 'Avez-vous déjà fait un long voyage en train ?'],
        de: ['Sind Sie gern mit dem Zug gefahren?', 'Schauen Sie auf Reisen gern aus dem Fenster?', 'Haben Sie schon einmal eine lange Zugreise gemacht?'] },
      ['train', 'railway', 'station', 'gare', 'zug', 'bahnhof', 'eisenbahn']),
    M('cafe', 'town', 'town-cafe', '', [], ['town', 'food'], { en: 'A café', fr: 'Un café', de: 'Ein Café' },
      { en: ['Imagine a little café on a sunny square. The tables are outside.', 'Picture a cosy café on a cold afternoon, with steamed-up windows.'],
        fr: ['Imaginez un petit café sur une place ensoleillée. Les tables sont dehors.', 'Imaginez un café douillet par un après-midi froid, avec des vitres embuées.'],
        de: ['Stellen Sie sich ein kleines Café an einem sonnigen Platz vor. Die Tische stehen draußen.', 'Stellen Sie sich ein gemütliches Café an einem kalten Nachmittag vor, mit beschlagenen Fenstern.'] },
      { en: ['the smell of fresh coffee', 'a slice of cake on a little plate', 'watching people go by', 'a newspaper and a quiet moment', 'a chat with a friend'],
        fr: ['de l’odeur du café frais', 'd’une part de gâteau sur une petite assiette', 'des passants qu’on regardait', 'd’un journal et d’un moment tranquille', 'd’une discussion avec un ami'],
        de: ['an den Duft von frischem Kaffee', 'an ein Stück Kuchen auf einem kleinen Teller', 'ans Leuteschauen', 'an eine Zeitung und einen ruhigen Moment', 'an einen Plausch mit einem Freund'] },
      { en: ['Do you like going to a café?', 'Do you prefer coffee or tea?', 'Did you have a favourite café?'],
        fr: ['Aimez-vous aller au café ?', 'Préférez-vous le café ou le thé ?', 'Aviez-vous un café préféré ?'],
        de: ['Gehen Sie gern ins Café?', 'Trinken Sie lieber Kaffee oder Tee?', 'Hatten Sie ein Lieblingscafé?'] },
      ['cafe', 'coffee', 'cake', 'terrasse', 'kaffee', 'kuchen']),
    M('sewing', 'work', 'work-sewing', '', [], ['crafts'], { en: 'Sewing and knitting', fr: 'La couture et le tricot', de: 'Nähen und Stricken' },
      { en: ['Imagine a sewing basket full of colourful threads and buttons.', 'Picture a quiet evening with knitting needles clicking softly.'],
        fr: ['Imaginez une boîte à couture pleine de fils colorés et de boutons.', 'Imaginez une soirée tranquille, avec des aiguilles à tricoter qui cliquettent doucement.'],
        de: ['Stellen Sie sich einen Nähkorb voller bunter Fäden und Knöpfe vor.', 'Stellen Sie sich einen ruhigen Abend vor, an dem die Stricknadeln leise klappern.'] },
      { en: ['the hum of a sewing machine', 'a ball of soft wool', 'a warm jumper you made', 'choosing a pretty fabric', 'a tin full of buttons'],
        fr: ['du ronronnement d’une machine à coudre', 'd’une pelote de laine douce', 'd’un pull chaud que vous avez fait', 'du choix d’un joli tissu', 'd’une boîte pleine de boutons'],
        de: ['an das Surren einer Nähmaschine', 'an ein Knäuel weicher Wolle', 'an einen warmen Pullover, den Sie gemacht haben', 'an die Wahl eines hübschen Stoffes', 'an eine Dose voller Knöpfe'] },
      { en: ['Did you like sewing or knitting?', 'Do you like soft wool?', 'Have you ever made a piece of clothing?'],
        fr: ['Aimiez-vous coudre ou tricoter ?', 'Aimez-vous la laine douce ?', 'Avez-vous déjà fait un vêtement ?'],
        de: ['Haben Sie gern genäht oder gestrickt?', 'Mögen Sie weiche Wolle?', 'Haben Sie schon einmal ein Kleidungsstück gemacht?'] },
      ['sewing', 'knitting', 'wool', 'couture', 'tricot', 'laine', 'nahen', 'stricken', 'wolle']),
    M('workshop', 'work', 'work-fields', '', [], ['crafts'], { en: 'The workshop', fr: 'L’atelier', de: 'Die Werkstatt' },
      { en: ['Imagine a workshop with tools neatly hanging on the wall.', 'Picture a workbench in the morning light, with fresh wood shavings on it.'],
        fr: ['Imaginez un atelier avec des outils bien rangés au mur.', 'Imaginez un établi dans la lumière du matin, couvert de copeaux de bois frais.'],
        de: ['Stellen Sie sich eine Werkstatt vor, mit Werkzeug ordentlich an der Wand.', 'Stellen Sie sich eine Werkbank im Morgenlicht vor, mit frischen Hobelspänen darauf.'] },
      { en: ['the smell of fresh wood', 'a hammer and a box of nails', 'repairing something that was broken', 'a little shelf you made yourself', 'the satisfaction of a job well done'],
        fr: ['de l’odeur du bois frais', 'd’un marteau et d’une boîte de clous', 'd’un objet réparé', 'd’une petite étagère faite de vos mains', 'de la satisfaction du travail bien fait'],
        de: ['an den Duft von frischem Holz', 'an einen Hammer und eine Schachtel Nägel', 'an etwas, das Sie repariert haben', 'an ein kleines Regal, das Sie selbst gebaut haben', 'an die Freude über gute Arbeit'] },
      { en: ['Did you like making or repairing things?', 'Do you like the smell of wood?', 'Did you have a favourite tool?'],
        fr: ['Aimiez-vous fabriquer ou réparer des choses ?', 'Aimez-vous l’odeur du bois ?', 'Aviez-vous un outil préféré ?'],
        de: ['Haben Sie gern Dinge gebaut oder repariert?', 'Mögen Sie den Duft von Holz?', 'Hatten Sie ein Lieblingswerkzeug?'] },
      ['workshop', 'tools', 'wood', 'atelier', 'outils', 'bois', 'werkstatt', 'werkzeug', 'holz']),
    M('cat', 'animals', 'animals-cat', '', [], ['animals'], { en: 'A cat', fr: 'Un chat', de: 'Eine Katze' },
      { en: ['Imagine a cat asleep in a patch of sunshine on the windowsill.', 'Picture a soft little kitten playing with a ball of wool.'],
        fr: ['Imaginez un chat endormi dans un rayon de soleil, sur le rebord de la fenêtre.', 'Imaginez un petit chaton tout doux qui joue avec une pelote de laine.'],
        de: ['Stellen Sie sich eine Katze vor, die auf der Fensterbank in der Sonne schläft.', 'Stellen Sie sich ein weiches kleines Kätzchen vor, das mit einem Wollknäuel spielt.'] },
      { en: ['a gentle purr', 'soft fur under your hand', 'a cat curled up on a chair', 'a saucer of milk', 'a cat watching the birds'],
        fr: ['d’un doux ronronnement', 'd’un pelage tout doux sous la main', 'd’un chat roulé en boule sur une chaise', 'd’une soucoupe de lait', 'd’un chat qui regarde les oiseaux'],
        de: ['an ein sanftes Schnurren', 'an weiches Fell unter der Hand', 'an eine Katze, zusammengerollt auf einem Stuhl', 'an ein Schälchen Milch', 'an eine Katze, die die Vögel beobachtet'] },
      { en: ['Do you like cats?', 'Do you like the sound of a cat purring?', 'Have you ever had a cat?'],
        fr: ['Aimez-vous les chats ?', 'Aimez-vous entendre un chat ronronner ?', 'Avez-vous déjà eu un chat ?'],
        de: ['Mögen Sie Katzen?', 'Hören Sie gern eine Katze schnurren?', 'Hatten Sie schon einmal eine Katze?'] },
      ['cat', 'cats', 'kitten', 'chat', 'chaton', 'katze', 'kater']),
    M('dog', 'animals', 'animals-dog', '', [], ['animals'], { en: 'A dog', fr: 'Un chien', de: 'Ein Hund' },
      { en: ['Imagine a friendly dog wagging its tail at the door.', 'Picture a dog running happily across a meadow after a ball.'],
        fr: ['Imaginez un chien gentil qui remue la queue devant la porte.', 'Imaginez un chien qui court joyeusement dans un pré après une balle.'],
        de: ['Stellen Sie sich einen freundlichen Hund vor, der an der Tür mit dem Schwanz wedelt.', 'Stellen Sie sich einen Hund vor, der fröhlich über eine Wiese einem Ball hinterherläuft.'] },
      { en: ['a walk with a dog on a lead', 'a wet nose saying hello', 'throwing a stick', 'a dog asleep by the fire', 'a happy bark'],
        fr: ['d’une promenade avec un chien en laisse', 'd’une truffe humide qui dit bonjour', 'd’un bâton qu’on lançait', 'd’un chien endormi près du feu', 'd’un aboiement joyeux'],
        de: ['an einen Spaziergang mit einem Hund an der Leine', 'an eine feuchte Nase, die Hallo sagt', 'ans Stöckchenwerfen', 'an einen Hund, der am Ofen schläft', 'an ein fröhliches Bellen'] },
      { en: ['Do you like dogs?', 'Have you ever had a dog?', 'Do you like walking with a dog?'],
        fr: ['Aimez-vous les chiens ?', 'Avez-vous déjà eu un chien ?', 'Aimez-vous vous promener avec un chien ?'],
        de: ['Mögen Sie Hunde?', 'Hatten Sie schon einmal einen Hund?', 'Gehen Sie gern mit einem Hund spazieren?'] },
      ['dog', 'dogs', 'puppy', 'chien', 'chiot', 'hund', 'welpe']),
    M('farm', 'animals', 'animals-farm', '', [], ['animals'], { en: 'The farm', fr: 'La ferme', de: 'Der Bauernhof' },
      { en: ['Imagine a farmyard in the morning. The hens are pecking and the cows are in the field.', 'Picture a big barn full of hay, with sunshine coming through the door.'],
        fr: ['Imaginez une cour de ferme le matin. Les poules picorent et les vaches sont au pré.', 'Imaginez une grande grange pleine de foin, avec le soleil qui entre par la porte.'],
        de: ['Stellen Sie sich einen Bauernhof am Morgen vor. Die Hühner picken, und die Kühe stehen auf der Weide.', 'Stellen Sie sich eine große Scheune voller Heu vor, durch deren Tor die Sonne scheint.'] },
      { en: ['fresh eggs still warm', 'the smell of hay', 'a tractor in the field', 'fresh milk in a jug', 'a horse looking over the fence'],
        fr: ['des œufs frais encore tièdes', 'de l’odeur du foin', 'd’un tracteur dans les champs', 'du lait frais dans un pot', 'd’un cheval qui regarde par-dessus la barrière'],
        de: ['an frische Eier, noch warm', 'an den Duft von Heu', 'an einen Traktor auf dem Feld', 'an frische Milch im Krug', 'an ein Pferd, das über den Zaun schaut'] },
      { en: ['Have you ever been on a farm?', 'Do you like the smell of hay?', 'Have you ever collected eggs?'],
        fr: ['Êtes-vous déjà allé dans une ferme ?', 'Aimez-vous l’odeur du foin ?', 'Avez-vous déjà ramassé des œufs ?'],
        de: ['Waren Sie schon einmal auf einem Bauernhof?', 'Mögen Sie den Duft von Heu?', 'Haben Sie schon einmal Eier eingesammelt?'] },
      ['farm', 'cows', 'hens', 'horse', 'ferme', 'vaches', 'poules', 'cheval', 'bauernhof', 'kuhe', 'huhner', 'pferd']),
    M('fireworks', 'celebrations', 'feast-fireworks', '', ['summer', 'winter'], [], { en: 'Fireworks', fr: 'Le feu d’artifice', de: 'Das Feuerwerk' },
      { en: ['Imagine a warm summer night. Everyone is looking up at the sky.', 'Picture the first firework opening like a big golden flower.'],
        fr: ['Imaginez une douce nuit d’été. Tout le monde regarde le ciel.', 'Imaginez la première fusée qui s’ouvre comme une grande fleur dorée.'],
        de: ['Stellen Sie sich eine warme Sommernacht vor. Alle schauen zum Himmel.', 'Stellen Sie sich die erste Rakete vor, die sich wie eine große goldene Blume öffnet.'] },
      { en: ['colours lighting up the sky', 'everyone saying ooh and aah', 'music playing in the square', 'a sparkler in your hand', 'walking home late and happy'],
        fr: ['des couleurs qui illuminaient le ciel', 'des « oh » et des « ah » de tout le monde', 'de la musique sur la place', 'd’un cierge magique dans la main', 'du retour à la maison, tard et heureux'],
        de: ['an Farben, die den Himmel erleuchteten', 'an das „Oh“ und „Ah“ aller Leute', 'an Musik auf dem Platz', 'an eine Wunderkerze in der Hand', 'an den späten, fröhlichen Heimweg'] },
      { en: ['Do you like fireworks?', 'Did you watch fireworks in summer?', 'Do you like bright colours?'],
        fr: ['Aimez-vous les feux d’artifice ?', 'Regardiez-vous les feux d’artifice en été ?', 'Aimez-vous les couleurs vives ?'],
        de: ['Mögen Sie Feuerwerk?', 'Haben Sie im Sommer Feuerwerk angeschaut?', 'Mögen Sie leuchtende Farben?'] },
      ['fireworks', 'feu d artifice', 'feuerwerk']),
    M('tram', 'town', 'town-tram', '', [], ['town', 'travel'], { en: 'The town', fr: 'La ville', de: 'Die Stadt' },
      { en: ['Imagine a busy street in town. A tram rings its bell as it goes by.', 'Picture a town square in the afternoon, with shop windows all around.'],
        fr: ['Imaginez une rue animée en ville. Un tramway fait sonner sa cloche en passant.', 'Imaginez une place de ville l’après-midi, avec des vitrines tout autour.'],
        de: ['Stellen Sie sich eine belebte Straße in der Stadt vor. Eine Straßenbahn klingelt beim Vorbeifahren.', 'Stellen Sie sich einen Stadtplatz am Nachmittag vor, ringsum Schaufenster.'] },
      { en: ['looking in the shop windows', 'the bell of the tram', 'a new hat or a new pair of shoes', 'a bench by the fountain', 'the lights coming on in the evening'],
        fr: ['du lèche-vitrines', 'de la cloche du tramway', 'd’un nouveau chapeau ou de nouvelles chaussures', 'd’un banc près de la fontaine', 'des lumières qui s’allumaient le soir'],
        de: ['an einen Schaufensterbummel', 'an die Glocke der Straßenbahn', 'an einen neuen Hut oder neue Schuhe', 'an eine Bank am Brunnen', 'an die Lichter, die abends angingen'] },
      { en: ['Did you like going into town?', 'Have you ever ridden on a tram?', 'Do you like looking in shop windows?'],
        fr: ['Aimiez-vous aller en ville ?', 'Êtes-vous déjà monté dans un tramway ?', 'Aimez-vous faire du lèche-vitrines ?'],
        de: ['Sind Sie gern in die Stadt gegangen?', 'Sind Sie schon einmal Straßenbahn gefahren?', 'Machen Sie gern einen Schaufensterbummel?'] },
      ['town', 'city', 'tram', 'ville', 'tramway', 'stadt', 'strassenbahn']),
    M('letters', 'family', 'family-lunch', '', [], ['reading'], { en: 'A letter in the post', fr: 'Une lettre au courrier', de: 'Ein Brief in der Post' },
      { en: ['Imagine finding a letter in the letterbox, with your name written by hand.', 'Picture a postcard with a pretty picture and a few warm words.'],
        fr: ['Imaginez une lettre dans la boîte aux lettres, avec votre nom écrit à la main.', 'Imaginez une carte postale avec une jolie image et quelques mots chaleureux.'],
        de: ['Stellen Sie sich vor, im Briefkasten liegt ein Brief, Ihr Name von Hand geschrieben.', 'Stellen Sie sich eine Postkarte vor, mit einem hübschen Bild und ein paar herzlichen Worten.'] },
      { en: ['the sound of the postman', 'a colourful stamp', 'opening the envelope carefully', 'a postcard from a holiday', 'writing a reply with your best pen'],
        fr: ['du passage du facteur', 'd’un timbre coloré', 'de l’enveloppe ouverte avec soin', 'd’une carte postale de vacances', 'd’une réponse écrite avec votre plus beau stylo'],
        de: ['an den Briefträger', 'an eine bunte Briefmarke', 'ans vorsichtige Öffnen des Umschlags', 'an eine Urlaubspostkarte', 'an eine Antwort, geschrieben mit dem besten Stift'] },
      { en: ['Do you like getting letters?', 'Did you send postcards from holidays?', 'Do you like writing by hand?'],
        fr: ['Aimez-vous recevoir des lettres ?', 'Envoyiez-vous des cartes postales en vacances ?', 'Aimez-vous écrire à la main ?'],
        de: ['Bekommen Sie gern Briefe?', 'Haben Sie aus dem Urlaub Postkarten geschickt?', 'Schreiben Sie gern mit der Hand?'] },
      ['letter', 'post', 'postcard', 'lettre', 'courrier', 'carte postale', 'brief', 'post', 'postkarte']),
    M('birthday', 'celebrations', 'family-wedding', '', [], ['food'], { en: 'A birthday cake', fr: 'Un gâteau d’anniversaire', de: 'Eine Geburtstagstorte' },
      { en: ['Imagine a table ready for a party, with a big cake in the middle.', 'Picture candles glowing on a cake and everyone starting to sing.'],
        fr: ['Imaginez une table prête pour une fête, avec un grand gâteau au milieu.', 'Imaginez des bougies qui brillent sur un gâteau et tout le monde qui commence à chanter.'],
        de: ['Stellen Sie sich einen festlich gedeckten Tisch vor, mit einer großen Torte in der Mitte.', 'Stellen Sie sich Kerzen auf einer Torte vor, und alle fangen an zu singen.'] },
      { en: ['blowing out the candles', 'a slice of cream cake', 'colourful paper and ribbons', 'a song sung all together', 'a little present to unwrap'],
        fr: ['des bougies qu’on soufflait', 'd’une part de gâteau à la crème', 'du papier coloré et des rubans', 'd’une chanson chantée tous ensemble', 'd’un petit cadeau à ouvrir'],
        de: ['ans Auspusten der Kerzen', 'an ein Stück Sahnetorte', 'an buntes Papier und Schleifen', 'an ein Lied, das alle zusammen sangen', 'an ein kleines Geschenk zum Auspacken'] },
      { en: ['Do you like birthday cake?', 'Did you have a favourite cake for parties?', 'Do you like singing at a party?'],
        fr: ['Aimez-vous les gâteaux d’anniversaire ?', 'Aviez-vous un gâteau préféré pour les fêtes ?', 'Aimez-vous chanter pendant une fête ?'],
        de: ['Mögen Sie Geburtstagstorte?', 'Hatten Sie eine Lieblingstorte für Feste?', 'Singen Sie gern auf einem Fest?'] },
      ['birthday', 'cake', 'party', 'anniversaire', 'gateau', 'fete', 'geburtstag', 'torte', 'fest']),
    M('winterlights', 'celebrations', 'feast-christmas', '', ['winter'], [], { en: 'The winter market', fr: 'Le marché d’hiver', de: 'Der Wintermarkt' },
      { en: ['Imagine a winter market in the evening, with little lights everywhere.', 'Picture wooden stalls in the cold air, and the smell of something sweet.'],
        fr: ['Imaginez un marché d’hiver le soir, avec de petites lumières partout.', 'Imaginez des chalets en bois dans l’air froid, et une bonne odeur sucrée.'],
        de: ['Stellen Sie sich einen Wintermarkt am Abend vor, mit kleinen Lichtern überall.', 'Stellen Sie sich Holzbuden in der kalten Luft vor, und es duftet nach etwas Süßem.'] },
      { en: ['gingerbread', 'roasted chestnuts in a paper bag', 'warm gloves', 'a hot drink to warm your hands', 'pretty decorations to look at'],
        fr: ['du pain d’épices', 'des châtaignes grillées dans un cornet', 'des gants bien chauds', 'd’une boisson chaude pour se réchauffer les mains', 'de jolies décorations à admirer'],
        de: ['an Lebkuchen', 'an geröstete Kastanien in einer Tüte', 'an warme Handschuhe', 'an ein heißes Getränk für die kalten Hände', 'an hübsche Dekorationen zum Anschauen'] },
      { en: ['Do you like winter markets?', 'Do you like gingerbread?', 'Do you like little lights in winter?'],
        fr: ['Aimez-vous les marchés d’hiver ?', 'Aimez-vous le pain d’épices ?', 'Aimez-vous les petites lumières en hiver ?'],
        de: ['Mögen Sie Wintermärkte?', 'Mögen Sie Lebkuchen?', 'Mögen Sie die kleinen Lichter im Winter?'] },
      ['winter market', 'lights', 'marche', 'lumieres', 'markt', 'lichter', 'lebkuchen']),
    M('football', 'town', 'town-tram', '', [], ['sport'], { en: 'A football match', fr: 'Un match de football', de: 'Ein Fußballspiel' },
      { en: ['Imagine a Sunday afternoon at the football ground. The crowd is cheering.', 'Picture a green pitch on a sunny day, and the players running out.'],
        fr: ['Imaginez un dimanche après-midi au stade. La foule encourage son équipe.', 'Imaginez un terrain bien vert par une belle journée, et les joueurs qui entrent sur le terrain.'],
        de: ['Stellen Sie sich einen Sonntagnachmittag auf dem Fußballplatz vor. Die Zuschauer jubeln.', 'Stellen Sie sich einen grünen Rasen an einem sonnigen Tag vor, und die Spieler laufen ein.'] },
      { en: ['a scarf in the team colours', 'a goal and everyone jumping up', 'a match on the radio', 'a kick-about in the street', 'a warm drink at half-time'],
        fr: ['d’une écharpe aux couleurs de l’équipe', 'd’un but et de tout le monde debout', 'd’un match à la radio', 'd’une partie de ballon dans la rue', 'd’une boisson chaude à la mi-temps'],
        de: ['an einen Schal in den Vereinsfarben', 'an ein Tor, bei dem alle aufsprangen', 'an ein Spiel im Radio', 'ans Kicken auf der Straße', 'an ein warmes Getränk in der Halbzeit'] },
      { en: ['Do you like football?', 'Did you have a favourite team?', 'Did you play ball games when you were young?'],
        fr: ['Aimez-vous le football ?', 'Aviez-vous une équipe préférée ?', 'Jouiez-vous au ballon quand vous étiez jeune ?'],
        de: ['Mögen Sie Fußball?', 'Hatten Sie eine Lieblingsmannschaft?', 'Haben Sie in jungen Jahren Ball gespielt?'] },
      ['football', 'match', 'team', 'foot', 'equipe', 'fussball', 'spiel', 'mannschaft'])
  ];
  /* Made from the life story: the place they grew up, and the decade of their youth. */
  var MEM_HOME = {
    open: { en: 'Think of the place where you grew up: {home}.', fr: 'Pensez à l’endroit où vous avez grandi : {home}.', de: 'Denken Sie an den Ort, an dem Sie aufgewachsen sind: {home}.' },
    bits: { en: ['the streets you knew well', 'the market square', 'a favourite bakery', 'the way home', 'the sounds of the neighbourhood', 'a view you loved'],
      fr: ['des rues que vous connaissiez bien', 'de la place du marché', 'd’une boulangerie préférée', 'du chemin de la maison', 'des bruits du quartier', 'd’une vue que vous aimiez'],
      de: ['an die Straßen, die Sie gut kannten', 'an den Marktplatz', 'an eine Lieblingsbäckerei', 'an den Weg nach Hause', 'an die Geräusche der Nachbarschaft', 'an einen Blick, den Sie liebten'] },
    qs: { en: ['Do you like to think about {home}?', 'Do you remember a favourite place there?'], fr: ['Aimez-vous repenser à cet endroit ?', 'Vous souvenez-vous d’un endroit préféré là-bas ?'], de: ['Denken Sie gern an diesen Ort zurück?', 'Erinnern Sie sich an einen Lieblingsplatz dort?'] }
  };
  var MEM_ERA = {
    title: { en: 'The {d}s', fr: 'Les années {d}', de: 'Die {d}er-Jahre' },
    open: { en: 'Think of the {d}s, when you were young.', fr: 'Pensez aux années {d}, quand vous étiez jeune.', de: 'Denken Sie an die {d}er-Jahre, als Sie jung waren.' },
    qs: { en: ['Do you remember music from that time?', 'Did you like to go dancing then?'], fr: ['Vous souvenez-vous de la musique de cette époque ?', 'Aimiez-vous aller danser à cette époque ?'], de: ['Erinnern Sie sich an die Musik aus dieser Zeit?', 'Sind Sie damals gern tanzen gegangen?'] },
    bits: {
      1940: { en: ['the radio in the kitchen', 'dancing at the village hall', 'a bicycle ride to the next village', 'fresh milk from the farm', 'songs sung together in the evening'],
        fr: ['de la radio dans la cuisine', 'des bals au village', 'd’une balade à vélo jusqu’au village voisin', 'du lait frais de la ferme', 'des chansons chantées ensemble le soir'],
        de: ['an das Radio in der Küche', 'an den Tanz im Dorfsaal', 'an eine Radtour ins Nachbardorf', 'an frische Milch vom Bauernhof', 'an Lieder, die man abends zusammen sang'] },
      1950: { en: ['the first television in the neighbourhood', 'a jukebox in a café', 'a Sunday outing in your best clothes', 'a scooter or a little car', 'dance music on the radio'],
        fr: ['de la première télévision du quartier', 'd’un juke-box dans un café', 'd’une sortie du dimanche dans vos beaux habits', 'd’un scooter ou d’une petite voiture', 'de la musique de danse à la radio'],
        de: ['an den ersten Fernseher in der Nachbarschaft', 'an eine Musikbox im Café', 'an einen Sonntagsausflug in den besten Kleidern', 'an einen Motorroller oder ein kleines Auto', 'an Tanzmusik im Radio'] },
      1960: { en: ['records played again and again', 'the first holidays abroad', 'a transistor radio', 'colourful clothes and new dances', 'the cinema on a Saturday night'],
        fr: ['des disques écoutés encore et encore', 'des premières vacances à l’étranger', 'd’un poste à transistors', 'des vêtements colorés et des danses nouvelles', 'du cinéma le samedi soir'],
        de: ['an Schallplatten, die man immer wieder hörte', 'an die ersten Urlaube im Ausland', 'an ein Kofferradio', 'an bunte Kleider und neue Tänze', 'an das Kino am Samstagabend'] },
      1970: { en: ['flared trousers and bright colours', 'a cassette recorder', 'a camping holiday', 'a Saturday evening show on television', 'a car packed for the holidays'],
        fr: ['des pantalons pattes d’éléphant et des couleurs vives', 'd’un magnétophone à cassettes', 'des vacances en camping', 'd’une émission de variétés le samedi soir', 'd’une voiture chargée pour les vacances'],
        de: ['an Schlaghosen und kräftige Farben', 'an einen Kassettenrekorder', 'an einen Campingurlaub', 'an eine Samstagabendshow im Fernsehen', 'an ein voll beladenes Auto für die Ferien'] },
      1980: { en: ['a walkman with your favourite songs', 'colourful sports clothes', 'a video recorder', 'music videos on television', 'a trip by train or plane'],
        fr: ['d’un baladeur avec vos chansons préférées', 'des vêtements de sport colorés', 'd’un magnétoscope', 'des clips à la télévision', 'd’un voyage en train ou en avion'],
        de: ['an einen Walkman mit Lieblingsliedern', 'an bunte Sportkleidung', 'an einen Videorekorder', 'an Musikvideos im Fernsehen', 'an eine Reise mit Zug oder Flugzeug'] }
    }
  };

  /* ---------- bank 4: seated exercises ("Bouger assis", agent E) ----------
     All done sitting down, slowly, small and safe: no full neck circles, no holding the breath,
     no standing. [title, how] in each language; reps: the usual count; figure: the drawing of
     js/art.js (ART.figure) that is closest. */
  function MV(key, zone, figure, reps, t) { return { id: 'mv-' + key, zone: zone, figure: figure, reps: reps, t: t }; }
  var MOVES = [
    MV('heels', 'legs', 'rest', 5, { en: ['Lift your heels', 'Lift your heels, keeping your toes on the floor.'], fr: ['Levez les talons', 'Levez les talons en gardant les orteils au sol.'], de: ['Fersen heben', 'Heben Sie die Fersen, die Zehen bleiben am Boden.'] }),
    MV('toes', 'legs', 'rest', 5, { en: ['Lift your toes', 'Lift your toes, keeping your heels on the floor.'], fr: ['Levez les orteils', 'Levez les orteils en gardant les talons au sol.'], de: ['Zehen heben', 'Heben Sie die Zehen, die Fersen bleiben am Boden.'] }),
    MV('march', 'legs', 'rest', 6, { en: ['March sitting down', 'Lift one knee a little, then the other, as if walking.'], fr: ['Marcher assis', 'Levez un peu un genou, puis l’autre, comme pour marcher.'], de: ['Im Sitzen marschieren', 'Heben Sie ein Knie etwas an, dann das andere, wie beim Gehen.'] }),
    MV('knee', 'legs', 'rest', 4, { en: ['Straighten one leg', 'Slowly straighten one knee, then bend it again.'], fr: ['Tendez une jambe', 'Tendez lentement un genou, puis pliez-le.'], de: ['Ein Bein strecken', 'Strecken Sie langsam ein Knie und beugen Sie es wieder.'] }),
    MV('ankles', 'legs', 'rest', 4, { en: ['Circle your feet', 'Lift one foot a little and draw slow circles with it.'], fr: ['Des cercles avec les pieds', 'Levez un peu un pied et dessinez des cercles lents.'], de: ['Füße kreisen', 'Heben Sie einen Fuß etwas an und malen Sie langsame Kreise.'] }),
    MV('slide', 'legs', 'rest', 5, { en: ['Slide your feet', 'Slide your feet forward on the floor, then back again.'], fr: ['Glissez les pieds', 'Faites glisser vos pieds vers l’avant sur le sol, puis ramenez-les.'], de: ['Füße schieben', 'Schieben Sie die Füße auf dem Boden nach vorn und wieder zurück.'] }),
    MV('knees', 'legs', 'rest', 5, { en: ['Knees apart and together', 'Move your knees apart, then bring them together again.'], fr: ['Genoux écartés, genoux serrés', 'Écartez les genoux, puis rapprochez-les.'], de: ['Knie auseinander und zusammen', 'Bewegen Sie die Knie auseinander und wieder zusammen.'] }),
    MV('tap', 'legs', 'rest', 8, { en: ['Tap your feet', 'Tap your feet on the floor, one after the other, as if to music.'], fr: ['Tapez des pieds', 'Tapez des pieds sur le sol, l’un après l’autre, comme en musique.'], de: ['Mit den Füßen tippen', 'Tippen Sie mit den Füßen auf den Boden, einer nach dem anderen, wie zur Musik.'] }),
    MV('press', 'legs', 'rest', 4, { en: ['Press your feet down', 'Press your feet gently into the floor, count to three, then relax.'], fr: ['Appuyez sur le sol', 'Appuyez doucement les pieds sur le sol, comptez jusqu’à trois, puis relâchez.'], de: ['Füße in den Boden drücken', 'Drücken Sie die Füße sanft in den Boden, zählen Sie bis drei und lassen Sie locker.'] }),
    MV('point', 'legs', 'rest', 4, { en: ['Point and pull', 'Stretch one leg a little, point your toes, then pull them towards you.'], fr: ['Pointe et flexion', 'Tendez un peu une jambe, pointez les orteils, puis ramenez-les vers vous.'], de: ['Strecken und anziehen', 'Strecken Sie ein Bein ein wenig, strecken Sie die Zehen und ziehen Sie sie dann zu sich.'] }),
    MV('heeltoe', 'legs', 'rest', 4, { en: ['Heel forward', 'Put one heel forward on the floor, then bring the foot back.'], fr: ['Le talon devant', 'Posez un talon devant vous, puis ramenez le pied.'], de: ['Ferse nach vorn', 'Setzen Sie eine Ferse vorn auf und holen Sie den Fuß zurück.'] }),
    MV('swing', 'legs', 'rest', 4, { en: ['A little swing', 'Swing one lower leg gently forward and back.'], fr: ['Un petit balancement', 'Balancez doucement le bas d’une jambe d’avant en arrière.'], de: ['Ein kleiner Schwung', 'Schwingen Sie einen Unterschenkel sanft vor und zurück.'] }),
    MV('one', 'upper', 'one', 3, { en: ['Raise one hand', 'Slowly raise one hand, then lower it again.'], fr: ['Levez une main', 'Levez lentement une main, puis baissez-la.'], de: ['Eine Hand heben', 'Heben Sie langsam eine Hand und senken Sie sie wieder.'] }),
    MV('both', 'upper', 'both', 3, { en: ['Raise both hands', 'Slowly raise both hands, then lower them again.'], fr: ['Levez les deux mains', 'Levez lentement les deux mains, puis baissez-les.'], de: ['Beide Hände heben', 'Heben Sie langsam beide Hände und senken Sie sie wieder.'] }),
    MV('out', 'upper', 'out', 3, { en: ['Arms out to the sides', 'Stretch both arms out to the sides, then let them rest.'], fr: ['Les bras sur les côtés', 'Tendez les deux bras sur les côtés, puis reposez-les.'], de: ['Arme zur Seite', 'Strecken Sie beide Arme zur Seite und legen Sie sie wieder ab.'] }),
    MV('cross', 'upper', 'cross', 3, { en: ['Touch the other shoulder', 'Reach across and touch your other shoulder, then let your hand rest.'], fr: ['Touchez l’autre épaule', 'Passez la main devant vous et touchez l’autre épaule, puis reposez la main.'], de: ['Die andere Schulter berühren', 'Greifen Sie hinüber und berühren Sie die andere Schulter, dann legen Sie die Hand ab.'] }),
    MV('shrug', 'upper', 'rest', 5, { en: ['Shoulders up and down', 'Lift your shoulders towards your ears, then let them drop gently.'], fr: ['Les épaules en haut, en bas', 'Montez les épaules vers les oreilles, puis laissez-les redescendre doucement.'], de: ['Schultern hoch und runter', 'Ziehen Sie die Schultern zu den Ohren und lassen Sie sie sanft sinken.'] }),
    MV('rolls', 'upper', 'rest', 5, { en: ['Roll your shoulders', 'Roll your shoulders slowly backwards, in big circles.'], fr: ['Roulez les épaules', 'Faites rouler lentement les épaules vers l’arrière, en grands cercles.'], de: ['Schultern kreisen', 'Kreisen Sie die Schultern langsam nach hinten, in großen Kreisen.'] }),
    MV('push', 'upper', 'out', 5, { en: ['Push a door open', 'Push both hands forward, as if opening a door, then bring them back.'], fr: ['Poussez une porte', 'Poussez les deux mains vers l’avant, comme pour ouvrir une porte, puis ramenez-les.'], de: ['Eine Tür aufschieben', 'Schieben Sie beide Hände nach vorn, als ob Sie eine Tür öffnen, und holen Sie sie zurück.'] }),
    MV('apple', 'upper', 'one', 4, { en: ['Pick an apple', 'Reach up with one hand, as if picking an apple.'], fr: ['Cueillez une pomme', 'Levez une main, comme pour cueillir une pomme.'], de: ['Einen Apfel pflücken', 'Strecken Sie eine Hand nach oben, als ob Sie einen Apfel pflücken.'] }),
    MV('hug', 'upper', 'cross', 3, { en: ['Give yourself a hug', 'Cross your arms and give yourself a warm hug, then open your arms.'], fr: ['Un câlin pour vous', 'Croisez les bras et faites-vous un bon câlin, puis ouvrez les bras.'], de: ['Sich selbst umarmen', 'Kreuzen Sie die Arme, umarmen Sie sich herzlich und öffnen Sie die Arme wieder.'] }),
    MV('row', 'upper', 'out', 5, { en: ['Row the boat', 'Pull your elbows back, as if rowing a boat, then reach forward again.'], fr: ['Ramez', 'Tirez les coudes vers l’arrière, comme pour ramer, puis tendez les bras devant vous.'], de: ['Rudern', 'Ziehen Sie die Ellbogen nach hinten, als ob Sie rudern, und strecken Sie die Arme wieder nach vorn.'] }),
    MV('clap', 'upper', 'rest', 8, { en: ['Clap your hands', 'Clap your hands in front of you, slowly, then a little faster.'], fr: ['Applaudissez', 'Frappez dans vos mains devant vous, lentement, puis un peu plus vite.'], de: ['In die Hände klatschen', 'Klatschen Sie vor sich in die Hände, langsam, dann etwas schneller.'] }),
    MV('elbows', 'upper', 'rest', 5, { en: ['Hands to shoulders', 'Bend your elbows and bring your hands to your shoulders, then lower them.'], fr: ['Les mains aux épaules', 'Pliez les coudes et portez les mains aux épaules, puis redescendez-les.'], de: ['Hände zu den Schultern', 'Beugen Sie die Ellbogen, führen Sie die Hände zu den Schultern und senken Sie sie wieder.'] }),
    MV('tall', 'back', 'rest', 3, { en: ['Sit up tall', 'Sit up straight, as if a string were gently pulling your head up.'], fr: ['Grandissez-vous', 'Asseyez-vous bien droit, comme si un fil tirait doucement votre tête.'], de: ['Aufrecht sitzen', 'Setzen Sie sich gerade hin, als ob ein Faden Ihren Kopf sanft nach oben zieht.'] }),
    MV('twist', 'back', 'rest', 4, { en: ['A gentle turn', 'Hands on your knees, turn your shoulders gently to one side, then the other.'], fr: ['Une douce rotation', 'Mains sur les genoux, tournez doucement les épaules d’un côté, puis de l’autre.'], de: ['Eine sanfte Drehung', 'Hände auf die Knie, drehen Sie die Schultern sanft zur einen, dann zur anderen Seite.'] }),
    MV('lean', 'back', 'rest', 4, { en: ['Lean to the side', 'Let one hand slide gently down your side, then come back up.'], fr: ['Penchez-vous sur le côté', 'Laissez une main glisser doucement le long du côté, puis remontez.'], de: ['Zur Seite neigen', 'Lassen Sie eine Hand sanft an der Seite hinabgleiten und kommen Sie wieder hoch.'] }),
    MV('forward', 'back', 'rest', 4, { en: ['Lean forward a little', 'Lean forward a little, then sit back up slowly.'], fr: ['Penchez-vous un peu en avant', 'Penchez-vous un peu en avant, puis redressez-vous lentement.'], de: ['Etwas nach vorn beugen', 'Beugen Sie sich ein wenig nach vorn und richten Sie sich langsam wieder auf.'] }),
    MV('blades', 'back', 'rest', 4, { en: ['Shoulders back', 'Pull your shoulders back gently, as if holding a pencil between them, then relax.'], fr: ['Les épaules en arrière', 'Tirez doucement les épaules en arrière, comme pour tenir un crayon entre elles, puis relâchez.'], de: ['Schultern zurück', 'Ziehen Sie die Schultern sanft zurück, als ob Sie einen Stift dazwischen halten, dann locker lassen.'] }),
    MV('round', 'back', 'rest', 4, { en: ['Round and straight', 'Round your back gently, then sit up straight again.'], fr: ['Dos rond, dos droit', 'Arrondissez doucement le dos, puis redressez-vous.'], de: ['Rund und gerade', 'Machen Sie den Rücken sanft rund und setzen Sie sich dann wieder gerade hin.'] }),
    MV('look', 'back', 'rest', 3, { en: ['Look over your shoulder', 'Turn your head slowly to look over one shoulder, then over the other.'], fr: ['Regardez par-dessus l’épaule', 'Tournez lentement la tête pour regarder par-dessus une épaule, puis par-dessus l’autre.'], de: ['Über die Schulter schauen', 'Drehen Sie den Kopf langsam und schauen Sie über eine Schulter, dann über die andere.'] }),
    MV('nod', 'back', 'rest', 4, { en: ['Nod yes', 'Nod your head slowly, as if saying yes.'], fr: ['Faites oui de la tête', 'Hochez lentement la tête, comme pour dire oui.'], de: ['Ja nicken', 'Nicken Sie langsam mit dem Kopf, als ob Sie Ja sagen.'] }),
    MV('tilt', 'back', 'rest', 3, { en: ['Ear to shoulder', 'Tilt your head gently towards one shoulder, then towards the other.'], fr: ['L’oreille vers l’épaule', 'Inclinez doucement la tête vers une épaule, puis vers l’autre.'], de: ['Ohr zur Schulter', 'Neigen Sie den Kopf sanft zu einer Schulter, dann zur anderen.'] }),
    MV('reach', 'back', 'out', 4, { en: ['Reach forward', 'Stretch both arms forward, only as far as is comfortable, then bring them back.'], fr: ['Tendez les bras devant vous', 'Tendez les deux bras vers l’avant, juste autant que c’est agréable, puis ramenez-les.'], de: ['Nach vorn strecken', 'Strecken Sie beide Arme nach vorn, nur so weit es angenehm ist, und holen Sie sie zurück.'] }),
    MV('fist', 'hands', 'rest', 6, { en: ['Open and close', 'Make a soft fist, then open your hand wide.'], fr: ['Ouvrir et fermer', 'Fermez doucement le poing, puis ouvrez grand la main.'], de: ['Öffnen und schließen', 'Machen Sie eine sanfte Faust und öffnen Sie die Hand dann weit.'] }),
    MV('fingers', 'hands', 'rest', 3, { en: ['Fingers to thumb', 'Touch each finger to your thumb, one after the other.'], fr: ['Les doigts vers le pouce', 'Touchez votre pouce avec chaque doigt, l’un après l’autre.'], de: ['Finger zum Daumen', 'Berühren Sie mit jedem Finger den Daumen, einen nach dem anderen.'] }),
    MV('wrists', 'hands', 'rest', 5, { en: ['Circle your wrists', 'Turn your wrists in slow circles.'], fr: ['Tournez les poignets', 'Faites tourner les poignets en cercles lents.'], de: ['Handgelenke kreisen', 'Kreisen Sie die Handgelenke langsam.'] }),
    MV('spread', 'hands', 'rest', 5, { en: ['Spread your fingers', 'Spread your fingers wide like a star, then relax.'], fr: ['Écartez les doigts', 'Écartez grand les doigts comme une étoile, puis relâchez.'], de: ['Finger spreizen', 'Spreizen Sie die Finger weit wie einen Stern und entspannen Sie sie wieder.'] }),
    MV('piano', 'hands', 'rest', 8, { en: ['Play the piano', 'Tap your fingers on your knees, as if playing the piano.'], fr: ['Jouez du piano', 'Tapotez des doigts sur vos genoux, comme si vous jouiez du piano.'], de: ['Klavier spielen', 'Tippen Sie mit den Fingern auf die Knie, als ob Sie Klavier spielen.'] }),
    MV('wave', 'hands', 'one', 4, { en: ['Wave hello', 'Wave hello with one hand, then with the other.'], fr: ['Faites coucou', 'Faites coucou avec une main, puis avec l’autre.'], de: ['Winken', 'Winken Sie mit einer Hand, dann mit der anderen.'] }),
    MV('squeeze', 'hands', 'rest', 5, { en: ['Squeeze a sponge', 'Squeeze your hands as if pressing a sponge, then let go.'], fr: ['Pressez une éponge', 'Serrez les mains comme pour presser une éponge, puis relâchez.'], de: ['Einen Schwamm drücken', 'Drücken Sie die Hände zusammen, als ob Sie einen Schwamm ausdrücken, und lassen Sie los.'] }),
    MV('rub', 'hands', 'rest', 3, { en: ['Warm your hands', 'Rub your hands together until they feel warm.'], fr: ['Réchauffez vos mains', 'Frottez vos mains l’une contre l’autre jusqu’à ce qu’elles soient chaudes.'], de: ['Hände wärmen', 'Reiben Sie die Hände aneinander, bis sie warm sind.'] }),
    MV('thumbs', 'hands', 'rest', 4, { en: ['Thumbs up', 'Show a thumbs up, then turn it down, then up again.'], fr: ['Le pouce en l’air', 'Levez le pouce, tournez-le vers le bas, puis de nouveau vers le haut.'], de: ['Daumen hoch', 'Zeigen Sie den Daumen nach oben, dann nach unten und wieder nach oben.'] }),
    MV('shake', 'hands', 'rest', 3, { en: ['Shake out your hands', 'Let your hands hang loose and shake them gently.'], fr: ['Secouez les mains', 'Laissez pendre vos mains et secouez-les doucement.'], de: ['Hände ausschütteln', 'Lassen Sie die Hände locker hängen und schütteln Sie sie sanft aus.'] }),
    MV('belly', 'breath', 'rest', 4, { en: ['Breathe slowly', 'Hands on your belly, breathe in slowly through your nose and out through your mouth.'], fr: ['Respirez lentement', 'Mains sur le ventre, inspirez lentement par le nez et expirez par la bouche.'], de: ['Langsam atmen', 'Hände auf den Bauch, atmen Sie langsam durch die Nase ein und durch den Mund aus.'] }),
    MV('flower', 'breath', 'rest', 4, { en: ['Smell the flower', 'Breathe in as if smelling a flower, then breathe out as if blowing out a candle.'], fr: ['Sentez la fleur', 'Inspirez comme pour sentir une fleur, puis soufflez comme pour éteindre une bougie.'], de: ['An der Blume riechen', 'Atmen Sie ein, als ob Sie an einer Blume riechen, und pusten Sie aus wie bei einer Kerze.'] }),
    MV('armsup', 'breath', 'both', 3, { en: ['Breathe with your arms', 'Raise your arms as you breathe in, lower them as you breathe out.'], fr: ['Respirez avec les bras', 'Levez les bras en inspirant, baissez-les en expirant.'], de: ['Mit den Armen atmen', 'Heben Sie die Arme beim Einatmen und senken Sie sie beim Ausatmen.'] }),
    MV('hum', 'breath', 'rest', 3, { en: ['Hum a note', 'Breathe in, then hum softly as you breathe out.'], fr: ['Fredonnez une note', 'Inspirez, puis fredonnez doucement en expirant.'], de: ['Einen Ton summen', 'Atmen Sie ein und summen Sie beim Ausatmen leise.'] }),
    MV('lift', 'breath', 'rest', 4, { en: ['Shoulders and breath', 'Lift your shoulders as you breathe in, let them drop as you breathe out.'], fr: ['Les épaules et le souffle', 'Montez les épaules en inspirant, laissez-les descendre en expirant.'], de: ['Schultern und Atem', 'Ziehen Sie beim Einatmen die Schultern hoch und lassen Sie sie beim Ausatmen sinken.'] }),
    MV('count', 'breath', 'rest', 4, { en: ['Count with your breath', 'Breathe in while counting to three, then breathe out slowly.'], fr: ['Comptez en respirant', 'Inspirez en comptant jusqu’à trois, puis expirez lentement.'], de: ['Mit dem Atem zählen', 'Atmen Sie ein und zählen Sie dabei bis drei, dann atmen Sie langsam aus.'] }),
    MV('balloon', 'breath', 'rest', 3, { en: ['Fill a balloon', 'Breathe in deeply, as if filling a balloon, then let the air out slowly.'], fr: ['Gonflez un ballon', 'Inspirez profondément, comme pour gonfler un ballon, puis laissez l’air sortir lentement.'], de: ['Einen Ballon füllen', 'Atmen Sie tief ein, als ob Sie einen Ballon füllen, und lassen Sie die Luft langsam hinaus.'] }),
    MV('sigh', 'breath', 'rest', 3, { en: ['A happy sigh', 'Breathe in, then let out a big, happy sigh.'], fr: ['Un grand soupir heureux', 'Inspirez, puis laissez sortir un grand soupir heureux.'], de: ['Ein fröhlicher Seufzer', 'Atmen Sie ein und lassen Sie einen großen, fröhlichen Seufzer hinaus.'] })
  ];

  /* ---------- bank 5: the welcome line (orientation: the season and the month) ---------- */
  function W(key, when, t) { return { id: 'w-' + key, when: when, t: t }; }
  var WELCOME = [
    W('sp1', 'spring', { en: 'In spring, the first flowers are coming out.', fr: 'Au printemps, les premières fleurs sortent.', de: 'Im Frühling kommen die ersten Blumen heraus.' }),
    W('sp2', 'spring', { en: 'Spring is the season of birdsong.', fr: 'Le printemps est la saison du chant des oiseaux.', de: 'Der Frühling ist die Zeit des Vogelgesangs.' }),
    W('sp3', 'spring', { en: 'In spring, the days are getting longer and lighter.', fr: 'Au printemps, les jours deviennent plus longs et plus clairs.', de: 'Im Frühling werden die Tage länger und heller.' }),
    W('sp4', 'spring', { en: 'In spring, the trees are covered in fresh green leaves.', fr: 'Au printemps, les arbres se couvrent de jeunes feuilles vertes.', de: 'Im Frühling tragen die Bäume frisches grünes Laub.' }),
    W('sp5', 'spring', { en: 'Spring is a lovely time to open the window.', fr: 'Le printemps est un beau moment pour ouvrir la fenêtre.', de: 'Der Frühling ist eine schöne Zeit, das Fenster zu öffnen.' }),
    W('su1', 'summer', { en: 'In summer, the days are long and bright.', fr: 'En été, les journées sont longues et lumineuses.', de: 'Im Sommer sind die Tage lang und hell.' }),
    W('su2', 'summer', { en: 'Summer is the season of strawberries and ice cream.', fr: 'L’été est la saison des fraises et des glaces.', de: 'Der Sommer ist die Zeit der Erdbeeren und des Eises.' }),
    W('su3', 'summer', { en: 'In summer, it is nice to sit in the shade.', fr: 'En été, il fait bon s’asseoir à l’ombre.', de: 'Im Sommer sitzt man gern im Schatten.' }),
    W('su4', 'summer', { en: 'In summer, a cool drink is very welcome.', fr: 'En été, une boisson fraîche fait du bien.', de: 'Im Sommer tut ein kühles Getränk gut.' }),
    W('su5', 'summer', { en: 'Summer evenings are warm and gentle.', fr: 'Les soirées d’été sont douces.', de: 'Sommerabende sind warm und mild.' }),
    W('au1', 'autumn', { en: 'In autumn, the leaves turn golden and red.', fr: 'En automne, les feuilles deviennent dorées et rouges.', de: 'Im Herbst werden die Blätter golden und rot.' }),
    W('au2', 'autumn', { en: 'Autumn is the season of apples and chestnuts.', fr: 'L’automne est la saison des pommes et des châtaignes.', de: 'Der Herbst ist die Zeit der Äpfel und Kastanien.' }),
    W('au3', 'autumn', { en: 'In autumn, a warm drink feels very good.', fr: 'En automne, une boisson chaude fait du bien.', de: 'Im Herbst tut ein warmes Getränk gut.' }),
    W('au4', 'autumn', { en: 'Autumn evenings are good for a cosy blanket.', fr: 'Les soirées d’automne sont faites pour une couverture douillette.', de: 'Herbstabende sind wie gemacht für eine kuschelige Decke.' }),
    W('au5', 'autumn', { en: 'In autumn, the trees put on their brightest colours.', fr: 'En automne, les arbres prennent leurs plus belles couleurs.', de: 'Im Herbst zeigen die Bäume ihre schönsten Farben.' }),
    W('wi1', 'winter', { en: 'In winter, a warm scarf and a hot drink feel good.', fr: 'En hiver, une écharpe chaude et une boisson chaude font du bien.', de: 'Im Winter tun ein warmer Schal und ein heißes Getränk gut.' }),
    W('wi2', 'winter', { en: 'Winter is the season of cosy evenings.', fr: 'L’hiver est la saison des soirées douillettes.', de: 'Der Winter ist die Zeit der gemütlichen Abende.' }),
    W('wi3', 'winter', { en: 'In winter, the birds love a little food at the window.', fr: 'En hiver, les oiseaux aiment trouver un peu de nourriture à la fenêtre.', de: 'Im Winter freuen sich die Vögel über etwas Futter am Fenster.' }),
    W('wi4', 'winter', { en: 'In winter, it is lovely to be warm inside.', fr: 'En hiver, il fait bon être au chaud à l’intérieur.', de: 'Im Winter ist es schön, drinnen im Warmen zu sein.' }),
    W('wi5', 'winter', { en: 'Winter is a good time for soup and warm socks.', fr: 'L’hiver est un bon moment pour la soupe et les chaussettes chaudes.', de: 'Der Winter ist eine gute Zeit für Suppe und warme Socken.' }),
    W('m1', 1, { en: 'January is the start of a new year.', fr: 'Janvier est le début d’une nouvelle année.', de: 'Der Januar ist der Anfang eines neuen Jahres.' }),
    W('m2', 2, { en: 'In February, the first snowdrops appear.', fr: 'En février, les premiers perce-neige apparaissent.', de: 'Im Februar zeigen sich die ersten Schneeglöckchen.' }),
    W('m3', 3, { en: 'In March, the first buds appear on the trees.', fr: 'En mars, les premiers bourgeons apparaissent sur les arbres.', de: 'Im März zeigen sich die ersten Knospen an den Bäumen.' }),
    W('m4', 4, { en: 'April weather changes quickly: sunshine, then a little rain.', fr: 'En avril, le temps change vite : du soleil, puis un peu de pluie.', de: 'Im April wechselt das Wetter schnell: Sonne, dann ein wenig Regen.' }),
    W('m5', 5, { en: 'In May, everything is in bloom.', fr: 'En mai, tout est en fleurs.', de: 'Im Mai blüht alles.' }),
    W('m6', 6, { en: 'June has the longest days of the year.', fr: 'Juin a les jours les plus longs de l’année.', de: 'Im Juni sind die Tage am längsten.' }),
    W('m7', 7, { en: 'July is often the warmest month of the year.', fr: 'Juillet est souvent le mois le plus chaud de l’année.', de: 'Der Juli ist oft der wärmste Monat des Jahres.' }),
    W('m8', 8, { en: 'In August, the fields are golden.', fr: 'En août, les champs sont dorés.', de: 'Im August sind die Felder golden.' }),
    W('m9', 9, { en: 'In September, the apples are ripe.', fr: 'En septembre, les pommes sont mûres.', de: 'Im September sind die Äpfel reif.' }),
    W('m10', 10, { en: 'In October, the forest turns red and gold.', fr: 'En octobre, la forêt devient rouge et dorée.', de: 'Im Oktober färbt sich der Wald rot und golden.' }),
    W('m11', 11, { en: 'November is a good month for soup and a warm blanket.', fr: 'Novembre est un bon mois pour la soupe et une couverture chaude.', de: 'Der November ist ein guter Monat für Suppe und eine warme Decke.' }),
    W('m12', 12, { en: 'In December, the evenings are bright with little lights.', fr: 'En décembre, les soirées brillent de petites lumières.', de: 'Im Dezember leuchten abends viele kleine Lichter.' })
  ];
  var GREET = {
    en: { morning: 'Good morning!', morningN: 'Good morning, {name}!', afternoon: 'Good afternoon!', afternoonN: 'Good afternoon, {name}!', evening: 'Good evening!', eveningN: 'Good evening, {name}!',
      today: 'Today is {date}.', time: 'It is {time}.', season: { spring: 'It is spring.', summer: 'It is summer.', autumn: 'It is autumn.', winter: 'It is winter.' },
      name: { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' } },
    fr: { morning: 'Bonjour !', morningN: 'Bonjour, {name} !', afternoon: 'Bon après-midi !', afternoonN: 'Bon après-midi, {name} !', evening: 'Bonsoir !', eveningN: 'Bonsoir, {name} !',
      today: 'Nous sommes le {date}.', time: 'Il est {time}.', season: { spring: 'C’est le printemps.', summer: 'C’est l’été.', autumn: 'C’est l’automne.', winter: 'C’est l’hiver.' },
      name: { spring: 'Printemps', summer: 'Été', autumn: 'Automne', winter: 'Hiver' } },
    de: { morning: 'Guten Morgen!', morningN: 'Guten Morgen, {name}!', afternoon: 'Guten Tag!', afternoonN: 'Guten Tag, {name}!', evening: 'Guten Abend!', eveningN: 'Guten Abend, {name}!',
      today: 'Heute ist {date}.', time: 'Es ist {time}.', season: { spring: 'Es ist Frühling.', summer: 'Es ist Sommer.', autumn: 'Es ist Herbst.', winter: 'Es ist Winter.' },
      name: { spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst', winter: 'Winter' } }
  };
  var BCP47 = { en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  /* The same season drawings as Hello & Today (js/activities.js), for the welcome card. */
  var SEASON_ART = {
    spring: '<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#E58FB0">' + [0, 72, 144, 216, 288].map(function (a) { return '<ellipse cx="50" cy="28" rx="13" ry="20" transform="rotate(' + a + ' 50 50)"/>'; }).join('') + '</g><circle cx="50" cy="50" r="12" fill="#F2C14E"/></svg>',
    summer: '<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#E8A21C" stroke-width="7" stroke-linecap="round">' + [0, 45, 90, 135, 180, 225, 270, 315].map(function (a) { return '<line x1="50" y1="8" x2="50" y2="20" transform="rotate(' + a + ' 50 50)"/>'; }).join('') + '</g><circle cx="50" cy="50" r="22" fill="#F2C14E"/></svg>',
    autumn: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 6 C60 26 80 28 88 40 C74 46 76 58 84 70 C68 68 60 74 54 88 L50 76 L46 88 C40 74 32 68 16 70 C24 58 26 46 12 40 C20 28 40 26 50 6 Z" fill="#D2691E"/><path d="M50 30 L50 96" stroke="#7A3B10" stroke-width="4" stroke-linecap="round"/></svg>',
    winter: '<svg viewBox="0 0 100 100" aria-hidden="true"><g stroke="#5BA4CF" stroke-width="6" stroke-linecap="round">' + [0, 60, 120].map(function (a) { return '<g transform="rotate(' + a + ' 50 50)"><line x1="50" y1="10" x2="50" y2="90"/><line x1="50" y1="24" x2="40" y2="15"/><line x1="50" y1="24" x2="60" y2="15"/><line x1="50" y1="76" x2="40" y2="85"/><line x1="50" y1="76" x2="60" y2="85"/></g>'; }).join('') + '</g></svg>'
  };

  /* ---------- the content of 1.15 (the fallback) ----------
     Used when a bank gives nothing (everything blocked, a broken bank…), so an activity always has
     something to show. The same texts as the defaults in js/activities.js. */
  var FALLBACK = {
    sayings: {
      en: ['A stitch in time saves|nine', 'Better late than|never', 'Actions speak louder than|words', 'The early bird catches the|worm', 'Many hands make light|work', 'Every cloud has a silver|lining'],
      fr: ['Mieux vaut tard que|jamais', 'Petit à petit, l’oiseau fait son|nid', 'Après la pluie, le beau|temps', 'Il n’y a pas de fumée sans|feu', 'L’habit ne fait pas le|moine', 'La nuit porte|conseil'],
      de: ['Morgenstund hat Gold im|Mund', 'Übung macht den|Meister', 'Besser spät als|nie', 'Der Apfel fällt nicht weit vom|Stamm', 'Reden ist Silber, Schweigen ist|Gold', 'Viele Köche verderben den|Brei']
    },
    quiz: ['brighter', 'neighbour', 'words', 'welcome', 'together'],
    memories: ['sea', 'mountain', 'forest'],
    move: ['one', 'both', 'cross', 'out', 'heels', 'shrug', 'twist', 'fist', 'belly']
  };

  /* ---------- what a saying is about (to match the life story) ---------- */
  var SAYING_WORDS = {
    garden: 'rose* flower* oak* acorn* tree trees seed* sow sows harvest moss garden* hay fleur* epine* jardin* arbre* mousse seme recolte* cultiver grain blume* baum baume saat ernte saen garten unkraut stamm',
    animals: 'dog dogs cat cats bird birds feather* horse* chicken* mice mouse lamb lion ox owl bee lark peacock snail goose gander leopard swallow worm bug clam chien* chat chats oiseau* cheval chevaux souris poule* mouton* agneau renard singe pinson gardon carpe mule boeuf boeufs tortue loir rossignol baleine cochons pie paon hirondelle lievre* chameau sardines merles grives rat lapin canard chevre loup coq ane mouche fourmi* taureau anguille poisson* hund hunde katze* vogel spatz taube gaul maus mause mausen wurm biene fuchs wiesel bar lamm fisch aal murmeltier schwein henne huhn esel pferde schwalbe eulen lowe made',
    food: 'egg eggs bread loaf cake broth pudding omelette milk honey sauce pie cucumber toast mustard pancake cherry chips stomach cooks cook eating oeuf* gateau miel lait beurre epinards poire pommes pain salades sel vin mangeant manger dine appetit tomate brot ei eier kuchen brei koch koche speck wurst honig butter magen essen tee klossbruhe rosinen',
    water: 'water sea fish boat river rain shower eau mer poisson ruisseaux rivieres pluie fontaine lac wasser meer fisch boot fluss regen tropfen',
    music: 'song sing tango music fiddle bell chanson chanter rossignol musique danse dansent musik ton lied singen steppt',
    home: 'home house houses castle maison maisons haus heim glashaus hause',
    work: 'work iron smith trade* forgeron forgeant fer metier travail ouvrier* arbeit handwerk schmied meister fleiss schuster zimmermann',
    travel: 'rome road roads journey mile miles step chemins voyager monture rom wege weg'
  };
  var SAYING_RE = {};
  Object.keys(SAYING_WORDS).forEach(function (t) {
    var alt = SAYING_WORDS[t].split(' ').map(function (w) { var star = /\*$/.test(w); w = norm(w.replace(/\*$/, '')).replace(/ /g, ''); return w + (star ? '[a-z0-9ß]*' : ''); });
    SAYING_RE[t] = new RegExp('(^| )(' + alt.join('|') + ')( |$)');
  });
  var TOPIC_TAG = { garden: 'garden', nature: 'garden', animals: 'animals', food: 'food', sea: 'water', music: 'music', crafts: 'work', town: 'home', travel: 'travel' };
  function sayingTags(text) { var t = ' ' + norm(text).replace(/ /g, '  ') + ' '; return Object.keys(SAYING_RE).filter(function (k) { return SAYING_RE[k].test(t); }); }
  var SIMILE = /^(as \S+ as|\S+ comme|\S+ wie|wie )/i;

  /* ---------- storage ----------
     { v, cfg: { remote, url, timeoutMs }, b: { 'code|lang|date': { kind: { sig, src, at, items } } },
       h: { code: { kind: { itemId: day number it was offered } } }, x: { code: { kind: { itemId: { at, label } } } } } */
  var memNewer = false;
  function blank() { return { v: 1, cfg: { remote: false, url: '', timeoutMs: 6000 }, b: {}, h: {}, x: {} }; }
  function load() {
    var d = null;
    var store = S();
    if (mem && (memNewer || !store)) d = clone(mem);
    else if (store) { try { d = JSON.parse(store.getItem(KEY) || 'null'); } catch (e) { d = mem ? clone(mem) : null; } }
    if (!d || typeof d !== 'object') d = blank();
    var z = blank();
    Object.keys(z).forEach(function (k) { if (!d[k] || typeof d[k] !== 'object') d[k] = z[k]; });
    return d;
  }
  function prune(d, today, hard) {
    Object.keys(d.b).forEach(function (bk) { if (bk.slice(-10) < today) delete d.b[bk]; });
    var keep = dateOf(today).day - (hard ? KEEP_DAYS / 4 : KEEP_DAYS);
    Object.keys(d.h).forEach(function (c) { Object.keys(d.h[c]).forEach(function (k) { var h = d.h[c][k]; Object.keys(h).forEach(function (id) { if (h[id] < keep) delete h[id]; }); }); });
  }
  /* The copy in memory is only kept when this device cannot save (then it is the day's batch). */
  function save(d, today) {
    var store = S();
    if (store) {
      try { store.setItem(KEY, JSON.stringify(d)); mem = null; memNewer = false; return true; }
      catch (e) {
        try { prune(d, today || dateOf().key, true); store.setItem(KEY, JSON.stringify(d)); mem = null; memNewer = false; return true; } catch (e2) { /* full or refused */ }
      }
    }
    mem = clone(d);
    memNewer = true;
    return false;
  }
  function slot(d, part, code, kind) { var p = d[part][code] = d[part][code] || {}; return p[kind] = p[kind] || {}; }
  function bkey(ctx) { return ctx.code + '|' + ctx.lang + '|' + ctx.key; }
  function fire() { try { if (typeof window !== 'undefined' && window.dispatchEvent && typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('bellatrix-daily')); } catch (e) { /* node tests */ } }

  /* ---------- what one call is about ---------- */
  function eraOf(born) { return Math.max(1940, Math.min(1980, Math.floor((born + 15) / 10) * 10)); }
  function context(kind, o) {
    o = o || {};
    var l = lang(o.lang), dt = dateOf(o.date), life = o.life && typeof o.life === 'object' ? o.life : {};
    var level = o.level === 'gentle' ? 'gentle' : 'usual';
    var born = parseInt(life.born, 10);
    if (!(born >= 1900 && born <= 2015)) born = 0;
    var home = clip(life.home, 40);
    if (home && !safe(home, l)) home = '';
    var avoid = words(life.avoid).map(norm).filter(Boolean);
    var loves = words(life.loves).filter(function (w) { return w.length <= 30 && safe(w, l); }).slice(0, 4).map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
    var own = (Array.isArray(o.own) ? o.own : []).map(function (s) {
      var st = clip(s && s.start, 120), en = clip(s && s.end, 40);
      return st && en && safe(st + ' ' + en, l) ? { id: 't-' + hid(l + '|' + st + '|' + en), start: st, end: en, why: 'team' } : null;
    }).filter(Boolean);
    var topics = topicsOf(life);
    var ctx = { kind: kind, lang: l, code: clip(o.code, 40) || '_', key: dt.key, day: dt.day, date: dt.date, season: seasonOf(dt.date), month: dt.date.getMonth() + 1,
      level: level, gentle: level === 'gentle', born: born, home: home, loves: loves, avoid: avoid, own: own, topics: topics, zone: o.zone || '' };
    ctx.peek = o.life === undefined && o.level === undefined && o.own === undefined;
    ctx.sig = hid(JSON.stringify([level, topics, born ? eraOf(born) : 0, born && born < 1936 ? 1 : 0, home, loves, avoid, own.map(function (x) { return x.id; })]));
    return ctx;
  }
  function count(kind, ctx) { return COUNT[kind][ctx.gentle ? 1 : 0]; }
  function total(kind, ctx) { return count(kind, ctx) * (kind === 'move' ? ZONES.length : 1); }

  /* ---------- the daily choice ----------
     Never offered first, then the longest ago; ties broken by the day's seed. So an item comes
     back only after every other one of the bank has had its turn (for sayings: about a month). */
  function pickNovel(list, k, ctx, opt) {
    opt = opt || {};
    var hist = ctx.hist, out = [], per = {};
    if (k <= 0) return out;
    var rows = list.filter(function (x) {
      return !ctx.blocked[x.id] && !ctx.taken[x.id] && (!opt.gap || hist[x.id] === undefined || ctx.day - hist[x.id] >= opt.gap);
    }).map(function (x) { return { x: x, last: hist[x.id] === undefined ? -1e9 : hist[x.id], r: ctx.rand() }; });
    rows.sort(function (a, b) { return a.last - b.last || a.r - b.r; });
    [true, false].forEach(function (strict) {
      rows.forEach(function (row) {
        if (out.length >= k || ctx.taken[row.x.id]) return;
        var g = opt.group ? opt.group(row.x) : '';
        if (strict && g && (per[g] || 0) >= (opt.max || 1)) return;
        per[g] = (per[g] || 0) + 1;
        ctx.taken[row.x.id] = 1;
        out.push(row.x);
      });
    });
    return out;
  }
  function why(w) { return function (x) { var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; }); y.why = w; return y; }; }

  /* ---------- sayings ---------- */
  var parsed = {};
  function sayingOf(l, line) {
    var tier = line.charAt(0) === '*' ? 1 : 2, p = line.replace(/^\*/, '').split('|');
    var start = str(p[0]).trim(), end = str(p[1]).trim();
    return { id: 's' + l + '-' + hid(start + '|' + end), start: start, end: end, tier: tier, tags: sayingTags(start + ' ' + end), simile: SIMILE.test(start) };
  }
  function sayingsBank(l) {
    if (!parsed[l]) parsed[l] = (SAYINGS[l] || []).map(function (line) { return sayingOf(l, line); }).filter(function (x) { return x.start && x.end && safe(x.start + ' ' + x.end, l); });
    return parsed[l];
  }
  /* Two other endings from the bank: the same kind of word where possible (German nouns capitalised
     like the answer, a vowel after a French l’ or d’, "a" or "an" in English), never one that
     could also be right. */
  /* Endings that would fit almost any saying ("good", "pas", "nicht"): never offered as a wrong one. */
  var LOOSE = {
    en: ' good well right done not it is you none nothing free again once best up out away all one ',
    fr: ' bien pas rien tout jamais deux trois soi faire point dit monde ',
    de: ' gut nicht nichts besser nie gern mit aus zu sein kann will oft an zwei drei '
  };
  function distractors(s, bank, ctx, n, taken) {
    var right = norm(s.end), elide = /[’']$/.test(s.start), upper = /^[A-ZÄÖÜ]/.test(s.end), inStart = ' ' + norm(s.start) + ' ', loose = LOOSE[ctx.lang] || '';
    var an = ctx.lang === 'en' && / an$/i.test(s.start), a = ctx.lang === 'en' && / a$/i.test(s.start);
    function other(b, all) {
      var e = norm(b.end);
      return e && e !== right && e.indexOf(right) < 0 && right.indexOf(e) < 0 && inStart.indexOf(' ' + e + ' ') < 0 && (all || (!taken[e] && loose.indexOf(' ' + e + ' ') < 0));
    }
    var pool = bank.filter(function (b) { return other(b); });
    /* A small list (the fallback): the other endings of the day may be used. */
    if (pool.length < n) pool = bank.filter(function (b) { return other(b, true); });
    var fit = pool.filter(function (b) {
      var vowel = /^[aeiouyhàâäéèêëîïôöœùûü]/i.test(b.end), ok = Math.abs(b.end.length - s.end.length) <= 6;
      if (elide) ok = ok && vowel;
      if (an) ok = ok && vowel;
      if (a) ok = ok && !vowel;
      if (ctx.lang === 'de') ok = ok && /^[A-ZÄÖÜ]/.test(b.end) === upper;
      return ok;
    });
    var out = [], seen = {};
    shuffle(fit.length >= n ? fit : pool, ctx.rand).forEach(function (b) { var e = norm(b.end); if (out.length < n && !seen[e]) { seen[e] = 1; out.push(b.end); } });
    return out;
  }
  function genSayings(ctx) {
    var bank = sayingsBank(ctx.lang), n = count('sayings', ctx), out = [];
    var pool = ctx.gentle ? bank.filter(function (b) { return b.tier === 1; }) : bank;
    if (pool.length < n * 4) pool = bank;
    if (ctx.own.length) out = out.concat(pickNovel(ctx.own, Math.min(2, n), ctx));
    var tags = ctx.topics.map(function (t) { return TOPIC_TAG[t]; }).filter(Boolean);
    if (tags.length) {
      out = out.concat(pickNovel(pool.filter(function (b) { return b.tags.some(function (t) { return tags.indexOf(t) >= 0; }); }), Math.min(2, n - out.length), ctx, { gap: LIFE_GAP }).map(why('life')));
    }
    /* At most two similes ("As busy as a bee") a day, three at the gentle level: they are the easiest. */
    out = out.concat(pickNovel(pool, n - out.length, ctx, { group: function (b) { return b.simile ? 'simile' : ''; }, max: ctx.gentle ? 3 : 2 }));
    return sayingItems(shuffle(out, ctx.rand), bank, ctx);
  }
  function sayingItems(list, bank, ctx) {
    var taken = {};
    list.forEach(function (s) { taken[norm(s.end)] = 1; });
    return list.map(function (s) {
      var wrong = (s.wrong || []).filter(function (w) { return norm(w) !== norm(s.end); }).slice(0, ctx.gentle ? 1 : 2);
      if (wrong.length < (ctx.gentle ? 1 : 2)) wrong = distractors(s, bank, ctx, ctx.gentle ? 1 : 2, taken);
      return { id: s.id, start: s.start, end: s.end, wrong: wrong, why: s.why || '' };
    });
  }

  /* ---------- the kindness quiz ---------- */
  function avoided(text, ctx) { var t = norm(text); return ctx.avoid.some(function (w) { return w.length > 2 && t.indexOf(w) >= 0; }); }
  function lifeFrames(ctx) {
    var l = ctx.lang, out = [];
    if (ctx.home) out.push({ id: 'q-home', q: QUIZ_LIFE.home.q, a: QUIZ_LIFE.home.a, r: QUIZ_LIFE.home.r });
    if (ctx.loves.length) out.push({ id: 'q-loves', q: QUIZ_LIFE.loves.q, first: ctx.loves.slice(0, 2), a: QUIZ_LIFE.loves.a, r: QUIZ_LIFE.loves.r });
    if (ctx.born) {
      var e = eraOf(ctx.born);
      out.push({ id: 'q-era-dance', q: QUIZ_ERA.dance.q, a: QUIZ_ERA.dance.a[e], r: QUIZ_ERA.dance.r });
      out.push({ id: 'q-era-singer', q: QUIZ_ERA.singer.q, a: QUIZ_ERA.singer.a[e], r: QUIZ_ERA.singer.r });
    }
    return out.filter(function (f) { return !!pick(f.a, l); });
  }
  function quizItem(f, ctx, fixed) {
    var l = ctx.lang, k = ctx.gentle ? 2 : 3;
    var pool = (pick(f.a, l) || []).filter(function (a) { return !avoided(a, ctx); });
    var a = fixed ? pool.slice(0, k) : (f.first || []).concat(shuffle(pool, ctx.rand)).filter(function (x, i, all) { return all.indexOf(x) === i; }).slice(0, k);
    if (f.first) a = shuffle(a, ctx.rand);
    function fill(s) { return str(s).replace(/\{home\}/g, ctx.home); }
    return { id: f.id, q: fill(pick(f.q, l)), a: a.map(fill), r: fill(pick(f.r, l)), why: f.why || '' };
  }
  function genQuiz(ctx) {
    var n = count('quiz', ctx), out = [];
    var frames = QUIZ.filter(function (f) { return !f.season || f.season === ctx.season; });
    var life = lifeFrames(ctx);
    if (life.length) out = out.concat(pickNovel(life, 1, ctx, { gap: 5 }).map(why('life')));
    /* A question about the season now and then (there are two per season). */
    out = out.concat(pickNovel(frames.filter(function (f) { return f.season; }), 1, ctx, { gap: 10 }));
    if (ctx.topics.length) {
      out = out.concat(pickNovel(frames.filter(function (f) { return !f.season && f.topics.some(function (t) { return ctx.topics.indexOf(t) >= 0; }); }), 1, ctx, { gap: 7 }).map(why('life')));
    }
    var rest = frames.filter(function (f) { return !f.season; });
    if (ctx.gentle) { var easy = rest.filter(function (f) { return f.s; }); if (easy.length >= n * 3) rest = easy; }
    /* The rest strictly in turn (longest ago first): every question waits for all the others. */
    out = out.concat(pickNovel(rest, n - out.length, ctx));
    return shuffle(out.slice(0, n), ctx.rand).map(function (f) { return quizItem(f, ctx); });
  }

  /* ---------- memories ---------- */
  function memItem(t, ctx) {
    var l = ctx.lang, k = ctx.gentle ? 2 : 3, r = ctx.rand, open, bits, q, out;
    function one(a) { return a[Math.floor(r() * a.length)]; }
    if (t.home) {
      open = pick(MEM_HOME.open, l).replace('{home}', ctx.home);
      bits = shuffle(pick(MEM_HOME.bits, l), r).slice(0, k);
      q = one(pick(MEM_HOME.qs, l)).replace('{home}', ctx.home);
      out = { id: t.id, topic: 'home', theme: 'town', card: 'town-market', scene: '', title: ctx.home, words: [norm(ctx.home)] };
    } else if (t.era) {
      open = pick(MEM_ERA.open, l).replace('{d}', t.era);
      bits = shuffle(MEM_ERA.bits[t.era][l], r).slice(0, k);
      q = one(pick(MEM_ERA.qs, l));
      out = { id: t.id, topic: 'era', theme: 'childhood', card: 'childhood-toys', scene: '', title: pick(MEM_ERA.title, l).replace('{d}', t.era), words: [String(t.era)] };
    } else {
      var m = t.m;
      open = one(m.opens[l] || m.opens.en);
      bits = shuffle(m.bits[l] || m.bits.en, r).slice(0, k);
      q = one(m.qs[l] || m.qs.en);
      out = { id: t.id, topic: m.topic, theme: m.theme, card: m.card, scene: m.scene, title: pick(m.title, l), words: m.words.slice() };
    }
    out.story = open + ' ' + PERHAPS[l] + listOr(bits, l) + '.';
    out.question = q;
    out.why = t.why || '';
    return out;
  }
  function genMemories(ctx) {
    var n = count('memories', ctx), out = [];
    var topics = MEMORIES.filter(function (m) { return !m.when.length || m.when.indexOf(ctx.season) >= 0; }).map(function (m) { return { id: 'm-' + m.topic, m: m }; });
    var life = [];
    if (ctx.home) life.push({ id: 'm-home', home: true });
    if (ctx.born) life.push({ id: 'm-era-' + eraOf(ctx.born), era: eraOf(ctx.born) });
    if (life.length) out = out.concat(pickNovel(life, 1, ctx, { gap: 4 }).map(why('life')));
    if (ctx.topics.length) {
      out = out.concat(pickNovel(topics.filter(function (t) { return t.m.tags.some(function (x) { return ctx.topics.indexOf(x) >= 0; }); }), 1, ctx, { gap: 7 }).map(why('life')));
    }
    out = out.concat(pickNovel(topics, n - out.length, ctx, { group: function (t) { return t.m.theme; }, max: 1 }));
    return out.slice(0, n).map(function (t) { return memItem(t, ctx); });
  }

  /* ---------- seated exercises and the welcome line ---------- */
  function moveItem(m, ctx) {
    var t = m.t[ctx.lang] || m.t.en, reps = m.reps;
    if (ctx.gentle) reps = Math.max(2, reps - 2);
    if (ctx.born && ctx.born < 1936) reps = Math.max(2, reps - 1);
    return { id: m.id, zone: m.zone, title: t[0], how: t[1], reps: reps, figure: m.figure };
  }
  function genMove(ctx) {
    var per = count('move', ctx), out = [];
    ZONES.forEach(function (z) { out = out.concat(pickNovel(MOVES.filter(function (m) { return m.zone === z; }), per, ctx)); });
    return out.map(function (m) { return moveItem(m, ctx); });
  }
  function genWelcome(ctx) {
    var pool = WELCOME.filter(function (w) { return w.when === ctx.season || w.when === ctx.month; });
    return pickNovel(pool, 1, ctx).map(function (w) { return { id: w.id, line: w.t[ctx.lang] || w.t.en, season: ctx.season }; });
  }
  var GEN = { sayings: genSayings, quiz: genQuiz, memories: genMemories, move: genMove, welcome: genWelcome };

  /* The 1.15 content, when a bank gives nothing. */
  function fallbackItems(kind, ctx) {
    var l = ctx.lang, ok = function (x) { return !ctx.blocked[x.id]; };
    if (kind === 'sayings') {
      var list = FALLBACK.sayings[l].map(function (line) { return sayingOf(l, line); });
      return sayingItems(list.filter(ok).slice(0, count(kind, ctx)), list, ctx);
    }
    if (kind === 'quiz') return QUIZ.filter(function (f) { return FALLBACK.quiz.indexOf(f.id.slice(2)) >= 0; }).filter(ok).map(function (f) { return quizItem(f, ctx, true); });
    if (kind === 'memories') return MEMORIES.filter(function (m) { return FALLBACK.memories.indexOf(m.topic) >= 0; }).map(function (m) { return { id: 'm-' + m.topic, m: m }; }).filter(ok).map(function (t) { return memItem(t, ctx); });
    if (kind === 'move') return MOVES.filter(function (m) { return FALLBACK.move.indexOf(m.id.slice(3)) >= 0; }).filter(ok).map(function (m) { return moveItem(m, ctx); });
    return WELCOME.filter(function (w) { return w.when === ctx.season; }).filter(ok).slice(0, 1).map(function (w) { return { id: w.id, line: w.t[l] || w.t.en, season: ctx.season }; });
  }
  /* French spacing on every text of an item. */
  function finish(items, ctx) {
    if (ctx.lang !== 'fr') return items;
    return items.map(function (it) {
      var y = {};
      Object.keys(it).forEach(function (k) { var v = it[k]; y[k] = typeof v === 'string' && k !== 'id' ? frSpace(v) : Array.isArray(v) && k !== 'words' ? v.map(function (x) { return typeof x === 'string' ? frSpace(x) : x; }) : v; });
      return y;
    });
  }
  function prepare(kind, ctx, d) {
    ctx.hist = slot(d, 'h', ctx.code, kind);
    ctx.blocked = slot(d, 'x', ctx.code, kind);
    ctx.taken = {};
    ctx.rand = rng(hash([ctx.code, kind, ctx.lang, ctx.key, ctx.sig].join('|')));
  }
  function generate(kind, ctx, d) {
    prepare(kind, ctx, d);
    var items = [];
    try { items = GEN[kind](ctx) || []; } catch (e) { items = []; }
    var src = 'local';
    if (!items.length) {
      ctx.taken = {};
      try { items = fallbackItems(kind, ctx); } catch (e) { items = []; }
      src = 'fallback';
    }
    items = finish(items.filter(function (x) { return !ctx.blocked[x.id] && safeAll(x, ctx.lang); }), ctx);
    return { items: items, src: src };
  }
  function record(d, ctx, kind, items) {
    var h = slot(d, 'h', ctx.code, kind);
    items.forEach(function (x) { h[x.id] = ctx.day; });
  }
  /* What leaves this file: copies, the memories with the drawing of their scene when js/art.js has it. */
  function wrap(items, meta, zone) {
    var a = clone(items || []);
    if (meta.kind === 'move' && zone) a = a.filter(function (x) { return x.zone === zone; });
    if (meta.kind === 'memories') {
      var A = typeof window !== 'undefined' ? window.ART : null;
      a.forEach(function (x) { if (x.scene && A && typeof A[x.scene] === 'string' && /^\s*<svg/.test(A[x.scene])) x.art = A[x.scene]; });
    }
    var out = a.slice();
    out.items = a;
    Object.keys(meta).forEach(function (k) { out[k] = meta[k]; });
    return out;
  }

  /* ---------- the API ---------- */
  function get(kind, o) {
    o = o || {};
    if (KINDS.indexOf(kind) < 0) return wrap([], { kind: kind, src: 'none' });
    var ctx, items = [], src = 'error';
    try {
      ctx = context(kind, o);
      var d = load(), bk = bkey(ctx), b = d.b[bk] && d.b[bk][kind];
      if (b && Array.isArray(b.items) && (ctx.peek || b.sig === ctx.sig)) { items = b.items; src = b.src; }
      else {
        var g = generate(kind, ctx, d);
        items = g.items; src = g.src;
        record(d, ctx, kind, items);
        d.b[bk] = d.b[bk] || {};
        d.b[bk][kind] = { sig: ctx.sig, src: src, at: new Date().toISOString(), items: items };
        prune(d, ctx.key);
        save(d, ctx.key);
      }
      var x = slot(d, 'x', ctx.code, kind);
      items = items.filter(function (it) { return !x[it.id]; });
      later(kind, o, ctx, d.cfg);
    } catch (e) { items = []; src = 'error'; }
    return wrap(items, { kind: kind, date: ctx ? ctx.key : '', lang: ctx ? ctx.lang : lang(o.lang), code: ctx ? ctx.code : '', src: src }, o.zone);
  }
  function peek(kind, o) {
    try {
      var ctx = context(kind, o), d = load(), b = d.b[bkey(ctx)] && d.b[bkey(ctx)][kind], x = slot(d, 'x', ctx.code, kind);
      return b ? wrap(b.items.filter(function (it) { return !x[it.id]; }), { kind: kind, date: ctx.key, lang: ctx.lang, code: ctx.code, src: b.src }, (o || {}).zone) : null;
    } catch (e) { return null; }
  }
  function textOf(kind, it) {
    if (!it) return '';
    if (kind === 'sayings') return it.start + (/[’'\-]$/.test(it.start) ? '' : ' ') + it.end;
    if (kind === 'quiz') return it.q;
    if (kind === 'welcome') return it.line;
    return it.title;
  }
  /* A blocked item's name in a language (the Care Team's), from the banks; '' when not there. */
  function label(kind, id, l) {
    l = lang(l);
    id = str(id);
    var hit = null;
    if (kind === 'sayings') {
      ['en', 'fr', 'de'].forEach(function (x) { sayingsBank(x).concat(FALLBACK.sayings[x].map(function (line) { return sayingOf(x, line); })).forEach(function (s) { if (!hit && s.id === id) hit = textOf(kind, s); }); });
    } else if (kind === 'quiz') {
      QUIZ.forEach(function (f) { if (f.id === id) hit = pick(f.q, l); });
      if (!hit && QUIZ_ERA[id.replace(/^q-era-/, '')]) hit = pick(QUIZ_ERA[id.replace(/^q-era-/, '')].q, l);
    } else if (kind === 'memories') {
      MEMORIES.forEach(function (m) { if ('m-' + m.topic === id) hit = pick(m.title, l); });
      if (!hit && /^m-era-\d{4}$/.test(id)) hit = pick(MEM_ERA.title, l).replace('{d}', id.slice(6));
    } else if (kind === 'move') {
      MOVES.forEach(function (m) { if (m.id === id) hit = (m.t[l] || m.t.en)[0]; });
    } else if (kind === 'welcome') {
      WELCOME.forEach(function (w) { if (w.id === id) hit = w.t[l] || w.t.en; });
    }
    return hit || '';
  }
  function memId(kind, id) { id = str(id); return kind === 'memories' && /^d-m-/.test(id) ? id.slice(2) : id; }
  function block(kind, id, code) {
    id = memId(kind, id);
    if (KINDS.indexOf(kind) < 0 || !id) return false;
    code = clip(code, 40) || '_';
    var d = load(), x = slot(d, 'x', code, kind), name = '';
    Object.keys(d.b).forEach(function (bk) {
      if (bk.indexOf(code + '|') !== 0 || !d.b[bk][kind]) return;
      var b = d.b[bk][kind];
      b.items.forEach(function (it) { if (it.id === id && !name) name = textOf(kind, it); });
      b.items = b.items.filter(function (it) { return it.id !== id; });
      if (!b.items.length) delete d.b[bk][kind];
    });
    x[id] = { at: new Date().toISOString(), label: clip(name || label(kind, id, 'en') || id, 160) };
    save(d);
    fire();
    return true;
  }
  function unblock(kind, id, code) {
    id = memId(kind, id);
    code = clip(code, 40) || '_';
    var d = load(), x = slot(d, 'x', code, kind);
    if (!x[id]) return false;
    delete x[id];
    save(d);
    fire();
    return true;
  }
  function blocked(kind, code) {
    var x = slot(load(), 'x', clip(code, 40) || '_', kind);
    return Object.keys(x).map(function (id) { return { id: id, label: x[id].label || id, at: x[id].at || '' }; }).sort(function (a, b) { return a.at < b.at ? 1 : -1; });
  }
  function isBlocked(kind, id, code) { return !!slot(load(), 'x', clip(code, 40) || '_', kind)[memId(kind, id)]; }

  /* ---------- the optional LabLand AI server (off by default) ----------
     POST { v, kind, lang, date, season, level, count, zones, topics, era, rules } to cfg.url: no name,
     no resident code, no free text from the life story. The answer { items: [...] } (the same item
     shapes as above) is checked like everything else (shape, length, nothing anxious, not blocked,
     not offered in the last 30 days), topped up by the local generator and stored as the batch of
     that day. A batch that exists is never replaced. Daily.get() stays synchronous: when the server
     is on, it asks in the background for TOMORROW's batch, so the server's content is ready the next
     day. Daily.prefetch(o) can also be called before a session (it fills the day only if empty). */
  function config() { try { return clone(load().cfg); } catch (e) { return blank().cfg; } }
  function setConfig(p) {
    p = p || {};
    var d = load();
    if (p.remote !== undefined) d.cfg.remote = !!p.remote;
    if (p.url !== undefined) { var u = str(p.url).trim(); d.cfg.url = /^https?:\/\/[^\s]+$/i.test(u) ? u.slice(0, 300) : ''; }
    if (p.timeoutMs !== undefined) d.cfg.timeoutMs = Math.max(1000, Math.min(20000, parseInt(p.timeoutMs, 10) || 6000));
    save(d);
    return clone(d.cfg);
  }
  function send(cfg, body) {
    if (typeof api._transport === 'function') return Promise.resolve().then(function () { return api._transport(cfg.url, body); });
    if (typeof fetch !== 'function') return Promise.reject(new Error('no network'));
    return new Promise(function (resolve, reject) {
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, cfg.timeoutMs || 6000);
      fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', signal: ctl ? ctl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) { clearTimeout(t); resolve(j); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  var NO_SCORE = /\b(wrong|incorrect|correct|right answer|faux|fausse|bonne reponse|mauvaise reponse|falsch|richtig)\b/;
  var THANKS = { en: 'Lovely choice. Thank you.', fr: 'Très joli choix. Merci.', de: 'Schöne Wahl. Danke.' };
  function validItem(kind, it, ctx) {
    if (!it || typeof it !== 'object') return null;
    function s(v, max) { v = clip(v, max + 1); return v && v.length <= max ? v : ''; }
    var x = null;
    if (kind === 'sayings') {
      var st = s(it.start, 100), en = s(it.end, 30);
      if (st && en) x = { start: st, end: en, wrong: (Array.isArray(it.wrong) ? it.wrong : []).map(function (w) { return s(w, 30); }).filter(Boolean).slice(0, 2) };
    } else if (kind === 'quiz') {
      var q = s(it.q, 140), a = (Array.isArray(it.a) ? it.a : []).map(function (w) { return s(w, 50); }).filter(Boolean).slice(0, ctx.gentle ? 2 : 3), r = s(it.r, 200);
      if (r && NO_SCORE.test(norm(r))) r = '';
      if (q && a.length >= 2 && !NO_SCORE.test(norm(q))) x = { q: q, a: a, r: r || THANKS[ctx.lang] };
    } else if (kind === 'memories') {
      var ti = s(it.title, 60), so = s(it.story, 600), qu = s(it.question, 140);
      var th = ['family', 'travel', 'childhood', 'work', 'animals', 'celebrations', 'town', 'nature'].indexOf(it.theme) >= 0 ? it.theme : 'nature';
      if (ti && so) x = { topic: 'remote', theme: th, card: '', scene: '', title: ti, story: so, question: qu, words: [] };
    } else if (kind === 'move') {
      var z = ZONES.indexOf(it.zone) >= 0 ? it.zone : '', mt = s(it.title, 60), how = s(it.how, 200);
      if (z && mt && how) x = { zone: z, title: mt, how: how, reps: Math.max(1, Math.min(10, parseInt(it.reps, 10) || 3)), figure: 'rest' };
    } else if (kind === 'welcome') {
      var line = s(it.line, 140);
      if (line) x = { line: line, season: ctx.season };
    }
    if (!x || !safeAll(x, ctx.lang)) return null;
    x.id = 'r-' + (str(it.id).replace(/[^\w-]/g, '').slice(0, 24) || hid(kind + JSON.stringify(x)));
    x.why = 'remote';
    return ctx.blocked[x.id] ? null : x;
  }
  function merge(kind, got, ctx, d) {
    var local = generate(kind, ctx, d).items, ids = {}, out;
    got.forEach(function (x) { ids[x.id] = 1; });
    if (kind === 'move') {
      out = [];
      ZONES.forEach(function (z) {
        var mine = got.filter(function (x) { return x.zone === z; }).slice(0, count(kind, ctx));
        out = out.concat(mine, local.filter(function (x) { return x.zone === z && !ids[x.id]; }).slice(0, count(kind, ctx) - mine.length));
      });
      return out;
    }
    out = got.slice(0, count(kind, ctx));
    out = out.concat(local.filter(function (x) { return !ids[x.id]; }).slice(0, count(kind, ctx) - out.length));
    if (kind === 'sayings') out = sayingItems(out, sayingsBank(ctx.lang), ctx);
    return finish(out, ctx);
  }
  function prefetch(o) {
    o = o || {};
    var cfg = config(), done = [];
    if (!cfg.remote || !cfg.url) return Promise.resolve({ src: 'off', kinds: [] });
    var kinds = (Array.isArray(o.kinds) ? o.kinds : KINDS).filter(function (k) { return KINDS.indexOf(k) >= 0; });
    var chain = Promise.resolve();
    kinds.forEach(function (kind) {
      chain = chain.then(function () {
        var ctx = context(kind, o), d = load(), bk = bkey(ctx);
        if (d.b[bk] && d.b[bk][kind]) return null;
        var body = { v: 1, kind: kind, lang: ctx.lang, date: ctx.key, season: ctx.season, level: ctx.level, count: total(kind, ctx), zones: kind === 'move' ? ZONES : undefined,
          topics: ctx.topics, era: ctx.born ? eraOf(ctx.born) : null, rules: 'kind and calm; no right or wrong answers; no grief, illness, politics, religion or fear' };
        return send(cfg, body).then(function (res) {
          var raw = res && (Array.isArray(res) ? res : res.items);
          if (!Array.isArray(raw) || !raw.length) return;
          var d2 = load();
          if (d2.b[bk] && d2.b[bk][kind]) return;
          var c2 = context(kind, o);
          prepare(kind, c2, d2);
          var seen = {}, got = [];
          raw.slice(0, 60).forEach(function (it) {
            var x = validItem(kind, it, c2);
            if (x && !seen[x.id] && !(c2.hist[x.id] !== undefined && c2.day - c2.hist[x.id] < 30)) { seen[x.id] = 1; got.push(x); }
          });
          if (!got.length) return;
          var items = merge(kind, got, c2, d2);
          record(d2, c2, kind, items);
          d2.b[bk] = d2.b[bk] || {};
          d2.b[bk][kind] = { sig: c2.sig, src: 'remote', at: new Date().toISOString(), items: items };
          prune(d2, c2.key);
          save(d2, c2.key);
          done.push(kind);
        }, function () { /* offline or server down: the local generator makes the batch when it is needed */ });
      });
    });
    return chain.then(function () { return { src: done.length ? 'remote' : 'local', kinds: done }; }, function () { return { src: 'local', kinds: done }; });
  }
  function later(kind, o, ctx, cfg) {
    cfg = cfg || {};
    if (!cfg.remote || !cfg.url || typeof setTimeout !== 'function') return;
    var next = dateOf(new Date(ctx.date.getTime() + 864e5)).key, k = ctx.code + '|' + ctx.lang + '|' + next + '|' + kind;
    if (asked[k]) return;
    asked[k] = 1;
    var p = {};
    Object.keys(o).forEach(function (x) { p[x] = o[x]; });
    p.date = next; p.kinds = [kind];
    setTimeout(function () { prefetch(p).then(null, function () {}); }, 0);
  }

  /* ---------- the welcome (Hello & Today, and the patient screen's waiting screen) ---------- */
  function welcome(o) {
    o = o || {};
    var l = lang(o.lang), now = o.now instanceof Date ? o.now : new Date(), G = GREET[l], loc = BCP47[l], s = seasonOf(now), h = now.getHours();
    var items = get('welcome', { lang: l, code: o.code, life: o.life || {}, date: now }), line = items[0] ? items[0].line : '';
    var name = clip(o.name, 40), part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
    function fmt(opt) { try { return now.toLocaleDateString(loc, opt); } catch (e) { return now.toDateString(); } }
    var date = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), time;
    try { time = now.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }); } catch (e) { time = pad(now.getHours()) + ':' + pad(now.getMinutes()); }
    var b = /^\s*(\d{1,2})\s*[.\/\-]\s*(\d{1,2})/.exec(str((o.life || {}).birthday));
    var greeting = name ? G[part + 'N'].replace('{name}', name) : G[part];
    var say = greeting + ' ' + G.today.replace('{date}', date) + ' ' + G.season[s] + ' ' + G.time.replace('{time}', time) + (line ? ' ' + line : '');
    function e(x) { return str(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var w = { greeting: greeting, say: say, line: line, weekday: fmt({ weekday: 'long' }), day: now.getDate(), monthYear: fmt({ month: 'long', year: 'numeric' }), date: date, time: time,
      season: s, seasonName: G.name[s], birthday: !!b && +b[1] === now.getDate() && +b[2] === now.getMonth() + 1 };
    if (l === 'fr') { w.greeting = frSpace(w.greeting); w.say = frSpace(w.say); }
    w.card = '<div class="today s-' + s + '"><span class="tdow">' + e(w.weekday) + '</span><span class="tday">' + w.day + '</span><span class="tmon">' + e(w.monthYear) + '</span>' +
      '<span class="tseason">' + SEASON_ART[s] + '<b>' + e(w.seasonName) + '</b></span><span class="ttime">' + e(w.time) + '</span></div>';
    return w;
  }

  var api = {
    KINDS: KINDS, ZONES: ZONES, KEY: KEY, EVENT: 'bellatrix-daily',
    get: get, peek: peek, block: block, unblock: unblock, blocked: blocked, isBlocked: isBlocked, label: label,
    welcome: welcome, season: function (d) { return seasonOf(d instanceof Date ? d : new Date()); },
    config: config, setConfig: setConfig, prefetch: prefetch,
    safe: function (text, l) { return safe(text, l); }, topics: topicsOf,
    size: function () {
      return { sayings: { en: sayingsBank('en').length, fr: sayingsBank('fr').length, de: sayingsBank('de').length }, quiz: QUIZ.length, memories: MEMORIES.length, move: MOVES.length, welcome: WELCOME.length };
    },
    /* For the node tests: another storage, a fake server, the banks. */
    _useStorage: function (s) { forced = s; mem = null; memNewer = false; asked = {}; parsed = {}; },
    _transport: null,
    _banks: { SAYINGS: SAYINGS, QUIZ: QUIZ, MEMORIES: MEMORIES, MOVES: MOVES, WELCOME: WELCOME, reset: function () { parsed = {}; } }
  };

  /* The Care Team labels of this file (Personalise fields of the activities, "ne plus proposer").
     Added only where the shared dictionary has no translation yet. */
  try {
    if (typeof I18N !== 'undefined' && I18N.add) {
      var T = {
        fr: { 'New every day': 'Nouveau chaque jour', 'No: only the list below': 'Non : seulement la liste ci-dessous', 'Difficulty': 'Difficulté', 'Usual': 'Habituelle', 'Easier': 'Plus facile',
          'After the welcome': 'Après l’accueil', 'Nothing: the day’s welcome only': 'Rien : seulement l’accueil du jour', 'A choice: today’s plan, a picture or music': 'Un choix : programme du jour, image ou musique',
          'Do not offer again': 'Ne plus proposer', 'Offer again': 'Proposer à nouveau', 'Removed: {n}': 'Retirés : {n}', 'Today’s content': 'Contenu du jour' },
        de: { 'New every day': 'Jeden Tag neu', 'No: only the list below': 'Nein: nur die Liste unten', 'Difficulty': 'Schwierigkeit', 'Usual': 'Normal', 'Easier': 'Leichter',
          'After the welcome': 'Nach der Begrüßung', 'Nothing: the day’s welcome only': 'Nichts: nur die Begrüßung des Tages', 'A choice: today’s plan, a picture or music': 'Eine Auswahl: Tagesplan, Bild oder Musik',
          'Do not offer again': 'Nicht mehr anbieten', 'Offer again': 'Wieder anbieten', 'Removed: {n}': 'Entfernt: {n}', 'Today’s content': 'Inhalt von heute' }
      };
      Object.keys(T).forEach(function (l) {
        var have = (I18N.dict && I18N.dict[l]) || {}, add = {};
        Object.keys(T[l]).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) add[k] = T[l][k]; });
        I18N.add(l, add);
      });
    }
  } catch (e) { /* no dictionary on this page */ }

  return api;
})();
