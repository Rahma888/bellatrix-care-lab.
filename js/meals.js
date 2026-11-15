/* "Menu" (Menüwahl, Menu du jour): the resident chooses tomorrow's meals on the patient TABLET, like in a
   hotel, instead of the handwritten list of the ward. The kitchen sets the menu (cuisine.html), the care team
   sends Bellatrix (one resident from the activity list, or the daily round from the head's notification,
   js/meals-staff.js) and the order goes to the server (labland/meals.mjs).
   On the tablet: a warm greeting ("Good afternoon, Mrs Huber! May I show you the menu for tomorrow?"), then
   one course at a time with big picture cards (2 or 3 per screen, readable from 2 m, for touch, voice and
   pointing in the air), the resident's restrictions said gently on the card ("Contains pork": shown, not
   hidden, and not choosable when it is a restriction), "Nothing for me" on every course (the kitchen sees
   "no choice, ask the care team"), a summary with Confirm / Change, then thanks.
   The run carries opt.meal = { date, ticket, diet, portion } (made on the head); without it (one device)
   the diet comes from this device's Care Team store and the server's "tomorrow" is used.
   The menu card (15 Nov, Rahma: "like a restaurant card"): the server always answers an `offer` (per meal and
   course the daily dishes, then the card's dishes). A course with daily dishes shows them first, each marked
   "Tagesempfehlung", with "Aus der Speisekarte wählen" next to "Nichts für mich"; a course without daily dishes
   (no menu from the kitchen) is the card's category straight away: one category per screen (Vorspeisen,
   Hauptgerichte, Desserts, Getränke), 2 to 6 big cards. Never the dead end "the menu is not ready".
   Dish names and descriptions in the resident's language when the kitchen gave one (dish.tr.fr / .en), the
   usual allergen words translated on the card.
   This file is also loaded by the Care Team page: there it only defines the activity (the tile). ES5. */
