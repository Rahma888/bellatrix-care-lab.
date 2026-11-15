// 1.16, agent N2: notifications for the family portal (BF-19, BF-25). Plain Node, no packages.
//
// Two ways to reach a relative, always both:
//   1. an in-app notification centre (the bell in portail.html, js/portail-calls.js polls it): it works
//      everywhere, also without https or without permission;
//   2. real Web Push (RFC 8030) to the phones where the relative switched notifications on: VAPID
//      (RFC 8292, ES256) and the "aes128gcm" message encryption (RFC 8291 + RFC 8188), done here with
//      node:crypto only. The push services only see an encrypted blob.
//
// Loaded by store-server.mjs (the hook M added); it registers itself with labland/family-portal.mjs:
//   setNotifier(fn): notify(personId, event) of the portal comes here.
//   routes  GET  family/notify?lang=fr        -> { items, unread, push: { key, devices } }
//           POST family/notify/read            { ids: [...] } or { all: true }
//           POST family/notify/subscribe       { subscription: { endpoint, keys: { p256dh, auth } }, lang }
//           POST family/notify/unsubscribe     { endpoint }
//           POST family/notify/test            a test push to this person's phones
//           GET  family/notify/key             -> { key } (the VAPID public key, base64url)
//
// The events (other agents call notify(personId, event) of family-portal.mjs; only that person is told):
//   { type: 'message_read', label, text? }                     BF-14/25: Bellatrix showed their message
//   { type: 'payment_request', label, product: 'play'|'books', request? }   BF-21/22/25
//   { type: 'premium_active', label, product, until? }         (the subscription is on)
//   The dashes of the portal's names are fine ('message-read', 'payment-request', 'premium-active').
//   { type: 'call_invite', label, until (ISO), invite }       BF-19 (sent by family-callreq.mjs)
//                              15 Nov: it RINGS: "Anna ruft an" / "Anna vous appelle" / "Anna is calling", buttons
//                              Annehmen (straight into the call: the event's url, famille.html#j=…&go=1) and Ablehnen
//                              (event.decline = { invite, pid, k }: sw-portail.js posts it to family/calls/decline);
//                              Urgency high, a short TTL (ringUntil + 15 s: a stale "is calling" is never shown), one
//                              tag per call (the missed-call notice replaces it).
//   { type: 'call_missed', label, invite }  { type: 'call_cancelled', label }  { type: 'call_later', label }
//   { type: 'talk_reminder', label, days, rid }  no call and no message for N days (family-callreq.mjs):
//                              two buttons on the phone, "Now" and "Plan a date" (portail.html#remind=…&a=now|plan)
//   anything else: { type, title: {fr,de,en} | 'text', body: {...} | 'text', tab? }   (e.g. BF-09 events)
//   Optional on every event: rid (the resident's id: the portal opens on that resident), id (dedup key).
//   notifyResident(rid, event, { only: [pids] }) tells every person linked to that resident (or only those).
//
// What is kept (labland/data/portal/notify.json; the VAPID key pair in vapid-keys.json, created on the
// first start): per person, the last 60 notices (30 days) and the push subscriptions of their phones
// (endpoint and the phone's public keys, a language). Nothing else: no name, no email.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as Portal from './family-portal.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LANGS = ['en', 'fr', 'de'];
const DAY = 24 * 3600 * 1000;
const KEEP_ITEMS = 60, KEEP_MS = 30 * DAY, MAX_SUBS = 8;
const RS = 4096;   // the aes128gcm record size: one record, so the payload stays under 3993 bytes
/* The push services of the browsers (Chrome, Edge, Firefox, Safari, Samsung): a subscription that points
   anywhere else is refused, so the server never posts to an address a client chose (no SSRF). */
const PUSH_HOSTS = ['googleapis.com', 'push.services.mozilla.com', 'mozaws.net', 'push.apple.com', 'notify.windows.com'];

/* ---------- Web Push crypto (node:crypto only) ---------- */
export function b64u(buf) { return Buffer.from(buf).toString('base64url'); }
export function unb64u(s) { return Buffer.from(String(s || '').replace(/=+$/, ''), 'base64url'); }

