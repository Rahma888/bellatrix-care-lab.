/* The kitchen page (cuisine.html, /cuisine) on a PC or a tablet of the kitchen. Two views for one day:
   - "Speiseplan": the menu of the day, lunch and dinner, starter / main / dessert, 1 to 3 dishes each (name, short
     description, tags, allergens, photo), the order deadline, copy of another day's menu, Save;
   - "Bestellungen": the residents' orders, live (every 10 s while shown): the quantities per dish for the cooks,
     the list per room for the trays with a "delivered" tick per meal, and a clean A4 print;
   - "Speisekarte" (15 Nov): the permanent menu card, not tied to a day: starters, main dishes, desserts, drinks,
     up to 6 dishes each (name, description, tags, allergens, photo, optional French and English names), the meals it
     is offered for and the hour the orders close the day before; "Restore the default card". A day without a menu
     plan is ordered from the card; with a menu plan the card is offered next to it. Card dishes appear in the
     quantities (marked "menu card") and in the trays like the daily dishes.
   The API: labland/meals.mjs (/meals/api/kitchen/...). Access: the care team's 6-character code (the same as
   "Add a game"), or #k=<token> when the robot head opens the page; requests from this machine need no token.
   The texts: js/i18n-cuisine.js. German by default, FR / EN on the switch. Dish and resident names are kitchen
   content and stay as typed. ES5, no library. For tests: window.Cuisine. */
