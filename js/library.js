/* The Library tab of the Care Team app (version 1.13): a small app store of premium apps, never the
   activities of the normal menu. LabLand controls the listing (catalog.apps, signed with the catalog);
   an app is either part of a pack (Chess and Ludo: the board-games pack) or "coming soon".
   - Featured card, category chips, a grid of apps; each app opens a sheet (icon, three previews,
     two sentences, players, minutes, languages).
   - Open: the activity is here and allowed, it is chosen in Activities. Get: the licence and trial
     flow of js/store.js (trial, then download when the pack is downloadable). Soon: not yet.
   - The connection to the Library (address, care home code, licences, activation requests) is
     behind the "Account" button. The rules and the signatures are in store.js.
   Every text goes through ST() (js/i18n-staff.js). ES5 only (the robot's WebView is Chrome 95). */

/* Premium, PER RESIDENT AND PER PRODUCT (1.16, 10 Nov 2026): two separate subscriptions, "Bellatrix Play
   Premium" and "Books Premium"; one never implies the other. The state is window.Premium (js/premium.js,
   v3), shared with the patient screen; the products, the demo prices and the durations are in
   js/premium-config.js (PREMIUM_CONFIG). PILOT: everything is free, no price is shown as a real charge.
   The team flow (contract 2): the team chooses the resident, the product and the duration, then taps
   "Authorise": a payment request goes to the family portal (Premium.authorise); the family pays on a
   SIMULATED form; the robot switches Premium on by itself for that resident and product (Premium.poll).
   Without a portal server or a family account: a short message, and the team's own demo payment as
   the labelled fallback (no card or IBAN field is ever shown here; see the TODO in activate()).
   PlayPremium.open({ patient, product }) shows the window. The Library tab, the Activities banners
   (js/staff.js) and the album/reading settings use this object. */
