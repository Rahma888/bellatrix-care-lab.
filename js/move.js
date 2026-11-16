/* Seated Move Along, rebuilt (1.16, workstream E; it used to be activity 5 in js/activities.js).

   Short, safe movements for a resident sitting in a chair, for one part of the body:
   the legs, the upper body, the back, the arms and hands, the neck and shoulders, or breathing.
   - Bellatrix suggests today's part (it changes every day); the resident can choose another one,
     and the care team can fix it per patient (Care Team, personalise: "Body part").
   - The movements change every day: Daily.get('move', ...) from js/daily.js when it is there,
     otherwise (and to fill up) this file's own bank, in a new order every day.
   - Every screen: one title, one picture, at most three buttons, one short sentence from Bellatrix.
     "C'est fait" ("I did one") counts each repetition; the camera can count the arm movements
     instead when the care team allows it (Session tab, "Count the movements with the camera").
   - The pictures are drawn here (SVG) and move with CSS animations, so they work without internet.
   - Optional videos: only through YouTube's official embedded player (youtube-nocookie.com, never
     downloaded), only from official channels of health bodies and care associations, only in the
     resident's language. Every id was checked with YouTube oEmbed on VIDEO_CHECKED (public and
     embeddable); re-check with  node tests/move.test.mjs --online. Without internet, or when a
     video cannot play, the drawn movements take over.
   Texts: the movements carry their own { en, fr, de }; the screens' texts are added to I18N below. */