/* A new VAPID key pair (P-256): the public key raw (65 bytes, uncompressed), the private scalar (32). */
export function newVapidKeys() {
  const e = crypto.createECDH('prime256v1');
  e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}
function vapidKeyObject(v) {
  const pub = unb64u(v.publicKey);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}
/* RFC 8292: the Authorization header of a push request, a JWT signed with ES256 for the push service's
   origin. Signed for each push and valid one hour (Apple's push service wants a short expiry). */
export function vapidAuth(endpoint, vapid, subject, nowMs) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor((nowMs || Date.now()) / 1000) + 3600, sub: subject }));
  const data = head + '.' + claims;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: vapidKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + data + '.' + b64u(sig) + ', k=' + vapid.publicKey;
}
/* RFC 8291: the payload encrypted for one subscription (p256dh = the phone's public key, auth = its
   16-byte secret), as one aes128gcm record: salt | rs | idlen | sender public key | ciphertext+tag.
   opt.salt and opt.senderPrivate only for the RFC test vector. */
export function encryptPayload(plain, p256dh, auth, opt = {}) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  if (ua.length !== 65 || ua[0] !== 4 || secret.length < 16) throw new Error('bad-keys');
  const as = crypto.createECDH('prime256v1');
  if (opt.senderPrivate) as.setPrivateKey(unb64u(opt.senderPrivate)); else as.generateKeys();
  const asPub = as.getPublicKey();
  const shared = as.computeSecret(ua);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, secret, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const salt = opt.salt ? unb64u(opt.salt) : crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const data = Buffer.concat([Buffer.from(plain), Buffer.from([2])]);   // 0x02: the last (and only) record, no padding
  if (data.length + 16 > RS) throw new Error('too-big');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(data), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0); head.writeUInt32BE(RS, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}
