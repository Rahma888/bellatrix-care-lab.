// Bellatrix · e-mails from the family portal (24 Nov, Rahma: "to check the e-mail address and send the codes we need
// an e-mail service (SMTP); choose a free one"). A small SMTP client on node:net / node:tls, no packages:
// implicit TLS (port 465) or STARTTLS (587 and others), AUTH PLAIN or LOGIN, a UTF-8 plain-text message.
//
// Configuration (nothing configured = nothing is sent, the portal works exactly as before):
//   environment  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, BELLATRIX_PUBLIC_URL (optional, for links)
//   or the file  labland/smtp.local.json  { "host", "port", "user", "pass", "from", "site" }  (never published: .gitignore)
// Recommended free service: Brevo (smtp-relay.brevo.com, port 587). The password / key is never printed.
//
// Addresses on reserved test domains (.test, .example, .invalid, .localhost, example.com/.net/.org) are never sent to,
// so tests and demo accounts can never mail anybody.
import fs from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LOCAL_FILE = path.join(HERE, 'smtp.local.json');

/* The settings, or null when e-mail is not set up. */
export function mailConfig(env = process.env, file = LOCAL_FILE) {
  let f = {};
  try { f = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (e) { f = {}; }
  const host = String(env.SMTP_HOST || f.host || '').trim();
  const from = String(env.SMTP_FROM || f.from || '').trim();
  if (!host || !from) return null;
  const port = parseInt(env.SMTP_PORT || f.port || 587, 10) || 587;
  return {
    host, port, from,
    user: String(env.SMTP_USER || f.user || ''), pass: String(env.SMTP_PASS || f.pass || ''),
    site: String(env.BELLATRIX_PUBLIC_URL || f.site || '').trim().replace(/\/+$/, ''),
    secure: port === 465,
    plainOk: f.plainOk === true || env.SMTP_PLAIN_OK === '1'   /* only for a local test server: credentials in clear */
  };
}

/* Reserved names that no real mailbox has (RFC 2606, 6761). */
export function reservedAddress(to) {
  const dom = String(to || '').toLowerCase().split('@')[1] || '';
  return !dom || /(^|\.)(test|example|invalid|localhost)$/.test(dom) || /^example\.(com|net|org)$/.test(dom);
}

function oneLine(s) { return String(s || '').replace(/[\r\n]+/g, ' ').trim(); }
function addrOf(from) { const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from); return m ? m[1] : oneLine(from); }
function word(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='; }
function fromHeader(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from);
  return m ? (m[1] ? word(m[1]) + ' ' : '') + '<' + m[2] + '>' : addrOf(from);
}

/* The whole message: plain text in UTF-8, base64 (no line can start with a dot, no 8-bit trouble). */
export function buildMessage(cfg, msg) {
  const id = crypto.randomBytes(12).toString('hex') + '@' + (addrOf(cfg.from).split('@')[1] || 'bellatrix');
  const body = Buffer.from(String(msg.text || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  return ['From: ' + fromHeader(cfg.from), 'To: <' + oneLine(msg.to) + '>', 'Subject: ' + word(oneLine(msg.subject)),
    'Date: ' + new Date().toUTCString(), 'Message-ID: <' + id + '>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', 'Auto-Submitted: auto-generated', '', body].join('\r\n');
}

/* One SMTP conversation. Resolves when the server accepted the message. */
export function smtpSend(cfg, msg, opts = {}) {
  const timeoutMs = opts.timeoutMs || 15000;
  return new Promise((resolve, reject) => {
    let sock = null, buf = '', waiting = null, done = false;
    const fail = (e) => { if (done) return; done = true; try { sock && sock.destroy(); } catch (x) { /* closed */ } reject(e instanceof Error ? e : new Error(String(e))); };
    const onData = (c) => {
      buf += c.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1);
        if (!waiting) continue;
        waiting.lines.push(line);
        if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) { const w = waiting; waiting = null; w.res({ code: parseInt(line.slice(0, 3), 10), lines: w.lines }); }
      }
    };
    const reply = () => new Promise((res) => { waiting = { res, lines: [] }; });
    const wire = (s) => { s.setTimeout(timeoutMs, () => fail(new Error('smtp timeout'))); s.on('data', onData); s.on('error', (e) => fail(new Error('smtp ' + (e.code || e.message)))); };
    const cmd = async (line, want) => {
      const r = reply(); sock.write(line + '\r\n'); const a = await r;
      if (!want.includes(a.code)) throw new Error('smtp ' + a.code + ' after ' + line.split(' ')[0] + ': ' + a.lines.join(' | ').slice(0, 160));
      return a;
    };
    const greet = async () => { const r = reply(); const a = await r; if (a.code !== 220) throw new Error('smtp greeting ' + a.code); };
    const run = async () => {
      await greet();
      const name = 'bellatrix.' + (os.hostname() || 'local').replace(/[^A-Za-z0-9.-]/g, '');
      let ehlo = await cmd('EHLO ' + name, [250]);
      let secured = cfg.secure;
      if (!secured && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        const t = tls.connect({ socket: sock, servername: cfg.host, rejectUnauthorized: opts.rejectUnauthorized !== false });
        await new Promise((ok, no) => { t.once('secureConnect', ok); t.once('error', no); });
        sock = t; wire(sock); secured = true;
        ehlo = await cmd('EHLO ' + name, [250]);
      }
      if (cfg.user) {
        if (!secured && !cfg.plainOk) throw new Error('smtp: no TLS offered, the password is not sent in clear');
        const caps = ehlo.lines.join(' ').toUpperCase();
        if (/AUTH[ =][^\n]*PLAIN/.test(caps)) await cmd('AUTH PLAIN ' + Buffer.from('\0' + cfg.user + '\0' + cfg.pass, 'utf8').toString('base64'), [235]);
        else {
          await cmd('AUTH LOGIN', [334]);
          await cmd(Buffer.from(cfg.user, 'utf8').toString('base64'), [334]);
          await cmd(Buffer.from(cfg.pass, 'utf8').toString('base64'), [235]);
        }
      }
      await cmd('MAIL FROM:<' + addrOf(cfg.from) + '>', [250]);
      await cmd('RCPT TO:<' + oneLine(msg.to) + '>', [250, 251]);
      await cmd('DATA', [354]);
      await cmd(buildMessage(cfg, msg) + '\r\n.', [250]);
      try { sock.write('QUIT\r\n'); } catch (e) { /* closing anyway */ }
      done = true; try { sock.end(); } catch (e) { /* closed */ }
      resolve(true);
    };
    try {
      sock = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host, rejectUnauthorized: opts.rejectUnauthorized !== false })
        : net.connect({ host: cfg.host, port: cfg.port });
      wire(sock);
      run().catch(fail);
    } catch (e) { fail(e); }
  });
}

