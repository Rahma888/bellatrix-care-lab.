/* Bellatrix speaks English, French or German. The care team chooses the language per patient
   (Session tab, "Language"); everything the patient sees and hears follows it. The care-team page
   itself stays in English.

   - The English text is the key: I18N.t('fr', 'Find the pairs') gives the French text, or the
     English one when no translation exists (nothing ever breaks, it just stays English).
   - {name} placeholders are filled from an object: I18N.t(lang, 'Level {n} of {top}', { n: 1, top: 4 }).
   - Translations are added per file with I18N.add('fr', { 'English': 'Français', ... }).
   - A default content value can be one text or { en: '…', fr: '…', de: '…' }; I18N.pick chooses. */
var I18N = (function () {
  'use strict';
  var dict = { fr: {}, de: {} };
  var LANGS = [['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch']];
  var BCP47 = { en: 'en-US', fr: 'fr-FR', de: 'de-DE' };
  function valid(lang) { return lang === 'fr' || lang === 'de' ? lang : 'en'; }
  function add(lang, table) {
    if (!dict[lang]) return;
    Object.keys(table).forEach(function (k) { dict[lang][k] = table[k]; });
  }
  function fill(s, vars) {
    if (!vars) return s;
    return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m; });
  }
  function t(lang, s, vars) {
    lang = valid(lang);
    var out = s;
    if (lang !== 'en' && s && Object.prototype.hasOwnProperty.call(dict[lang], s)) out = dict[lang][s];
    return fill(out, vars);
  }
  function pick(lang, v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      lang = valid(lang);
      return v[lang] !== undefined ? v[lang] : v.en;
    }
    return v;
  }
  /* English texts without a translation, for checking a language (browser console: I18N.missing('de')). */
  var seen = {};
  function note(s) { if (s) seen[s] = true; }
  function missing(lang) { return Object.keys(seen).filter(function (s) { return !Object.prototype.hasOwnProperty.call(dict[valid(lang)] || {}, s); }); }
  return { add: add, t: function (lang, s, vars) { note(s); return t(lang, s, vars); }, pick: pick, valid: valid, LANGS: LANGS, BCP47: BCP47, missing: missing, dict: dict };
})();