/* The receiving side (what the browser does), for the tests: the phone's private key and secret. */
export function decryptPayload(body, uaPrivate, auth) {
  body = Buffer.from(body);
  const salt = body.subarray(0, 16), rs = body.readUInt32BE(16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  if (rs < 18 || ct.length > rs) throw new Error('bad-record');
  const ua = crypto.createECDH('prime256v1');
  ua.setPrivateKey(unb64u(uaPrivate));
  const shared = ua.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, unb64u(auth), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = out.length - 1;
  while (end >= 0 && out[end] === 0) end--;
  if (end < 0 || out[end] !== 2) throw new Error('bad-padding');
  return out.subarray(0, end);
}
/* Checks a VAPID header (tests): the signature with the given public key, the audience and the expiry. */
export function verifyVapid(header, endpoint, nowMs) {
  const m = /^vapid t=([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/.exec(String(header || ''));
  if (!m) return null;
  const pub = unb64u(m[4]);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(m[1] + '.' + m[2]), { key, dsaEncoding: 'ieee-p1363' }, unb64u(m[3]));
  const claims = JSON.parse(unb64u(m[2]).toString('utf8'));
  const t = Math.floor((nowMs || Date.now()) / 1000);
  return { ok: ok && claims.aud === new URL(endpoint).origin && claims.exp > t && claims.exp <= t + 24 * 3600, claims, key: m[4] };
}

/* ---------- the texts (FR, DE, EN), the same on the lock screen and in the bell ---------- */
const PRODUCT = { play: { en: 'Bellatrix Play Premium', fr: 'Bellatrix Play Premium', de: 'Bellatrix Play Premium' }, books: { en: 'Books Premium', fr: 'Livres Premium', de: 'Bücher Premium' } };
const TEXTS = {
  message_read: { tab: 'history', en: ['{name} read your message', ''], fr: ['{name} a lu votre message', ''], de: ['{name} hat Ihre Nachricht gelesen', ''] },
  payment_request: { tab: 'premium', en: ['{product} for {name}', 'The care team is waiting for your answer.'], fr: ['{product} pour {name}', 'L’équipe attend votre accord.'], de: ['{product} für {name}', 'Das Pflegeteam wartet auf Ihre Antwort.'] },
  premium_active: { tab: 'premium', en: ['{product} is active for {name}', ''], fr: ['{product} est actif pour {name}', ''], de: ['{product} ist für {name} aktiv', ''] },
  call_invite: { tab: 'calls', sticky: true, urgent: true, ring: true, en: ['{name} is calling', 'Bellatrix video call'], fr: ['{name} vous appelle', 'Appel vidéo Bellatrix'], de: ['{name} ruft an', 'Videoanruf über Bellatrix'],
    actions: [['accept', { en: 'Answer', fr: 'Répondre', de: 'Annehmen' }], ['decline', { en: 'Decline', fr: 'Refuser', de: 'Ablehnen' }]] },
  call_missed: { tab: 'calls', en: ['Missed call from {name}', 'Ask for a call when it suits you.'], fr: ['Appel manqué de {name}', 'Demandez un appel quand cela vous convient.'], de: ['Verpasster Anruf von {name}', 'Bitten Sie um einen Anruf, wenn es Ihnen passt.'] },
  call_cancelled: { tab: 'calls', en: ['Call with {name} cancelled', ''], fr: ['Appel avec {name} annulé', ''], de: ['Anruf mit {name} abgesagt', ''] },
  call_visit: { tab: 'calls', en: ['Bellatrix is on the way to {name}…', 'You will get the invitation as soon as everything is ready.'], fr: ['Bellatrix va voir {name}…', 'Vous recevrez l’invitation dès que tout est prêt.'], de: ['Bellatrix ist auf dem Weg zu {name} …', 'Sie bekommen die Einladung, sobald alles bereit ist.'] },
  call_later: { tab: 'calls', en: ['Call request: a little later', 'The care team will get back to you soon.'], fr: ['Demande d’appel : un peu plus tard', 'L’équipe revient vers vous bientôt.'], de: ['Anrufwunsch: etwas später', 'Das Pflegeteam meldet sich bald.'] },
  talk_reminder: { tab: 'calls', en: ['You have not talked with {name} for {span}', 'Now, or plan a date?'], fr: ['Vous n’avez pas parlé avec {name} depuis {span}', 'Maintenant, ou planifier une date ?'], de: ['Sie haben seit {span} nicht mit {name} gesprochen', 'Jetzt, oder einen Termin planen?'],
    actions: [['now', { en: 'Now', fr: 'Maintenant', de: 'Jetzt' }], ['plan', { en: 'Plan a date', fr: 'Planifier une date', de: 'Termin planen' }]] },
  test: { tab: 'calls', en: ['Notifications are on', 'You will be told here.'], fr: ['Notifications activées', 'Vous serez prévenu ici.'], de: ['Benachrichtigungen sind an', 'Sie werden hier informiert.'] }
};
const SPAN = { en: ['1 day', '{n} days'], fr: ['1 jour', '{n} jours'], de: ['1 Tag', '{n} Tagen'] };   // "for 7 days", "depuis 7 jours", "seit 7 Tagen"
function span(n, l) { n = Math.max(1, Math.round(Number(n) || 1)); return (n === 1 ? SPAN[l][0] : SPAN[l][1]).replace('{n}', n); }
const SOMEONE = { en: 'Your loved one', fr: 'Votre proche', de: 'Ihr Angehöriger' };
const LOCALE = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE' };
function lang(v) { return LANGS.includes(v) ? v : 'en'; }
function fill(s, v) { return String(s || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m)); }
function hhmm(iso, l) { const t = Date.parse(iso); if (!isFinite(t)) return ''; try { return new Date(t).toLocaleTimeString(LOCALE[l], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(t).toISOString().slice(11, 16); } }
function pick(x, l) { if (!x) return ''; if (typeof x === 'string') return x; return x[l] || x.en || x.fr || x.de || ''; }
/* A notice in one language: { title, body }. */
export function textOf(item, l) {
  l = lang(l);
  const t = TEXTS[item.type], v = item.vars || {};
  if (!t) return { title: pick(item.title, l).slice(0, 120), body: pick(item.body, l).slice(0, 240) };
  const vars = { name: v.label || SOMEONE[l], product: v.product ? pick(PRODUCT[v.product] || v.product, l) : '', time: v.until ? hhmm(v.until, l) : '', span: span(v.days, l) };
  const q = { en: ['“', '”'], fr: ['« ', ' »'], de: ['„', '“'] }[l], ex = String(v.text || '');
  const body = item.type === 'message_read' && ex ? q[0] + ex.slice(0, 80) + (ex.length > 80 ? '…' : '') + q[1] : fill(t[l][1], vars);
  return { title: fill(t[l][0], vars), body };
}
/* The event names other modules use ('message-read', 'payment-request', 'premium-active', …). */
function normType(t) {
  const s = String(t || '').toLowerCase().replace(/[^a-z_]+/g, '_');
  if (TEXTS[s]) return s;
  if (/^message_(shown|seen)$|^read$/.test(s)) return 'message_read';
  if (/^(premium_|payment_)?(request|pay)$/.test(s)) return 'payment_request';
  if (/^premium_(on|activated)$/.test(s)) return 'premium_active';
  if (/^call_?missed$/.test(s)) return 'call_missed';
  if (/^call_?invit/.test(s)) return 'call_invite';
  return s || 'info';
}

/* ---------- the module ---------- */
export function createNotify(opts = {}) {
  const P = opts.portal || Portal;   // personsOfResident, linkedResidents: the portal's shared functions
  const now = opts.now || (() => Date.now());
  const log = opts.log || ((t) => console.log(new Date().toLocaleTimeString('en-GB') + '  notify: ' + t));
  const SUBJECT = opts.subject || process.env.VAPID_SUBJECT || 'mailto:pilot@bellatrix.example';
  let DIR = opts.dataDir || null;
  function dir() { return DIR || (DIR = process.env.PORTAL_DATA || path.join(HERE, 'data', 'portal')); }
  /* The push transport; the tests give their own local receiver. */
  const allowEndpoint = opts.allowEndpoint || ((u) => u.protocol === 'https:' && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)));
  const post = opts.post || ((endpoint, headers, body) => fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000) }).then((r) => r.status));

  /* ---------- storage ---------- */
  let data = null, vapid = null;
  function file() { return path.join(dir(), 'notify.json'); }
  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
    if (!data.persons || typeof data.persons !== 'object') data.persons = {};
    return data;
  }
  let saveTimer = null;
  function save(now2) {
    if (now2 === false) { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(true), 200); if (saveTimer.unref) saveTimer.unref(); return; }
    fs.mkdirSync(dir(), { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(load(), null, 1));
    fs.renameSync(tmp, file());
  }
  function person(pid, create) {
    const d = load();
    let p = d.persons[pid];
    if (!p && create) p = d.persons[pid] = { items: [], subs: [] };
    if (p) { p.items = Array.isArray(p.items) ? p.items : []; p.subs = Array.isArray(p.subs) ? p.subs : []; }
    return p || null;
  }
  /* The VAPID key pair: made once, kept next to the portal data (never sent anywhere but the public half). */
  function keys() {
    if (vapid) return vapid;
    const f = path.join(dir(), 'vapid-keys.json');
    try { const v = JSON.parse(fs.readFileSync(f, 'utf8')); if (v && v.publicKey && v.privateKey) vapid = v; } catch (e) { vapid = null; }
    if (!vapid) {
      vapid = Object.assign(newVapidKeys(), { created: new Date(now()).toISOString() });
      fs.mkdirSync(dir(), { recursive: true });
      fs.writeFileSync(f, JSON.stringify(vapid, null, 1), { mode: 0o600 });
      log('new VAPID key pair for Web Push (labland/data/portal/vapid-keys.json)');
    }
    return vapid;
  }
  function sweep(p) {
    const t = now();
    p.items = p.items.filter((x) => t - Date.parse(x.at) < KEEP_MS).slice(0, KEEP_ITEMS);
  }

  /* ---------- push ---------- */
  const results = [];   // the last deliveries (tests and the log), memory only
  function topicOf(tag) { return crypto.createHash('sha256').update(String(tag)).digest('base64url').slice(0, 32); }
  function pushTo(pid, sub, item) {
    const l = lang(sub.lang), tx = textOf(item, l), t = TEXTS[item.type] || {};
    const payload = { v: 1, id: item.id, type: item.type, title: tx.title, body: tx.body, tag: item.tag, rid: item.rid || '', tab: item.tab || '', url: item.url || 'portail.html#n=' + item.id + (item.rid ? '&r=' + item.rid : ''),
      sticky: !!t.sticky, at: item.at, lang: l };
    /* Buttons on the notification itself (where the phone shows them), each with its own address. */
    /* A ringing call: Answer opens the call itself, Decline is posted by the service worker (no window). */
    if (t.ring) {
      payload.ring = true; payload.invite = (item.vars || {}).invite || ''; payload.ringUntil = (item.vars || {}).ringUntil || '';
      if (item.decline) payload.decline = item.decline;
      payload.actions = t.actions.map((a) => ({ action: a[0], title: a[1][l], url: a[0] === 'accept' ? payload.url : '' }));
    } else if (t.actions && item.rid) payload.actions = t.actions.map((a) => ({ action: a[0], title: a[1][l], url: 'portail.html#remind=' + item.rid + '&a=' + a[0] }));
    let body;
    try { body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub.keys.p256dh, sub.keys.auth); } catch (e) { return Promise.resolve(0); }
    /* a ringing call lives as long as it rings (plus 15 s); an older invitation until its end; the rest a day */
    const v0 = item.vars || {}, ringEnd = item.type === 'call_invite' && v0.ringUntil ? Date.parse(v0.ringUntil) : NaN;
    const ttl = isFinite(ringEnd) ? Math.max(15, Math.min(120, Math.round((ringEnd - now()) / 1000) + 15))
      : item.type === 'call_invite' && v0.until ? Math.max(30, Math.round((Date.parse(v0.until) - now()) / 1000)) : 24 * 3600;
    const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: String(ttl), Urgency: t.urgent ? 'high' : 'normal',
      Topic: topicOf(item.tag), Authorization: vapidAuth(sub.endpoint, keys(), SUBJECT, now()) };
    return Promise.resolve().then(() => post(sub.endpoint, headers, body)).then((status) => {
      results.unshift({ pid, endpoint: sub.endpoint, status, type: item.type, at: new Date(now()).toISOString() });
      results.length = Math.min(results.length, 50);
      const p = person(pid);
      const s = p && p.subs.find((x) => x.endpoint === sub.endpoint);
      if (!s) return status;
      if (status === 404 || status === 410) { p.subs = p.subs.filter((x) => x !== s); log('a phone stopped receiving notifications (subscription gone)'); }
      else if (status >= 200 && status < 300) { s.ok = new Date(now()).toISOString(); s.fails = 0; }
      else { s.fails = (s.fails || 0) + 1; s.err = status; if (s.fails >= 20) p.subs = p.subs.filter((x) => x !== s); }
      save(false);
      return status;
    }, (e) => {
      results.unshift({ pid, endpoint: sub.endpoint, status: 0, error: String(e && e.message || e), type: item.type, at: new Date(now()).toISOString() });
      const p = person(pid), s = p && p.subs.find((x) => x.endpoint === sub.endpoint);
      if (s) { s.fails = (s.fails || 0) + 1; s.err = 0; save(false); }
      return 0;
    });
  }

  /* ---------- notify ---------- */
  /* One notice to one person: in the bell at once, and pushed to their phones. Returns the notice
     (with .sent, a Promise of the push statuses). Same tag: the notice replaces the older one (an
     invitation becomes "missed"). */
  function notify(pid, event) {
    if (!pid || !event || typeof event !== 'object') return null;
    pid = String(pid).slice(0, 40);
    const type = normType(event.type), t = now();
    const vars = {};
    for (const k of ['label', 'product', 'months', 'until', 'ringUntil', 'text', 'invite', 'request', 'days']) if (event[k] != null && event[k] !== '') vars[k] = typeof event[k] === 'string' ? event[k].slice(0, 200) : event[k];
    if (!vars.label && event.resident) vars.label = String(event.resident).slice(0, 40);
    if (!vars.label && event.rid) { try { const r = (P.linkedResidents(pid) || []).find((x) => x.rid === event.rid); if (r) vars.label = r.label; } catch (e) { /* no label */ } }
    const item = { id: crypto.randomBytes(9).toString('base64url'), type, at: new Date(t).toISOString(), read: false, vars, rid: event.rid ? String(event.rid).slice(0, 40) : '',
      tab: String(event.tab || (TEXTS[type] && TEXTS[type].tab) || '').slice(0, 20),
      /* The same tag replaces: an invitation and its end; "read" once per resident (a burst of reads is one
         notice); one per payment request. */
      tag: String(event.tag || (event.invite ? 'call-' + event.invite : type === 'message_read' ? 'read-' + (event.rid || '') : (event.id || event.request || event.message) ? type + '-' + (event.id || event.request || event.message) : type + '-' + t)).slice(0, 60) };
    if (!TEXTS[type]) { item.title = event.title || ''; item.body = event.body || ''; }
    /* Where a tap on the phone's notification leads: the portal (default), or straight into the call. */
    if (/^(portail|famille)\.html#[A-Za-z0-9=&_.-]{1,120}$/.test(String(event.url || ''))) item.url = event.url;
    /* the Decline button of a ringing call: which call, for whom, and its key (family-callreq.mjs); never shown in the bell */
    const dc = event.decline;
    if (dc && typeof dc === 'object' && /^[A-Za-z0-9_-]{6,40}$/.test(String(dc.invite || '')) && /^[A-Za-z0-9_-]{6,40}$/.test(String(dc.pid || '')) && /^[A-Za-z0-9_-]{16,64}$/.test(String(dc.k || ''))) item.decline = { invite: String(dc.invite), pid: String(dc.pid), k: String(dc.k) };
    const p = person(pid, true);
    sweep(p);
    /* The same tag replaces the older notice in the bell too. */
    p.items = p.items.filter((x) => x.tag !== item.tag);
    p.items.unshift(item);
    p.items.length = Math.min(p.items.length, KEEP_ITEMS);
    save(false);
    item.sent = event.push === false ? Promise.resolve([]) : Promise.all(p.subs.slice().map((s) => pushTo(pid, s, item)));
    return item;
  }
  /* Everybody linked to a resident (opts.only: just these persons, if they are linked). */
  function notifyResident(rid, event, o = {}) {
    let pids = [];
    try { pids = P.personsOfResident(rid) || []; } catch (e) { pids = []; }
    if (Array.isArray(o.only)) pids = pids.filter((x) => o.only.includes(x));
    return pids.map((pid) => notify(pid, Object.assign({ rid }, event)));
  }

  /* ---------- routes (family side) ---------- */
  function view(x, l) { const tx = textOf(x, l); return { id: x.id, type: x.type, at: x.at, read: !!x.read, title: tx.title, body: tx.body, tab: x.tab, rid: x.rid, invite: (x.vars || {}).invite || '', until: (x.vars || {}).until || '' }; }
  function familyRoute(req, url, body, ctx) {
    const f = ctx.family;
    /* A session without an active resident (suspended, removed) is not "signed out": 403, so the portal
       does not sign the person out because of this module. */
    if (!f) return /^Bearer\s/i.test(String((req.headers || {}).authorization || '')) ? [403, { error: 'no-access' }] : [401, { error: 'signed-out' }];
    const pid = f.pid || f.id, post = req.method === 'POST', sub = String(ctx.path || '').replace(/^\/+/, '');
    if (sub === 'key' && !post) return [200, { key: keys().publicKey }];
    if (sub === '' && !post) {
      const p = person(pid), l = lang(ctx.q('lang') || f.lang);
      if (p) sweep(p);
      const items = p ? p.items : [];
      return [200, { items: items.slice(0, 40).map((x) => view(x, l)), unread: items.filter((x) => !x.read).length,
        push: { key: keys().publicKey, devices: p ? p.subs.length : 0, last: p && p.subs.length ? p.subs.map((s) => s.ok || '').sort().pop() || null : null } }];
    }
    if (sub === 'read' && post) {
      const p = person(pid);
      if (!p) return [200, { ok: true, unread: 0 }];
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      p.items.forEach((x) => { if (body.all === true || ids.includes(x.id)) x.read = true; });
      save(false);
      return [200, { ok: true, unread: p.items.filter((x) => !x.read).length }];
    }
    if (sub === 'subscribe' && post) {
      const s = body.subscription && typeof body.subscription === 'object' ? body.subscription : {};
      const endpoint = String(s.endpoint || '').slice(0, 800), k = s.keys || {};
      let u = null;
      try { u = new URL(endpoint); } catch (e) { u = null; }
      if (!u || !allowEndpoint(u)) return [400, { error: 'bad-endpoint' }];
      const p256dh = String(k.p256dh || ''), auth = String(k.auth || '');
      if (unb64u(p256dh).length !== 65 || unb64u(auth).length < 16) return [400, { error: 'bad-keys' }];
      const p = person(pid, true);
      /* The same phone may come back under another person (a shared tablet): only the last one keeps it. */
      for (const [other, q] of Object.entries(load().persons)) if (other !== pid && q.subs) q.subs = q.subs.filter((x) => x.endpoint !== endpoint);
      const old = p.subs.find((x) => x.endpoint === endpoint);
      const rec = { endpoint, keys: { p256dh, auth }, lang: lang(body.lang || f.lang), at: old ? old.at : new Date(now()).toISOString(), seen: new Date(now()).toISOString(), ok: old ? old.ok || null : null, fails: 0 };
      p.subs = [rec].concat(p.subs.filter((x) => x.endpoint !== endpoint)).slice(0, MAX_SUBS);
      save(true);
      if (!old) log('a family member switched notifications on for a phone');
      return [200, { ok: true, devices: p.subs.length }];
    }
    if (sub === 'unsubscribe' && post) {
      const p = person(pid);
      const endpoint = String(body.endpoint || '');
      if (p) { p.subs = p.subs.filter((x) => x.endpoint !== endpoint); save(true); }
      return [200, { ok: true, devices: p ? p.subs.length : 0 }];
    }
    if (sub === 'test' && post) {
      const item = notify(pid, { type: 'test', rid: f.rid, label: f.label, tag: 'test' });
      return [200, { ok: true, devices: (person(pid) || { subs: [] }).subs.length, id: item ? item.id : '' }];
    }
    return [404, { error: 'not-found' }];
  }

  /* Forget a person (account deleted): their notices and phones. */
  function forget(pid) { const d = load(); if (d.persons[pid]) { delete d.persons[pid]; save(true); } }

  return { notify, notifyResident, familyRoute, forget, publicKey: () => keys().publicKey, results, _data: () => load(), dir: () => dir() };
}

/* ---------- the shared instance, registered with the portal (store-server.mjs imports this file) ---------- */
let SHARED = null;
export function shared() { return SHARED || (SHARED = createNotify()); }
export function notify(pid, event) { return shared().notify(pid, event); }
export function notifyResident(rid, event, o) { return shared().notifyResident(rid, event, o); }
if (typeof Portal.registerRoutes === 'function' && !process.env.BELLATRIX_NOTIFY_NO_REGISTER) {
  Portal.registerRoutes('family/notify', (req, url, body, ctx) => shared().familyRoute(req, url, body, ctx));
  if (typeof Portal.setNotifier === 'function') Portal.setNotifier((pid, event) => { shared().notify(pid, event); });
}
