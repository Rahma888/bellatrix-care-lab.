/* Care Team: the photos of the Memories activity, and the books of the reading app.
   15 Nov (Rahma): shown in the activity's own settings, Activities > Memories > Personalise (photos)
   and Activities > Book reading > Personalise (books): #arBody in staff.html, shown by staff.js for
   these two activities only (event 'bellatrix-staff-act'). The "Music & photos" tab is gone. For the
   resident chosen in Activities.
   1.16 (tester, 10 Nov: "far too much text"): short labels, no paragraphs; what is rarely needed
   folds under "More".
   - Photos: add a photo from this device (made smaller and kept here as a data URL) with a theme,
     a caption, an optional question and an optional story (Bellatrix tells it with the picture);
     photos sent by the family (agent M's portal) carry a "Family" mark; hide a photo, remove it.
     14 Nov: "Photos from the family": the photos the family sent as MESSAGES through the portal, for this
     resident; one tap puts one into the Memories album, one tap takes it out (FamilyMessages.albumAdd /
     albumRemove, js/messages.js). Nothing is shown when the family sent no photo.
     "More": the themes offered, the generic pictures in this resident's own words, notes for the
     team, the numbers (most liked, themes avoided, session length) and the "Photo of the day" on
     the robot's waiting screen (off unless turned on here). Album and Memory Postcards are one
     activity since 1.16 (Memories, agent G): the postcards are generic pictures of it.
   - Books (1.16, books only, agent H): this resident's "Livres Premium" (separate product 'books'
     of js/premium.js v3), their request, the books and, folded, their sources. The weather place,
     the horoscope and "50 years ago" are gone.
   Every text goes through ST() (French and German in js/i18n-album-reading.js and, for the 1.16
   texts, js/i18n-staff.js). ES5 only (Chrome 95). */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !window.Album) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = Lab.esc;
  var S = function (k, v) { return window.ST ? ST(k, v) : I18N.t('en', k, v); };
  var who = '', draft = '', more = false;

  function teamLang() { try { return window.ST && ST.lang ? ST.lang() : 'en'; } catch (e) { return 'en'; } }
  function themeName(id) { var t = Album.themeOf(id); return S(t ? t.label : id); }
  function dur(s) { s = Math.round(s || 0); return S('{m} min {s} s', { m: Math.floor(s / 60), s: s % 60 }); }
  function day(iso) { try { return new Date(iso).toLocaleDateString(I18N.BCP47[teamLang()] || 'en-GB', { day: 'numeric', month: 'short' }); } catch (e) { return iso || ''; } }
  function residents() {
    var codes = {};
    try { var s = JSON.parse(localStorage.getItem('bellatrix-care-lab-v1') || '{}') || {}; Object.keys(s.patients || {}).forEach(function (c) { codes[c] = 1; }); } catch (e) { /* none yet */ }
    Album.patients().forEach(function (c) { codes[c] = 1; });
    var f = $('fParticipant'), cur = f && f.value.trim();
    if (cur) codes[cur] = 1;
    if (!Object.keys(codes).length) codes.P1 = 1;
    return Object.keys(codes).sort();
  }
  function currentCode() { var f = $('fParticipant'); return (f && f.value.trim()) || 'P1'; }
  function options(list, sel) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
  function themeOptions(sel) { return options(Album.THEMES.map(function (t) { return [t.id, themeName(t.id)]; }), sel); }
  function pictureOf(r) {
    if (r.src) return '<img src="' + esc(r.src) + '" alt="">';
    var g = Album.GENERIC.filter(function (x) { return x.id === r.id; })[0];
    return g ? g.art() : '';
  }

  /* ---------- the place: the settings of Memories and of Book reading ----------
     staff.html has it (#arBody, inside Personalise); staff.js shows it for these two activities and
     says which activity is chosen with the 'bellatrix-staff-act' event { key }. */
  var view = null;
  function mount() {
    var panel = $('arBody');
    if (!panel || panel.getAttribute('data-wired')) return false;
    panel.setAttribute('data-wired', '1');
    wire(panel);
    window.addEventListener('bellatrix-staff-act', function (e) { follow(e.detail); });
    /* Personalise unfolded: the family's latest photos */
    var box = $('persBox');
    if (box) box.addEventListener('toggle', function () { if (box.open && view === 'album') familyRefresh(); });
    return true;
  }
  function follow(d) {
    view = d && (d.key === 'album' || d.key === 'reading') ? d.key : null;
    if (!view) return;
    who = currentCode();
    render();
    if (view === 'album') familyRefresh();
  }
  function visible() { return !!view; }
  function show() { if (window.StaffUI && StaffUI.openActivity) StaffUI.openActivity('album', who); }

  /* The resident is the one chosen in Activities ("Personalise for P1"): a title only. */
  function headHtml(title) { return '<h3 class="ph arhead">' + esc(title) + '</h3>'; }
  function render() {
    var panel = $('arBody');
    if (!panel || !view) return;
    if (!who) who = currentCode();
    if (view === 'reading') { panel.innerHTML = '<div class="arsec">' + headHtml(S('Books')) + booksHtml() + '</div>'; return; }
    panel.innerHTML = '<div class="arsec">' + headHtml(S('Album')) +
      '<p class="note">' + esc(S('Only with consent: the resident and the people in the photo.')) + '</p>' +
      familyHtml() + addHtml() + photosHtml() +
      '<details class="more armore"' + (more ? ' open' : '') + '><summary>' + esc(S('More options')) + '</summary>' +
        themesHtml() + cardsHtml() + notesHtml() + dashHtml() + dayHtml() + '</details></div>';
    familyThumbs();
  }

  /* ---------- photos the family sent as messages: one tap into the album, one tap out ---------- */
  var famUrls = {}, famSync = 0;
  function FMS() { return window.FamilyMessages && FamilyMessages.familyPhotos ? FamilyMessages : null; }
  function familyHtml() {
    var F = FMS(), list = F ? F.familyPhotos(who).slice(0, 12) : [];
    if (!list.length) return '';
    return '<div class="arfamily"><h3>' + esc(S('Photos from the family')) + ' <span class="note">(' + list.length + ')</span></h3><div class="arfamgrid">' + list.map(function (m) {
      var inn = !!F.inAlbum(m.id), u = famUrls[m.id];
      return '<figure class="arfamph' + (inn ? ' in' : '') + '" data-msg="' + esc(m.id) + '"><div class="arimg" data-famimg="' + esc(m.id) + '">' + (u ? '<img src="' + esc(u) + '" alt="">' : '') +
        (inn ? '<span class="arfam">' + esc(S('In the album')) + '</span>' : '') + '</div>' +
        '<figcaption><span class="note">' + esc(m.from || '') + ' · ' + esc(day(m.at)) + '</span>' +
        '<button type="button" class="' + (inn ? 'ghost' : 'go') + ' sm" data-act="' + (inn ? 'famdel' : 'famadd') + '">' + esc(inn ? S('Remove from the album') : S('Add to the album')) + '</button></figcaption></figure>';
    }).join('') + '</div></div>';
  }
  function familyThumbs() {
    var F = FMS();
    if (!F) return;
    Array.prototype.forEach.call(document.querySelectorAll('#arBody [data-famimg]'), function (el) {
      var id = el.getAttribute('data-famimg');
      if (famUrls[id] || el.querySelector('img')) return;
      F.photoUrl(id).then(function (u) {
        famUrls[id] = u;
        var box = document.querySelector('#arBody [data-famimg="' + id + '"]');
        if (box && !box.querySelector('img')) box.insertAdjacentHTML('afterbegin', '<img src="' + esc(u) + '" alt="">');
      }, function () { /* the frame stays empty */ });
    });
  }
  /* The family's latest photos, asked when the section opens (at most every 20 s). */
  function familyRefresh() {
    var F = FMS();
    if (!F || location.protocol === 'file:' || Date.now() - famSync < 20000) return;
    famSync = Date.now();
    F.sync().then(function () {
      var a = document.activeElement;
      if (view === 'album' && !(a && a.closest && a.closest('#arBody input, #arBody textarea, #arBody select'))) render();
    }, function () { /* shown from what this robot already has */ });
  }

  /* ---------- photos ---------- */
  function addHtml() {
    return '<div class="aradd"><div class="araddrow">' +
      '<div class="arthumb" id="arDraft">' + (draft ? '<img src="' + esc(draft) + '" alt="">' : '<span class="note">' + esc(S('No photo chosen')) + '</span>') + '</div>' +
      '<div class="arfields">' +
        '<label class="ghost filebtn">' + esc(S('Choose a photo…')) + '<input type="file" accept="image/*" id="arFile"></label>' +
        '<div class="grid2"><label class="field"><span>' + esc(S('Theme')) + '</span><select id="arTheme">' + themeOptions('family') + '</select></label>' +
        '<label class="field"><span>' + esc(S('Caption')) + '</span><input type="text" id="arCaption" maxlength="90" placeholder="' + esc(S('e.g. Paul’s wedding, 1978')) + '"></label></div>' +
        '<label class="field"><span>' + esc(S('Question (optional)')) + '</span><input type="text" id="arQuestion" maxlength="160" placeholder="' + esc(S('e.g. Who is next to Paul?')) + '"></label>' +
        '<label class="field"><span>' + esc(S('Story (optional)')) + '</span><textarea id="arStory" rows="2" maxlength="700" placeholder="' + esc(S('Bellatrix tells it with the picture.')) + '"></textarea></label>' +
        '<div class="row"><button type="button" class="go" id="arAdd"' + (draft ? '' : ' disabled') + '>' + esc(S('Add to the album')) + '</button></div>' +
      '</div></div></div>';
  }
  function photosHtml() {
    var all = Album.list(who, { all: true }), likes = Album.likes(who), hidden = Album.hiddenThemes(who);
    if (!all.length) return '<div class="arphotos"><p class="note">' + esc(S('No photo yet: generic pictures are shown.')) + '</p></div>';
    return '<div class="arphotos"><h3>' + esc(S('Photos')) + ' <span class="note">(' + all.length + ')</span></h3><div class="argrid">' + all.map(function (r) {
      var off = r.hidden || hidden.indexOf(r.theme) >= 0;
      return '<figure class="arph' + (off ? ' off' : '') + '" data-id="' + esc(r.id) + '"><div class="arimg">' + pictureOf(r) +
        (r.family ? '<span class="arfam">' + esc(S('Family')) + '</span>' : '') + (off ? '<span class="aroff">' + esc(S('Hidden')) + '</span>' : '') + '</div>' +
        '<figcaption><input type="text" data-f="caption" maxlength="90" value="' + esc(r.caption) + '" aria-label="' + esc(S('Caption')) + '" placeholder="' + esc(S('Caption')) + '">' +
        '<input type="text" data-f="question" maxlength="160" value="' + esc(r.question) + '" aria-label="' + esc(S('Question (optional)')) + '" placeholder="' + esc(S('Question (optional)')) + '">' +
        '<textarea data-f="story" rows="2" maxlength="700" aria-label="' + esc(S('Story (optional)')) + '" placeholder="' + esc(S('Story (optional)')) + '">' + esc(r.story || '') + '</textarea>' +
        '<div class="row"><select data-f="theme" aria-label="' + esc(S('Theme')) + '">' + themeOptions(r.theme) + '</select><span class="arlikes" title="' + esc(S('Hearts')) + '">♥ ' + (likes[r.id] || 0) + '</span></div>' +
        '<div class="row"><button type="button" class="ghost sm" data-act="hide">' + esc(r.hidden ? S('Show again') : S('Don’t show')) + '</button>' +
        '<button type="button" class="ghost sm danger" data-act="del">' + esc(S('Remove')) + '</button></div>' +
        '<span class="note">' + esc(day(r.addedAt)) + (r.url && !r.img ? ' · ' + esc(S('not yet saved on this robot')) : '') + '</span></figcaption></figure>';
    }).join('') + '</div></div>';
  }
  function themesHtml() {
    var hidden = Album.hiddenThemes(who);
    return '<div class="arthemes"><h3>' + esc(S('Themes offered')) + '</h3><div class="archips">' +
      Album.THEMES.map(function (t) {
        var off = hidden.indexOf(t.id) >= 0;
        return '<label class="archip' + (off ? ' off' : '') + '"><input type="checkbox" data-hidetheme="' + t.id + '"' + (off ? '' : ' checked') + '> ' + esc(themeName(t.id)) + '</label>';
      }).join('') + '</div></div>';
  }
  /* The generic pictures (with the memory postcards, 1.16) in this resident's own words: one picture
     at a time, empty fields keep the built-in words (Album.setCardText). */
  var card = '';
  function cardsHtml() {
    if (!Album.setCardText || !Album.cardText || !Album.GENERIC || !Album.GENERIC.length) return '';
    var lang = teamLang(), list = Album.GENERIC, g = list.filter(function (x) { return x.id === card; })[0] || list[0], t = Album.cardText(who, g.id) || {};
    card = g.id;
    function own(v) { return v && typeof v === 'object' ? (v[lang] || v.en || '') : (v || ''); }
    return '<div class="arcards"><h3>' + esc(S('Words on the pictures')) + '</h3><div class="araddrow"><div class="arthumb">' + g.art() + '</div><div class="arfields">' +
      '<label class="field"><span>' + esc(S('Picture')) + '</span><select id="arCard">' + options(list.map(function (x) { return [x.id, themeName(x.theme) + ' · ' + own(x.caption)]; }), g.id) + '</select></label>' +
      '<label class="field"><span>' + esc(S('Caption')) + '</span><input type="text" data-card="caption" maxlength="90" value="' + esc(t.caption || '') + '" placeholder="' + esc(own(g.caption)) + '"></label>' +
      '<label class="field"><span>' + esc(S('Question (optional)')) + '</span><input type="text" data-card="question" maxlength="160" value="' + esc(t.question || '') + '" placeholder="' + esc(own(g.question)) + '"></label>' +
      '<label class="field"><span>' + esc(S('Story (optional)')) + '</span><textarea data-card="story" rows="2" maxlength="700" placeholder="' + esc(own(g.story)) + '">' + esc(t.story || '') + '</textarea></label>' +
      '</div></div></div>';
  }
  function notesHtml() {
    return '<div class="arnotes"><h3>' + esc(S('Notes for the care team')) + '</h3><textarea id="arNotes" rows="2" placeholder="' + esc(S('e.g. Do not show the photos of her husband for now.')) + '">' + esc(Album.notes(who)) + '</textarea></div>';
  }

  /* ---------- the numbers ---------- */
  function dashHtml() {
    var st = Album.stats(who, teamLang()), all = Album.list(who, { all: true });
    var byId = {};
    all.forEach(function (r) { byId[r.id] = r; });
    var top = st.topLiked.length ? '<ol class="artop">' + st.topLiked.map(function (x) {
      var r = byId[x.id] || { id: x.id };
      return '<li><span class="arthumb sm">' + pictureOf(r) + '</span><span><b>' + esc(x.caption || '…') + '</b><span class="note">' + esc(themeName(x.theme)) + '</span></span><span class="arlikes">♥ ' + x.n + '</span></li>';
    }).join('') + '</ol>' : '';
    var avoided = st.themes.filter(function (t) { return t.avoided && !t.hidden; }).map(function (t) { return themeName(t.id); });
    return '<div class="ardash"><h3>' + esc(S('Numbers')) + '</h3><div class="arkpis">' +
      '<span><b>' + st.sessions + '</b>' + esc(S('sessions')) + '</span>' +
      '<span><b>' + (st.sessions ? dur(st.avgS) : '–') + '</b>' + esc(S('on average')) + '</span>' +
      '<span><b>' + st.photos + '</b>' + esc(S('photos')) + '</span></div>' +
      top + (avoided.length ? '<p class="note">' + esc(S('Offered, never chosen')) + ': ' + esc(avoided.join(', ')) + '</p>' : '') +
      '<p class="note">' + esc(S('Not a memory or health measure.')) + '</p></div>';
  }

  /* ---------- Photo du jour ---------- */
  function dayHtml() {
    var pd = Album.photoDay(), p = Album.photoOfDay(new Date(), teamLang()), codes = residents();
    return '<div class="arday"><h3>' + esc(S('Photo of the day')) + '</h3><label class="check"><input type="checkbox" id="arDayOn"' + (pd.on ? ' checked' : '') + '> <span>' + esc(S('On the robot’s waiting screen')) + '</span></label>' +
      '<div class="grid2"><label class="field"><span>' + esc(S('Photos of')) + '</span><select id="arDayWho">' + options(codes.map(function (c) { return [c, c]; }), pd.patient || who) + '</select></label>' +
      '<label class="check"><input type="checkbox" id="arDayGeneric"' + (pd.generic ? ' checked' : '') + '> <span>' + esc(S('Only generic pictures')) + '</span></label></div>' +
      '<p class="note">' + esc(S('Everyone passing sees it: personal photos only with consent.')) + '</p>' +
      (p ? '<div class="ardayprev"><span class="arthumb">' + (p.src ? '<img src="' + esc(p.src) + '" alt="">' : p.art) + '</span><span><b>' + esc(S('Today')) + ':</b> ' + esc(p.caption || '') + '</span></div>' : '') + '</div>';
  }

  /* ---------- books (1.16: books only) ---------- */
  function premiumBooks(code) {
    try { if (window.Reading && Reading.premiumOn) return !!Reading.premiumOn(code); } catch (e) { /* below */ }
    return false;
  }
  function askedBooks(code) {
    try { if (window.Reading && Reading.asked) return !!Reading.asked(code); } catch (e) { /* none */ }
    return false;
  }
  function booksHtml() {
    if (!window.Reading || !Reading.data) return '<p class="note">' + esc(S('No books on this screen.')) + '</p>';
    var stories = Reading.data.stories || [], year = new Date().getFullYear(), prem = premiumBooks(who), asked = !prem && askedBooks(who);
    var shown = stories.filter(function (s) { try { return !Reading.licenceOk || Reading.licenceOk(Reading.licenceFor(s.id), year); } catch (e) { return true; } });
    var h = '<div class="arbooksprem"><p><span class="pcrown" aria-hidden="true">♛</span> <b>' + esc(who) + '</b> · ' + esc(prem ? S('Premium books on') : S('Premium books off')) +
      (asked ? ' · <span class="arreq">' + esc(S('{code} asked for them', { code: who })) + '</span>' : '') + '</p>' +
      (window.PlayPremium ? '<button type="button" class="' + (asked ? 'go' : 'ghost') + '" id="arPremium">' + esc(prem ? S('Premium settings') : S('Open Premium')) + '</button>' : '') + '</div>';
    var langs = ['fr', 'de', 'en'];
    h += '<div class="arbooks">' + langs.map(function (l) {
      var list = shown.filter(function (s) { return s.lang === l; });
      if (!list.length) return '';
      return '<div><h3>' + esc(l.toUpperCase()) + ' <span class="note">(' + list.length + ')</span></h3><ul class="arlist">' + list.map(function (s) {
        return '<li>' + (s.premium ? '<span class="pcrown" title="' + esc(S('Premium books')) + '">♛</span> ' : '') + esc(s.title) + '</li>';
      }).join('') + '</ul></div>';
    }).join('') + '</div>';
    if (Reading.licenceFor) {
      h += '<details class="more armore"><summary>' + esc(S('Sources')) + '</summary><div class="tblwrap"><table class="tbl"><thead><tr><th>' + esc(S('Text')) + '</th><th>' + esc(S('Author')) + '</th><th>' + esc(S('Source')) + '</th><th>' + esc(S('Checked')) + '</th></tr></thead><tbody>' +
        stories.map(function (s) {
          var l = Reading.licenceFor(s.id), ok = false;
          try { ok = Reading.licenceOk(l, year); } catch (e) { ok = false; }
          return '<tr><td>' + esc(s.title) + ' <span class="note">(' + esc(String(s.lang || '').toUpperCase()) + ')</span></td><td>' + esc(l ? l.author + ' † ' + l.authorDeath + (l.translator ? ' / ' + l.translator + ' † ' + l.translatorDeath : '') : '') + '</td>' +
            '<td>' + (l && l.sourceUrl ? '<a href="' + esc(l.sourceUrl) + '" target="_blank" rel="noopener">' + esc(l.sourceUrl.replace(/^https:\/\/([^/]+).*$/, '$1')) + '</a>' : '') + '</td><td>' + (ok ? esc(l.verifiedOn) + ' · ' + esc(l.verifiedBy) : '<b class="warn">' + esc(S('incomplete: not shown')) + '</b>') + '</td></tr>';
        }).join('') + '</tbody></table></div></details>';
    }
    return h;
  }

  /* ---------- events ---------- */
  var noteTimer = null;
  function wire(panel) {
    panel.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'arWho') { who = t.value; draft = ''; render(); return; }
      if (t.id === 'arFile' && t.files && t.files[0]) {
        Album.shrink(t.files[0]).then(function (d) { draft = d; var box = $('arDraft'); if (box) box.innerHTML = '<img src="' + esc(d) + '" alt="">'; var b = $('arAdd'); if (b) b.disabled = false; })
          .catch(function () { window.alert(S('Those files are not pictures.')); });
        return;
      }
      if (t.hasAttribute('data-hidetheme')) { Album.hideTheme(who, t.getAttribute('data-hidetheme'), !t.checked); render(); return; }
      if (t.id === 'arCard') { card = t.value; render(); return; }
      if (t.hasAttribute('data-card')) {
        var words = {};
        Array.prototype.forEach.call(panel.querySelectorAll('[data-card]'), function (x) { words[x.getAttribute('data-card')] = x.value; });
        Album.setCardText(who, card, words);
        return;
      }
      var fig = t.closest('.arph');
      if (fig && t.hasAttribute('data-f')) { var f = {}; f[t.getAttribute('data-f')] = t.value; Album.update(who, fig.getAttribute('data-id'), f); if (t.getAttribute('data-f') === 'theme') render(); return; }
      if (t.id === 'arDayOn' || t.id === 'arDayWho' || t.id === 'arDayGeneric') {
        Album.photoDay({ on: $('arDayOn').checked, patient: $('arDayWho').value, generic: $('arDayGeneric').checked });
        render();
      }
    });
    panel.addEventListener('toggle', function (e) { if (e.target && e.target.classList && e.target.classList.contains('armore') && view === 'album') more = e.target.open; }, true);
    panel.addEventListener('input', function (e) {
      if (e.target.id !== 'arNotes') return;
      var v = e.target.value, c = who;
      clearTimeout(noteTimer); noteTimer = setTimeout(function () { Album.setNotes(c, v); }, 400);
    });
    panel.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      if (t.id === 'arAdd') {
        if (!draft) return;
        var r = Album.add(who, { theme: $('arTheme').value, src: draft, caption: $('arCaption').value, question: $('arQuestion').value, story: $('arStory') ? $('arStory').value : '', addedBy: 'staff' });
        if (!r) { window.alert(Album.lastError === 'full' ? S('This robot’s storage is full: remove a few photos first.') : S('Those files are not pictures.')); return; }
        draft = ''; Lab.toast(S('Added to the album.')); render();
        return;
      }
      var ff = t.closest('.arfamph');
      if (ff && FMS()) {
        var mid = ff.getAttribute('data-msg');
        if (t.getAttribute('data-act') === 'famadd') {
          t.disabled = true;
          FMS().albumAdd(mid).then(function () { Lab.toast(S('Added to the album.')); render(); }, function () {
            t.disabled = false;
            Lab.toast(Album.lastError === 'full' ? S('This robot’s storage is full: remove a few photos first.') : S('No connection to the family portal.'));
          });
        } else if (t.getAttribute('data-act') === 'famdel') { FMS().albumRemove(mid); Lab.toast(S('Removed from the album.')); render(); }
        return;
      }
      var fig = t.closest('.arph');
      if (fig && t.getAttribute('data-act') === 'hide') { var cur = Album.get(who, fig.getAttribute('data-id')); Album.update(who, cur.id, { hidden: !cur.hidden }); render(); return; }
      if (fig && t.getAttribute('data-act') === 'del' && window.confirm(S('Remove this photo from the album?'))) { Album.remove(who, fig.getAttribute('data-id')); render(); return; }
      if (t.id === 'arPremium' && window.PlayPremium) PlayPremium.open({ patient: who, product: 'books' });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!$('setup') || !mount()) return;
    if (window.StaffUI && StaffUI.activity) follow({ key: StaffUI.activity() });
    /* the patient chosen in Activities is the one shown here too */
    var p = $('fParticipant');
    if (p) p.addEventListener('change', function () { var c = p.value.trim(); if (c) { who = c; draft = ''; } if (visible()) render(); });
    /* A family photo validated in another tab, or a session on the robot: the open section follows. */
    window.addEventListener(Album.EVENT, function () { var a = document.activeElement; if (visible() && !(a && a.closest && a.closest('#arBody input, #arBody textarea'))) render(); });
    window.addEventListener('storage', function (e) { if (visible() && e.key && /^bellatrix-(album|play-premium|premium|reading|books)/.test(e.key)) render(); });
    window.addEventListener('bellatrix-play-premium', function () { if (visible()) render(); });
    /* Pictures the family portal gave as server addresses are copied here for offline use. */
    setTimeout(function () { Album.cache(); }, 2000);
  });
  /* open(code): the photos of THAT resident (14 Nov: from the family notification on the head, js/family-visit-staff.js);
     15 Nov: they are in Activities > Memories > Personalise, opened for that resident. */
  window.AlbumStaff = { open: function (code) { if (code) who = String(code); show(); if (view === 'album') { render(); familyRefresh(); } }, render: render };
})();