(function () {
  'use strict';
  var LANG_KEY = 'bellatrix-cuisine-lang', TOKEN_KEY = 'bellatrix-cuisine-token';
  var MEALS = ['lunch', 'dinner'], COURSES = ['starter', 'main', 'dessert'], TAGS = ['veg', 'pork', 'soft', 'diabetic'];
  var CATS = ['starter', 'main', 'dessert', 'drinks'], TR_LANGS = ['fr', 'en'];
  var MAX_DISHES = 3, MAX_CARD = 6, REFRESH_MS = 10000, PHOTO_MAX = 3 * 1024 * 1024, PHOTO_SIDE = 1024;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/, STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, UNTIL_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  /* In the robot app the page comes from the app itself (https://app.bellatrix/): the server is the head's Node (8765).
     On a PC or tablet of the kitchen the page comes from the server: relative addresses. */
  var ORIGIN = window.BellatrixApp ? 'http://127.0.0.1:8765/' : '';
  var API = ORIGIN + 'meals/api/';
  var $ = function (id) { return document.getElementById(id); };

  var lang = 'de', token = '', authed = false, view = 'menu';
  var date = '', today = '', tomorrow = '';
  var day = null;           /* the last answer of GET kitchen/day for `date` */
  var draft = null;         /* the menu being edited: { deadline, meals: { lunch: { starter: [dish, …] } } } */
  var dirty = false, saving = false, uploads = 0, pendingDel = 0;
  var days = [];            /* GET kitchen/days: [{ date, dishes }] */
  var saveMsg = null, saveBad = false, loginMsg = null, netMsg = null, ordersMsg = null;   /* functions: the text in the current language */
  var savedAt = '', updatedAt = '', lastSig = '', timer = 0, loads = 0, dayAway = false;
  /* the menu card: the draft being edited ({ meals, until, cats: { starter: [dish, …] } }), whether it is the default one */
  var cardDraft = null, cardDirty = false, cardSaving = false, cardDefault = true, cardMsg = null, cardBad = false, cardSavedAt = '';

  /* ---------- small tools ---------- */
  function tr(s, vars) { return I18N.t(lang, s, vars); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: this visit only */ } }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return dayOf(d); }
  function parseStamp(s) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null; }
  /* the evening before at 18:00, as the server does */
  function defaultDeadline(s) { return addDays(s, -1) + 'T18:00'; }
  function fmt(d, o) { try { return new Intl.DateTimeFormat(I18N.BCP47[lang] || 'de-DE', o).format(d); } catch (e) { return dayOf(d); } }
  function longDay(s) { return DATE_RE.test(s) ? fmt(parseDay(s), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  function shortDay(s) { return DATE_RE.test(s) ? fmt(parseDay(s), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : ''; }
  function shortStamp(s) { var d = parseStamp(s); return d ? fmt(d, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
  function clock() { return fmt(new Date(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function hhmm(stamp) { var d = parseStamp(stamp); return d ? fmt(d, { hour: '2-digit', minute: '2-digit' }) : ''; }
  function idPart(s) { return String(s).replace(/[^A-Za-z0-9_-]/g, '_'); }

  function mealName(m) { return m === 'dinner' ? tr('Dinner') : tr('Lunch'); }
  function courseName(c) { return c === 'starter' ? tr('Starter') : c === 'main' ? tr('Main course') : c === 'drinks' ? tr('Drink') : tr('Dessert'); }
  function catName(c) { return c === 'starter' ? tr('Starters') : c === 'main' ? tr('Main dishes') : c === 'drinks' ? tr('Drinks') : tr('Desserts'); }
  /* something to order on the day: the daily menu or the card (the server's totals per meal) */
  function hasOffer(d) { return !!(d && d.totals && Object.keys(d.totals).length); }
  function tagName(t) { return t === 'veg' ? tr('vegetarian') : t === 'pork' ? tr('with pork') : t === 'soft' ? tr('soft food') : tr('for diabetics'); }

  /* ---------- the server ---------- */
  function call(method, p, body, photo) {
    var h = {}, opt = { method: method, cache: 'no-store', headers: h };
    if (token) h.Authorization = 'Kitchen ' + token;
    if (photo) { h['Content-Type'] = photo.type; opt.body = photo.blob; }
    else if (body) { h['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    return fetch(API + p, opt).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j || {} }; }, function () { return { status: r.status, body: {} }; });
    });
  }
  /* 403 on a kitchen call: the token is no longer right (new team code): ask for the code again */
  function denied(r) { if (r.status === 403) { showLogin(); return true; } return false; }

  /* ---------- the screens ---------- */
  function screen(which) {
    $('cWait').hidden = which !== 'wait';
    $('cLoginBox').hidden = which !== 'login';
    $('cOffline').hidden = which !== 'offline';
    $('cApp').hidden = which !== 'app';
    $('cViews').hidden = which !== 'app';
  }
  function showLogin() {
    authed = false;
    screen('login');
    renderLogin();
    try { $('cCode').focus(); } catch (e) { /* not focusable yet */ }
  }
  function start() {
    screen('wait');
    return call('GET', 'kitchen/me').then(function (r) {
      if (r.status === 200) {
        authed = true;
        today = r.body.today || today; tomorrow = r.body.tomorrow || tomorrow;
        if (!date) date = tomorrow;
        screen('app');
        show(view);
        return Promise.all([loadDay(), loadDays(), loadCard()]);
      }
      if (r.status === 403) { showLogin(); return null; }
      screen('offline');
      return null;
    }, function () { screen('offline'); });
  }
  function login(e) {
    if (e) e.preventDefault();
    var code = $('cCode').value.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { loginMsg = function () { return tr('Type the 6-character code.'); }; renderLogin(); $('cCode').focus(); return; }
    $('cLogin').disabled = true;
    call('POST', 'kitchen/login', { code: code }).then(function (r) {
      $('cLogin').disabled = false;
      if (r.status === 200 && r.body.token) {
        token = String(r.body.token); put(TOKEN_KEY, token);
        $('cCode').value = ''; loginMsg = null; renderLogin();
        start();
        return;
      }
      if (r.status === 429) loginMsg = function () { return tr('Too many tries. Try again in 10 minutes.'); };
      else if (r.status === 403) loginMsg = function () { return tr('This code is not right.'); };
      else loginMsg = function () { return tr('The server does not answer.'); };
      renderLogin();
      $('cCode').select();
    }, function () {
      $('cLogin').disabled = false;
      loginMsg = function () { return tr('The server does not answer.'); };
      renderLogin();
    });
  }
  function renderLogin() {
    var t = loginMsg ? loginMsg() : '';
    $('cLoginErr').textContent = t; $('cLoginErr').hidden = !t;
  }

  /* ---------- the day ---------- */
  function loadDay(silent) {
    var want = date, n = ++loads;
    return call('GET', 'kitchen/day?date=' + encodeURIComponent(want)).then(function (r) {
      if (want !== date || n !== loads) return;
      if (denied(r)) return;
      if (r.status !== 200) { netMsg = function () { return tr('The server does not answer.'); }; renderNet(); return; }
      var b = r.body;
      today = b.today || today; tomorrow = b.tomorrow || tomorrow;
      day = b; updatedAt = clock(); netMsg = null;
      if (!dirty) { draft = fromMenu(b.menu, want); renderEditor(); }
      renderNet(); renderDayBar(); renderSaveState(); renderMenuNote(); renderOrders(!silent);
    }, function () {
      if (want !== date) return;
      netMsg = function () { return tr('The server does not answer.'); };
      renderNet();
    });
  }
  function loadDays() {
    return call('GET', 'kitchen/days').then(function (r) {
      if (denied(r) || r.status !== 200) return;
      days = (r.body.days || []).filter(function (x) { return x && DATE_RE.test(x.date); });
      renderDays();
    }, function () { /* the list stays as it was */ });
  }
  function setDate(d) {
    d = String(d || '');
    if (!DATE_RE.test(d)) { $('cDate').value = date; return Promise.resolve(false); }
    if (d === date) return loadDay().then(function () { return true; });
    if (dirty && !window.confirm(tr('Unsaved changes will be lost. Continue?'))) { $('cDate').value = date; return Promise.resolve(false); }
    date = d; day = null; draft = null; dirty = false; lastSig = ''; savedAt = ''; saveMsg = null; ordersMsg = null;
    renderDayBar(); renderEditor(); renderSaveState(); renderMenuNote(); renderOrders(true); renderDays();
    return loadDay().then(function () { return true; });
  }
  function renderNet() {
    var t = netMsg ? netMsg() : '';
    $('cNet').textContent = t; $('cNet').hidden = !t;
  }
  function renderDayBar() {
    $('cDate').value = date;
    $('cDayLabel').textContent = longDay(date);
    var rel = !date ? '' : date === today ? tr('today') : date === tomorrow ? tr('tomorrow') : (today && date === addDays(today, -1)) ? tr('yesterday') : '';
    $('cRel').textContent = rel; $('cRel').hidden = !rel;
    var menu = day && day.date === date ? day.menu : null, st = '';
    if (day && day.date === date) {
      var when = day.deadline || (menu && menu.deadline) || '';
      if (!menu && !hasOffer(day)) st = tr('No menu yet');
      else st = (menu ? '' : tr('No menu plan: the menu card applies') + ' · ') +
        (day.open ? tr('Choice open until {t}', { t: shortStamp(when) }) : tr('Choice closed since {t}', { t: shortStamp(when) }));
    }
    $('cState').textContent = st;
    $('cState').className = 'cstate' + (day && day.date === date && hasOffer(day) && !day.open ? ' cclosed' : '');
    var closed = !!(menu && !day.open);
    $('cClosed').hidden = !closed;
    $('cClosed').textContent = closed ? tr('The deadline has passed: residents can no longer choose on the tablet.') + (view === 'menu' ? ' ' + tr('Change the deadline to open it again.') : '') : '';
    each(document.querySelectorAll('.ctday'), function (el) { el.textContent = shortDay(date); el.hidden = !dayAway || !date; });
    $('cToday').className = 'cbtn' + (date === today ? ' con' : '');
    $('cTomorrow').className = 'cbtn' + (date === tomorrow ? ' con' : '');
  }

  /* ---------- the menu editor ---------- */
  function blank() { return { id: '', name: '', desc: '', tags: [], allergens: '', photo: '' }; }
  function fromMenu(menu, d) {
    var out = { deadline: (menu && STAMP_RE.test(menu.deadline || '')) ? menu.deadline : defaultDeadline(d), meals: {} };
    MEALS.forEach(function (m) {
      out.meals[m] = {};
      COURSES.forEach(function (c) {
        var list = (menu && menu.meals && menu.meals[m] && menu.meals[m][c]) || [];
        out.meals[m][c] = list.map(function (x) {
          return { id: x.id || '', name: x.name || '', desc: x.desc || '', tags: (x.tags || []).slice(), allergens: (x.allergens || []).join(', '), photo: x.photo || '' };
        });
        /* a day without a menu starts with one empty dish per course, ready to type */
        if (!menu) out.meals[m][c].push(blank());
      });
    });
    return out;
  }
  function splitAllergens(s) { return String(s || '').split(/[,;]/).map(function (a) { return a.replace(/^\s+|\s+$/g, ''); }).filter(Boolean); }
  function used(d) { return !!(d.name.trim() || d.desc.trim() || d.tags.length || d.allergens.trim() || d.photo); }
  function toBody() {
    var meals = {};
    MEALS.forEach(function (m) {
      COURSES.forEach(function (c) {
        var list = draft.meals[m][c].filter(function (d) { return d.name.trim(); }).map(function (d) {
          var o = { name: d.name.trim(), desc: d.desc.trim(), tags: TAGS.filter(function (t) { return d.tags.indexOf(t) >= 0; }), allergens: splitAllergens(d.allergens), photo: d.photo || '' };
          if (d.id) o.id = d.id;   /* the orders refer to it */
          return o;
        });
        if (list.length) { meals[m] = meals[m] || {}; meals[m][c] = list; }
      });
    });
    return { date: date, deadline: STAMP_RE.test(draft.deadline) ? draft.deadline : defaultDeadline(date), meals: meals };
  }
  function dishCount(d) { var n = 0; MEALS.forEach(function (m) { COURSES.forEach(function (c) { n += d.meals[m][c].filter(function (x) { return x.name.trim(); }).length; }); }); return n; }

  /* id: the dish's element id ('cDish-lunch-main-0' in the menu plan, 'cCard-main-0' on the card) */
  function photoHtml(id, d) {
    if (d._busy) return '<div class="cphbox cphbusy"><span>' + esc(tr('Uploading…')) + '</span></div>';
    if (d.photo) return '<div class="cphbox"><img src="' + ORIGIN + 'meals/photo/' + esc(d.photo) + '" alt=""></div><button type="button" class="clink" data-act="unphoto" id="' + id + '-unphoto">' + esc(tr('Remove the photo')) + '</button>';
    return '<label class="cphbox cphadd"><input type="file" accept="image/jpeg,image/png,image/webp,image/*" id="' + id + '-photo" data-act="photo"><span>' + esc(tr('Add a photo')) + '</span></label>' +
      (d._err ? '<span class="cpherr" role="alert">' + esc(d._err()) + '</span>' : '');
  }
  function dishHtml(m, c, i, d) {
    var id = 'cDish-' + m + '-' + c + '-' + i;
    var h = '<div class="cdish" id="' + id + '" data-m="' + m + '" data-c="' + c + '" data-i="' + i + '">';
    h += '<div class="cph" id="' + id + '-ph">' + photoHtml(id, d) + '</div>';
    h += '<div class="cfields">';
    h += '<input type="text" class="cin cname" id="' + id + '-name" data-f="name" maxlength="60" autocomplete="off" value="' + esc(d.name) + '" placeholder="' + esc(tr('Dish name')) + '" aria-label="' + esc(tr('Dish name')) + '">';
    h += '<input type="text" class="cin cdesc" id="' + id + '-desc" data-f="desc" maxlength="140" autocomplete="off" value="' + esc(d.desc) + '" placeholder="' + esc(tr('Short description')) + '" aria-label="' + esc(tr('Short description')) + '">';
    h += '<div class="ctags">';
    TAGS.forEach(function (t) {
      h += '<label class="ctag"><input type="checkbox" id="' + id + '-' + t + '" data-tag="' + t + '"' + (d.tags.indexOf(t) >= 0 ? ' checked' : '') + '><span>' + esc(tagName(t)) + '</span></label>';
    });
    h += '</div>';
    h += '<div class="clast"><input type="text" class="cin call" id="' + id + '-allergens" data-f="allergens" maxlength="200" autocomplete="off" value="' + esc(d.allergens) + '" placeholder="' + esc(tr('Allergens, separated by commas')) + '" aria-label="' + esc(tr('Allergens, separated by commas')) + '">';
    h += '<button type="button" class="clink cremove" data-act="remove" id="' + id + '-remove">' + esc(tr('Remove')) + '</button></div>';
    h += '</div>';
    return h + '</div>';
  }
  function renderEditor() {
    var box = $('cEditor');
    if (!draft) { box.innerHTML = ''; $('cDeadline').value = ''; return; }
    $('cDeadline').value = draft.deadline;
    var h = '';
    MEALS.forEach(function (m) {
      h += '<section class="cmeal" id="cMeal-' + m + '" data-m="' + m + '"><h2>' + esc(mealName(m)) + '</h2><div class="ccourses">';
      COURSES.forEach(function (c) {
        var list = draft.meals[m][c];
        h += '<div class="ccourse" id="cCourse-' + m + '-' + c + '"><h3>' + esc(courseName(c)) + '</h3>';
        if (!list.length) h += '<p class="coff">' + esc(tr('Not offered')) + '</p>';
        list.forEach(function (d, i) { h += dishHtml(m, c, i, d); });
        if (list.length < MAX_DISHES) h += '<button type="button" class="cbtn cadd" id="cAdd-' + m + '-' + c + '" data-act="add" data-m="' + m + '" data-c="' + c + '">+ ' + esc(tr('Add a dish')) + '</button>';
        h += '</div>';
      });
      h += '</div></section>';
    });
    box.innerHTML = h;
  }
  function changed() { dirty = true; saveMsg = null; renderSaveState(); }

  /* ---------- the menu card editor ---------- */
  function cardBlank() { return { id: '', name: '', desc: '', tags: [], allergens: '', photo: '', name_fr: '', desc_fr: '', name_en: '', desc_en: '', _card: true }; }
  function fromCard(k) {
    var out = { meals: (k && k.meals && k.meals.length) ? k.meals.slice() : ['lunch'], until: (k && UNTIL_RE.test(k.until || '')) ? k.until : '18:00', cats: {} };
    CATS.forEach(function (c) {
      out.cats[c] = ((k && k.cats && k.cats[c]) || []).map(function (x) {
        var t = x.tr || {}, fr = t.fr || {}, en = t.en || {};
        return { id: x.id || '', name: x.name || '', desc: x.desc || '', tags: (x.tags || []).slice(), allergens: (x.allergens || []).join(', '), photo: x.photo || '',
          name_fr: fr.name || '', desc_fr: fr.desc || '', name_en: en.name || '', desc_en: en.desc || '', _card: true };
      });
    });
    return out;
  }
  function cardBody() {
    var cats = {};
    CATS.forEach(function (c) {
      cats[c] = cardDraft.cats[c].filter(function (d) { return d.name.trim(); }).map(function (d) {
        var o = { name: d.name.trim(), desc: d.desc.trim(), tags: TAGS.filter(function (t) { return d.tags.indexOf(t) >= 0; }), allergens: splitAllergens(d.allergens), photo: d.photo || '', tr: {} };
        TR_LANGS.forEach(function (l) { var n = d['name_' + l].trim(), s = d['desc_' + l].trim(); if (n || s) o.tr[l] = { name: n, desc: s }; });
        if (d.id) o.id = d.id;
        return o;
      });
    });
    return { meals: cardDraft.meals.slice(), until: cardDraft.until, cats: cats };
  }
  function cardCount() { var n = 0; if (cardDraft) CATS.forEach(function (c) { n += cardDraft.cats[c].filter(function (x) { return x.name.trim(); }).length; }); return n; }
  /* drinks: only "for diabetics" (sugar-free) means something */
  function cardTags(c) { return c === 'drinks' ? ['diabetic'] : TAGS; }
  function cardDishHtml(c, i, d) {
    var id = 'cCard-' + c + '-' + i, hasTr = !!(d.name_fr || d.desc_fr || d.name_en || d.desc_en);
    var h = '<div class="cdish" id="' + id + '" data-card="1" data-c="' + c + '" data-i="' + i + '">';
    h += '<div class="cph" id="' + id + '-ph">' + photoHtml(id, d) + '</div>';
    h += '<div class="cfields">';
    h += '<input type="text" class="cin cname" id="' + id + '-name" data-f="name" maxlength="60" autocomplete="off" value="' + esc(d.name) + '" placeholder="' + esc(tr('Dish name')) + '" aria-label="' + esc(tr('Dish name')) + '">';
    h += '<input type="text" class="cin cdesc" id="' + id + '-desc" data-f="desc" maxlength="140" autocomplete="off" value="' + esc(d.desc) + '" placeholder="' + esc(tr('Short description')) + '" aria-label="' + esc(tr('Short description')) + '">';
    h += '<div class="ctags">';
    cardTags(c).forEach(function (t) {
      h += '<label class="ctag"><input type="checkbox" id="' + id + '-' + t + '" data-tag="' + t + '"' + (d.tags.indexOf(t) >= 0 ? ' checked' : '') + '><span>' + esc(tagName(t)) + '</span></label>';
    });
    h += '</div>';
    h += '<input type="text" class="cin call" id="' + id + '-allergens" data-f="allergens" maxlength="200" autocomplete="off" value="' + esc(d.allergens) + '" placeholder="' + esc(tr('Allergens, separated by commas')) + '" aria-label="' + esc(tr('Allergens, separated by commas')) + '">';
    h += '<details class="ctr"' + (d._open ? ' open' : '') + '><summary>' + esc(hasTr ? tr('Names for French and English residents') : tr('Add French and English names')) + '</summary><div class="ctrgrid">';
    [['name_fr', 'Name (French)', 60], ['desc_fr', 'Description (French)', 140], ['name_en', 'Name (English)', 60], ['desc_en', 'Description (English)', 140]].forEach(function (f) {
      h += '<input type="text" class="cin ctrin" id="' + id + '-' + f[0] + '" data-f="' + f[0] + '" maxlength="' + f[2] + '" autocomplete="off" value="' + esc(d[f[0]]) + '" placeholder="' + esc(tr(f[1])) + '" aria-label="' + esc(tr(f[1])) + '">';
    });
    h += '</div></details>';
    h += '<div class="clast clastcard"><span class="cgrow"></span><button type="button" class="clink cremove" data-act="remove" id="' + id + '-remove">' + esc(tr('Remove')) + '</button></div>';
    h += '</div>';
    return h + '</div>';
  }
  function renderCard() {
    var box = $('cCardEditor');
    if (!cardDraft) { box.innerHTML = ''; return; }
    $('cCardLunch').checked = cardDraft.meals.indexOf('lunch') >= 0;
    $('cCardDinner').checked = cardDraft.meals.indexOf('dinner') >= 0;
    $('cCardUntil').value = cardDraft.until;
    var h = '<div class="ccats">';
    CATS.forEach(function (c) {
      var list = cardDraft.cats[c];
      h += '<section class="ccat" id="cCat-' + c + '" data-c="' + c + '"><h2>' + esc(catName(c)) + '<span class="ccount">' + esc(list.length + ' / ' + MAX_CARD) + '</span></h2>';
      if (!list.length) h += '<p class="coff">' + esc(tr('Not offered')) + '</p>';
      list.forEach(function (d, i) { h += cardDishHtml(c, i, d); });
      if (list.length < MAX_CARD) h += '<button type="button" class="cbtn cadd" id="cCardAdd-' + c + '" data-act="add" data-card="1" data-c="' + c + '">+ ' + esc(tr('Add a dish')) + '</button>';
      h += '</section>';
    });
    box.innerHTML = h + '</div>';
  }
  function renderCardState() {
    var el = $('cCardState'), t = '', bad = false;
    if (cardSaving) t = tr('Saving…');
    else if (uploads && view === 'card') t = tr('Uploading…');
    else if (cardMsg) { t = cardMsg(); bad = cardBad; }
    else if (cardDirty) t = tr('Not saved');
    else if (cardSavedAt) t = tr('Saved at {t}', { t: cardSavedAt });
    else if (cardDraft && cardDefault) t = tr('This is the default card.');
    el.textContent = t;
    el.className = 'csavestate' + (bad ? ' cbad' : cardDirty && !cardSaving ? ' cdirty' : '');
    $('cCardSave').disabled = cardSaving || !!uploads || !cardDraft;
    $('cCardReset').disabled = cardSaving || !cardDraft || (cardDefault && !cardDirty);
  }
  function cardChanged() { cardDirty = true; cardMsg = null; renderCardState(); }
  function loadCard() {
    return call('GET', 'kitchen/card').then(function (r) {
      if (denied(r) || r.status !== 200) return;
      cardDefault = !!r.body.isDefault;
      if (!cardDirty) { cardDraft = fromCard(r.body.card); renderCard(); }
      renderCardState();
    }, function () { /* the card stays as it was */ });
  }
  function saveCard(reset) {
    if (cardSaving || uploads || !cardDraft) return Promise.resolve(false);
    if (!reset) {
      for (var a = 0; a < CATS.length; a++) {
        var list = cardDraft.cats[CATS[a]];
        for (var i = 0; i < list.length; i++) {
          if (used(list[i]) && !list[i].name.trim()) {
            cardMsg = function () { return tr('Every dish needs a name.'); }; cardBad = true; renderCardState();
            var f = $('cCard-' + CATS[a] + '-' + i + '-name');
            if (f) f.focus();
            return Promise.resolve(false);
          }
        }
      }
      if (!cardCount()) { cardMsg = function () { return tr('The menu card needs at least one dish.'); }; cardBad = true; renderCardState(); return Promise.resolve(false); }
    }
    cardSaving = true; cardMsg = null; renderCardState();
    return call('POST', 'kitchen/card', reset ? { reset: true } : { card: cardBody() }).then(function (r) {
      cardSaving = false;
      if (denied(r)) return false;
      if (r.status !== 200) { cardMsg = function () { return tr('Not saved: please try again.'); }; cardBad = true; renderCardState(); return false; }
      cardDirty = false; cardDefault = !!r.body.isDefault; cardSavedAt = fmt(new Date(), { hour: '2-digit', minute: '2-digit' });
      cardMsg = reset ? function () { return tr('The default card is back.'); } : null; cardBad = false;
      cardDraft = fromCard(r.body.card);
      renderCard(); renderCardState();
      return loadDay(true).then(function () { return true; });
    }, function () { cardSaving = false; cardMsg = function () { return tr('The server does not answer.'); }; cardBad = true; renderCardState(); return false; });
  }
  function resetCard() {
    if (!cardDraft) return Promise.resolve(false);
    if (!window.confirm(tr('Replace the menu card with the default card?'))) return Promise.resolve(false);
    return saveCard(true);
  }

  function dishOf(el) {
    var box = el.closest ? el.closest('.cdish') : null;
    if (!box) return null;
    var c = box.getAttribute('data-c'), i = +box.getAttribute('data-i'), list;
    if (box.getAttribute('data-card')) {
      list = cardDraft && cardDraft.cats[c];
      return list && list[i] ? { card: true, c: c, i: i, list: list, dish: list[i], box: box } : null;
    }
    if (!draft) return null;
    var m = box.getAttribute('data-m');
    list = draft.meals[m] && draft.meals[m][c];
    return list && list[i] ? { m: m, c: c, i: i, list: list, dish: list[i], box: box } : null;
  }
  function onEditorInput(e) {
    var t = e.target, f = t.getAttribute('data-f'), x = dishOf(t);
    if (!x) return;
    var done = x.card ? cardChanged : changed;
    if (f) { x.dish[f] = t.value; done(); return; }
    var tag = t.getAttribute('data-tag');
    if (tag) {
      var k = x.dish.tags.indexOf(tag);
      if (t.checked && k < 0) x.dish.tags.push(tag);
      if (!t.checked && k >= 0) x.dish.tags.splice(k, 1);
      done();
    }
  }
  function onEditorChange(e) {
    var t = e.target;
    if (t.getAttribute('data-act') === 'photo') { var x = dishOf(t); if (x && t.files && t.files[0]) upload(x.dish, t.files[0]); return; }
    if (t.getAttribute('data-tag')) onEditorInput(e);
  }
  function onEditorClick(e) {
    var s = e.target.closest ? e.target.closest('summary') : null;
    if (s) { var y = dishOf(s); if (y) y.dish._open = !s.parentNode.open; return; }
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.tagName === 'INPUT') return;
    var act = b.getAttribute('data-act'), f, list;
    if (act === 'add' && b.getAttribute('data-card')) {
      list = cardDraft.cats[b.getAttribute('data-c')];
      if (list.length >= MAX_CARD) return;
      list.push(cardBlank()); cardChanged(); renderCard();
      f = $('cCard-' + b.getAttribute('data-c') + '-' + (list.length - 1) + '-name');
      if (f) f.focus();
      return;
    }
    if (act === 'add') {
      list = draft.meals[b.getAttribute('data-m')][b.getAttribute('data-c')];
      if (list.length >= MAX_DISHES) return;
      list.push(blank()); changed(); renderEditor();
      f = $('cDish-' + b.getAttribute('data-m') + '-' + b.getAttribute('data-c') + '-' + (list.length - 1) + '-name');
      if (f) f.focus();
      return;
    }
    var x = dishOf(b);
    if (!x) return;
    if (act === 'remove') {
      if (used(x.dish) && x.dish.name.trim() && !window.confirm(tr('Remove “{name}”?', { name: x.dish.name.trim() }))) return;
      x.list.splice(x.i, 1);
      if (x.card) { cardChanged(); renderCard(); } else { changed(); renderEditor(); }
      return;
    }
    if (act === 'unphoto') { x.dish.photo = ''; x.dish._err = null; if (x.card) cardChanged(); else changed(); refreshPhoto(x.dish); }
  }
  /* the element id of a dish (menu plan or card) */
  function where(dish) {
    var a, b, i;
    if (draft) {
      for (a = 0; a < MEALS.length; a++) for (b = 0; b < COURSES.length; b++) {
        i = draft.meals[MEALS[a]][COURSES[b]].indexOf(dish);
        if (i >= 0) return 'cDish-' + MEALS[a] + '-' + COURSES[b] + '-' + i;
      }
    }
    if (cardDraft) {
      for (b = 0; b < CATS.length; b++) { i = cardDraft.cats[CATS[b]].indexOf(dish); if (i >= 0) return 'cCard-' + CATS[b] + '-' + i; }
    }
    return '';
  }
  function refreshPhoto(dish) {
    var id = where(dish), box = id && $(id + '-ph');
    if (box) box.innerHTML = photoHtml(id, dish);
  }

  /* ---------- photos: big pictures are made smaller (about 1024 px, JPEG) before they are sent ---------- */
  function shrink(file) {
    return new Promise(function (ok, ko) {
      var type = String(file.type || '').toLowerCase(), direct = /^image\/(jpeg|png|webp)$/.test(type) && file.size <= 600 * 1024;
      var url = '', img = new Image();
      try { url = URL.createObjectURL(file); } catch (e) { ko(new Error('bad-photo')); return; }
      img.onload = function () {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (direct && w <= 1600 && h <= 1600) { URL.revokeObjectURL(url); ok({ blob: file, type: type }); return; }
        var k = Math.min(1, PHOTO_SIDE / Math.max(w, h, 1)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        var g = cv.getContext('2d');
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, cw, ch); g.drawImage(img, 0, 0, cw, ch);
        URL.revokeObjectURL(url);
        var done = function (b) { if (b && b.size) ok({ blob: b, type: 'image/jpeg' }); else ko(new Error('bad-photo')); };
        if (cv.toBlob) { cv.toBlob(done, 'image/jpeg', 0.85); return; }
        try {
          var bin = atob(cv.toDataURL('image/jpeg', 0.85).split(',')[1]), arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          done(new Blob([arr], { type: 'image/jpeg' }));
        } catch (e) { ko(new Error('bad-photo')); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('bad-photo')); };
      img.src = url;
    });
  }
  function upload(dish, file) {
    var states = function () { renderSaveState(); renderCardState(); };
    dish._busy = true; dish._err = null; uploads++;
    refreshPhoto(dish); states();
    var fail = function (msg) { dish._busy = false; dish._err = msg; uploads--; refreshPhoto(dish); states(); };
    shrink(file).then(function (p) {
      if (p.blob.size > PHOTO_MAX) { fail(function () { return tr('The photo is too big.'); }); return; }
      return call('POST', 'kitchen/photo', null, p).then(function (r) {
        if (denied(r)) { fail(null); return; }
        if (r.status === 200 && r.body.id) { dish._busy = false; uploads--; dish.photo = String(r.body.id); if (dish._card) cardChanged(); else changed(); refreshPhoto(dish); states(); return; }
        if (r.status === 413) fail(function () { return tr('The photo is too big.'); });
        else fail(function () { return tr('This picture cannot be used.'); });
      }, function () { fail(function () { return tr('The server does not answer.'); }); });
    }, function () { fail(function () { return tr('This picture cannot be used.'); }); });
  }

  /* ---------- save, copy, empty ---------- */
  function renderSaveState() {
    var el = $('cSaveState'), t = '', bad = false;
    if (saving) t = tr('Saving…');
    else if (uploads) t = tr('Uploading…');
    else if (saveMsg) { t = saveMsg(); bad = saveBad; }
    else if (dirty) t = tr('Not saved');
    else if (savedAt) t = tr('Saved at {t}', { t: savedAt });
    el.textContent = t;
    el.className = 'csavestate' + (bad ? ' cbad' : dirty && !saving ? ' cdirty' : '');
    $('cSave').disabled = saving || !!uploads || !draft;
  }
  function say(fn, bad) { saveMsg = fn; saveBad = !!bad; renderSaveState(); }
  function save() {
    if (saving || uploads || !draft) return Promise.resolve(false);
    for (var a = 0; a < MEALS.length; a++) for (var b = 0; b < COURSES.length; b++) {
      var list = draft.meals[MEALS[a]][COURSES[b]];
      for (var i = 0; i < list.length; i++) {
        if (used(list[i]) && !list[i].name.trim()) {
          say(function () { return tr('Every dish needs a name.'); }, true);
          var f = $('cDish-' + MEALS[a] + '-' + COURSES[b] + '-' + i + '-name');
          if (f) f.focus();
          return Promise.resolve(false);
        }
      }
    }
    var want = date, body = toBody();
    saving = true; saveMsg = null; renderSaveState();
    return call('POST', 'kitchen/menu', body).then(function (r) {
      saving = false;
      if (denied(r)) return false;
      if (r.status !== 200) { say(function () { return tr('Not saved: please try again.'); }, true); return false; }
      if (want !== date) return true;
      dirty = false; savedAt = fmt(new Date(), { hour: '2-digit', minute: '2-digit' });
      saveMsg = r.body.menu ? null : function () { return tr('Saved: no menu for this day.'); }; saveBad = false;
      draft = fromMenu(r.body.menu, want);
      renderEditor(); renderSaveState();
      return Promise.all([loadDay(), loadDays()]).then(function () { return true; });
    }, function () { saving = false; say(function () { return tr('The server does not answer.'); }, true); return false; });
  }
  function renderDays() {
    var sel = $('cCopyFrom'), keep = sel.value;
    var h = '<option value="">' + esc(tr('Copy the menu of…')) + '</option>';
    days.forEach(function (x) {
      if (x.date === date) return;
      var n = +x.dishes || 0;
      h += '<option value="' + esc(x.date) + '">' + esc(shortDay(x.date) + ' · ' + (n === 1 ? tr('1 dish') : tr('{n} dishes', { n: n }))) + '</option>';
    });
    sel.innerHTML = h;
    sel.value = keep;
    if (sel.value !== keep) sel.value = '';
    $('cCopy').disabled = !sel.value;
  }
  function copy() {
    var from = $('cCopyFrom').value, want = date;
    if (!DATE_RE.test(from) || from === date) return Promise.resolve(false);
    var has = (day && day.menu) || (draft && dishCount(draft) > 0);
    if (has && !window.confirm(tr('Replace the menu of this day with the one of {day}?', { day: shortDay(from) }))) return Promise.resolve(false);
    $('cCopy').disabled = true;
    return call('POST', 'kitchen/copy', { from: from, to: want }).then(function (r) {
      if (denied(r)) return false;
      if (r.status !== 200) { say(r.status === 404 ? function () { return tr('This day has no menu.'); } : function () { return tr('Not saved: please try again.'); }, true); renderDays(); return false; }
      if (want !== date) return true;
      dirty = false; savedAt = fmt(new Date(), { hour: '2-digit', minute: '2-digit' });
      say(function () { return tr('Copied from {day} and saved.', { day: shortDay(from) }); });
      draft = fromMenu(r.body.menu, want);
      $('cCopyFrom').value = '';
      renderEditor();
      return Promise.all([loadDay(), loadDays()]).then(function () { return true; });
    }, function () { say(function () { return tr('The server does not answer.'); }, true); renderDays(); return false; });
  }
  function clearDay() {
    if (!draft || !dishCount(draft)) return;
    if (!window.confirm(tr('Remove all dishes of this day?'))) return;
    MEALS.forEach(function (m) { COURSES.forEach(function (c) { draft.meals[m][c] = []; }); });
    changed(); renderEditor();
  }
  function renderMenuNote() {
    var n = day && day.date === date && day.menu && day.counts ? day.counts.answered : 0, t = '';
    if (n === 1) t = tr('One resident has already answered. Change dishes rather than removing them.');
    else if (n > 1) t = tr('{n} residents have already answered. Change dishes rather than removing them.', { n: n });
    $('cMenuNote').textContent = t; $('cMenuNote').hidden = !t;
  }

  /* ---------- the orders ---------- */
  function stat(n, label, cls) { return '<div class="cstat' + (cls ? ' ' + cls : '') + '"><span class="cbig">' + n + '</span><span class="clab">' + esc(label) + '</span></div>'; }
  function tally() {
    var n = { residents: 0, chosen: 0, declined: 0, open: 0 };
    ((day && day.rows) || []).forEach(function (r) { n.residents++; if (r.status === 'chosen') n.chosen++; else if (r.status === 'declined') n.declined++; else n.open++; });
    return n;
  }
  function notesHtml(diet) {
    diet = diet || {};
    var p = [];
    if (diet.veg) p.push(esc(tr('vegetarian')));
    if (diet.nopork) p.push(esc(tr('no pork')));
    if (diet.soft) p.push(esc(tr('soft food')));
    if (diet.diabetic) p.push(esc(tr('diabetic')));
    if (diet.allergies) p.push('<span class="callg">' + esc(tr('Allergies:')) + ' <span data-i18n-skip>' + esc(diet.allergies) + '</span></span>');
    return p.join(', ');
  }
  function totalsHtml() {
    if (!day) return '';
    if (!hasOffer(day)) return '<div class="cempty"><p>' + esc(tr('No menu for this day.')) + '</p><button type="button" class="cbtn" id="cMakeMenu" data-go="menu">' + esc(tr('Make the menu')) + '</button></div>';
    var h = day.menu ? '' : '<p class="cnote cnote-card">' + esc(tr('No menu plan for this day: the residents choose from the menu card. Only the dishes ordered are listed.')) + '</p>';
    MEALS.forEach(function (m) {
      var t = day.totals && day.totals[m];
      if (!t) return;
      h += '<section class="ctm" id="cTotals-' + m + '" data-meal="' + m + '"><h3>' + esc(mealName(m)) + '</h3><div class="ctcs">';
      CATS.forEach(function (c) {
        var x = t[c];
        if (!x) return;
        var sum = 0;
        x.dishes.forEach(function (d) { sum += d.n; });
        h += '<div class="ctc" data-course="' + c + '"><h4><span>' + esc(courseName(c)) + '</span><span class="csum">' + esc(sum === 1 ? tr('1 portion') : tr('{n} portions', { n: sum })) + '</span></h4><table class="ctt"><tbody>';
        x.dishes.forEach(function (d) {
          h += '<tr data-dish="' + esc(d.id) + '"' + (d.card ? ' class="ccardrow"' : '') + '><td class="cnum">' + (+d.n || 0) + '</td><td class="cdn"><span class="cdname" data-i18n-skip>' + esc(d.name) + '</span>' +
            (d.card ? '<span class="cfrom">' + esc(tr('menu card')) + '</span>' : '') +
            (d.small ? '<span class="csmall">' + esc(d.small === 1 ? tr('of which 1 small') : tr('of which {n} small', { n: d.small })) + '</span>' : '') + '</td></tr>';
        });
        h += '<tr class="cask"><td class="cnum">' + (+x.none || 0) + '</td><td class="cdn">' + esc(tr('no choice / ask the team')) + '</td></tr>';
        h += '</tbody></table></div>';
      });
      h += '</div></section>';
    });
    return h;
  }
  function roomsHtml() {
    if (!hasOffer(day)) return '';
    var rows = day.rows || [];
    if (!rows.length) return '<p class="cempty">' + esc(tr('No resident list yet: the robot sends it.')) + '</p>';
    var h = '';
    MEALS.forEach(function (m) {
      if (!day.totals[m]) return;
      var cs = CATS.filter(function (c) { return day.totals[m][c]; });
      h += '<section class="crm" id="cRooms-' + m + '" data-meal="' + m + '"><h3>' + esc(mealName(m)) + '<span class="cponly"> · ' + esc(longDay(date)) + '</span></h3>';
      h += '<div class="cscroll"><table class="crt"><thead><tr><th class="cr">' + esc(tr('Room')) + '</th><th class="cnm">' + esc(tr('Name')) + '</th><th class="cnotes">' + esc(tr('Notes')) + '</th><th class="cpo">' + esc(tr('Portion')) + '</th>';
      cs.forEach(function (c) { h += '<th class="cch">' + esc(courseName(c)) + '</th>'; });
      h += '<th class="cdl">' + esc(tr('Delivered')) + '</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var del = r.delivered && r.delivered[m], mine = (r.meals && r.meals[m]) || {};
        h += '<tr data-code="' + esc(r.code) + '" data-meal="' + m + '" class="cs-' + esc(r.status) + (del ? ' cdone' : '') + '">';
        h += '<td class="cr">' + esc(r.room || '–') + '</td><td class="cnm" data-i18n-skip>' + esc(r.name || r.code) + '</td><td class="cnotes">' + notesHtml(r.diet) + '</td>';
        h += '<td class="cpo">' + (r.portion === 'small' ? '<b>' + esc(tr('small')) + '</b>' : esc(tr('normal'))) + '</td>';
        if (r.status === 'open') h += '<td class="cst" colspan="' + cs.length + '">' + esc(tr('not chosen yet')) + '</td>';
        else if (r.status === 'declined') h += '<td class="cst cst-ask" colspan="' + cs.length + '">' + esc(tr('no choice, please ask the team')) + '</td>';
        else {
          cs.forEach(function (c) {
            var v = mine[c];
            h += '<td class="cch">' + (v && v.none ? '<span class="cask">' + esc(tr('no choice / ask the team')) + '</span>' : v && v.name ? '<span data-i18n-skip>' + esc(v.name) + '</span>' : '<span class="cmuted">–</span>') + '</td>';
          });
        }
        h += '<td class="cdl"><label class="cdlab"><input type="checkbox" class="cdel" id="cDel-' + idPart(r.code) + '-' + m + '" data-code="' + esc(r.code) + '" data-meal="' + m + '"' + (del ? ' checked' : '') +
          ' aria-label="' + esc(tr('Delivered')) + '"><span class="cbox"></span><span class="cdt">' + esc(del ? hhmm(del) : '') + '</span></label></td></tr>';
      });
      h += '</tbody></table></div></section>';
    });
    return h;
  }
  function renderOrders(force) {
    var n = tally();
    var ready = !!(day && day.date === date);
    var any = ready && hasOffer(day);
    $('cCounts').innerHTML = any ? stat(n.chosen, tr('Chosen')) + stat(n.declined, tr('No choice, ask the team')) + stat(n.open, tr('Not chosen yet')) + stat(n.residents, tr('Residents'), 'cres') : '';
    $('cUpdated').textContent = ready && updatedAt ? (ordersMsg ? ordersMsg() : tr('Updated {t}', { t: updatedAt })) : '';
    $('cUpdated').className = 'cupdated' + (ordersMsg ? ' cbad' : '');
    $('cPrint').disabled = !any;
    $('cRoomsTitle').hidden = !any;
    $('cTotalsTitle').hidden = !any;
    var sig = lang + '|' + date + '|' + (ready ? JSON.stringify([day.menu, day.totals, day.rows]) : '');
    if (!force && sig === lastSig) return;
    if (pendingDel && !force) return;   /* a tick is on its way: the next refresh draws it */
    lastSig = sig;
    $('cTotals').innerHTML = ready ? totalsHtml() : '';
    $('cRooms').innerHTML = ready ? roomsHtml() : '';
    var p = '';
    if (ready) {
      p = '<h1>' + esc(tr('Orders for {day}', { day: longDay(date) })) + '</h1><p>' + esc(tr('{a} of {n} residents have answered', { a: n.chosen + n.declined, n: n.residents })) +
        ' · ' + esc(tr('Printed {t}', { t: fmt(new Date(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })) + '</p>';
    }
    $('cPrintHead').innerHTML = p;
  }
  function findRow(code) { var rows = (day && day.rows) || []; for (var i = 0; i < rows.length; i++) if (rows[i].code === code) return rows[i]; return null; }
  function onDelivered(cb) {
    var code = cb.getAttribute('data-code'), meal = cb.getAttribute('data-meal'), on = cb.checked, want = date;
    pendingDel++; cb.disabled = true;
    var back = function (msg) {
      pendingDel--; cb.checked = !on; cb.disabled = false;
      ordersMsg = msg; renderOrders(true);
    };
    call('POST', 'kitchen/delivered', { date: want, code: code, meal: meal, on: on }).then(function (r) {
      if (denied(r)) { pendingDel--; return; }
      if (r.status !== 200) { back(function () { return tr('Not saved: please try again.'); }); return; }
      pendingDel--; ordersMsg = null;
      var row = want === date ? findRow(code) : null;
      if (row) row.delivered = r.body.delivered || {};
      renderOrders(true);
    }, function () { back(function () { return tr('The server does not answer.'); }); });
  }

  /* ---------- views, language ---------- */
  function show(v) {
    if (v !== 'menu' && v !== 'orders' && v !== 'card') return;
    view = v;
    $('cMenu').hidden = v !== 'menu'; $('cOrders').hidden = v !== 'orders'; $('cCard').hidden = v !== 'card';
    /* the card is not tied to a day: no day bar */
    $('cDayBar').hidden = v === 'card'; $('cNet').hidden = v === 'card' || !netMsg;
    each(document.querySelectorAll('#cViews [data-view]'), function (b) {
      var on = b.getAttribute('data-view') === v;
      b.className = on ? 'on' : ''; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderDayBar();
    if (v === 'card') $('cClosed').hidden = true;
    if (authed && v === 'orders') loadDay(true);
    if (authed && v === 'menu') loadDays();
    if (authed && v === 'card') loadCard();
  }
  function apply() {
    document.documentElement.lang = lang;
    document.title = tr('Kitchen') + ' · Bellatrix';
    each(document.querySelectorAll('[data-st]'), function (el) { el.textContent = tr(el.getAttribute('data-st')); });
    each(document.querySelectorAll('#cLang [data-ui-lang]'), function (b) {
      var on = b.getAttribute('data-ui-lang') === lang;
      b.className = on ? 'on' : ''; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    $('cLang').setAttribute('aria-label', tr('Language'));
    $('cPrev').setAttribute('aria-label', tr('Previous day')); $('cPrev').title = tr('Previous day');
    $('cNext').setAttribute('aria-label', tr('Next day')); $('cNext').title = tr('Next day');
    $('cDate').setAttribute('aria-label', tr('Day'));
    $('cCode').setAttribute('aria-label', tr('Code of the care team'));
    renderLogin(); renderNet(); renderDayBar(); renderEditor(); renderSaveState(); renderMenuNote(); renderDays(); renderOrders(true); renderCard(); renderCardState();
  }
  function setLang(l) {
    lang = l === 'fr' || l === 'en' ? l : 'de';
    put(LANG_KEY, lang);
    apply();
  }

  /* ---------- start ---------- */
  function readToken() {
    var h = String(location.hash || ''), m = /(?:^#|&)k=([A-Za-z0-9_-]{20,64})(?:&|$)/.exec(h);
    if (m) { token = m[1]; put(TOKEN_KEY, token); }
    else token = ls(TOKEN_KEY).replace(/[^A-Za-z0-9_-]/g, '');
    if (/(?:^#|&)k=/.test(h) && window.history && history.replaceState) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* the address keeps it */ }
    }
  }
  function bind() {
    $('cLoginForm').addEventListener('submit', login);
    $('cRetry').addEventListener('click', start);
    $('cLang').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-ui-lang]') : null;
      if (b) setLang(b.getAttribute('data-ui-lang'));
    });
    $('cViews').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-view]') : null;
      if (b) show(b.getAttribute('data-view'));
    });
    $('cPrev').addEventListener('click', function () { if (date) setDate(addDays(date, -1)); });
    $('cNext').addEventListener('click', function () { if (date) setDate(addDays(date, 1)); });
    $('cToday').addEventListener('click', function () { if (today) setDate(today); });
    $('cTomorrow').addEventListener('click', function () { if (tomorrow) setDate(tomorrow); });
    $('cDate').addEventListener('change', function () { setDate($('cDate').value); });
    $('cDeadline').addEventListener('input', function () { if (draft && STAMP_RE.test($('cDeadline').value)) { draft.deadline = $('cDeadline').value; changed(); } });
    $('cDeadline').addEventListener('change', function () { if (draft && STAMP_RE.test($('cDeadline').value)) { draft.deadline = $('cDeadline').value; changed(); } });
    $('cCopyFrom').addEventListener('change', function () { $('cCopy').disabled = !$('cCopyFrom').value; });
    $('cCopy').addEventListener('click', copy);
    $('cClear').addEventListener('click', clearDay);
    $('cSave').addEventListener('click', save);
    $('cPrint').addEventListener('click', function () { renderOrders(true); window.print(); });
    $('cEditor').addEventListener('input', onEditorInput);
    $('cEditor').addEventListener('change', onEditorChange);
    $('cEditor').addEventListener('click', onEditorClick);
    $('cCardEditor').addEventListener('input', onEditorInput);
    $('cCardEditor').addEventListener('change', onEditorChange);
    $('cCardEditor').addEventListener('click', onEditorClick);
    $('cCardMeals').addEventListener('change', function () {
      if (!cardDraft) return;
      var m = [];
      if ($('cCardLunch').checked) m.push('lunch');
      if ($('cCardDinner').checked) m.push('dinner');
      if (!m.length) { $('cCardLunch').checked = true; m = ['lunch']; }   /* the card serves at least one meal */
      cardDraft.meals = m; cardChanged();
    });
    $('cCardUntil').addEventListener('change', function () { if (cardDraft && UNTIL_RE.test($('cCardUntil').value)) { cardDraft.until = $('cCardUntil').value; cardChanged(); } });
    $('cCardSave').addEventListener('click', function () { saveCard(false); });
    $('cCardReset').addEventListener('click', resetCard);
    $('cOrders').addEventListener('change', function (e) { if (e.target.className === 'cdel') onDelivered(e.target); });
    $('cOrders').addEventListener('click', function (e) { var b = e.target.closest ? e.target.closest('[data-go]') : null; if (b) show(b.getAttribute('data-go')); });
    window.addEventListener('beforeunload', function (e) { if (dirty || cardDirty) { e.preventDefault(); e.returnValue = ''; return ''; } });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && view === 'menu' && authed) { e.preventDefault(); save(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && view === 'card' && authed) { e.preventDefault(); saveCard(false); }
    });
    /* the day bar scrolled away: the tool bar, which stays, shows the day */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (list) {
        dayAway = !list[list.length - 1].isIntersecting;
        each(document.querySelectorAll('.ctday'), function (el) { el.hidden = !dayAway || !date; });
      }, { rootMargin: '-56px 0px 0px 0px' }).observe($('cDayBar'));
    }
    timer = setInterval(function () {
      if (authed && view === 'orders' && !document.hidden && !pendingDel && date) loadDay(true);
    }, REFRESH_MS);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var l = ls(LANG_KEY);
    lang = l === 'fr' || l === 'en' || l === 'de' ? l : 'de';   /* German unless chosen, whatever the browser says */
    readToken();
    /* opened from the robot head: the way back to the Care Team */
    if (window.BellatrixApp && $('cBack')) $('cBack').hidden = false;
    bind();
    apply();
    start();
  });

  /* for tests */
  window.Cuisine = {
    state: function () {
      return { lang: lang, view: view, date: date, today: today, tomorrow: tomorrow, authed: authed, dirty: dirty, saving: saving, uploads: uploads,
        open: !!(day && day.open), day: day ? JSON.parse(JSON.stringify(day)) : null, draft: draft ? JSON.parse(JSON.stringify(draft)) : null, days: days.slice() };
    },
    refresh: function () { return authed ? Promise.all([loadDay(), loadDays(), loadCard()]) : start(); },
    show: function (v) { show(v); },
    setDate: function (d) { return setDate(d); },
    save: save,
    card: function () { return { draft: cardDraft ? JSON.parse(JSON.stringify(cardDraft)) : null, dirty: cardDirty, isDefault: cardDefault, saving: cardSaving }; },
    saveCard: function () { return saveCard(false); },
    lang: setLang
  };
})();