var PlayPremium = (function () {
  'use strict';
  var MAIN = 'bellatrix-care-lab-v1', INITIALS = 'bellatrix-staff-initials', LEGACY_ASK = 'bellatrix-play-premium-request';
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  var NAMES = { play: 'Bellatrix Play Premium', books: 'Books Premium' };
  var esc = function (s) { return Lab.esc(s); };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function loc() { return LOCALE[ST.lang()] || 'en-GB'; }
  function C() { return (Premium.config && Premium.config()) || window.PREMIUM_CONFIG || {}; }
  /* pilotFree true: 0 is shown. testPayment (default true): the payment is simulated, nothing is debited. */
  function pilot() { return C().pilotFree !== false; }
  function testPay() { return C().testPayment !== false; }
  function currency() { var c = C().currency; return /^[A-Z]{3}$/.test(c || '') ? c : 'EUR'; }
  function centsOf(v) { var n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; }
  /* A product as the Care Team shows it (English keys, translated by ST). */
  function info(p) {
    var id = Premium.product(p) || 'play', c = (C().products || {})[id] || {};
    return { id: id, name: c.name || NAMES[id], short: c.short || (id === 'books' ? 'Books' : 'Music'), icon: c.icon || (id === 'books' ? 'book' : 'crown'),
      category: c.category || (id === 'books' ? 'reading' : 'music-movement'), cents: centsOf(c.monthCents), tagline: c.tagline || '', about: c.about || '',
      benefits: c.benefits && c.benefits.length ? c.benefits.slice(0, 3) : [] };
  }
  function name(p) { return ST(info(p).name); }
  var PLANS = Premium.months().map(function (n) { return { id: 'team-' + n, months: n, name: n === 1 ? '1 month' : n === 3 ? '3 months' : n === 12 ? '12 months' : '{n} months' }; });
  function planOf(id) { for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i]; return null; }
  function planName(p) { return ST(p.name, { n: p.months }); }
  /* 'team-3', 'family-12'…: the months are at the end of the plan id. */
  function monthsOf(planId) { var x = /-(\d+)$/.exec(String(planId || '')); return x ? parseInt(x[1], 10) : 1; }
  /* Premium of that product for this resident now. Without a code: false (never on for "everyone"). */
  function on(code, p) { return !!code && Premium.isOn(code, p); }
  function money(cents) {
    var v = cents / 100;
    try { return new Intl.NumberFormat(loc(), { style: 'currency', currency: currency() }).format(v); } catch (e) { return v.toFixed(2) + ' ' + currency(); }
  }
  /* The demo price of a month and of a plan (only ever shown labelled "demo" in the pilot). */
  function price(p) { return money(info(p).cents); }
  function total(plan, p) { return money(info(p).cents * (plan ? plan.months : 1)); }
  /* What a plan costs as the team sees it. The pilot: 0 (BF-24), never a real charge. */
  function priceLabel(plan, p) { return pilot() ? money(0) : total(plan, p); }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  /* 1.15 callers: the oldest ask as { patient, at, product }, or null. */
  function request() { var a = Premium.asks()[0]; return a ? { patient: a.code, at: a.at, product: a.product } : null; }
  /* The ask of that resident goes (of one product, or of every product). */
  function clearRequest(code, p) { if (code) Premium.unask(code, p); }
  function initials() {
    try { if (window.StaffTools && StaffTools.initials) return StaffTools.initials() || ''; } catch (e) { /* read it below */ }
    return String(get(INITIALS) || '').trim();
  }
  /* The residents known in Care Team (the patients of staff.js), the one chosen in Activities, those
     who asked, those with a request and those who have Premium. */
  function residents() {
    var codes = {}, f = typeof document !== 'undefined' && document.getElementById ? document.getElementById('fParticipant') : null;
    try { Object.keys((JSON.parse(get(MAIN) || '{}') || {}).patients || {}).forEach(function (c) { codes[Premium.norm(c)] = 1; }); } catch (e) { /* none yet */ }
    if (f && f.value.trim()) codes[Premium.norm(f.value)] = 1;
    Premium.asks().forEach(function (a) { codes[a.code] = 1; });
    Premium.requests().forEach(function (q) { codes[q.code] = 1; });
    Premium.listAll().forEach(function (x) { codes[x.code] = 1; });
    delete codes[''];
    var out = Object.keys(codes).sort();
    return out.length ? out : ['P1'];
  }
  /* The words of a payment request state. */
  var STATE_TEXT = { requested: 'Requested', awaiting_family: 'Waiting for the family', paid: 'Paid by the family', active: 'Premium active', refused: 'Refused by the family', expired: 'Expired' };
  function stateLabel(q) { return ST(STATE_TEXT[q && q.state] || 'Requested'); }
  /* OK / Authorise: the payment request goes to the family of that resident (contract 2). */
  function authorise(code, p, months) { return Premium.authorise(code, p, months, { by: initials() }); }
  /* The team's own demo payment (the fallback without a family portal or a family account).
     TODO(payment): replace this demo with the real hosted checkout when the pilot ends. The care
     team's choice (the resident's code, the product and the duration) goes to the LabLand server,
     which opens a checkout session at the payment provider on the provider's own secure page; this app
     never shows card or IBAN fields and never sees bank data. Only the server's signed confirmation
     may then turn Premium on here. Keep the promise: the callers wait for it. */
  function activate(planId, code, p) {
    var plan = planOf(planId) || PLANS[0], c = Premium.norm(code), pr = Premium.product(p) || 'play';
    if (!c) return Promise.reject(new Error('Choose a resident.'));
    return new Promise(function (resolve) { setTimeout(resolve, 700); }).then(function () {
      return Premium.activate(c, pr, { until: Premium.untilAfter(c, pr, plan.months), by: initials(), source: 'team', months: plan.months, plan: plan.id });
    });
  }
  /* The team turns it off (and ends the portal request or gift it came from). */
  function deactivate(code, p) { return Premium.stop(code, p || 'play'); }

  /* ---------- the Premium window: resident, product, duration; Authorise; or the team's demo payment ---------- */
  var m = null; /* { step: 'plans' | 'sent' | 'fail' | 'pay' | 'done', product, plan, code, busy, until, fail } */
  function crown() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 68 L17 32 L36 48 L50 24 L64 48 L83 32 L78 68 Z" fill="#F2C14E"/><rect x="22" y="68" width="56" height="11" rx="4" fill="#F2C14E"/>' +
      '<circle cx="17" cy="30" r="5.5" fill="#FFE29A"/><circle cx="50" cy="22" r="5.5" fill="#FFE29A"/><circle cx="83" cy="30" r="5.5" fill="#FFE29A"/></svg>';
  }
  function book() {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 34 C40 27 26 27 16 31 L16 80 C26 76 40 76 50 83 Z" fill="#F2C14E"/><path d="M50 34 C60 27 74 27 84 31 L84 80 C74 76 60 76 50 83 Z" fill="#FFE29A"/>' +
      '<path d="M38 22 L36 10 L44 16 L50 6 L56 16 L64 10 L62 22 Z" fill="#F2C14E"/></svg>';
  }
  function lock() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8 10.5 V8 a4 4 0 0 1 8 0 V10.5" fill="none" stroke="currentColor" stroke-width="2.2"/>' +
      '<circle cx="12" cy="15.5" r="1.6" fill="#FFFFFF"/></svg>';
  }
  function badge(p) { return info(p).icon === 'book' ? book() : crown(); }
  function title() { return esc(ST('{product} for {code}', { product: name(m.product), code: m.code })); }
  function note() {
    if (pilot()) return '<small class="pmnote">' + esc(ST('Free during the pilot.')) + '</small>';
    return testPay() ? '<small class="pmnote">' + esc(ST('Demo: no payment will be made.')) + '</small>' : '';
  }
  /* The two subscriptions of the resident, each with its state (BF-20). */
  function shortState(code, p) {
    var cur = Premium.entry(code, p), q = Premium.openRequest(code, p);
    if (cur) return cur.until ? ST('Active until {date}', { date: day(cur.until) }) : ST('Activated');
    return q ? stateLabel(q) : ST('Not active');
  }
  function productHtml() {
    return '<div class="pmplans pmproducts" role="radiogroup" aria-label="' + esc(ST('Premium')) + '">' + Premium.PRODUCTS.map(function (p) {
      var sel = p === m.product;
      return '<button type="button" class="pmplan' + (sel ? ' selected' : '') + '" role="radio" aria-checked="' + sel + '" data-pm="product" data-product="' + p + '">' +
        '<span class="pmdot"></span><span class="pmpn"><strong>' + esc(ST(info(p).short)) + '</strong><small>' + esc(shortState(m.code, p)) + '</small></span></button>';
    }).join('') + '</div>';
  }
  function whoHtml() {
    var list = residents();
    if (list.indexOf(m.code) < 0) list.push(m.code);
    return '<label class="pmwho"><span>' + esc(ST('Resident')) + '</span><select data-pm="who">' + list.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === m.code ? ' selected' : '') + '>' + esc(c + (Premium.isOn(c, m.product) ? ' ✓' : '')) + '</option>';
    }).join('') + '</select></label>';
  }
  /* Where this resident and product stand: active, asked for, a request and its state. */
  function statusHtml() {
    var cur = Premium.entry(m.code, m.product), q = Premium.requestFor(m.code, m.product), out = '';
    if (cur) out += '<p class="pmline pmon">✓ ' + esc(cur.until ? ST('Active until {date}', { date: day(cur.until) }) : ST('Activated')) + '</p>';
    if (Premium.asked(m.code, m.product)) out += '<p class="pmline">' + esc(ST('Asked for by {who}', { who: m.code })) + '</p>';
    if (q && !(q.state === 'active' && cur) && !(q.state === 'expired' && q.endedBy === 'team')) out += '<p class="pmline pmstate st-' + esc(q.state) + '">' + esc(stateLabel(q)) + '</p>';
    return out;
  }
  function stepHtml() {
    var p = planOf(m.plan) || PLANS[0], demo = '<small class="pmnote">' + esc(ST('Demo: no payment will be made.')) + '</small>';
    if (m.step === 'done') {
      return '<div class="pmsuccess"><span class="pmcrown">' + badge(m.product) + '</span><h2 id="pmTitle">' + esc(ST('Premium activated!')) + '</h2>' +
        '<p>' + esc(m.until ? ST('{product} is active for {who} until {date}.', { product: name(m.product), who: m.code, date: day(m.until) }) : ST('{product} is active for {who}.', { product: name(m.product), who: m.code })) + '</p>' +
        '<button type="button" class="pmconfirm" data-pm="close">' + esc(ST('Done')) + '</button></div>';
    }
    if (m.step === 'sent') {
      return '<div class="pmsuccess"><span class="pmcrown">' + badge(m.product) + '</span><h2 id="pmTitle">' + esc(ST('Sent to the family')) + '</h2>' +
        '<p>' + esc(m.code + ' · ' + name(m.product)) + '</p><p class="pmline pmstate st-awaiting_family">' + esc(ST('Waiting for the family')) + '</p>' +
        '<button type="button" class="pmconfirm" data-pm="close">' + esc(ST('Done')) + '</button></div>';
    }
    if (m.step === 'fail') {
      return '<div class="pmhead"><span class="pmbadge">' + badge(m.product) + '</span><h2 id="pmTitle">' + title() + '</h2></div>' +
        '<p class="pmline pmwarn" role="status">' + esc(m.fail === 'no-family' ? ST('No family account for {code}.', { code: m.code }) : ST('The family portal does not answer.')) + '</p>' +
        '<button type="button" class="pmconfirm" data-pm="pay">' + esc(ST('Team payment (demo)')) + '</button>' +
        '<button type="button" class="pmback" data-pm="back">' + esc(ST('Back')) + '</button>' + demo;
    }
    if (m.step === 'pay') {
      return '<div class="pmhead"><span class="pmbadge lock">' + lock() + '</span><h2 id="pmTitle">' + esc(ST('Team payment (demo)')) + '</h2></div>' +
        '<div class="pmsummary"><span><strong>' + title() + '</strong><small>' + esc(planName(p)) + '</small></span><b>' + esc(priceLabel(p, m.product)) + '</b></div>' +
        '<button type="button" class="pmconfirm" data-pm="confirm"' + (m.busy ? ' disabled' : '') + '>' + esc(m.busy ? ST('One moment…') : ST('Confirm (demo)')) + '</button>' +
        '<button type="button" class="pmback" data-pm="back"' + (m.busy ? ' disabled' : '') + '>' + esc(ST('Back')) + '</button>' + demo;
    }
    var open = Premium.openRequest(m.code, m.product);
    var head = '<div class="pmhead"><span class="pmbadge">' + badge(m.product) + '</span><h2 id="pmTitle">' + title() + '</h2>' + productHtml() + whoHtml() + statusHtml() + '</div>' +
      '<div class="pmbenefits">' + info(m.product).benefits.map(function (b) { return '<span><b>✓</b> ' + esc(ST(b)) + '</span>'; }).join('') + '</div>';
    if (open) {
      /* Already asked of the family: wait, or take it back. */
      return head + '<button type="button" class="pmback" data-pm="cancel" data-id="' + esc(open.id) + '"' + (m.busy ? ' disabled' : '') + '>' + esc(ST('Cancel the request')) + '</button>' +
        '<button type="button" class="pmconfirm" data-pm="close">' + esc(ST('Close')) + '</button>';
    }
    return head + '<div class="pmplans" role="radiogroup" aria-label="' + esc(ST('How long?')) + '">' + PLANS.map(function (x) {
        var sel = x.id === p.id;
        return '<button type="button" class="pmplan' + (sel ? ' selected' : '') + '" role="radio" aria-checked="' + sel + '" data-pm="plan" data-plan="' + x.id + '">' +
          '<span class="pmdot"></span><span class="pmpn"><strong>' + esc(planName(x)) + '</strong></span><b>' + esc(priceLabel(x, m.product)) + '</b></button>';
      }).join('') + '</div>' +
      '<button type="button" class="pmconfirm" data-pm="authorise"' + (m.busy ? ' disabled' : '') + '>' + esc(m.busy ? ST('One moment…') : ST('Authorise')) + '</button>' +
      '<small class="pmnote">' + esc(ST('The family gets a payment request.')) + '</small>' + note();
  }
  function draw() {
    var back = document.getElementById('premiumModal');
    if (!m) { if (back) back.parentNode.removeChild(back); return; }
    if (!back) {
      back = document.createElement('div');
      back.id = 'premiumModal'; back.className = 'pmbackdrop'; back.setAttribute('role', 'presentation');
      back.innerHTML = '<section class="pmodal" role="dialog" aria-modal="true" aria-labelledby="pmTitle"></section>';
      document.body.appendChild(back);
      back.addEventListener('mousedown', function (e) { if (e.target === back && !(m && m.busy)) close(); });
      back.addEventListener('click', onClick);
      back.addEventListener('change', function (e) { if (m && e.target && e.target.getAttribute('data-pm') === 'who') { m.code = Premium.norm(e.target.value); draw(); } });
    }
    back.firstChild.innerHTML = '<button type="button" class="pmclose" data-pm="close" aria-label="' + esc(ST('Close')) + '"' + (m.busy ? ' disabled' : '') + '>×</button>' + stepHtml();
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-pm]') : null;
    if (!b || b.disabled || !m || b.tagName === 'SELECT') return;
    var what = b.getAttribute('data-pm');
    if (what === 'close') close();
    else if (what === 'plan') { m.plan = b.getAttribute('data-plan'); draw(); }
    else if (what === 'product') { m.product = Premium.product(b.getAttribute('data-product')) || m.product; draw(); }
    else if (what === 'pay') { m.step = 'pay'; draw(); }
    else if (what === 'back') { m.step = 'plans'; draw(); }
    else if (what === 'authorise') {
      m.busy = true; draw();
      authorise(m.code, m.product, (planOf(m.plan) || PLANS[0]).months).then(function () { if (!m) return; m.busy = false; m.step = 'sent'; draw(); },
        function (er) { if (!m) return; m.busy = false; m.step = 'fail'; m.fail = er && er.code === 'no-family' ? 'no-family' : 'no-server'; draw(); });
    }
    else if (what === 'cancel') {
      m.busy = true; draw();
      Premium.cancel(b.getAttribute('data-id')).then(function () { if (!m) return; m.busy = false; draw(); });
    }
    else if (what === 'confirm') {
      m.busy = true; draw();
      activate(m.plan, m.code, m.product).then(function (en) { if (!m) return; m.busy = false; m.step = 'done'; m.until = en && en.until; draw(); },
        function () { if (!m) return; m.busy = false; draw(); });
    }
  }
  /* opts.patient: the resident (from an ask: preselected); opts.product: 'play' (default) or 'books'.
     Without a resident (the Library): the one chosen in Activities when they do not have it yet, or
     the first one without it. */
  function open(opts) {
    opts = opts || {};
    var pr = Premium.product(opts.product) || 'play', code = Premium.norm(opts.patient);
    if (!code) {
      var f = document.getElementById('fParticipant'), cur = Premium.norm(f && f.value), list = residents();
      code = cur && !Premium.isOn(cur, pr) ? cur : (list.filter(function (c) { return !Premium.isOn(c, pr); })[0] || cur || list[0]);
    }
    m = { step: 'plans', product: pr, plan: planOf(opts.plan) ? opts.plan : PLANS[0].id, code: code, busy: false, until: null, fail: '' };
    draw();
  }
  function close() { m = null; draw(); }
  /* Escape closes this window only, not the store sheet under it. */
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && m) { e.stopImmediatePropagation(); if (!m.busy) close(); } });
  /* A state that changes while the window is open (the family paid, the other page): drawn again. */
  window.addEventListener(Premium.EVENT, function () { if (m && !m.busy) draw(); });

  return {
    REQUEST: LEGACY_ASK, PLANS: PLANS, CENTS: info('play').cents,
    product: info, name: name, pilot: pilot, stateLabel: stateLabel,
    on: on, list: function (p) { return Premium.list(p); }, monthsOf: monthsOf, price: price, total: total, priceLabel: priceLabel, residents: residents,
    request: request, clearRequest: clearRequest, authorise: authorise,
    activate: activate, deactivate: deactivate, open: open, close: close, isOpen: function () { return !!m; },
    current: function () { return m ? m.code : ''; }, currentProduct: function () { return m ? m.product : ''; }
  };
})();