/* The portal's mailer: send(to, subject, text) never throws and never waits for the portal's answer. */
export function createMailer(cfg, log = () => {}) {
  const on = !!cfg;
  return {
    enabled: on,
    site: on ? cfg.site : '',
    send(to, subject, text) {
      if (!on || reservedAddress(to)) return Promise.resolve(false);
      return smtpSend(cfg, { to, subject, text }).then(() => { log('e-mail sent to ' + String(to).replace(/^(.).*@/, '$1***@')); return true; },
        (e) => { log('e-mail not sent (' + String(e.message || e).replace(cfg.pass || '\u0000', '***') + ')'); return false; });
    }
  };
}

/* The texts (FR / DE / EN): the sign-in code and the confirmation of a new address. */
const T = {
  fr: { codeS: 'Votre code Bellatrix', codeB: 'Bonjour {name},\n\nVotre code pour vous connecter au portail famille Bellatrix : {code}\nIl est valable 15 minutes.\n\nSi vous n’avez rien demandé, ignorez ce message.\n\nBellatrix',
        verS: 'Confirmez votre adresse e-mail', verB: 'Bonjour {name},\n\nBienvenue sur le portail famille Bellatrix.\nVotre code de confirmation : {code}{link}\nIl est valable 48 heures.\n\nSi vous n’avez pas créé de compte, ignorez ce message.\n\nBellatrix', link: '\nOu ouvrez ce lien : {url}' },
  de: { codeS: 'Ihr Bellatrix-Code', codeB: 'Hallo {name},\n\nIhr Code für die Anmeldung im Bellatrix-Familienportal: {code}\nEr gilt 15 Minuten.\n\nWenn Sie nichts angefordert haben, ignorieren Sie diese Nachricht.\n\nBellatrix',
        verS: 'Bestätigen Sie Ihre E-Mail-Adresse', verB: 'Hallo {name},\n\nwillkommen im Bellatrix-Familienportal.\nIhr Bestätigungscode: {code}{link}\nEr gilt 48 Stunden.\n\nWenn Sie kein Konto angelegt haben, ignorieren Sie diese Nachricht.\n\nBellatrix', link: '\nOder öffnen Sie diesen Link: {url}' },
  en: { codeS: 'Your Bellatrix code', codeB: 'Hello {name},\n\nYour code to sign in to the Bellatrix family portal: {code}\nIt is valid for 15 minutes.\n\nIf you did not ask for it, ignore this message.\n\nBellatrix',
        verS: 'Confirm your e-mail address', verB: 'Hello {name},\n\nWelcome to the Bellatrix family portal.\nYour confirmation code: {code}{link}\nIt is valid for 48 hours.\n\nIf you did not create an account, ignore this message.\n\nBellatrix', link: '\nOr open this link: {url}' }
};
function fill(s, v) { return s.replace(/\{(\w+)\}/g, (m, k) => (v[k] !== undefined ? String(v[k]) : m)); }
export function mailText(kind, lang, v) {
  const t = T[lang] || T.en;
  if (kind === 'code') return { subject: t.codeS, text: fill(t.codeB, v) };
  return { subject: t.verS, text: fill(t.verB, Object.assign({}, v, { link: v.url ? fill(t.link, v) : '' })) };
}