var MoveLab = (function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : this;

  /* ---------- the parts of the body ---------- */
  var ZONES = [
    { id: 'legs', staff: 'Legs', words: ['legs', 'leg', 'knees', 'feet', 'foot'],
      name: { en: 'Legs', fr: 'Jambes', de: 'Beine' },
      today: { en: 'Today: your legs', fr: 'Aujourd’hui : les jambes', de: 'Heute: die Beine' },
      say: { en: 'Let’s move the legs gently, only as far as feels good.', fr: 'Bougeons doucement les jambes, seulement tant que c’est agréable.', de: 'Bewegen wir sanft die Beine, nur so weit es angenehm ist.' } },
    { id: 'upper', staff: 'Upper body', words: ['upper body', 'upper', 'body', 'chest'],
      name: { en: 'Upper body', fr: 'Haut du corps', de: 'Oberkörper' },
      today: { en: 'Today: your upper body', fr: 'Aujourd’hui : le haut du corps', de: 'Heute: der Oberkörper' },
      say: { en: 'Let’s move the upper body gently, only as far as feels good.', fr: 'Bougeons doucement le haut du corps, seulement tant que c’est agréable.', de: 'Bewegen wir sanft den Oberkörper, nur so weit es angenehm ist.' } },
    { id: 'back', staff: 'Back and posture', words: ['back', 'spine', 'posture'],
      name: { en: 'Back', fr: 'Dos', de: 'Rücken' },
      today: { en: 'Today: your back', fr: 'Aujourd’hui : le dos', de: 'Heute: der Rücken' },
      say: { en: 'Let’s move the back gently, only as far as feels good.', fr: 'Bougeons doucement le dos, seulement tant que c’est agréable.', de: 'Bewegen wir sanft den Rücken, nur so weit es angenehm ist.' } },
    { id: 'arms', staff: 'Arms and hands', words: ['arms', 'hands', 'hand', 'fingers', 'wrists'],
      name: { en: 'Arms and hands', fr: 'Bras et mains', de: 'Arme und Hände' },
      today: { en: 'Today: your arms and hands', fr: 'Aujourd’hui : les bras et les mains', de: 'Heute: Arme und Hände' },
      say: { en: 'Let’s move the arms and hands gently, only as far as feels good.', fr: 'Bougeons doucement les bras et les mains, seulement tant que c’est agréable.', de: 'Bewegen wir sanft Arme und Hände, nur so weit es angenehm ist.' } },
    { id: 'neck', staff: 'Neck and shoulders', words: ['neck', 'shoulders', 'shoulder', 'head'],
      name: { en: 'Neck and shoulders', fr: 'Nuque et épaules', de: 'Nacken und Schultern' },
      today: { en: 'Today: your neck and shoulders', fr: 'Aujourd’hui : la nuque et les épaules', de: 'Heute: Nacken und Schultern' },
      say: { en: 'Let’s move the neck and shoulders gently, only as far as feels good.', fr: 'Bougeons doucement la nuque et les épaules, seulement tant que c’est agréable.', de: 'Bewegen wir sanft Nacken und Schultern, nur so weit es angenehm ist.' } },
    { id: 'breath', staff: 'Breathing', words: ['breathing', 'breathe', 'breath', 'relax'],
      name: { en: 'Breathing', fr: 'Respiration', de: 'Atmung' },
      today: { en: 'Today: calm breathing', fr: 'Aujourd’hui : respirer calmement', de: 'Heute: ruhig atmen' },
      say: { en: 'Let’s breathe calmly, at your own pace.', fr: 'Respirons calmement, à votre rythme.', de: 'Atmen wir ruhig, in Ihrem Tempo.' } }
  ];
  var ZONE_IDS = ZONES.map(function (z) { return z.id; });
  var ZONE = {};
  ZONES.forEach(function (z) { ZONE[z.id] = z; });

  /* ---------- the movements ----------
     fig: which drawing (front, side, hand); anim: how it moves (ANIMS below); pose: a movement the
     camera can count (js/core.js POSE_TEST: one, both, cross, out). One sentence each, very simple. */
  function ex(id, zone, fig, anim, pose, title, how) { return { id: id, zone: zone, fig: fig, anim: anim, pose: pose || null, title: title, how: how }; }
  var BANK = [
    ex('leg-knee', 'legs', 'side', 'knee', null, { en: 'Lift one knee', fr: 'Lever un genou', de: 'Ein Knie heben' },
      { en: 'Lift one knee a little, then put your foot down.', fr: 'Levez un peu un genou, puis reposez le pied.', de: 'Heben Sie ein Knie ein wenig an und stellen Sie den Fuß wieder ab.' }),
    ex('leg-stretch', 'legs', 'side', 'kick', null, { en: 'Stretch one leg', fr: 'Tendre une jambe', de: 'Ein Bein strecken' },
      { en: 'Stretch one leg out in front, then bend it again.', fr: 'Tendez une jambe devant vous, puis repliez-la.', de: 'Strecken Sie ein Bein nach vorn und beugen Sie es wieder.' }),
    ex('leg-toes', 'legs', 'side', 'toes', null, { en: 'Toes and heels', fr: 'Pointes et talons', de: 'Zehen und Fersen' },
      { en: 'Lift your toes, then lift your heels.', fr: 'Levez la pointe des pieds, puis les talons.', de: 'Heben Sie die Zehen, dann die Fersen.' }),
    ex('leg-ankle', 'legs', 'side', 'ankle', null, { en: 'Circle your foot', fr: 'Tourner le pied', de: 'Den Fuß kreisen' },
      { en: 'Lift one foot a little and turn it in small circles.', fr: 'Levez un peu un pied et faites de petits cercles.', de: 'Heben Sie einen Fuß leicht an und kreisen Sie ihn langsam.' }),
    ex('leg-march', 'legs', 'side', 'march', null, { en: 'March sitting down', fr: 'Marcher assis', de: 'Im Sitzen gehen' },
      { en: 'Lift your feet one after the other, as if walking.', fr: 'Levez les pieds l’un après l’autre, comme pour marcher.', de: 'Heben Sie die Füße abwechselnd, wie beim Gehen.' }),
    ex('leg-squeeze', 'legs', 'front', 'squeeze', null, { en: 'Knees together', fr: 'Serrer les genoux', de: 'Knie zusammen' },
      { en: 'Press your knees together, then relax.', fr: 'Serrez les genoux l’un contre l’autre, puis relâchez.', de: 'Drücken Sie die Knie zusammen und lassen Sie dann locker.' }),

    ex('up-both', 'upper', 'front', 'both', 'both', { en: 'Raise both arms', fr: 'Lever les deux bras', de: 'Beide Arme heben' },
      { en: 'Slowly raise both arms, then lower them.', fr: 'Levez lentement les deux bras, puis baissez-les.', de: 'Heben Sie langsam beide Arme und senken Sie sie wieder.' }),
    ex('up-one', 'upper', 'front', 'one', 'one', { en: 'Raise one arm', fr: 'Lever un bras', de: 'Einen Arm heben' },
      { en: 'Slowly raise one arm, then lower it.', fr: 'Levez lentement un bras, puis baissez-le.', de: 'Heben Sie langsam einen Arm und senken Sie ihn wieder.' }),
    ex('up-out', 'upper', 'front', 'out', 'out', { en: 'Open your arms', fr: 'Ouvrir les bras', de: 'Die Arme öffnen' },
      { en: 'Open your arms wide to the sides, then let them rest.', fr: 'Ouvrez grand les bras sur les côtés, puis reposez-les.', de: 'Öffnen Sie die Arme weit zur Seite und legen Sie sie wieder ab.' }),
    ex('up-cross', 'upper', 'front', 'cross', 'cross', { en: 'Touch the other shoulder', fr: 'Toucher l’autre épaule', de: 'Die andere Schulter berühren' },
      { en: 'Touch your other shoulder, then let your hand rest.', fr: 'Touchez l’autre épaule, puis reposez la main.', de: 'Berühren Sie die andere Schulter und legen Sie die Hand wieder ab.' }),
    ex('up-push', 'upper', 'side', 'push', null, { en: 'Push forward', fr: 'Pousser devant soi', de: 'Nach vorn schieben' },
      { en: 'Push your hands forward, then bring them back.', fr: 'Poussez les mains devant vous, puis ramenez-les.', de: 'Schieben Sie die Hände nach vorn und holen Sie sie zurück.' }),

    ex('back-tall', 'back', 'side', 'tall', null, { en: 'Sit up tall', fr: 'Se grandir', de: 'Aufrecht sitzen' },
      { en: 'Sit up tall, then relax your back.', fr: 'Grandissez-vous, puis relâchez le dos.', de: 'Richten Sie sich auf und entspannen Sie dann den Rücken.' }),
    ex('back-turn', 'back', 'front', 'twist', null, { en: 'Turn gently', fr: 'Tourner doucement', de: 'Sanft drehen' },
      { en: 'Turn your shoulders gently to one side, then the other.', fr: 'Tournez doucement les épaules d’un côté, puis de l’autre.', de: 'Drehen Sie die Schultern sanft zur einen Seite, dann zur anderen.' }),
    ex('back-lean', 'back', 'side', 'lean', null, { en: 'Lean forward a little', fr: 'Se pencher un peu', de: 'Leicht nach vorn beugen' },
      { en: 'Lean forward a little, then sit back up slowly.', fr: 'Penchez-vous un peu en avant, puis redressez-vous lentement.', de: 'Beugen Sie sich leicht nach vorn und richten Sie sich langsam wieder auf.' }),
    ex('back-side', 'back', 'front', 'sidebend', null, { en: 'Lean to the side', fr: 'Se pencher sur le côté', de: 'Zur Seite neigen' },
      { en: 'Lean a little to one side, then come back to the middle.', fr: 'Penchez-vous un peu sur le côté, puis revenez au centre.', de: 'Neigen Sie sich leicht zur Seite und kommen Sie zurück zur Mitte.' }),
    ex('back-round', 'back', 'side', 'round', null, { en: 'Round and straighten', fr: 'Arrondir et redresser', de: 'Rund machen und aufrichten' },
      { en: 'Round your back gently, then sit up tall.', fr: 'Arrondissez doucement le dos, puis redressez-vous.', de: 'Machen Sie den Rücken sanft rund und richten Sie sich wieder auf.' }),

    ex('hand-fist', 'arms', 'hand', 'fist', null, { en: 'Open and close your hands', fr: 'Ouvrir et fermer les mains', de: 'Hände öffnen und schließen' },
      { en: 'Open your hands wide, then make a soft fist.', fr: 'Ouvrez grand les mains, puis fermez-les doucement.', de: 'Öffnen Sie die Hände weit und machen Sie dann sanft eine Faust.' }),
    ex('hand-wrist', 'arms', 'hand', 'wrist', null, { en: 'Circle your wrists', fr: 'Tourner les poignets', de: 'Die Handgelenke kreisen' },
      { en: 'Turn your wrists slowly in small circles.', fr: 'Tournez lentement les poignets en petits cercles.', de: 'Kreisen Sie langsam die Handgelenke.' }),
    ex('hand-thumb', 'arms', 'hand', 'thumb', null, { en: 'Thumb to fingers', fr: 'Le pouce et les doigts', de: 'Daumen zu den Fingern' },
      { en: 'Touch each finger with your thumb, one after the other.', fr: 'Touchez chaque doigt avec le pouce, l’un après l’autre.', de: 'Berühren Sie mit dem Daumen nacheinander jeden Finger.' }),
    ex('hand-clap', 'arms', 'hand', 'clap', null, { en: 'Clap your hands', fr: 'Taper dans les mains', de: 'In die Hände klatschen' },
      { en: 'Clap your hands gently.', fr: 'Tapez doucement dans vos mains.', de: 'Klatschen Sie sanft in die Hände.' }),
    ex('arm-curl', 'arms', 'side', 'curl', null, { en: 'Bend your elbows', fr: 'Plier les coudes', de: 'Die Ellbogen beugen' },
      { en: 'Bend your elbows to bring your hands up, then lower them.', fr: 'Pliez les coudes pour monter les mains, puis baissez-les.', de: 'Beugen Sie die Ellbogen, heben Sie die Hände und senken Sie sie wieder.' }),
    ex('arm-one', 'arms', 'front', 'one', 'one', { en: 'Raise one hand', fr: 'Lever une main', de: 'Eine Hand heben' },
      { en: 'Slowly raise one hand, then lower it again.', fr: 'Levez lentement une main, puis baissez-la.', de: 'Heben Sie langsam eine Hand und senken Sie sie wieder.' }),

    ex('neck-shrug', 'neck', 'front', 'shrug', null, { en: 'Shrug your shoulders', fr: 'Hausser les épaules', de: 'Schultern hochziehen' },
      { en: 'Lift your shoulders up, then let them drop.', fr: 'Montez les épaules, puis laissez-les retomber.', de: 'Ziehen Sie die Schultern hoch und lassen Sie sie fallen.' }),
    ex('neck-roll', 'neck', 'front', 'roll', null, { en: 'Roll your shoulders', fr: 'Rouler les épaules', de: 'Schultern kreisen' },
      { en: 'Roll your shoulders slowly backwards.', fr: 'Faites rouler lentement les épaules vers l’arrière.', de: 'Kreisen Sie die Schultern langsam nach hinten.' }),
    ex('neck-turn', 'neck', 'front', 'turn', null, { en: 'Turn your head', fr: 'Tourner la tête', de: 'Den Kopf drehen' },
      { en: 'Turn your head slowly to one side, then the other.', fr: 'Tournez lentement la tête d’un côté, puis de l’autre.', de: 'Drehen Sie den Kopf langsam zur einen Seite, dann zur anderen.' }),
    ex('neck-nod', 'neck', 'front', 'nod', null, { en: 'Nod gently', fr: 'Hocher la tête', de: 'Sanft nicken' },
      { en: 'Nod your head slowly, as if saying yes.', fr: 'Hochez lentement la tête, comme pour dire oui.', de: 'Nicken Sie langsam, als würden Sie Ja sagen.' }),
    ex('neck-tilt', 'neck', 'front', 'tilt', null, { en: 'Ear towards the shoulder', fr: 'L’oreille vers l’épaule', de: 'Ohr zur Schulter' },
      { en: 'Tilt your head gently towards one shoulder, then the other.', fr: 'Penchez doucement la tête vers une épaule, puis vers l’autre.', de: 'Neigen Sie den Kopf sanft zu einer Schulter, dann zur anderen.' }),

    ex('br-calm', 'breath', 'front', 'breathe', null, { en: 'Breathe in, breathe out', fr: 'Inspirer, expirer', de: 'Einatmen, ausatmen' },
      { en: 'Breathe in through your nose, then out slowly through your mouth.', fr: 'Inspirez par le nez, puis soufflez lentement par la bouche.', de: 'Atmen Sie durch die Nase ein und langsam durch den Mund aus.' }),
    ex('br-belly', 'breath', 'front', 'belly', null, { en: 'Hands on your belly', fr: 'Les mains sur le ventre', de: 'Hände auf den Bauch' },
      { en: 'Put your hands on your belly and feel it rise as you breathe in.', fr: 'Posez les mains sur le ventre et sentez-le se lever quand vous inspirez.', de: 'Legen Sie die Hände auf den Bauch und spüren Sie, wie er sich beim Einatmen hebt.' }),
    ex('br-arms', 'breath', 'front', 'breatharms', 'both', { en: 'Arms up with the breath', fr: 'Les bras avec le souffle', de: 'Arme mit dem Atem' },
      { en: 'Raise your arms as you breathe in, lower them as you breathe out.', fr: 'Levez les bras en inspirant, baissez-les en expirant.', de: 'Heben Sie die Arme beim Einatmen und senken Sie sie beim Ausatmen.' }),
    ex('br-candle', 'breath', 'front', 'candle', null, { en: 'Blow out a candle', fr: 'Souffler une bougie', de: 'Eine Kerze auspusten' },
      { en: 'Breathe in, then blow out slowly, as if on a candle.', fr: 'Inspirez, puis soufflez lentement, comme sur une bougie.', de: 'Atmen Sie ein und pusten Sie langsam aus, wie bei einer Kerze.' }),
    ex('br-flower', 'breath', 'front', 'flower', null, { en: 'Smell a flower', fr: 'Sentir une fleur', de: 'An einer Blume riechen' },
      { en: 'Breathe in slowly, as if smelling a flower.', fr: 'Inspirez lentement, comme pour sentir une fleur.', de: 'Atmen Sie langsam ein, als würden Sie an einer Blume riechen.' })
  ];
  var BY_ID = {};
  BANK.forEach(function (x) { BY_ID[x.id] = x; });

  /* ---------- official videos (YouTube's embedded player only) ----------
     channel = YouTube's author_name, as oEmbed gives it (the check compares them). zones: the parts
     of the body the video works on. min: its length in minutes. All are done sitting on a chair
     (title or description says so); LabLand watches each one once before the pilot. */
  var VIDEO_CHECKED = '2026-11-10';
  function vid(id, lang, zones, channel, title, min) { return { id: id, lang: lang, zones: zones, channel: channel, title: title, min: min }; }
  var VIDEOS = [
    vid('O-c8roij4Zg', 'en', ['legs'], 'Homerton Healthcare NHS Foundation Trust', '2  Chair Based Leg Strengthening Exercises', 3.6),
    vid('vbXJGR4zd4o', 'en', ['legs', 'upper'], 'West Suffolk NHS Foundation Trust', '10 minute seated exercise', 10.3),
    vid('KaiPi324Y-A', 'en', ['back', 'upper'], 'Leicestershire Partnership NHS Trust', 'Seated Physio Led Pilates exercises', 8.3),
    vid('sNxyYCaQbFw', 'en', ['arms'], 'Arthritis UK', 'Tailored stretching: Finger, hand and wrist exercises (for arthritis and joint pain)', 10.7),
    vid('mIxCSJNbfhU', 'en', ['arms'], 'North Bristol NHS Trust', 'Hand Exercises 1', 1),
    vid('VHrDSjlg6NE', 'en', ['arms'], 'NHS 24', 'Thumb and finger touch for hand osteoarthritis', 1),
    vid('w51vrWJs2zA', 'en', ['neck'], 'North Bristol NHS Trust', 'Neck Exercises', 3.1),
    vid('GqfrbGtorBE', 'en', ['breath'], 'Coventry and Warwickshire Partnership NHS Trust', 'NHS Videos - Relaxation - Breathing Techniques', 2.2),

    vid('uUixohW9iPA', 'fr', ['legs', 'upper'], 'Siel Bleu', '15min | Gym sur chaise pour les aînés  - Séance 1 | Activité Physique Adaptée | Catherine', 14.5),
    vid('G5AkJFfR5Sg', 'fr', ['legs'], 'Siel Bleu', '6min | Échauffement assis sur chaise | Activité Physique | Charlène', 6.5),
    vid('U1U-vDdZ40g', 'fr', ['legs', 'arms'], 'Siel Bleu', '8 min | Séance de Gym Douce très adaptée ! | Activité Physique Adaptée | Emilie', 8.3),
    vid('2H7ZdsGlqxM', 'fr', ['upper', 'arms'], 'GymSana asbl/vzw - Siel Bleu Belgique', '5min | Frottements haut du corps | Gym douce et assise | Activité Physique Adaptée | David | S1J1', 5.8),
    vid('ykqZ2hwqfDo', 'fr', ['upper', 'neck'], 'GymSana asbl/vzw - Siel Bleu Belgique', '6 min | Mobilisation de la tête aux pieds | Gym douce et assise | Bénédicte | S9J39', 5.9),
    vid('sA7ILBDS4dM', 'fr', ['back', 'neck'], 'Siel Bleu', 'Mobilisation pour prévenir les douleurs autour du cou, des épaules et du dos | Siel Bleu au Travail', 3.1),
    vid('ab7pgc0NdAA', 'fr', ['arms'], 'Siel Bleu', 'Mobilisation pour prévenir les douleurs aux poignets | Siel Bleu au Travail', 1.3),
    vid('rW0xjj7cX1M', 'fr', ['breath'], 'Siel Bleu', '11 min | Respirons ! Séance 3  : Cohérence Cardiaque | Respiration | Céline', 10.9),
    vid('1mJ9QzocA8M', 'fr', ['breath'], 'GymSana asbl/vzw - Siel Bleu Belgique', '5min | Mobilisation-Respiration | Gym douce et assise | Activité Physique Adaptée | Nicolas | S5J19', 11.2),

    vid('wSNzu7db0Gg', 'de', ['legs'], 'Stiftung Pfennigparade', 'Bleib fit - Mach mit! - Übungen für die Beine im Sitzen', 6.8),
    vid('99yZa7hhp0k', 'de', ['legs'], 'Deutsche Rentenversicherung Bund - Ihre Reha', '39. Übung: Mobilisation und Kräftigung der Knie im Sitz', 0.6),
    vid('7Gr9_4qJEUU', 'de', ['upper', 'back'], 'Stiftung Pfennigparade', 'Bleib fit - Mach mit! - Übungen für den Rumpf im Sitzen', 9.3),
    vid('kC6KDj4aCYo', 'de', ['upper', 'arms'], 'AOK - Der Gesundheitskanal', 'Armjogging | Sitzgymnastik & Arm-Workout ohne Geräte für zuhause | AOK', 0.7),
    vid('AgSYYVQclP8', 'de', ['back'], 'Deutsche Rentenversicherung Bund - Ihre Reha', '46. Übung: Dehnungen der Rückenmuskulatur im Sitz', 1.4),
    vid('w_mqJ9I417k', 'de', ['back'], 'BARMER', 'Yoga im sitzen //  Chair Yoga Lesson mit UrbanYogaism // 12 Min', 13.7),
    vid('0pVB3Ov7vEo', 'de', ['arms'], 'Stiftung Pfennigparade', 'Bleib fit - macht mit! Übungen für die Hand - für Menschen mit und ohne Behinderung', 10.1),
    vid('2EiDukPN92U', 'de', ['neck'], 'Stiftung Pfennigparade', 'Bleib fit - macht mit! Starker Nacken, keine Schmerzen - für Menschen mit und ohne Behinderung', 10.3),
    vid('9ySJdK5azNg', 'de', ['neck'], 'Deutsche Rentenversicherung Bund - Ihre Reha', '34. Übung: Dehnübungen der hinteren Schultergürtelmuskulatur (Übungen im Sitz oder Stand)', 1.2),
    vid('jUTEJMGIROc', 'de', ['breath'], 'Deutsche Rentenversicherung Bund - Ihre Reha', '54. Übung: Atemübungen im Sitz zur Zwerchfell und Brustkorbmobilisation', 1.6)
  ];

  /* ---------- the day, and a repeatable "random" order per day and patient ---------- */
  function pick(lang, v) { if (v && typeof v === 'object') return v[lang] !== undefined ? v[lang] : v.en; return v == null ? '' : String(v); }
  function dayIndex(d) { d = d || new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function hash(s) { s = String(s); var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffled(list, seed) { var a = list.slice(), r = rng(seed); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

  /* Today's part of the body: a different one every day (the patient code shifts the cycle). */
  function zoneOfDay(date, code) { return ZONE_IDS[(dayIndex(date) + hash(code || '')) % ZONE_IDS.length]; }

  /* The bank's movements for this part, in today's order: the first n are a new set every day.
     Every set of n movements of this part comes once per cycle, in an order of its own per patient,
     so two days running never have the same set (unless the part has only n movements); the rest
     follow, to fill up. */
  function sets(list, n) {
    var out = [];
    (function walk(from, acc) {
      if (acc.length === n) { out.push(acc); return; }
      for (var i = from; i < list.length; i++) walk(i + 1, acc.concat([list[i]]));
    })(0, []);
    return out;
  }
  function bankFor(zone, date, code, n) {
    var list = BANK.filter(function (x) { return x.zone === zone; });
    n = Math.max(1, Math.min(n || 3, list.length));
    var day = dayIndex(date), all = shuffled(sets(list, n), hash(zone + '|' + (code || '')));
    var today = shuffled(all[((day % all.length) + all.length) % all.length], hash(zone + '|' + (code || '') + '|' + day));
    return today.concat(shuffled(list.filter(function (x) { return today.indexOf(x) < 0; }), day));
  }

  /* What js/daily.js (agent D) hands over for 'move': an array (also as .items) of movements
     { id: 'mv-…', zone, title, how, reps, figure } in the patient's language; also accepted: this
     file's bank ids ('leg-knee') and texts as { en, fr, de }. Anything that is not clearly seated and
     gentle is left out, and two movements with the same drawing are not both taken: the bank fills
     the gaps. The repetitions are always the team's (Care Team, personalise). */
  var UNSAFE = /\b(stand|standing|stand up|jump\w*|run|running|lie down|lying|weights?|dumbbells?|debout|sauter|saut|courir|allong\w*|poids|halt[eè]res?)\b|\b(aufsteh|steh|spring|lauf|liegen|hantel|gewicht)/i;
  var POSES = { one: 1, both: 1, cross: 1, out: 1 };
  /* js/daily.js (1.16) names its movements 'mv-<key>' with the zones legs, upper, back, hands, breath
     and a `figure` of js/art.js: here each one gets the part of the body of this activity (its neck
     movements go to "Neck and shoulders", hands to "Arms and hands"), the drawing that moves like it
     and the movement the camera can count. Unknown ones: by their zone and figure. */
  var DAILY_AS = {
    heels: ['legs', 'toes'], toes: ['legs', 'toes'], march: ['legs', 'march'], knee: ['legs', 'kick'], ankles: ['legs', 'ankle'], slide: ['legs', 'kick'],
    knees: ['legs', 'squeeze'], tap: ['legs', 'toes'], press: ['legs', 'toes'], point: ['legs', 'kick'], heeltoe: ['legs', 'kick'], swing: ['legs', 'kick'],
    one: ['upper', 'one', 'one'], both: ['upper', 'both', 'both'], out: ['upper', 'out', 'out'], cross: ['upper', 'cross', 'cross'], push: ['upper', 'push'],
    apple: ['upper', 'one', 'one'], hug: ['upper', 'cross', 'cross'], row: ['upper', 'push'], reach: ['upper', 'push'],
    shrug: ['neck', 'shrug'], rolls: ['neck', 'roll'], look: ['neck', 'turn'], nod: ['neck', 'nod'], tilt: ['neck', 'tilt'],
    tall: ['back', 'tall'], twist: ['back', 'twist'], lean: ['back', 'sidebend'], forward: ['back', 'lean'], blades: ['back', 'tall'], round: ['back', 'round'],
    clap: ['arms', 'clap'], elbows: ['arms', 'curl'], fist: ['arms', 'fist'], fingers: ['arms', 'thumb'], wrists: ['arms', 'wrist'], spread: ['arms', 'fist'],
    piano: ['arms', 'thumb'], wave: ['arms', 'wrist'], squeeze: ['arms', 'fist'], rub: ['arms', 'clap'], thumbs: ['arms', 'wrist'], shake: ['arms', 'wrist'],
    belly: ['breath', 'belly'], flower: ['breath', 'flower'], armsup: ['breath', 'breatharms', 'both'], hum: ['breath', 'breathe'], lift: ['breath', 'breathe'],
    count: ['breath', 'breathe'], balloon: ['breath', 'breathe'], sigh: ['breath', 'breathe']
  };
  var DAILY_ZONE = { legs: 'legs', upper: 'upper', back: 'back', hands: 'arms', arms: 'arms', neck: 'neck', breath: 'breath' };
  function fromDaily(x) {
    if (!x) return null;
    if (typeof x === 'string') return BY_ID[x] || null;
    if (x.id && BY_ID[x.id] && !x.how) return BY_ID[x.id];
    if (!x.title || !x.how) return null;
    var key = String(x.id || '').replace(/^mv-/, ''), as = DAILY_AS[key] || null;
    var zone = as ? as[0] : DAILY_ZONE[x.zone];
    if (!zone) return null;
    var texts = [x.title, x.how].map(function (t) { return typeof t === 'object' ? [t.en, t.fr, t.de].join(' ') : String(t); }).join(' ');
    if (UNSAFE.test(texts)) return null;
    var how = typeof x.how === 'object' ? x.how.en || '' : String(x.how);
    if (how.length > 140) return null;
    var fig = x.anim || x.figure, base = BANK.filter(function (b) { return b.zone === zone; })[0];
    var anim = as ? as[1] : ANIMS[fig] ? fig : base.anim;
    var pose = as ? as[2] || null : POSES[x.pose] ? x.pose : POSES[x.figure] && anim === x.figure ? x.figure : null;
    var reps = parseInt(x.reps, 10);
    return { id: 'daily-' + String(x.id || hash(texts)), zone: zone, fig: ANIMS[anim].fig, anim: anim, pose: pose,
      reps: reps >= 1 && reps <= 10 ? reps : null, title: x.title, how: x.how, daily: true, dailyId: x.id || '' };
  }
  function dailyBatch(o) {
    var D = W.Daily;
    if (!D || typeof D.get !== 'function') return null;
    try {
      var q = { lang: o.lang, code: o.code, life: o.life || {} };
      if (o.level) q.level = o.level;
      if (o.date) q.date = o.date;
      var b = D.get('move', q);
      if (!b || typeof b.then === 'function') return null;
      return Array.isArray(b) ? b : Array.isArray(b.items) ? b.items : Array.isArray(b.exercises) ? b.exercises : null;
    } catch (e) { return null; }
  }
  /* The movements of this session: today's batch from Daily for this part first, then the bank. */
  function plan(zone, o) {
    o = o || {};
    var n = Math.max(1, Math.min(5, o.count || 3)), out = [], seen = {}, source = 'bank';
    var batch = o.daily !== undefined ? o.daily : dailyBatch(o);
    var drawn = {};
    (batch || []).map(fromDaily).forEach(function (x) {
      if (x && x.zone === zone && !seen[x.id] && !drawn[x.anim] && out.length < n) { seen[x.id] = 1; drawn[x.anim] = 1; out.push(x); source = 'daily'; }
    });
    /* The bank fills up (today's set first), without a movement Daily already gave (the same drawing). */
    var rest = bankFor(zone, o.date, o.code, n);
    rest.filter(function (x) { return !drawn[x.anim]; }).concat(rest).forEach(function (x) { if (!seen[x.id] && out.length < n) { seen[x.id] = 1; out.push(x); } });
    if (source === 'daily' && out.some(function (x) { return !x.daily; })) source = 'daily+bank';
    return { zone: zone, items: out, source: source };
  }
  /* Today's video for this part in the patient's language, or null (no video in another language). */
  function videoFor(zone, lang, date) {
    var list = VIDEOS.filter(function (v) { return v.lang === lang && v.zones.indexOf(zone) >= 0; });
    return list.length ? list[dayIndex(date) % list.length] : null;
  }

  /* ---------- the drawings ----------
     Front: the resident seen from the front (like a mirror); side: seen from the side, facing right;
     hand: one big hand (two for clapping). Parts that move are groups (class mvp-…) turned around a
     joint by the CSS below. Colours as js/art.js; the background follows the theme (--hero). */
  var INK = '#3F7D6B', LEG = '#5E6B78', DARK = '#333333', CHAIR = '#D9C2A0', SEAT = '#A47E54', HOT = '#E8841A', SKIN = '#F0C9A0', SOFT = '#CFE5CC';
  function g(cls, inner) { return '<g class="mvp mvp-' + cls + '">' + inner + '</g>'; }
  function line(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>'; }
  function arrows(list) {
    return (list || []).map(function (d) {
      var two = d.charAt(0) === '!';
      return '<path class="mvarrow" d="' + (two ? d.slice(1) : d) + '" stroke="' + HOT + '" stroke-width="8" fill="none" stroke-dasharray="16 12" stroke-linecap="round" marker-end="url(#mvArr)"' + (two ? ' marker-start="url(#mvArr)"' : '') + '/>';
    }).join('');
  }
  var DEFS = '<defs><marker id="mvArr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="' + HOT + '"/></marker></defs>';
  function frame(cls, body) {
    return '<svg class="mvfig ' + cls + '" viewBox="0 0 400 400" aria-hidden="true" focusable="false">' + DEFS +
      '<rect class="mvbg" width="400" height="400" fill="#F7F7F7"/>' + body + '</svg>';
  }
  function front(a) {
    var belly = a === 'belly';
    var armR = belly ? ['152,138', '146,196', '188,214'] : ['152,138', '140,198', '172,240'];
    var armL = belly ? ['248,138', '254,196', '212,214'] : ['248,138', '260,198', '228,240'];
    function arm(side, p) {
      var s = p[0].split(','), e = p[1].split(','), h = p[2].split(',');
      return g('arm' + side, line(s[0], s[1], e[0], e[1]) + g('fore' + side, line(e[0], e[1], h[0], h[1])));
    }
    var halo = /breathe|belly|breatharms|candle|flower/.test(a) ? '<circle class="mvp mvp-halo" cx="200" cy="150" r="118" fill="' + SOFT + '" fill-opacity=".28"/>' : '';
    var extra = '';
    if (a === 'candle') extra = '<rect x="318" y="262" width="20" height="74" rx="5" fill="#FFFFFF" stroke="' + DARK + '" stroke-width="5"/>' +
      '<g class="mvp mvp-flame"><path d="M328 258 C316 244 320 230 328 214 C336 230 340 244 328 258 Z" fill="#F59E0B"/></g>';
    if (a === 'flower') extra = '<path d="M300 300 C290 240 270 190 246 150" stroke="#3F8F4F" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      [0, 72, 144, 216, 288].map(function (r) { return '<ellipse cx="246" cy="134" rx="11" ry="18" fill="#E58FB0" transform="rotate(' + r + ' 246 148)"/>'; }).join('') + '<circle cx="246" cy="148" r="9" fill="#F2C14E"/>';
    return halo +
      '<rect x="138" y="96" width="124" height="160" rx="18" fill="' + CHAIR + '"/>' +
      '<rect x="120" y="244" width="160" height="30" rx="12" fill="' + SEAT + '"/>' +
      '<rect x="130" y="272" width="16" height="104" rx="6" fill="' + SEAT + '"/><rect x="254" y="272" width="16" height="104" rx="6" fill="' + SEAT + '"/>' +
      '<g class="mvink" stroke="' + INK + '" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
        g('legs', g('legR', '<polyline points="182,250 176,308 176,372"/>') + g('legL', '<polyline points="218,250 224,308 224,372"/>')) +
        g('torso',
          line(200, 118, 200, 244) +
          (belly ? '<ellipse class="mvp mvp-belly" cx="200" cy="214" rx="30" ry="20" fill="' + SOFT + '" stroke="none"/>' : '') +
          g('head', line(200, 120, 200, 104) + '<circle cx="200" cy="78" r="34" fill="' + SKIN + '" stroke="none"/>' +
            g('face', '<circle cx="187" cy="73" r="5" fill="' + DARK + '" stroke="none"/><circle cx="213" cy="73" r="5" fill="' + DARK + '" stroke="none"/>' +
              '<path d="M189 91 Q200 99 211 91" stroke="' + DARK + '" stroke-width="4"/>')) +
          g('shoulders', line(152, 138, 248, 138) + arm('R', armR) + arm('L', armL))) +
      '</g>' + extra;
  }
  function side(a) {
    function leg(n, color) {
      return '<g class="mvink" stroke="' + color + '" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
        g('thigh' + n, line(150, 252, 248, 252) + g('shin' + n, line(248, 252, 252, 350) + g('heel' + n, g('toe' + n, line(252, 350, 292, 354))))) + '</g>';
    }
    return '<rect x="96" y="120" width="22" height="150" rx="8" fill="' + CHAIR + '"/>' +
      '<rect x="96" y="258" width="170" height="22" rx="8" fill="' + SEAT + '"/>' +
      '<rect x="104" y="278" width="14" height="96" rx="5" fill="' + SEAT + '"/><rect x="240" y="278" width="14" height="96" rx="5" fill="' + SEAT + '"/>' +
      (a === 'march' ? leg(2, '#8793A0') : '') + leg('', LEG) +
      '<g class="mvink" stroke="' + INK + '" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" fill="none">' +
        g('torsoS', line(150, 252, 158, 136) +
          g('headS', line(160, 130, 162, 120) + '<circle cx="168" cy="94" r="30" fill="' + SKIN + '" stroke="none"/><circle cx="184" cy="90" r="4.5" fill="' + DARK + '" stroke="none"/>') +
          g('armS', line(158, 146, 166, 206) + g('foreS', line(166, 206, 214, 236)))) +
      '</g>';
  }
  function hand(a) {
    function one(cls, tx, s) {
      var fingers = [[146, 108], [176, 92], [206, 96], [236, 116]].map(function (f, i) {
        return g('fing mvp-fing' + i, '<rect x="' + f[0] + '" y="' + f[1] + '" width="28" height="' + (206 - f[1]) + '" rx="14"/>');
      }).join('');
      /* scaled around (200, 300), then moved sideways */
      return '<g transform="translate(' + (tx + 200 * (1 - s)) + ' ' + (300 * (1 - s)) + ') scale(' + s + ')"><g class="mvp mvp-' + cls + '">' +
        '<g fill="' + SKIN + '" stroke="' + DARK + '" stroke-width="8" stroke-linejoin="round">' +
        '<rect x="168" y="300" width="70" height="96" rx="16"/>' + fingers +
        g('thumb', '<rect x="96" y="214" width="28" height="86" rx="14" transform="rotate(-38 124 290)"/>') +
        '<rect x="140" y="186" width="126" height="130" rx="44"/></g></g></g>';
    }
    if (a === 'clap') return one('handA', -86, 0.62) + one('handB', 86, 0.62);
    return one('hand', 0, 1);
  }

  /* How each movement moves: the drawing, the length of one cycle (s), the joints (x y in the
     drawing) and the key frames of each part (percent: transform), and the dashed arrows. hold: the
     moment shown still when the screen asks for less motion (fraction of a cycle). */
  var UP = [0, 40, 60, 100];
  function to(vals) { return UP.map(function (p, i) { return [p, vals[i]]; }); }
  function rot(deg) { return to(['rotate(0deg)', 'rotate(' + deg + 'deg)', 'rotate(' + deg + 'deg)', 'rotate(0deg)']); }
  function both(deg) { return [[0, 'rotate(0deg)'], [25, 'rotate(' + deg + 'deg)'], [50, 'rotate(0deg)'], [75, 'rotate(' + (-deg) + 'deg)'], [100, 'rotate(0deg)']]; }
  var ANIMS = {
    one: { fig: 'front', d: 4, parts: { armL: ['248px 138px', rot(-160)], foreL: ['260px 198px', rot(-48)] }, arrows: ['M322 210 Q356 120 304 40'] },
    both: { fig: 'front', d: 4, parts: { armL: ['248px 138px', rot(-160)], foreL: ['260px 198px', rot(-48)], armR: ['152px 138px', rot(160)], foreR: ['140px 198px', rot(48)] },
      arrows: ['M322 210 Q356 120 304 40', 'M78 210 Q44 120 96 40'] },
    out: { fig: 'front', d: 4, parts: { armL: ['248px 138px', rot(-79)], foreL: ['260px 198px', rot(-48)], armR: ['152px 138px', rot(79)], foreR: ['140px 198px', rot(48)] },
      arrows: ['M262 224 Q330 222 356 170', 'M138 224 Q70 222 44 170'] },
    cross: { fig: 'front', d: 4, parts: { armL: ['248px 138px', rot(55)], foreL: ['260px 198px', rot(42)] }, arrows: ['M276 262 Q250 200 190 168'] },
    squeeze: { fig: 'front', d: 3, parts: { legR: ['182px 250px', rot(-7)], legL: ['218px 250px', rot(7)] }, arrows: ['M118 330 L150 330', 'M282 330 L250 330'] },
    shrug: { fig: 'front', d: 3, parts: { shoulders: ['200px 138px', to(['translateY(0px)', 'translateY(-18px)', 'translateY(-18px)', 'translateY(0px)'])] },
      arrows: ['M316 176 L316 116', 'M84 176 L84 116'] },
    roll: { fig: 'front', d: 4, parts: { shoulders: ['200px 138px', [[0, 'translate(0px,0px)'], [25, 'translate(0px,-16px)'], [50, 'translate(0px,-8px) scaleX(.93)'], [75, 'translate(0px,4px) scaleX(.96)'], [100, 'translate(0px,0px)']]] },
      arrows: ['M300 180 Q338 140 304 104'] },
    turn: { fig: 'front', d: 8, hold: 0.25, parts: { face: ['200px 78px', [[0, 'translateX(0px)'], [25, 'translateX(-14px)'], [50, 'translateX(0px)'], [75, 'translateX(14px)'], [100, 'translateX(0px)']]] },
      arrows: ['!M140 26 Q200 4 260 26'] },
    nod: { fig: 'front', d: 3, parts: { face: ['200px 78px', to(['translateY(0px)', 'translateY(9px)', 'translateY(9px)', 'translateY(0px)'])], head: ['200px 118px', rot(4)] },
      arrows: ['M262 40 Q284 76 262 112'] },
    tilt: { fig: 'front', d: 8, hold: 0.25, parts: { head: ['200px 118px', both(-16)] }, arrows: ['M146 34 Q122 70 140 108', 'M254 34 Q278 70 260 108'] },
    twist: { fig: 'front', d: 6, hold: 0.25, parts: { shoulders: ['200px 138px', [[0, 'scaleX(1)'], [25, 'scaleX(.74) translateX(10px)'], [50, 'scaleX(1)'], [75, 'scaleX(.74) translateX(-10px)'], [100, 'scaleX(1)']]],
      face: ['200px 78px', [[0, 'translateX(0px)'], [25, 'translateX(-8px)'], [50, 'translateX(0px)'], [75, 'translateX(8px)'], [100, 'translateX(0px)']]] }, arrows: ['!M112 112 Q200 84 288 112'] },
    sidebend: { fig: 'front', d: 8, hold: 0.25, parts: { torso: ['200px 250px', both(-10)] }, arrows: ['M106 110 Q84 160 104 210', 'M294 110 Q316 160 296 210'] },
    breathe: { fig: 'front', d: 8, parts: { halo: ['200px 150px', [[0, 'scale(.72)'], [50, 'scale(1.06)'], [100, 'scale(.72)']]], shoulders: ['200px 138px', [[0, 'translateY(0px)'], [50, 'translateY(-5px)'], [100, 'translateY(0px)']]] } },
    flower: { fig: 'front', d: 8, parts: { halo: ['200px 150px', [[0, 'scale(.72)'], [50, 'scale(1.06)'], [100, 'scale(.72)']]] } },
    belly: { fig: 'front', d: 8, parts: { halo: ['200px 150px', [[0, 'scale(.72)'], [50, 'scale(1.06)'], [100, 'scale(.72)']]], belly: ['200px 214px', [[0, 'scale(1)'], [50, 'scale(1.38)'], [100, 'scale(1)']]] } },
    breatharms: { fig: 'front', d: 8, parts: { halo: ['200px 150px', [[0, 'scale(.72)'], [50, 'scale(1.06)'], [100, 'scale(.72)']]],
      armL: ['248px 138px', [[0, 'rotate(0deg)'], [50, 'rotate(-160deg)'], [100, 'rotate(0deg)']]], foreL: ['260px 198px', [[0, 'rotate(0deg)'], [50, 'rotate(-48deg)'], [100, 'rotate(0deg)']]],
      armR: ['152px 138px', [[0, 'rotate(0deg)'], [50, 'rotate(160deg)'], [100, 'rotate(0deg)']]], foreR: ['140px 198px', [[0, 'rotate(0deg)'], [50, 'rotate(48deg)'], [100, 'rotate(0deg)']]] },
      arrows: ['M322 210 Q356 120 304 40', 'M78 210 Q44 120 96 40'] },
    candle: { fig: 'front', d: 6, hold: 0.7, parts: { halo: ['200px 150px', [[0, 'scale(.72)'], [40, 'scale(1.06)'], [100, 'scale(.72)']]],
      flame: ['328px 258px', [[0, 'rotate(0deg) scaleY(1)'], [40, 'rotate(0deg) scaleY(1)'], [55, 'rotate(28deg) scaleY(.8)'], [85, 'rotate(34deg) scaleY(.7)'], [100, 'rotate(0deg) scaleY(1)']]] } },

    knee: { fig: 'side', d: 4, parts: { thigh: ['150px 252px', rot(-22)] }, arrows: ['M300 262 Q318 218 296 186'] },
    kick: { fig: 'side', d: 4, parts: { shin: ['248px 252px', rot(-70)] }, arrows: ['M292 372 Q342 336 352 278'] },
    toes: { fig: 'side', d: 4, hold: 0.25, parts: { heel: ['252px 352px', [[0, 'rotate(0deg)'], [25, 'rotate(-22deg)'], [50, 'rotate(0deg)'], [100, 'rotate(0deg)']]],
      toe: ['292px 354px', [[0, 'rotate(0deg)'], [50, 'rotate(0deg)'], [75, 'rotate(16deg)'], [100, 'rotate(0deg)']]] }, arrows: ['M318 344 Q334 320 322 298'] },
    ankle: { fig: 'side', d: 4, hold: 0.25, parts: { heel: ['252px 350px', [[0, 'rotate(0deg)'], [25, 'rotate(-16deg)'], [50, 'rotate(0deg)'], [75, 'rotate(14deg)'], [100, 'rotate(0deg)']]] },
      arrows: ['M316 314 A 34 34 0 1 1 312 388'] },
    march: { fig: 'side', d: 4, hold: 0.25, parts: { thigh: ['150px 252px', [[0, 'rotate(0deg)'], [25, 'rotate(-20deg)'], [50, 'rotate(0deg)'], [100, 'rotate(0deg)']]],
      thigh2: ['150px 252px', [[0, 'rotate(0deg)'], [50, 'rotate(0deg)'], [75, 'rotate(-20deg)'], [100, 'rotate(0deg)']]] }, arrows: ['M300 262 Q318 218 296 186'] },
    lean: { fig: 'side', d: 5, parts: { torsoS: ['150px 252px', rot(15)] }, arrows: ['M200 54 Q262 70 280 124'] },
    tall: { fig: 'side', d: 5, parts: { torsoS: ['150px 252px', to(['rotate(7deg)', 'rotate(-2deg) translateY(-6px)', 'rotate(-2deg) translateY(-6px)', 'rotate(7deg)'])] }, arrows: ['M226 120 L226 52'] },
    round: { fig: 'side', d: 5, parts: { torsoS: ['150px 252px', rot(10)], headS: ['162px 124px', rot(20)] }, arrows: ['M214 60 Q262 86 262 140'] },
    push: { fig: 'side', d: 4, parts: { armS: ['158px 146px', rot(-62)], foreS: ['166px 206px', rot(50)] }, arrows: ['M236 196 L336 176'] },
    curl: { fig: 'side', d: 4, parts: { foreS: ['166px 206px', rot(-95)] }, arrows: ['M248 238 Q268 184 222 152'] },

    fist: { fig: 'hand', d: 3, parts: { fing: ['0px 206px', to(['scaleY(1)', 'scaleY(.34)', 'scaleY(.34)', 'scaleY(1)'])], thumb: ['124px 290px', rot(34)] }, arrows: ['M318 110 Q350 170 318 236'] },
    wrist: { fig: 'hand', d: 4, hold: 0.25, parts: { hand: ['203px 330px', both(-18)] }, arrows: ['!M108 96 Q204 34 300 96'] },
    thumb: { fig: 'hand', d: 2.6, parts: { thumb: ['124px 290px', to(['rotate(0deg)', 'rotate(46deg)', 'rotate(46deg)', 'rotate(0deg)'])] }, arrows: ['M70 250 Q76 180 128 150'] },
    clap: { fig: 'hand', d: 1.6, parts: { handA: ['200px 300px', to(['translateX(0px)', 'translateX(58px)', 'translateX(58px)', 'translateX(0px)'])],
      handB: ['200px 300px', to(['translateX(0px)', 'translateX(-58px)', 'translateX(-58px)', 'translateX(0px)'])] }, arrows: ['M150 70 L190 70', 'M250 70 L210 70'] }
  };
  function figure(item, zoneHot) {
    var a = ANIMS[item.anim] ? item.anim : 'breathe', spec = ANIMS[a];
    var body = spec.fig === 'side' ? side(a) : spec.fig === 'hand' ? hand(a) : front(a);
    return frame('mv-' + spec.fig + ' mv-a-' + a + (zoneHot ? ' mv-z-' + zoneHot : ' mv-run'), body + (zoneHot ? '' : arrows(spec.arrows)));
  }
  /* The small picture of a part of the body on a choice: the figure with that part coloured. */
  function zoneIcon(zone) { return figure({ anim: zone === 'arms' ? 'one' : zone === 'breath' ? 'breathe' : 'both' }, zone); }
  var ICON_MORE = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="24" cy="50" r="10" fill="' + INK + '"/><circle cx="50" cy="50" r="10" fill="' + INK + '"/><circle cx="76" cy="50" r="10" fill="' + INK + '"/></svg>';

  /* The CSS of the drawings and the video box, made once from ANIMS (the type tokens are not used:
     there is no text in here). Animations run only when the screen does not ask for less motion;
     then the drawing shows its key moment, still. */
  function css() {
    var out = ['.mvfig { display: block; }', '.mvfig .mvbg, .mvpic .mvfig .mvbg { fill: var(--hero, #F7F7F7); }',
      '.mvfig .mvp { transform-box: view-box; }', '.mvfig .mvp-legs { stroke: ' + LEG + '; }',
      '.picture.mvpic { background: var(--hero, #F7F7F7); display: grid; place-items: center; }',
      '.figure.mvbox { position: relative; }', '.figure.mvbox > svg { height: 100%; width: auto; max-width: 100%; }',
      '.figure.mvvid { background: #000; display: block; }', '.mvyt, .mvyt iframe { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border: 0; }',
      '.opt .ico .mvfig { border-radius: 18px; }',
      '.mv-z-legs .mvp-legs, .mv-z-upper .mvp-shoulders, .mv-z-back .mvp-torso > line, .mv-z-arms .mvp-armR, .mv-z-arms .mvp-armL, .mv-z-neck .mvp-head > line, .mv-z-neck .mvp-shoulders > line { stroke: ' + HOT + '; }',
      '.mv-z-neck .mvp-head > circle { fill: ' + HOT + '; }', '.mv-z-breath .mvp-halo { fill-opacity: .55; }'];
    var motion = [], still = [];
    Object.keys(ANIMS).forEach(function (a) {
      var spec = ANIMS[a], hold = spec.hold === undefined ? 0.5 : spec.hold;
      Object.keys(spec.parts).forEach(function (p) {
        var origin = spec.parts[p][0], frames = spec.parts[p][1], name = 'mv-' + a + '-' + p;
        var sel = '.mvfig.mv-run.mv-a-' + a + ' .mvp-' + p;
        out.push(sel + ' { transform-origin: ' + origin + '; }');
        motion.push('@keyframes ' + name + ' { ' + frames.map(function (f) { return f[0] + '% { transform: ' + f[1] + '; }'; }).join(' ') + ' }');
        motion.push(sel + ' { animation: ' + name + ' ' + spec.d + 's ease-in-out infinite; }');
        still.push(sel + ' { animation: ' + name + ' ' + spec.d + 's linear ' + (-hold * spec.d) + 's infinite paused; }');
      });
    });
    return out.join('\n') + '\n@media (prefers-reduced-motion: no-preference) {\n' + motion.join('\n') + '\n}\n@media (prefers-reduced-motion: reduce) {\n' +
      motion.filter(function (m) { return m.charAt(0) === '@'; }).join('\n') + '\n' + still.join('\n') + '\n}\n';
  }
  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('move-css')) return;
    var s = document.createElement('style');
    s.id = 'move-css';
    s.textContent = css();
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- YouTube's official player, loaded once (shared with Bellatrix Play) ---------- */
  var apiPromise = null;
  function youtube() {
    if (W.YT && W.YT.Player) return Promise.resolve(W.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (ok, fail) {
      var prev = W.onYouTubeIframeAPIReady, done = false;
      W.onYouTubeIframeAPIReady = function () { done = true; if (prev) { try { prev(); } catch (e) { /* not ours */ } } ok(W.YT); };
      var s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = function () { apiPromise = null; fail(new Error('offline')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!done && !(W.YT && W.YT.Player)) { apiPromise = null; fail(new Error('timeout')); } }, 12000);
    });
    return apiPromise;
  }
  function online() { try { return W.navigator.onLine !== false; } catch (e) { return true; } }

  var api = { ZONES: ZONES, ZONE_IDS: ZONE_IDS, BANK: BANK, VIDEOS: VIDEOS, VIDEO_CHECKED: VIDEO_CHECKED, ANIMS: ANIMS, UNSAFE: UNSAFE,
    dayIndex: dayIndex, zoneOfDay: zoneOfDay, bankFor: bankFor, plan: plan, fromDaily: fromDaily, videoFor: videoFor, figure: figure, zoneIcon: zoneIcon, css: css, pick: pick };
  if (typeof Lab === 'undefined' || typeof I18N === 'undefined') return api;

  /* ---------- the screens' texts (the movements carry their own) ---------- */
  I18N.add('fr', {
    'Watch a video': 'Voir une vidéo', 'Another part': 'Autre partie', 'Which part shall we move?': 'Quelle partie voulez-vous bouger ?',
    'Other parts': 'Autres parties', 'Move along with the video': 'Bougez avec la vidéo', 'Do only what feels comfortable.': 'Faites seulement ce qui est agréable.',
    'Without the video': 'Sans la vidéo', 'Let’s move together instead.': 'Bougeons plutôt ensemble.',
    /* Care Team: personalising, Results, the activity's line */
    'Body part': 'Partie du corps', 'Today’s suggestion': 'Suggestion du jour', 'Legs': 'Jambes', 'Upper body': 'Haut du corps', 'Back and posture': 'Dos et posture',
    'Arms and hands': 'Bras et mains', 'Neck and shoulders': 'Nuque et épaules', 'Breathing': 'Respiration', 'Movements per session': 'Mouvements par séance',
    'Videos': 'Vidéos', 'Offer a video (internet)': 'Proposer une vidéo (Internet)', 'No videos': 'Pas de vidéo',
    'Seated movement: body part': 'Bouger assis : partie du corps', 'Seated movement: video': 'Bouger assis : vidéo', 'Seated movement: movements of the day': 'Bouger assis : mouvements du jour',
    'Gentle seated movements, new every day.': 'Des mouvements doux, assis, nouveaux chaque jour.',
    'Gentle seated movements for one part of the body, new every day, with drawings that move or an official video.': 'Des mouvements doux, assis, pour une partie du corps, nouveaux chaque jour, avec des dessins animés ou une vidéo officielle.'
  });
  I18N.add('de', {
    'Watch a video': 'Video ansehen', 'Another part': 'Anderer Bereich', 'Which part shall we move?': 'Was möchten Sie bewegen?',
    'Other parts': 'Andere Bereiche', 'Move along with the video': 'Machen Sie mit dem Video mit', 'Do only what feels comfortable.': 'Machen Sie nur, was angenehm ist.',
    'Without the video': 'Ohne Video', 'Let’s move together instead.': 'Bewegen wir uns lieber zusammen.',
    'Body part': 'Körperbereich', 'Today’s suggestion': 'Vorschlag des Tages', 'Legs': 'Beine', 'Upper body': 'Oberkörper', 'Back and posture': 'Rücken und Haltung',
    'Arms and hands': 'Arme und Hände', 'Neck and shoulders': 'Nacken und Schultern', 'Breathing': 'Atmung', 'Movements per session': 'Bewegungen pro Einheit',
    'Videos': 'Videos', 'Offer a video (internet)': 'Video anbieten (Internet)', 'No videos': 'Keine Videos',
    'Seated movement: body part': 'Bewegung im Sitzen: Körperbereich', 'Seated movement: video': 'Bewegung im Sitzen: Video', 'Seated movement: movements of the day': 'Bewegung im Sitzen: Bewegungen des Tages',
    'Gentle seated movements, new every day.': 'Sanfte Bewegungen im Sitzen, jeden Tag neu.',
    'Gentle seated movements for one part of the body, new every day, with drawings that move or an official video.': 'Sanfte Bewegungen im Sitzen für einen Körperbereich, jeden Tag neu, mit bewegten Zeichnungen oder einem offiziellen Video.'
  });

  /* ---------- the activity ---------- */
  var esc = Lab.esc;
  var ACK = '<div class="ack" aria-live="polite"></div>';
  var COUNT_WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  function num(v, lo, hi, def) { var n = parseInt(v, 10); return isNaN(n) ? def : Math.max(lo, Math.min(hi, n)); }
  function helpOpen() { try { return !!(Lab._t && Lab._t.state && Lab._t.state.help); } catch (e) { return false; } }
  function enText(v) { return typeof v === 'object' && v ? v.en || '' : String(v || ''); }

  Lab.define({
    key: 'move', day: 5, name: 'Seated Move Along', zone: 'MOVEMENT_CORNER',
    flow: 'Gentle seated movements for one part of the body, new every day, with drawings that move or an official video.',
    learn: 'Instruction clarity, the part of the body chosen, video or drawings, camera tracking limits and opt-out.',
    art: function () { return ART.move; },
    noHandSigns: true,
    content: [
      { id: 'zone', label: 'Body part', type: 'select', value: 'ask', options: [['ask', 'Today’s suggestion']].concat(ZONES.map(function (z) { return [z.id, z.staff]; })) },
      { id: 'count', label: 'Movements per session', type: 'number', min: 1, max: 5, value: '3' },
      { id: 'reps', label: 'Repetitions of each movement', type: 'number', min: 1, max: 10, value: '3' },
      { id: 'video', label: 'Videos', type: 'select', value: 'offer', options: [['offer', 'Offer a video (internet)'], ['off', 'No videos']] }
    ],
    start: function (L) {
      var lang = L.lang(), now = new Date(), code = Lab.patient;
      var reps = num(L.text('reps'), 1, 10, 3), count = num(L.text('count'), 1, 5, 3);
      var fixed = ZONE[L.text('zone')] ? L.text('zone') : '';
      var zone = fixed || zoneOfDay(now, code), videoOn = String(L.text('video') || 'offer') !== 'off', session = null;
      function T(v) { return pick(lang, v); }
      function pic(z) { return figure(BANK.filter(function (x) { return x.zone === z; })[0]); }

      /* 1. Today's part of the body: begin, a video, or another part (three buttons at most). */
      function propose() {
        var z = ZONE[zone], v = videoOn && online() ? videoFor(zone, lang, now) : null;
        var acts = [{ label: L.t('Let’s begin'), primary: true, gesture: 'open', words: ['begin', 'start', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true, run: begin }];
        if (v) acts.push({ label: L.t('Watch a video'), words: ['video', 'watch', 'film'], noLabelWords: true, run: function () { L.go(video(v), { replace: true }); } });
        acts.push({ label: L.t('Another part'), words: ['another', 'other', 'change', 'something else'], noLabelWords: true, run: function () { L.go(choose(0), { replace: true }); } });
        return { id: 'zone-' + zone, title: T(z.today), pic: pic(zone), picCls: 'mvpic', back: false, say: T(z.say), actions: acts };
      }
      /* 2. Another part: two parts and "Other parts" on each screen. */
      function choose(page) {
        var two = ZONE_IDS.slice(page * 2, page * 2 + 2);
        return {
          id: 'choose-' + page, title: L.t('Which part shall we move?'), back: false,
          say: L.t('Which part shall we move?'),
          choices: two.map(function (id) {
            var z = ZONE[id];
            return { label: T(z.name), icon: zoneIcon(id), words: z.words, value: id, run: function () { zone = id; L.log('Part of the body chosen: ' + id, 'result'); L.go(propose(), { replace: true }); } };
          }).concat([{ label: L.t('Other parts'), icon: ICON_MORE, words: ['other', 'others', 'more', 'other parts'], run: function () { L.go(choose((page + 1) % Math.ceil(ZONE_IDS.length / 2)), { replace: true }); } }])
        };
      }
      function begin() {
        session = plan(zone, { date: now, code: code, count: count, lang: lang, life: Lab.opt.life || {}, level: Lab.opt.level || '' });
        L.stat('moveZone', ZONE[zone].staff);
        L.stat('moveSource', session.source);
        L.log('Seated movements: ' + zone + ', ' + session.items.map(function (x) { return x.id; }).join(', ') + ' (' + session.source + ')', 'result');
        if (!Lab.opt.camMove) { L.go(exercise(0), { clear: true }); return; }
        L.go(L.consent({ key: 'move', eyebrow: L.t('Seated Move Along'), title: L.t('May I use my camera to count with you?'), pic: ART.move },
          function (yes) { L.setConsent('move', yes); L.go(yes ? calibrate() : exercise(0), { clear: true }); }), { replace: true });
      }
      function calibrate() {
        var greeted = false;
        return {
          id: 'calibrate', title: L.t('Can I see your hands and shoulders?'), back: false,
          body: '<div class="calib" id="calib">' + esc(L.t('Looking for you…')) + '</div>',
          pose: { kind: null, onVisible: function (v) {
            var el = document.getElementById('calib');
            if (el) { el.textContent = v ? L.t('Yes, I can see you.') : L.t('Not yet. Please move a little so I can see your shoulders.'); el.classList.toggle('good', v); }
            if (v && !greeted) { greeted = true; L.log('Calibration: participant visible', 'camera'); }
          } },
          actions: [
            { label: L.t('Ready'), primary: true, words: ['ready', 'yes', 'ok', 'okay', 'start', 'go'], noLabelWords: true, run: function () { L.go(exercise(0), { clear: true }); } },
            { label: L.t('Continue without the camera'), words: ['without', 'no camera', 'without the camera'], noLabelWords: true, run: function () { L.setConsent('move', false); L.log('Camera switched off by participant', 'camera'); L.go(exercise(0), { clear: true }); } }
          ]
        };
      }
      /* 3. One movement: the drawing moves, the counter fills with every "C'est fait" (or with what
         the camera sees, for the arm movements it knows); full, the next movement starts by itself. */
      function exercise(i) {
        /* 16 Nov: the movements the camera has no test for are counted as any clear movement out and back (core.js
           'any'); only breathing stays with the button. */
        var x = session.items[i], last = i + 1 >= session.items.length, withCam = L.consentOf('move') === true, kind = x.pose || (x.zone === 'breath' ? null : 'any'), camCounts = withCam && !!kind;
        var n = 0, full = false, st, dots = '';
        for (var d = 0; d < reps; d++) dots += '<i></i>';
        function next() { if (L.step() !== st) return; if (last) L.finish(); else L.go(exercise(i + 1), { replace: true }); }
        function add(how) {
          if (full) return;
          n++;
          L.log('Repetition ' + n + ' of ' + reps + ' (' + how + ')', 'rep', { move: x.pose || x.id });
          var box = document.getElementById('reps');
          if (box) {
            Array.prototype.forEach.call(box.querySelectorAll('.dots i'), function (el, k) { el.classList.toggle('on', k < n); });
            document.getElementById('repNum').textContent = n;
            box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
          }
          if (n >= reps) {
            full = true;
            L.push('moves', { move: enText(x.title), reps: n, counted: camCounts ? 'camera' : 'tap' });
            L.ack(L.t('Well done!'));
            L.say(L.t('{count}! Well done.', { count: COUNT_WORDS[n - 1] ? L.t(COUNT_WORDS[n - 1]) : n }) + (last ? '' : ' ' + L.t('Next movement.')));
            L.later(next, 2600);
          } else {
            L.ack(n === reps - 1 ? L.t('One more!') : L.t('Great!'));
            L.say(L.t('{count}!', { count: COUNT_WORDS[n - 1] ? L.t(COUNT_WORDS[n - 1]) : String(n) }));
          }
        }
        function again() {
          var svg = document.querySelector('#screen .mvfig');
          if (svg) { svg.classList.remove('mv-run'); void svg.getBoundingClientRect(); svg.classList.add('mv-run'); }
          L.say(T(x.how));
        }
        var did = { label: L.t('I did one'), words: ['did one', 'i did one', 'done', 'did it', 'i did it', 'yes', 'one more done'], noLabelWords: true, run: function (src) { add(src === 'voice' ? 'said' : 'tapped'); } };
        var show = { label: L.t('Show me again'), pair: true, words: ['again', 'repeat', 'show me again', 'once more'], noLabelWords: true, run: again };
        var skip = { label: L.t('Skip this one'), pair: true, skip: true, words: ['skip', 'pass', 'not this one'], noLabelWords: true, run: function () { L.push('moves', { move: enText(x.title), reps: n, counted: 'skipped' }); next(); } };
        if (camCounts) did.cls = 'soft'; else did.primary = true;
        st = {
          id: 'move-' + x.id, title: T(x.title), back: false,
          body: '<div class="figure mvbox">' + figure(x) +
            '<div class="reps" id="reps" aria-live="polite"><div class="dots">' + dots + '</div><div class="repnum"><b id="repNum">0</b> / ' + reps + '</div></div></div>' + ACK,
          pose: withCam ? { kind: kind, onSeen: function () { add('camera'); } } : undefined,
          say: T(x.how),
          noReprompt: withCam,
          actions: camCounts ? [show, skip, did] : [did, show, skip]
        };
        return st;
      }
      /* The video, in YouTube's own player. The engine redraws the screen for Help or a turn of the
         screen: the player is made again where it stopped (paused while Help is open). Offline, an
         error or no answer from YouTube: the drawn movements take over. */
      function video(v) {
        var player = null, at = 0, ready = false, failed = false, spoke = false, ticking = false, st;
        function destroy() { var p = player; player = null; ready = false; if (p) { try { at = p.getCurrentTime() || at; } catch (e) { /* gone */ } try { p.destroy(); } catch (e) { /* gone */ } } }
        function fallback(why) {
          if (failed || L.step() !== st) return;
          failed = true;
          L.log('Video ' + v.id + ' could not play (' + why + '): drawn movements instead', 'error');
          L.stat('moveVideo', 'not available');
          destroy();
          L.go(instead(), { replace: true });
        }
        function play() { if (player && ready && !helpOpen()) { try { player.playVideo(); } catch (e) { /* next tap */ } } }
        function mount() {
          if (failed || L.step() !== st) return;
          if (!online()) { fallback('offline'); return; }
          youtube().then(function (YT) {
            var host = document.getElementById('mvYt');
            if (failed || L.step() !== st || !host) return;
            destroy();
            var box = document.createElement('div');
            host.appendChild(box);
            var me = player = new YT.Player(box, {
              host: 'https://www.youtube-nocookie.com', videoId: v.id, width: '100%', height: '100%',
              playerVars: { autoplay: 0, start: Math.floor(at), controls: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, modestbranding: 1, cc_load_policy: 0, disablekb: 1, hl: lang },
              events: {
                onReady: function () {
                  if (player !== me) return;
                  ready = true;
                  try { me.setVolume(Math.round(100 * Math.max(0, Math.min(1, Lab.opt.volume || 0.9)))); } catch (e) { /* not ready after all */ }
                  if (spoke) play();
                },
                onStateChange: function (e) { if (player === me && e.data === 0) { L.stat('moveVideo', v.channel + ': ' + v.title + ' (to the end)'); destroy(); L.finish(); } },
                onError: function (e) { if (player === me) fallback('error ' + e.data); }
              }
            });
            L.later(function () { if (!ready && player === me) fallback('timeout'); }, 20000);
          }, function (e) { fallback(e && e.message || 'offline'); });
          if (!ticking) { ticking = true; L.every(function () { try { if (player && ready) at = player.getCurrentTime() || at; } catch (e) { /* not ready */ } }, 1000); }
        }
        st = {
          id: 'video-' + zone, title: L.t('Move along with the video'), back: false, noReprompt: true,
          body: '<div class="figure mvvid"><div class="mvyt" id="mvYt"></div></div>',
          say: L.t('Do only what feels comfortable.'),
          afterSay: function () { spoke = true; play(); },
          after: function () { mount(); },
          leave: destroy,
          actions: [
            { label: L.t('I’m done'), primary: true, gesture: 'open', words: ['done', 'finished', 'im done', 'enough', 'finish'], noLabelWords: true,
              run: function () { L.stat('moveVideo', v.channel + ': ' + v.title); destroy(); L.finish(); } },
            { label: L.t('Without the video'), words: ['without', 'no video', 'drawings'], noLabelWords: true,
              run: function () { L.stat('moveVideo', 'left for the drawings'); destroy(); begin(); } }
          ]
        };
        L.log('Video: ' + v.channel + ' – ' + v.title + ' (' + v.id + ')', 'result');
        return st;
      }
      function instead() {
        return { id: 'novideo', title: L.t('Let’s move together instead.'), pic: pic(zone), picCls: 'mvpic', back: false, noHistory: true,
          actions: [{ label: L.t('Let’s begin'), primary: true, gesture: 'open', words: ['begin', 'start', 'yes', 'ready', 'ok', 'okay', 'go'], noLabelWords: true, run: begin }] };
      }
      return propose();
    }
  });
  injectCss();
  return api;
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MoveLab;