var Library = (function () {
  'use strict';
  var esc = Lab.esc, $ = function (id) { return document.getElementById(id); };
  var LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
  var CATS = [['games', 'Games', 'c-games'], ['music-movement', 'Music and movement', 'c-music'], ['creativity', 'Creativity', 'c-creativity'], ['memories', 'Memories', 'c-memory'], ['reading', 'Reading', 'c-memory']];
  /* The same list as labland/catalog-src.json, for a catalog older than the store (or none yet). The
     Premium cards are never taken from the catalog: one card per product of js/premium-config.js. */
  var FALLBACK_APPS = [
    { id: 'chess', game: 'chess', pack: 'board-games', name: 'Chess', category: 'games', icon: 'chess', tagline: 'Chess against Bellatrix or a friend.',
      about: 'A large board, three levels and short puzzles. An unfinished game waits for next time.', players: '1 or 2', minutes: '15–40' },
    { id: 'ludo', game: 'ludo', pack: 'board-games', name: 'Ludo', category: 'games', icon: 'ludo', tagline: 'The great classic, up to six players.',
      about: 'Play together at one robot or between robots. Bellatrix takes the free places.', players: '2 to 6', minutes: '5–30' },
    { id: 'conductor', name: 'Conductor', category: 'music-movement', icon: 'conductor', soon: true, tagline: 'Conduct an orchestra with your arms.',
      about: 'The resident conducts the orchestra with arm movements. The camera follows the tempo.', players: '1 or a group', minutes: '10' },
    { id: 'airpaint', name: 'Air painting', category: 'creativity', icon: 'airpaint', soon: true, tagline: 'Paint in the air with your hand.',
      about: 'Paint with the hand in the air. The picture becomes a postcard for the family.', players: '1', minutes: '10–15' },
    { id: 'timemachine', name: 'Time machine', category: 'memories', icon: 'timemachine', soon: true, tagline: 'Travel back to a year of your choice.',
      about: 'Choose a year: pictures from the archives, songs, prices and questions from that time.', players: '1 or a group', minutes: '15' },
    { id: 'lifebook', name: 'The book of my life', category: 'memories', icon: 'lifebook', soon: true, tagline: 'A memory film of a whole life.',
      about: 'A memory film made from the life story and family photos.', players: '1 with family', minutes: '10' }
  ];
  var busy = '', msg = null, sheet = null, account = false, cat = 'all';
  try { cat = sessionStorage.getItem('libCat') || 'all'; } catch (e) { cat = 'all'; }

  function loc() { return LOCALE[ST.lang()] || 'en-GB'; }
  function day(iso) { return iso ? new Date(iso).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''; }
  function when(iso) { return iso ? day(iso) + ', ' + new Date(iso).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }) : ''; }
  function plural(n, one, many) { return n === 1 ? ST(one) : ST(many, { n: n }); }

  /* ---------- the apps ---------- */
  /* Premium (1.16): one card per product, from PREMIUM_CONFIG. The featured one: the product a resident
     asked for last, else Bellatrix Play Premium. */
  function featuredProduct() { var a = Premium.asks(); return a.length ? a[a.length - 1].product : 'play'; }
  function premiumApps() {
    var top = featuredProduct();
    return Premium.PRODUCTS.map(function (p) {
      var x = PlayPremium.product(p);
      return { id: p + 'premium', product: p, unlock: p + '-premium', name: x.name, category: x.category, icon: x.icon, featured: p === top, tagline: x.tagline, about: x.about, players: '1' };
    }).sort(function (a, b) { return a.featured === b.featured ? 0 : a.featured ? -1 : 1; });
  }
  function isPremium(app) { return !!app && (!!app.product || /-premium$/.test(app.unlock || '') || app.id === 'playpremium'); }
  function apps() {
    var c = Store.catalog(), l = c && c.apps && c.apps.length ? c.apps : FALLBACK_APPS;
    return premiumApps().concat(l.filter(function (a) { return !isPremium(a); }).map(function (a) {
      if (!a.featured) return a;
      var b = {}; for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) b[k] = a[k];
      b.featured = false; return b;
    }));
  }
  function appById(id) { var l = apps(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function catOf(app) { for (var i = 0; i < CATS.length; i++) if (CATS[i][0] === app.category) return CATS[i]; return [app.category || '', app.category || '', '']; }
  function packOf(app) { return app.pack || (app.game ? Store.packFor(app.game) : null); }
  function catalogPack(id) { var c = Store.catalog(), hit = null; if (c && id) c.packs.forEach(function (p) { if (p.id === id) hit = p; }); return hit; }
  function pending(packId) { return Store.requests().filter(function (r) { return r.pack === packId && r.state === 'pending'; })[0] || null; }
  function live(s) { return s === 'included' || s === 'active' || s === 'trial'; }
  /* soon | open | update | requested | get, or premium for a Premium product (always "get for a
     resident": Premium is per resident and per product, js/premium.js) */
  function stateOf(app) {
    if (app.soon) return 'soon';
    if (app.product) return 'premium';
    var pack = packOf(app), entry = catalogPack(pack), inst = pack ? Store.installed()[pack] : null;
    if (app.game && Lab.byKey[app.game] && Store.allowed(app.game)) {
      if (Store.licence() && !Store.testMode && entry && entry.package && inst && inst.ok && inst.manifest && inst.manifest.version !== entry.package.version && live(Store.status(pack))) return 'update';
      return 'open';
    }
    if (pack && pending(pack)) return 'requested';
    return 'get';
  }
  var BTN = { soon: 'Soon', open: 'Open', update: 'Update', requested: 'Requested', get: 'Get', premium: 'Get' };
  /* "Active for P1, P3" (that product), or '' when no resident has it. */
  function premiumLine(p) {
    var l = Premium.list(p);
    return l.length ? ST('Active for {codes}', { codes: l.map(function (x) { return x.code; }).join(', ') }) : '';
  }
  /* wide: the featured card and the sheet say "Get for a resident"; the small card says "Get". */
  function pill(app, big, wide) {
    var s = stateOf(app);
    if (s === 'premium') {
      return '<button type="button" class="' + (big ? 'go appgo' : 'pillbtn') + '" data-lib="premium" data-app="' + esc(app.id) + '"' + (busy ? ' disabled' : '') + '>' +
        esc(ST(big || wide ? 'Get for a resident' : 'Get')) + '</button>';
    }
    if (s === 'soon' || s === 'requested') return '<span class="pillbtn muted' + (big ? ' big' : '') + '">' + esc(ST(s === 'soon' && big ? 'Coming soon' : BTN[s])) + '</span>';
    return '<button type="button" class="' + (big ? 'go appgo' : 'pillbtn') + '" data-lib="' + s + '" data-app="' + esc(app.id) + '"' + (busy ? ' disabled' : '') + '>' + esc(ST(BTN[s])) + '</button>';
  }

  /* ---------- drawings: one flat icon per app, three previews, the featured picture ---------- */
  var COLORS = { crown: '#1D3557', book: '#2E5E4E', chess: '#2F4858', ludo: '#E3A417', conductor: '#0B5C70', airpaint: '#B23A72', timemachine: '#6A4C9C', lifebook: '#2E7D4F' };
  function colorOf(app) { return COLORS[app.icon] || '#0B5C70'; }
  /* The picture of an icon, drawn in a 100 x 100 box, without its background. */
  function art(name) {
    if (name === 'crown') return '<path d="M22 68 L17 32 L36 48 L50 24 L64 48 L83 32 L78 68 Z" fill="#F2C14E"/><rect x="22" y="68" width="56" height="11" rx="4" fill="#F2C14E"/>' +
      '<circle cx="17" cy="30" r="5.5" fill="#FFE29A"/><circle cx="50" cy="22" r="5.5" fill="#FFE29A"/><circle cx="83" cy="30" r="5.5" fill="#FFE29A"/>' +
      '<path d="M44 52 L44 64 L55 58 Z" fill="#1D3557"/>';
    if (name === 'chess') return '<rect x="22" y="76" width="56" height="8" rx="3" fill="#FFFFFF"/><path d="M36 76 L40 50 L60 50 L64 76 Z" fill="#FFFFFF"/>' +
      '<rect x="35" y="44" width="30" height="7" rx="3" fill="#FFFFFF"/><circle cx="50" cy="36" r="9" fill="#FFFFFF"/><rect x="47.5" y="14" width="5" height="16" rx="2" fill="#F2C14E"/><rect x="42" y="19" width="16" height="5" rx="2" fill="#F2C14E"/>';
    if (name === 'ludo') return '<rect x="14" y="14" width="72" height="72" rx="14" fill="#FFFFFF" opacity=".25"/><circle cx="30" cy="30" r="12" fill="#D93A3A" stroke="#FFFFFF" stroke-width="4"/>' +
      '<circle cx="70" cy="30" r="12" fill="#2F6FD1" stroke="#FFFFFF" stroke-width="4"/><circle cx="30" cy="70" r="12" fill="#2E8B57" stroke="#FFFFFF" stroke-width="4"/><circle cx="70" cy="70" r="12" fill="#2F4858" stroke="#FFFFFF" stroke-width="4"/>' +
      '<rect x="39" y="39" width="22" height="22" rx="5" fill="#FFFFFF"/><circle cx="45" cy="45" r="2.6" fill="#2F4858"/><circle cx="50" cy="50" r="2.6" fill="#2F4858"/><circle cx="55" cy="55" r="2.6" fill="#2F4858"/>';
    if (name === 'conductor') return '<path d="M20 58 Q50 18 82 44" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round" opacity=".7"/>' +
      '<line x1="30" y1="74" x2="68" y2="34" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="76" r="8" fill="#F2C14E"/>' +
      '<circle cx="70" cy="70" r="6" fill="#FFFFFF"/><rect x="74" y="50" width="3.5" height="21" fill="#FFFFFF"/><path d="M77.5 50 Q86 54 84 62 Q82 57 77.5 56 Z" fill="#FFFFFF"/>';
    if (name === 'airpaint') return '<path d="M18 72 C30 30 52 86 82 30" fill="none" stroke="#FFD166" stroke-width="10" stroke-linecap="round"/>' +
      '<path d="M18 72 C30 30 52 86 82 30" fill="none" stroke="#7CCBDD" stroke-width="10" stroke-linecap="round" transform="translate(0 11)"/>' +
      '<path d="M18 72 C30 30 52 86 82 30" fill="none" stroke="#7FD3A0" stroke-width="10" stroke-linecap="round" transform="translate(0 -11)"/><circle cx="82" cy="30" r="8" fill="#FFFFFF"/>';
    if (name === 'timemachine') return '<path d="M24 36 A30 30 0 0 1 72 26" fill="none" stroke="#F2C14E" stroke-width="5" stroke-linecap="round"/><path d="M16 30 L28 42 L31 28 Z" fill="#F2C14E"/>' +
      '<circle cx="50" cy="56" r="24" fill="#FFFFFF"/><line x1="50" y1="56" x2="50" y2="40" stroke="#6A4C9C" stroke-width="4.5" stroke-linecap="round"/>' +
      '<line x1="50" y1="56" x2="61" y2="62" stroke="#6A4C9C" stroke-width="4.5" stroke-linecap="round"/><circle cx="50" cy="56" r="3.5" fill="#6A4C9C"/>';
    if (name === 'lifebook') return '<path d="M50 40 C40 33 26 33 18 37 L18 78 C26 74 40 74 50 81 Z" fill="#FFFFFF"/><path d="M50 40 C60 33 74 33 82 37 L82 78 C74 74 60 74 50 81 Z" fill="#E3F2E8"/>' +
      '<line x1="26" y1="48" x2="42" y2="46" stroke="#2E7D4F" stroke-width="2.5" opacity=".5"/><line x1="26" y1="56" x2="42" y2="54" stroke="#2E7D4F" stroke-width="2.5" opacity=".5"/>' +
      '<path d="M50 30 C50 30 40 23 40 17 C40 12 47 11 50 16 C53 11 60 12 60 17 C60 23 50 30 50 30 Z" fill="#F2C14E"/>';
    if (name === 'book') return '<path d="M50 36 C40 29 26 29 16 33 L16 80 C26 76 40 76 50 83 Z" fill="#FFFFFF"/><path d="M50 36 C60 29 74 29 84 33 L84 80 C74 76 60 76 50 83 Z" fill="#E3F2E8"/>' +
      '<line x1="24" y1="46" x2="42" y2="44" stroke="#2E5E4E" stroke-width="2.5" opacity=".5"/><line x1="24" y1="55" x2="42" y2="53" stroke="#2E5E4E" stroke-width="2.5" opacity=".5"/>' +
      '<line x1="58" y1="44" x2="76" y2="46" stroke="#2E5E4E" stroke-width="2.5" opacity=".5"/><path d="M38 24 L36 12 L44 18 L50 8 L56 18 L64 12 L62 24 Z" fill="#F2C14E"/>';
    return '<circle cx="50" cy="50" r="22" fill="#FFFFFF" opacity=".9"/>';
  }
  function icon(app) {
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="' + colorOf(app) + '"/>' + art(app.icon) + '</svg>';
  }
  /* Three simple previews of the patient screen: start, choice, well done. */
  function previews(app) {
    var c = colorOf(app);
    function mini(x, y, s) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><rect width="100" height="100" rx="22" fill="' + c + '"/>' + art(app.icon) + '</g>'; }
    function bar(x, y, w, o) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="6" rx="3" fill="#12222B" opacity="' + (o || 0.75) + '"/>'; }
    function star(x, y) { return '<path transform="translate(' + x + ' ' + y + ')" d="M0 -7 L2 -2 L7 -2 L3 1 L4.5 6 L0 3 L-4.5 6 L-3 1 L-7 -2 L-2 -2 Z" fill="#F2B233"/>'; }
    var bg = '<rect width="160" height="100" fill="#F4F7F8"/>';
    return [
      bg + mini(14, 22, 0.56) + bar(84, 34, 56) + bar(84, 46, 40, 0.35) + '<rect x="84" y="62" width="56" height="16" rx="8" fill="' + c + '"/>',
      bg + bar(14, 14, 60) + [0, 1, 2].map(function (i) { return '<rect x="' + (14 + i * 46) + '" y="30" width="40" height="56" rx="8" fill="#FFFFFF" stroke="#DCE4E8"/>' + mini(20 + i * 46, 38, 0.28) + bar(20 + i * 46, 74, 26, 0.3); }).join(''),
      bg + mini(55, 14, 0.5) + star(40, 40) + star(120, 40) + star(80, 74) + bar(52, 84, 56, 0.35)
    ].map(function (inner) { return '<svg viewBox="0 0 160 100" aria-hidden="true">' + inner + '</svg>'; });
  }
  /* The featured picture: an orchestra, conducted from the armchair. */
  function featuredArt(app) {
    if (app.icon === 'crown') {
      /* Play Premium: the big clip view with its synced lyrics, and the crown. */
      var lines = [[262, 104, 104, 0.18], [262, 124, 128, 1], [262, 144, 92, 0.18], [262, 164, 116, 0.18]];
      return '<svg viewBox="-50 20 500 200" aria-hidden="true" preserveAspectRatio="xMidYMid slice">' +
        '<rect x="-50" width="500" height="260" fill="#E6EDF5"/><circle cx="380" cy="40" r="90" fill="#F2C14E" opacity=".18"/>' +
        '<rect x="20" y="62" width="216" height="136" rx="16" fill="#1D3557"/><circle cx="128" cy="130" r="26" fill="#FFFFFF" opacity=".95"/><path d="M120 116 L120 144 L142 130 Z" fill="#1D3557"/>' +
        '<rect x="40" y="180" width="176" height="5" rx="2.5" fill="#FFFFFF" opacity=".3"/><rect x="40" y="180" width="96" height="5" rx="2.5" fill="#F2C14E"/>' +
        '<rect x="246" y="84" width="150" height="104" rx="14" fill="#FFFFFF"/>' +
        lines.map(function (l) { return '<rect x="' + l[0] + '" y="' + l[1] + '" width="' + l[2] + '" height="9" rx="4.5" fill="' + (l[3] === 1 ? '#0B5C70' : '#12222B') + '" opacity="' + l[3] + '"/>'; }).join('') +
        '<g transform="translate(-6 18) scale(.62)">' + art('crown').replace('fill="#1D3557"', 'fill="#F2C14E"') + '</g>' +
        '<g fill="#B23A72"><circle cx="410" cy="200" r="7"/><rect x="414" y="174" width="3.5" height="27"/><path d="M417.5 174 Q427 179 424 188 Q421 182 417.5 181 Z"/></g>' +
        '</svg>';
    }
    if (app.icon !== 'conductor') return '<svg viewBox="0 0 400 260" aria-hidden="true" preserveAspectRatio="xMidYMid slice"><rect width="400" height="260" fill="' + colorOf(app) + '"/><g transform="translate(130 60) scale(1.4)">' + art(app.icon) + '</g></svg>';
    var heads = [[70, 120, '#A8336A'], [115, 104, '#6A4C9C'], [160, 96, '#E3A417'], [240, 96, '#2E7D4F'], [285, 104, '#2F6FD1'], [330, 120, '#D93A3A']];
    return '<svg viewBox="-50 20 500 200" aria-hidden="true" preserveAspectRatio="xMidYMid slice">' +
      '<rect x="-50" width="500" height="260" fill="#DDEFF3"/><ellipse cx="200" cy="300" rx="300" ry="120" fill="#C5E3EA"/>' +
      heads.map(function (h) {
        return '<rect x="' + (h[0] - 16) + '" y="' + (h[1] + 14) + '" width="32" height="40" rx="12" fill="' + h[2] + '" opacity=".85"/><circle cx="' + h[0] + '" cy="' + h[1] + '" r="12" fill="#F1C9A5"/>' +
          '<rect x="' + (h[0] - 14) + '" y="' + (h[1] + 30) + '" width="28" height="4" rx="2" fill="#12222B" opacity=".25"/>';
      }).join('') +
      '<path d="M120 60 Q200 10 290 50" fill="none" stroke="#0B5C70" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round" opacity=".5"/>' +
      '<rect x="168" y="190" width="64" height="80" rx="26" fill="#0B5C70"/><circle cx="200" cy="168" r="22" fill="#F1C9A5"/><path d="M178 160 Q200 136 222 160 Q212 150 200 150 Q188 150 178 160 Z" fill="#E8EEF1"/>' +
      '<path d="M176 206 L140 150" stroke="#0B5C70" stroke-width="14" stroke-linecap="round"/><path d="M224 206 L262 146" stroke="#0B5C70" stroke-width="14" stroke-linecap="round"/>' +
      '<circle cx="139" cy="148" r="8" fill="#F1C9A5"/><circle cx="263" cy="144" r="8" fill="#F1C9A5"/><line x1="264" y1="143" x2="300" y2="104" stroke="#12222B" stroke-width="4" stroke-linecap="round"/>' +
      '<g fill="#A8336A"><circle cx="318" cy="70" r="8"/><rect x="323" y="40" width="4" height="31"/><path d="M327 40 Q338 46 335 56 Q332 50 327 49 Z"/></g>' +
      '<g fill="#E3A417"><circle cx="86" cy="60" r="7"/><rect x="90" y="34" width="3.5" height="27"/><circle cx="110" cy="54" r="7"/><rect x="114" y="28" width="3.5" height="27"/><rect x="90" y="28" width="27.5" height="5"/></g>' +
      '</svg>';
  }

  /* ---------- the page ---------- */
  function msgHtml() { return msg ? '<p class="' + (msg.bad ? 'warn libmsg' : 'libok libmsg') + '" role="status">' + esc(msg.text) + '</p>' : ''; }
  function headHtml() {
    return '<div class="storetop"><h2>' + esc(ST('Library')) + '</h2>' +
      '<button type="button" class="acctbtn" data-lib="account">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4" fill="currentColor"/><path d="M4 20 C5 15 8.5 13.5 12 13.5 C15.5 13.5 19 15 20 20 Z" fill="currentColor"/></svg>' +
        '<span>' + esc(ST('Account')) + '</span>' + (Store.licence() || Store.testMode ? '' : '<i class="dot" aria-hidden="true"></i>') + '</button></div>' +
      (sheet || account ? '' : msgHtml());
  }
  function featuredHtml() {
    var f = null;
    apps().forEach(function (a) { if (!f && a.featured) f = a; });
    if (!f || (cat !== 'all' && f.category !== cat)) return '';
    return '<section class="feat" data-lib="app" data-app="' + esc(f.id) + '">' +
      '<div class="feattext"><p class="featkick">' + esc(ST('Featured')) + '</p><h3>' + esc(ST(f.name)) + '</h3><p class="feattag">' + esc(ST(f.tagline)) + '</p>' +
        '<div class="featrow"><span class="appicon sm">' + icon(f) + '</span>' + featLine(f) + pill(f, false, true) + '</div></div>' +
      '<div class="featart">' + featuredArt(f) + '</div></section>';
  }
  function featLine(app) {
    var on = app.product ? premiumLine(app.product) : '';
    return on ? '<span class="featcat premon">✓ ' + esc(on) + '</span>' : '<span class="featcat">' + esc(ST(catOf(app)[1])) + '</span>';
  }
  function chipsHtml() {
    var used = {};
    apps().forEach(function (a) { used[a.category] = 1; });
    return '<div class="chips storechips" role="group">' + [['all', 'Everything', '']].concat(CATS).filter(function (c) { return c[0] === 'all' || used[c[0]]; }).map(function (c) {
      return '<button type="button" class="chip' + (c[0] === cat ? ' on' : '') + (c[2] ? ' ' + c[2] : '') + '" data-lib="cat" data-cat="' + c[0] + '">' + esc(ST(c[1])) + '</button>';
    }).join('') + '</div>';
  }
  function cardHtml(app) {
    var on = app.product ? premiumLine(app.product) : '';
    return '<article class="appcard" data-lib="app" data-app="' + esc(app.id) + '" tabindex="0">' +
      '<span class="appicon">' + icon(app) + '</span>' +
      '<span class="appmeta"><b>' + esc(ST(app.name)) + '</b>' + (on ? '<span class="premon">✓ ' + esc(on) + '</span>' : '<span>' + esc(ST(catOf(app)[1])) + '</span>') + '</span>' + pill(app) + '</article>';
  }
  function gridHtml() {
    return '<div class="appgrid">' + apps().filter(function (a) { return cat === 'all' || a.category === cat; }).map(cardHtml).join('') + '</div>';
  }

  /* ---------- one app ---------- */
  /* A Premium product, per resident: who has it (end date, where it came from, "Deactivate"), then the
     payment requests and their state (waiting for the family, paid, refused, expired). */
  function premiumResidents(p) {
    var l = Premium.list(p), t = Date.now();
    var reqs = Premium.requests(p).filter(function (q) {
      if (q.state === 'requested' || q.state === 'awaiting_family' || q.state === 'paid') return true;
      return (q.state === 'refused' || (q.state === 'expired' && q.endedBy !== 'team')) && t - Date.parse(q.updatedAt || q.at) < 14 * 864e5;
    }).slice(0, 6);
    var h = !l.length ? '<p class="note premnone">' + esc(ST('No resident has Premium yet.')) + '</p>' :
      '<div class="premres"><h4>' + esc(ST('Active for')) + '</h4><ul>' + l.map(function (x) {
        var from = x.source === 'family' ? ST('offered by the family') : x.source === 'request' ? ST('paid by the family') : x.by ? x.by : '';
        var info = [x.until ? ST('until {date}', { date: day(x.until) }) : ST('No end date'), from].filter(Boolean).join(' · ');
        return '<li><b>' + esc(x.code) + '</b><span>' + esc(info) + '</span>' +
          '<button type="button" class="ghost sm" data-lib="premoff" data-code="' + esc(x.code) + '" data-product="' + esc(p) + '"' + (busy ? ' disabled' : '') + '>' + esc(ST('Deactivate')) + '</button></li>';
      }).join('') + '</ul></div>';
    if (reqs.length) {
      h += '<div class="premres premreqs"><h4>' + esc(ST('Requests')) + '</h4><ul>' + reqs.map(function (q) {
        var open = q.state === 'awaiting_family' || q.state === 'requested';
        return '<li><b>' + esc(q.code) + '</b><span class="pmstate st-' + esc(q.state) + '">' + esc(PlayPremium.stateLabel(q)) + '</span>' +
          (open ? '<button type="button" class="ghost sm" data-lib="premcancel" data-id="' + esc(q.id) + '"' + (busy ? ' disabled' : '') + '>' + esc(ST('Cancel the request')) + '</button>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    return h;
  }
  function sheetHtml(app) {
    var c = catOf(app);
    /* A Premium product: the residents and the requests first, then what it brings. */
    var body = app.product ? premiumResidents(app.product) +
        '<div class="pmbenefits libbenefits">' + PlayPremium.product(app.product).benefits.map(function (x) { return '<span><b>✓</b> ' + esc(ST(x)) + '</span>'; }).join('') + '</div>' +
        '<p class="about">' + esc(ST(app.about)) + '</p>'
      : '<div class="shots">' + previews(app).map(function (s) { return '<div class="shot">' + s + '</div>'; }).join('') + '</div>' +
        '<p class="about">' + esc(ST(app.about)) + '</p>' +
        '<div class="infos"><div><span>' + esc(ST('Players')) + '</span><b>' + esc(ST(app.players || '1')) + '</b></div>' +
          '<div><span>' + esc(ST('Minutes')) + '</span><b>' + esc(ST(app.minutes || '10')) + '</b></div>' +
          '<div><span>' + esc(ST('Languages')) + '</span><b>FR · EN · DE</b></div></div>';
    return '<div class="sheetbox appsheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">' +
      '<button type="button" class="sheetx" data-lib="close" aria-label="' + esc(ST('Close')) + '">×</button>' +
      '<div class="ashead"><span class="appicon big">' + icon(app) + '</span>' +
        '<div class="ashtext"><h3 id="sheetTitle">' + esc(ST(app.name)) + '</h3><p><span class="tcat ' + c[2] + '">' + esc(ST(c[1])) + '</span></p><p class="ashtag">' + esc(ST(app.tagline)) + '</p></div>' +
        '<div class="ashbtn">' + pill(app, true) + '</div></div>' +
      msgHtml() + body + '</div>';
  }

  /* ---------- the account: connection, licences, activation requests ---------- */
  function stateChip(p) {
    var s = Store.status(p.id), lic = Store.licence(), info = lic && lic.packs[p.id], left = Store.daysLeft(p.id), req = pending(p.id);
    var chip = s === 'test' ? ['on', ST('Test mode: available')] : s === 'included' ? ['on', ST('Included')] : s === 'active' ? ['on', ST('Active until {date}', { date: day(info.until) })] :
      s === 'trial' ? ['trial', ST('Free trial') + ' · ' + plural(left, '1 day left', '{n} days left')] :
      s === 'expired' ? ['off', ST(info.status === 'trial' ? 'Free trial ended {date}' : 'Ended {date}', { date: day(info.until) })] :
      s === 'unlicensed' ? ['off', p.download ? ST('Not connected') : ST('Works until a licence is loaded')] : ['off', ST('Not active in this care home')];
    return '<span class="pchip ' + chip[0] + '">' + esc(chip[1]) + '</span>' + (req ? ' <span class="pchip wait">' + esc(ST('Requested {date}, waiting for LabLand', { date: day(req.at) })) + '</span>' : '');
  }
  function packButtons(p) {
    var s = Store.status(p.id), inst = Store.installed()[p.id], out = [];
    if (!Store.licence() || p.included || Store.testMode) return '';
    if (s === 'none' || s === 'off') out.push('<button type="button" class="ghost sm" data-lib="trial" data-pack="' + p.id + '">' + esc(ST('Free trial ({n} days)', { n: Store.catalog().trialDays || 30 })) + '</button>');
    if (s !== 'active' && !pending(p.id)) out.push('<button type="button" class="ghost sm" data-lib="activate" data-pack="' + p.id + '">' + esc(ST('Ask LabLand to activate')) + '</button>');
    if (p.download && inst && inst.ok && !inst.bundled) out.push('<button type="button" class="ghost sm danger" data-lib="remove" data-pack="' + p.id + '">' + esc(ST('Remove')) + '</button>');
    return out.join('');
  }
  function accountHtml() {
    var cfg = Store.config(), lic = Store.licence(), c = Store.catalog(), problems = Store.problems();
    var who = lic ? '<b>' + esc(lic.careHome.name) + '</b> · ' + esc(lic.careHome.code) + (cfg.checked ? ' · ' + esc(ST('checked {when}', { when: when(cfg.checked) })) : '') : '<b>' + esc(ST('Not connected yet.')) + '</b>';
    return '<div class="sheetbox acctsheet" role="dialog" aria-modal="true" aria-labelledby="acctTitle">' +
      '<button type="button" class="sheetx" data-lib="close" aria-label="' + esc(ST('Close')) + '">×</button>' +
      '<h3 id="acctTitle">' + esc(ST('Account')) + '</h3>' +
      (Store.testMode ? '<p class="libok">' + esc(ST('Test mode on this PC: every activity is available.')) + '</p>' : '') +
      '<div class="acctwho"><p class="libwho">' + who + '</p>' + (lic ? '<button type="button" class="ghost sm" data-lib="refresh">' + esc(ST('Check for updates')) + '</button>' : '') + '</div>' +
      msgHtml() +
      (c ? '<h4>' + esc(ST('Licences')) + '</h4><ul class="licences">' + c.packs.map(function (p) {
        return '<li><span class="licname">' + esc(ST(p.name)) + '</span><span class="licstate">' + stateChip(p) + '</span><span class="licbtns">' + packButtons(p) + '</span></li>';
      }).join('') + '</ul>' : '') +
      '<details class="more"' + (lic || Store.testMode ? '' : ' open') + '><summary>' + esc(ST('Connection')) + '</summary>' +
        '<div class="grid2"><label class="field"><span>' + esc(ST('Library address')) + '</span><input id="libServer" type="text" autocomplete="off" value="' + esc(cfg.server || '') + '" placeholder="http://…"></label>' +
        '<label class="field"><span>' + esc(ST('Care home code')) + '</span><input id="libCode" type="text" autocomplete="off" value="' + esc(cfg.code || '') + '" placeholder="' + esc(ST('e.g. DEMO-2026')) + '"></label></div>' +
        '<div class="row"><button type="button" class="go" data-lib="connect">' + esc(ST('Connect')) + '</button></div>' +
        '<p class="note">' + esc(ST('Only the care home code is sent. Patient data stays on this device.')) + '</p>' +
      '</details>' +
      (problems.length ? '<p class="warn">' + problems.map(function (p) { return esc(ST(p)); }).join('<br>') + '</p>' : '') +
      '</div>';
  }

  /* ---------- drawing and actions ---------- */
  function render() {
    var box = $('libBody');
    if (!box) return;
    var shown = sheet ? appById(sheet) : null;
    box.innerHTML = '<div class="store">' + headHtml() + featuredHtml() + chipsHtml() + gridHtml() + '</div>' +
      (account ? '<div class="sheet" id="libSheet">' + accountHtml() + '</div>' : shown ? '<div class="sheet" id="libSheet">' + sheetHtml(shown) + '</div>' : '');
    if (busy) Array.prototype.forEach.call(box.querySelectorAll('button[data-lib]'), function (b) {
      var w = b.getAttribute('data-lib');
      if (w !== 'close' && w !== 'account' && w !== 'cat') b.disabled = true;
    });
  }
  function act(what, task, okText) {
    busy = what; msg = { text: ST('One moment…') }; render();
    return task().then(function (r) {
      busy = ''; msg = okText ? { text: typeof okText === 'function' ? okText(r) : okText } : null; render();
    }, function (e) {
      busy = ''; msg = { text: ST(e.message || String(e)), bad: true }; render();
    });
  }
  /* "Get": a licence first (free trial, or a request when the trial is over), then the download. */
  function getApp(app) {
    var pack = packOf(app), entry = catalogPack(pack), name = ST(app.name);
    if (!Store.licence() || !entry) { account = true; sheet = null; msg = { text: ST('Connect to the Library first.'), bad: true }; render(); return; }
    var s = Store.status(pack), inst = Store.installed()[pack];
    function installIfNeeded() {
      var i = Store.installed()[pack];
      if (entry.download && entry.package && !(i && i.ok) && live(Store.status(pack))) return Store.install(pack);
      return null;
    }
    if (live(s)) {
      if (entry.download && entry.package && !(inst && inst.ok)) act('install', function () { return Store.install(pack); }, ST('{name} is installed.', { name: name }));
      else location.reload(); /* licensed and on this device: the page opens again to run it */
    } else if (s === 'none' || s === 'off') {
      act('trial', function () { return Store.request(pack, 'trial').then(installIfNeeded); }, ST('Your free trial of {name} has started.', { name: name }));
    } else {
      act('activate', function () { return Store.request(pack, 'activate'); }, ST('LabLand has your request for {name}.', { name: name }));
    }
  }
  function closeAll() { sheet = null; account = false; msg = null; render(); }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-lib]') : null;
    if (!b) { if (e.target.id === 'libSheet') closeAll(); return; }
    if (b.disabled) return;
    var what = b.getAttribute('data-lib'), app = appById(b.getAttribute('data-app') || ''), pack = b.getAttribute('data-pack');
    var p = catalogPack(pack), name = p ? ST(p.name) : '';
    if (what === 'app') { sheet = app ? app.id : null; account = false; msg = null; render(); }
    else if (what === 'cat') { cat = b.getAttribute('data-cat'); try { sessionStorage.setItem('libCat', cat); } catch (err) { /* only a convenience */ } render(); }
    else if (what === 'close') closeAll();
    else if (what === 'account') { account = true; sheet = null; msg = null; render(); }
    else if (what === 'open' && app) { sheet = null; render(); if (window.StaffUI) StaffUI.choose(app.game); }
    else if (what === 'get' && app) getApp(app);
    /* Premium: the resident, the product and the duration open in the Premium window (Authorise). */
    else if (what === 'premium' && app) PlayPremium.open({ product: app.product });
    else if (what === 'premoff') {
      var code = b.getAttribute('data-code'), pr = b.getAttribute('data-product') || 'play', pn = PlayPremium.name(pr);
      if (!code || !window.confirm(ST('Turn off {product} for {code}?', { product: pn, code: code }))) return;
      act(what, function () { return PlayPremium.deactivate(code, pr); }, ST('{product} is off for {code}.', { product: pn, code: code }));
    }
    else if (what === 'premcancel') act(what, function () { return Premium.cancel(b.getAttribute('data-id')); }, null);
    else if (what === 'update' && app) {
      var up = packOf(app);
      act(what, function () { return Store.install(up).then(function (m) { setTimeout(function () { location.reload(); }, 1500); return m; }); }, function (m) { return ST('{name} {v} is installed. The page opens again.', { name: ST(app.name), v: m.version }); });
    }
    else if (what === 'connect') {
      /* Read the fields before the sheet is drawn again ("One moment…"). */
      var server = $('libServer').value, code = $('libCode').value;
      act(what, function () { return Store.connect(server, code); }, function () { return ST('Connected as {name}.', { name: Store.licence().careHome.name }); });
    }
    else if (what === 'refresh') act(what, Store.refresh, ST('Everything is up to date.'));
    else if (what === 'trial') act(what, function () { return Store.request(pack, 'trial'); }, ST('Your free trial of {name} has started.', { name: name }));
    else if (what === 'activate') act(what, function () { return Store.request(pack, 'activate'); }, ST('LabLand has your request for {name}.', { name: name }));
    else if (what === 'remove') {
      if (!window.confirm(ST('Remove {name} from this robot? Saved results stay in Results.', { name: name }))) return;
      Store.remove(pack);
      location.reload();
    }
  }
  function open() {
    render();
    /* Approvals from LabLand arrive without anyone asking. */
    if (Store.licence() && !busy) Store.refresh().then(render, function () { /* offline: keep what we have */ });
  }
  document.addEventListener('DOMContentLoaded', function () {
    var box = $('libBody');
    if (!box) return;
    box.addEventListener('click', onClick);
    box.addEventListener('keydown', function (e) {
      var t = e.target;
      if ((e.key === 'Enter' || e.key === ' ') && t.classList && t.classList.contains('appcard')) { e.preventDefault(); onClick({ target: t }); }
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && (sheet || account)) closeAll(); });
  });
  window.addEventListener('bellatrix-store', function () { if ($('libBody') && !$('tab-library').hidden) render(); });
  window.addEventListener('bellatrix-play-premium', function () { if ($('libBody') && !$('tab-library').hidden && !busy) render(); });
  return { render: render, open: open };
})();