window.Meals = (function () {
  'use strict';
  var MEALS = ['lunch', 'dinner'], COURSES = ['starter', 'main', 'dessert'], CATS = ['starter', 'main', 'dessert', 'drinks'];
  var MEAL_NAME = { lunch: 'Lunch', dinner: 'Dinner' }, COURSE_NAME = { starter: 'Starter', main: 'Main course', dessert: 'Dessert', drinks: 'Drink' };
  var CAT_NAME = { starter: 'Starters', main: 'Main dishes', dessert: 'Desserts', drinks: 'Drinks' };
  var NUM_WORDS = [['one', 'first', 'number one', 'eins', 'erste', 'ersten', 'nummer eins', 'un', 'une', 'premier', 'premiere', 'numero un'],
    ['two', 'second', 'number two', 'zwei', 'zweite', 'zweiten', 'nummer zwei', 'deux', 'deuxieme', 'numero deux'],
    ['three', 'third', 'number three', 'drei', 'dritte', 'dritten', 'nummer drei', 'trois', 'troisieme', 'numero trois'],
    ['four', 'fourth', 'number four', 'vier', 'vierte', 'vierten', 'nummer vier', 'quatre', 'quatrieme', 'numero quatre'],
    ['five', 'fifth', 'number five', 'funf', 'funfte', 'funften', 'nummer funf', 'cinq', 'cinquieme', 'numero cinq'],
    ['six', 'sixth', 'number six', 'sechs', 'sechste', 'sechsten', 'nummer sechs', 'sixieme', 'numero six']];
  var CARD_WORDS = ['menu card', 'the card', 'from the card', 'speisekarte', 'aus der speisekarte', 'karte', 'la carte', 'carte', 'a la carte'];
  /* the usual allergen words of the kitchen (German), said in the resident's language on the card */
  var ALLERGENS = { gluten: ['gluten', 'gluten'], milch: ['lait', 'milk'], laktose: ['lactose', 'lactose'], ei: ['œuf', 'egg'], eier: ['œufs', 'eggs'],
    fisch: ['poisson', 'fish'], sellerie: ['céleri', 'celery'], senf: ['moutarde', 'mustard'], nusse: ['fruits à coque', 'nuts'], erdnusse: ['arachides', 'peanuts'],
    soja: ['soja', 'soy'], sesam: ['sésame', 'sesame'], krebstiere: ['crustacés', 'crustaceans'], weichtiere: ['mollusques', 'molluscs'], lupinen: ['lupin', 'lupin'],
    sulfite: ['sulfites', 'sulphites'], schwefeldioxid: ['sulfites', 'sulphites'] };
  var NONE_WORDS = ['nothing', 'none', 'nothing for me', 'no thanks', 'nichts', 'nichts fur mich', 'nein danke', 'rien', 'rien pour moi', 'non merci'];

  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function getJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v === null ? d : v; } catch (e) { return d; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  if (typeof I18N !== 'undefined' && I18N.add) {
    var addNew = function (l, t) { var have = I18N.dict[l] || {}, out = {}; Object.keys(t).forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(have, k)) out[k] = t[k]; }); I18N.add(l, out); };
    addNew('fr', {
      'Menu': 'Menu du jour', 'Choose tomorrow’s meals, one course at a time.': 'Choisir les repas de demain, un plat après l’autre.',
      'Good morning, {name}!': 'Bonjour, {name} !', 'Good afternoon, {name}!': 'Bonjour, {name} !', 'Good evening, {name}!': 'Bonsoir, {name} !',
      'Good morning!': 'Bonjour !', 'Good afternoon!': 'Bonjour !', 'Good evening!': 'Bonsoir !',
      'May I show you the menu for tomorrow?': 'Puis-je vous montrer le menu de demain ?', 'Yes, please': 'Oui, volontiers', 'Not now': 'Pas maintenant',
      'One moment…': 'Un instant…', 'Lunch': 'Déjeuner', 'Dinner': 'Dîner', 'Starter': 'Entrée', 'Main course': 'Plat principal', 'Dessert': 'Dessert',
      'What would you like?': 'Que désirez-vous ?', 'Nothing for me': 'Rien pour moi',
      'Contains pork': 'Contient du porc', 'Not vegetarian': 'Pas végétarien', 'Contains {list}': 'Contient : {list}', 'Rather firm': 'Plutôt ferme', 'Contains sugar': 'Contient du sucre',
      'Your choice': 'Votre choix', 'Shall I send this to the kitchen?': 'Je l’envoie à la cuisine ?', 'Confirm': 'Confirmer', 'Change': 'Modifier', 'Small portion': 'Petite portion',
      'Thank you very much, the kitchen is informed.': 'Merci beaucoup, la cuisine est informée.', 'Enjoy your meal tomorrow!': 'Bon appétit demain !',
      'The menu for tomorrow is not ready yet.': 'Le menu de demain n’est pas encore prêt.', 'The care team will tell you.': 'L’équipe vous le dira.',
      'The kitchen has closed the choice for tomorrow.': 'La cuisine a clos le choix pour demain.', 'The care team will help you.': 'L’équipe vous aidera volontiers.',
      'The kitchen did not get your choice.': 'La cuisine n’a pas reçu votre choix.', 'The care team will pass it on.': 'L’équipe la transmettra.',
      'All right. The care team will ask you later.': 'D’accord. L’équipe vous demandera plus tard.', 'Finish': 'Terminer',
      'Drink': 'Boisson', 'Starters': 'Entrées', 'Main dishes': 'Plats', 'Desserts': 'Desserts', 'Drinks': 'Boissons',
      'Today’s special': 'Suggestion du jour', 'Choose from the menu card': 'Choisir sur la carte', 'From the menu card': 'À la carte',
      'From the menu card: what would you like?': 'À la carte : que désirez-vous ?',
      'The menu cannot be reached right now.': 'Le menu n’est pas joignable pour le moment.'
    });
    addNew('de', {
      'Menu': 'Menüwahl', 'Choose tomorrow’s meals, one course at a time.': 'Die Mahlzeiten für morgen wählen, Gang für Gang.',
      'Good morning, {name}!': 'Guten Morgen, {name}!', 'Good afternoon, {name}!': 'Guten Tag, {name}!', 'Good evening, {name}!': 'Guten Abend, {name}!',
      'Good morning!': 'Guten Morgen!', 'Good afternoon!': 'Guten Tag!', 'Good evening!': 'Guten Abend!',
      'May I show you the menu for tomorrow?': 'Darf ich Ihnen das Menü für morgen zeigen?', 'Yes, please': 'Ja, gerne', 'Not now': 'Jetzt nicht',
      'One moment…': 'Einen Moment…', 'Lunch': 'Mittagessen', 'Dinner': 'Abendessen', 'Starter': 'Vorspeise', 'Main course': 'Hauptgang', 'Dessert': 'Nachspeise',
      'What would you like?': 'Was darf es sein?', 'Nothing for me': 'Nichts für mich',
      'Contains pork': 'Enthält Schwein', 'Not vegetarian': 'Nicht vegetarisch', 'Contains {list}': 'Enthält {list}', 'Rather firm': 'Eher fest', 'Contains sugar': 'Enthält Zucker',
      'Your choice': 'Ihre Wahl', 'Shall I send this to the kitchen?': 'Soll ich das an die Küche schicken?', 'Confirm': 'Bestätigen', 'Change': 'Ändern', 'Small portion': 'Kleine Portion',
      'Thank you very much, the kitchen is informed.': 'Vielen Dank, die Küche ist informiert.', 'Enjoy your meal tomorrow!': 'Guten Appetit morgen!',
      'The menu for tomorrow is not ready yet.': 'Das Menü für morgen ist noch nicht fertig.', 'The care team will tell you.': 'Das Team sagt Ihnen Bescheid.',
      'The kitchen has closed the choice for tomorrow.': 'Die Küche nimmt für morgen keine Wahl mehr an.', 'The care team will help you.': 'Das Team hilft Ihnen gern.',
      'The kitchen did not get your choice.': 'Die Küche hat Ihre Wahl nicht erhalten.', 'The care team will pass it on.': 'Das Team gibt sie weiter.',
      'All right. The care team will ask you later.': 'Gut. Das Team fragt Sie später.', 'Finish': 'Fertig',
      'Drink': 'Getränk', 'Starters': 'Vorspeisen', 'Main dishes': 'Hauptgerichte', 'Desserts': 'Desserts', 'Drinks': 'Getränke',
      'Today’s special': 'Tagesempfehlung', 'Choose from the menu card': 'Aus der Speisekarte wählen', 'From the menu card': 'Aus der Speisekarte',
      'From the menu card: what would you like?': 'Aus der Speisekarte: Was darf es sein?',
      'The menu cannot be reached right now.': 'Die Speisekarte ist gerade nicht erreichbar.'
    });
  }

  /* ---------- the server (the head's, through the link; else this page's own; else the call server) ---------- */
  function headInfo() {
    try { var a = window.BellatrixApp; if (a && typeof a.linkServer === 'function') return JSON.parse(a.linkServer() || '{}') || {}; } catch (e) { /* no robot */ }
    return {};
  }
  function server() {
    var k = ls('bellatrix-link-server').trim().replace(/\/+$/, '');
    if (k && k.toLowerCase() !== 'local' && /^https?:\/\/[^\s\/]+/i.test(k)) return k;
    if (headInfo().running) return 'http://127.0.0.1:8765';
    if (!window.BellatrixApp && typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) return location.protocol + '//' + location.host;
    var c = ls('bellatrix-call-server').trim().replace(/\/+$/, '');
    return /^https?:\/\/[^\s\/]+/i.test(c) ? c : '';
  }
  /* -> Promise of { status, body } (rejects only when the server cannot be reached) */
  function api(method, path, body, headers) {
    var s = server();
    if (!s || typeof fetch !== 'function') return Promise.reject(new Error('no-server'));
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null, to = null, h = {}, k;
    if (ctrl) to = setTimeout(function () { ctrl.abort(); }, 10000);
    if (body) h['Content-Type'] = 'application/json';
    for (k in headers || {}) if (Object.prototype.hasOwnProperty.call(headers, k)) h[k] = headers[k];
    return fetch(s + '/meals/api/' + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(to); return r.json().then(function (j) { return { status: r.status, body: j || {} }; }, function () { return { status: r.status, body: {} }; }); },
        function (e) { clearTimeout(to); throw e; });
  }
  function photoUrl(id) { return id ? server() + '/meals/photo/' + encodeURIComponent(id) : ''; }

  /* ---------- a resident's restrictions on a dish (the server does the same for allergies) ----------
     block: never choosable here, the reason is on the card (allergies, vegetarian, no pork);
     note: choosable, said gently (soft food, diabetes). */
  /* "Ei" (egg) is the one short allergen word; "Eier" is the same */
  function words(s) {
    return String(s || '').toLowerCase().replace(/œ/g, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ß]+/)
      .map(function (w) { return w === 'eier' ? 'ei' : w; }).filter(function (w) { return w.length >= 3 || w === 'ei'; });
  }
  function plainKey(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\s+|\s+$/g, ''); }
  /* an allergen as the resident reads it: the usual words translated, anything else as the kitchen typed it */
  function allergenText(a, lang) {
    var t = ALLERGENS[plainKey(a)], k = lang === 'fr' ? 0 : lang === 'en' ? 1 : -1;
    return t && k >= 0 ? t[k] : a;
  }
  function allergyHits(dish, allergies, lang) {
    var mine = words(allergies), out = [];
    if (!mine.length) return out;
    (dish.allergens || []).forEach(function (a) {
      var t = ALLERGENS[plainKey(a)], w = words(a).concat(t ? words(t[0]).concat(words(t[1])) : []);
      var hit = w.some(function (x) { return mine.some(function (y) { return x === y || (y.length >= 4 && x.indexOf(y) === 0) || (x.length >= 4 && y.indexOf(x) === 0); }); });
      if (hit) out.push(allergenText(a, lang));
    });
    return out;
  }
  /* drinks: no "not vegetarian" and no "rather firm" (a drink has neither); sugar is said as for desserts */
  function flags(dish, diet, course, lang) {
    var tags = dish.tags || [], block = [], note = [], drink = course === 'drinks';
    diet = diet || {};
    var al = allergyHits(dish, diet.allergies, lang);
    if (al.length) block.push(['Contains {list}', { list: al.join(', ') }]);
    if (diet.nopork && tags.indexOf('pork') >= 0) block.push(['Contains pork']);
    if (diet.veg && !drink && tags.indexOf('veg') < 0) block.push(['Not vegetarian']);
    if (diet.soft && !drink && tags.indexOf('soft') < 0) note.push(['Rather firm']);
    if (diet.diabetic && (course === 'dessert' || drink) && tags.indexOf('diabetic') < 0) note.push(['Contains sugar']);
    return { block: block, note: note };
  }
  /* the dish in the resident's language when the kitchen wrote it (dish.tr.fr / .en), else as typed */
  function dishName(d, lang) { var t = d && d.tr && d.tr[lang]; return (t && t.name) || (d ? d.name : ''); }
  function dishDesc(d, lang) { var t = d && d.tr && d.tr[lang]; return t && t.name ? (t.desc || '') : (d ? d.desc || '' : ''); }

  /* ---------- the activity ---------- */
  function greeting(T, name) {
    var h = new Date().getHours(), part = h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
    if (part === 'morning') return name ? T('Good morning, {name}!', { name: name }) : T('Good morning!');
    if (part === 'afternoon') return name ? T('Good afternoon, {name}!', { name: name }) : T('Good afternoon!');
    return name ? T('Good evening, {name}!', { name: name }) : T('Good evening!');
  }
  function art() {
    return '<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="400" height="300" fill="#F0F6FC"/>' +
      '<circle cx="200" cy="150" r="88" fill="#FFFFFF" stroke="#00519E" stroke-width="8"/><circle cx="200" cy="150" r="58" fill="none" stroke="#9FD3F5" stroke-width="6"/>' +
      '<path d="M78 72v54M66 72v34a12 12 0 0 0 24 0V72M78 126v104" fill="none" stroke="#00519E" stroke-width="8" stroke-linecap="round"/>' +
      '<path d="M322 72c-14 10-18 34-18 58h18v100" fill="none" stroke="#00519E" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function state() { return window.Lab && Lab._t && Lab._t.state; }
  function setOutcome(v) { var S = state(); if (S && S.rec) S.rec.outcome = v; }
  function setConsent(v) { var S = state(); if (S && S.rec) S.rec.consent.takePart = v; }

  function start(L) {
    var T = L.t, o = (Lab.opt && Lab.opt.meal) || {}, code = Lab.patient, name = (Lab.opt.greet || '').trim();
    var own = (((getJ('bellatrix-care-lab-v1', {}) || {}).patients || {})[code] || {}).prefs || {};
    var diet = o.diet || own.diet || {}, portion = o.portion || (own.diet && own.diet.portion) || 'normal';
    var lang = L.lang ? L.lang() : 'en';
    var offer = null, date = o.date || '', open = false, failed = false, loaded = false, waiting = false, sent = false;
    var picks = {}, plan = [];
    var hi = greeting(T, name), q = T('May I show you the menu for tomorrow?');

    var loading = api('GET', 'menu' + (date ? '?date=' + encodeURIComponent(date) : '')).then(function (r) {
      if (r.status === 200 && r.body) { offer = r.body.offer || fromMenu(r.body.menu); date = r.body.date || date; open = !!r.body.open; } else failed = true;
    }, function () { failed = true; }).then(function () { loaded = true; if (waiting) begin(); });

    /* an older server without the card: its daily menu as the offer */
    function fromMenu(menu) {
      var out = {};
      MEALS.forEach(function (m) {
        var meal = menu && menu.meals && menu.meals[m];
        if (!meal) return;
        out[m] = {};
        COURSES.forEach(function (c) { if (meal[c] && meal[c].length) out[m][c] = { daily: meal[c], card: [] }; });
      });
      return out;
    }
    function hasOffer() { return !!offer && Object.keys(offer).length > 0; }
    /* The courses to ask: one screen per course with a real choice (or a dish that needs explaining).
       A single daily dish without the card is chosen for the resident, as before. */
    function makePlan() {
      plan = []; picks = {};
      MEALS.forEach(function (m) {
        var meal = offer[m];
        if (!meal) return;
        picks[m] = {};
        CATS.forEach(function (c) {
          var x = meal[c], daily = (x && x.daily) || [], card = (x && x.card) || [];
          if (!daily.length && !card.length) return;
          if (daily.length === 1 && !card.length && !flags(daily[0], diet, c, lang).block.length) { picks[m][c] = daily[0].id; return; }
          plan.push({ meal: m, course: c, daily: daily, card: card });
        });
      });
    }
    function dishOf(m, c, id) {
      var x = offer[m] && offer[m][c], l = x ? (x.daily || []).concat(x.card || []) : [];
      for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
      return null;
    }
    function flagText(f) { return f.map(function (x) { return T(x[0], x[1]); }).join(' · '); }

    function end(outcome) { setOutcome(outcome); Lab.endSession(); }
    function closing(title, lead, outcome, ms) {
      return { id: 'meal-end', final: true, center: true, title: title, lead: lead || '', say: lead ? title + ' ' + lead : title, back: false, noHistory: true, airPointer: true,
        actions: [{ label: T('Finish'), primary: true, noLabelWords: true, words: ['finish', 'done', 'ok', 'fertig', 'terminer'], run: function () { end(outcome); } }],
        enter: function () { L.later(function () { end(outcome); }, ms || 9000); } };
    }
    function notReady() { L.log('Menu: nothing to choose for tomorrow on the server', 'result'); L.go(closing(T('The menu for tomorrow is not ready yet.'), T('The care team will tell you.'), 'completed'), { clear: true }); }
    function unreachable() { L.log('Menu: the menu server does not answer', 'error'); L.go(closing(T('The menu cannot be reached right now.'), T('The care team will help you.'), 'completed'), { clear: true }); }
    function closed() { L.log('Menu: orders for tomorrow are closed', 'result'); L.go(closing(T('The kitchen has closed the choice for tomorrow.'), T('The care team will help you.'), 'completed'), { clear: true }); }

    function begin() {
      waiting = false;
      if (failed) { unreachable(); return; }
      if (!hasOffer()) { notReady(); return; }   /* the server always has the card: only an empty answer comes here */
      if (!open) { closed(); return; }
      makePlan();
      if (!plan.length) { summary(); return; }
      course(0);
    }
    /* One screen per course. cardView: the card's category ("Mittagessen · Hauptgerichte"); else the daily dishes
       first, marked "Tagesempfehlung", with "Aus der Speisekarte wählen" when the card has that category. */
    function course(i, cardView) {
      var p = plan[i], m = p.meal, c = p.course, cur = picks[m][c];
      var fromCard = !!cardView || !p.daily.length, list = fromCard ? p.card : p.daily;
      var anyFree = false;
      var choices = list.map(function (d, k) {
        var f = flags(d, diet, c, lang), blocked = f.block.length > 0, photo = photoUrl(d.photo), desc = dishDesc(d, lang);
        if (!blocked) anyFree = true;
        var why = flagText(f.block.concat(f.note));
        return {
          label: dishName(d, lang), value: d.id, disabled: blocked, words: NUM_WORDS[k] || [],
          cls: 'mc' + (photo ? '' : ' nophoto') + (blocked ? ' blocked' : '') + (cur === d.id ? ' chosen' : '') + (fromCard ? ' mc-card' : ' mc-daily'),
          art: (photo ? '<span class="mc-photo"><img src="' + esc(photo) + '" alt=""></span>' : '') +
            (fromCard ? '' : '<span class="mc-badge">' + esc(T('Today’s special')) + '</span>') +
            (desc ? '<span class="mc-desc">' + esc(desc) + '</span>' : '') + (why ? '<span class="mc-flag">' + esc(why) + '</span>' : ''),
          run: function () { picks[m][c] = d.id; L.log('Menu: ' + c + ' chosen' + (fromCard ? ' from the menu card' : ''), 'app'); next(i); }
        };
      });
      var title = T(MEAL_NAME[m]) + ' · ' + T(fromCard ? CAT_NAME[c] : COURSE_NAME[c]);
      var lead = fromCard && p.daily.length ? T('From the menu card: what would you like?') : T('What would you like?');
      var spoken = title + '. ' + (fromCard ? '' : T('Today’s special') + '. ') + list.map(function (d, k) {
        var f = flags(d, diet, c, lang), why = flagText(f.block.concat(f.note));
        return (k + 1) + ': ' + dishName(d, lang) + (why ? ', ' + why : '') + '.';
      }).join(' ') + ' ' + lead;
      var acts = [];
      if (!fromCard && p.card.length) {
        acts.push({ label: T('Choose from the menu card'), cls: 'mc-tocard', pair: true, words: CARD_WORDS, noLabelWords: true,
          run: function () { L.log('Menu: the resident opens the menu card (' + c + ')', 'app'); course(i, true); } });
      }
      acts.push({ label: T('Nothing for me'), primary: !anyFree, cls: 'mc-none', words: NONE_WORDS, noLabelWords: true, run: function () { picks[m][c] = 'none'; next(i); } });
      L.go({
        id: 'meal-' + m + '-' + c + (cardView ? '-card' : ''), cls: 'mealstep mealcourse n' + Math.min(choices.length, 6) + (choices.length >= 4 ? ' mgrid' : '') + (fromCard ? ' mcardview' : ''),
        title: title, lead: lead, style: 'cards', choices: choices, airPointer: true, say: spoken,
        back: i > 0 || !!cardView, noStop: false, actions: acts
      }, { replace: i === 0 && !cardView });
    }
    function next(i) { if (i + 1 < plan.length) course(i + 1); else summary(); }
    function summaryParts() {
      var html = '', spoken = [];
      MEALS.forEach(function (m) {
        if (!picks[m]) return;
        var lines = '', said = [];
        CATS.forEach(function (c) {
          if (!(c in picks[m])) return;
          var v = picks[m][c], d = v === 'none' ? null : dishOf(m, c, v), txt = d ? dishName(d, lang) : T('Nothing for me');
          lines += '<div class="ms-row' + (d ? '' : ' ms-none') + '"><span class="ms-c">' + esc(T(COURSE_NAME[c])) + '</span><span class="ms-d">' + esc(txt) + '</span></div>';
          if (d) said.push(dishName(d, lang));
        });
        html += '<section class="ms-meal"><h3>' + esc(T(MEAL_NAME[m])) + '</h3>' + lines + '</section>';
        spoken.push(T(MEAL_NAME[m]) + ': ' + (said.length ? said.join(', ') : T('Nothing for me')) + '.');
      });
      if (portion === 'small') html += '<p class="ms-portion">' + esc(T('Small portion')) + '</p>';
      return { html: '<div class="mealsum">' + html + '</div>', say: spoken.join(' ') };
    }
    function summary() {
      var s = summaryParts(), title = T('Your choice'), lead = T('Shall I send this to the kitchen?');
      L.go({
        id: 'meal-summary', cls: 'mealstep mealsummary', title: title, lead: lead, body: s.html, airPointer: true, back: plan.length > 0, say: title + '. ' + s.say + ' ' + lead,
        actions: [
          { label: T('Confirm'), primary: true, pair: true, words: ['yes', 'confirm', 'send', 'ok', 'ja', 'bestatigen', 'oui', 'confirmer'], noLabelWords: true, run: confirm },
          { label: T('Change'), pair: true, words: ['change', 'again', 'andern', 'modifier'], noLabelWords: true, run: function () { L.log('Menu: the resident changes the choice', 'app'); if (plan.length) course(0); else summary(); } }
        ]
      }, { replace: !plan.length });
    }
    function send(status) {
      var body = { ticket: o.ticket || '', code: code, date: date, status: status, portion: portion, meals: status === 'chosen' ? picks : {} };
      return api('POST', 'order', body).then(function (r) { return r.status === 200 ? 'ok' : r.status === 409 ? 'closed' : 'failed'; }, function () { return 'failed'; });
    }
    function confirm() {
      if (sent) return;
      sent = true;
      L.go({ id: 'meal-sending', title: T('One moment…'), back: false, noHistory: true, say: '' }, { clear: true });
      send('chosen').then(function (res) {
        if (res === 'closed') { closed(); return; }
        if (res !== 'ok') {
          L.log('Menu: the order could not be sent', 'error');
          L.go(closing(T('The kitchen did not get your choice.'), T('The care team will pass it on.'), 'completed'), { clear: true });
          return;
        }
        L.stat('menuChosen', true);
        L.log('Menu: choice sent to the kitchen', 'result');
        L.go(closing(T('Thank you very much, the kitchen is informed.'), T('Enjoy your meal tomorrow!'), 'completed'), { clear: true });
      });
    }
    function decline() {
      setConsent('no');
      L.log('Menu: not now (the kitchen sees: ask the care team)', 'result');
      if (loaded && hasOffer() && open) send('declined');
      else loading.then(function () { if (hasOffer() && open) send('declined'); });
      L.go(closing(T('All right. The care team will ask you later.'), '', 'declined', 7000), { clear: true });
    }

    return {
      id: 'meal-hello', cls: 'mealstep mealhello', title: hi, lead: q, pic: Lab.faceHtml('hero'), picCls: 'facebox', back: false, noHistory: true, noStop: true, airPointer: true,
      say: hi + ' ' + q,
      actions: [
        { label: T('Yes, please'), primary: true, gesture: 'open', words: ['yes', 'yeah', 'please', 'ok', 'okay', 'sure', 'ja', 'gerne', 'oui', 'volontiers'], noLabelWords: true,
          run: function () {
            setConsent('yes');
            L.log('Menu: wants to see the menu', 'consent');
            if (loaded) { begin(); return; }
            waiting = true;
            L.go({ id: 'meal-wait', title: T('One moment…'), back: false, noHistory: true, say: '' }, { clear: true });
          } },
        { label: T('Not now'), gesture: 'fist', words: ['no', 'not now', 'later', 'nein', 'spater', 'non', 'plus tard'], noLabelWords: true, run: decline }
      ]
    };
  }

  if (typeof Lab !== 'undefined' && Lab.define) {
    Lab.define({
      key: 'meals', day: 18, name: 'Menu', zone: 'DINING', noAgain: true,
      flow: 'Choose tomorrow’s meals, one course at a time. The kitchen sees the choice at once.',
      learn: 'Can the resident choose the meals for tomorrow alone, and does it feel like good service?',
      art: art, content: [], start: start
    });
    /* The menu greets in its own words ("May I show you the menu for tomorrow?"): no "Shall we start?" before it. */
    if (typeof Lab.start === 'function' && !Lab._mealsWrapped) {
      Lab._mealsWrapped = true;
      var start0 = Lab.start;
      Lab.start = function (key, o) {
        if (key === 'meals' && !(o && o.direct)) { var p = {}, k; for (k in o || {}) if (Object.prototype.hasOwnProperty.call(o, k)) p[k] = o[k]; p.direct = true; o = p; }
        return start0.call(this, key, o);
      };
    }
  }
  return { flags: flags, allergyHits: allergyHits, allergenText: allergenText, dishName: dishName, dishDesc: dishDesc, server: server, api: api, photoUrl: photoUrl,
    MEALS: MEALS, COURSES: COURSES, CATS: CATS, MEAL_NAME: MEAL_NAME, COURSE_NAME: COURSE_NAME, CAT_NAME: CAT_NAME };
})();
