// E-mails of the family portal (labland/mailer.mjs, 24 Nov): the SMTP conversation against a fake local server,
// nothing sent without settings or to test addresses, and the portal's use (sign-in code, address confirmation).
// Run: node --test tests/mailer.test.mjs. Silent, local only.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { mailConfig, smtpSend, createMailer, reservedAddress, mailText } from '../labland/mailer.mjs';
import { createPortal } from '../labland/family-portal.mjs';

/* A fake SMTP server: records the commands and the message; offers AUTH PLAIN LOGIN, no TLS. */
function fakeSmtp() {
  const got = { cmds: [], data: '', conns: 0 };
  const server = net.createServer((s) => {
    got.conns++;
    let buf = '', inData = false;
    s.write('220 fake ESMTP\r\n');
    s.on('data', (c) => {
      buf += c.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) { if (line === '.') { inData = false; s.write('250 queued\r\n'); } else got.data += line + '\r\n'; continue; }
        got.cmds.push(line);
        if (/^EHLO/.test(line)) s.write('250-fake\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        else if (/^AUTH PLAIN/.test(line)) s.write('235 ok\r\n');
        else if (/^MAIL FROM/.test(line) || /^RCPT TO/.test(line)) s.write('250 ok\r\n');
        else if (line === 'DATA') { inData = true; s.write('354 go\r\n'); }
        else if (line === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
        else s.write('500 ?\r\n');
      }
    });
    s.on('error', () => {});
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, got, port: server.address().port })));
}

test('no settings: no mailer, nothing is sent; test domains are never mailed', async () => {
  const none = path.join(os.tmpdir(), 'no-such-smtp-' + crypto.randomBytes(4).toString('hex') + '.json');
  assert.equal(mailConfig({}, none), null);
  const m = createMailer(null);
  assert.equal(m.enabled, false);
  assert.equal(await m.send('marie@exemple.fr', 'x', 'y'), false);
  for (const a of ['a@example.test', 'b@x.example', 'c@foo.invalid', 'd@localhost', 'e@example.com', 'f@example.org']) assert.ok(reservedAddress(a), a);
  assert.ok(!reservedAddress('sophie@exemple.fr'));
  const f = await fakeSmtp();
  const live = createMailer({ host: '127.0.0.1', port: f.port, from: 'Bellatrix <noreply@exemple.fr>', user: '', pass: '', site: '', secure: false });
  assert.equal(await live.send('sophie@example.test', 'x', 'y'), false);
  assert.equal(f.got.conns, 0, 'a test address never opens a connection');
  f.server.close();
});

test('settings from the environment or the local file; the password is not part of what is logged', async () => {
  const file = path.join(os.tmpdir(), 'smtp-' + crypto.randomBytes(4).toString('hex') + '.json');
  fs.writeFileSync(file, JSON.stringify({ host: 'smtp-relay.brevo.com', port: 587, user: 'u', pass: 'secret-key', from: 'Bellatrix <noreply@exemple.fr>', site: 'https://famille.exemple.fr/' }));
  const c = mailConfig({}, file);
  assert.equal(c.host, 'smtp-relay.brevo.com'); assert.equal(c.port, 587); assert.equal(c.secure, false); assert.equal(c.site, 'https://famille.exemple.fr');
  assert.equal(mailConfig({ SMTP_HOST: 'h', SMTP_FROM: 'a@b.de', SMTP_PORT: '465' }, file).secure, true);
  fs.unlinkSync(file);
  const logs = [];
  const m = createMailer({ host: '127.0.0.1', port: 1, from: 'a@exemple.fr', user: 'u', pass: 'secret-key', site: '', secure: false }, (t) => logs.push(t));
  assert.equal(await m.send('sophie@exemple.fr', 'x', 'y'), false);
  assert.ok(logs.length && !logs.join(' ').includes('secret-key'));
});

test('the SMTP conversation: EHLO, AUTH PLAIN, MAIL, RCPT, DATA with a UTF-8 subject and body, QUIT', async () => {
  const f = await fakeSmtp();
  const cfg = { host: '127.0.0.1', port: f.port, from: 'Bellatrix <noreply@exemple.fr>', user: 'apikey', pass: 'pa55', secure: false, plainOk: true };
  const m = mailText('code', 'fr', { name: 'Sophie', code: '482913' });
  await smtpSend(cfg, { to: 'sophie@exemple.fr', subject: m.subject, text: m.text });
  for (let i = 0; i < 50 && !f.got.cmds.includes('QUIT'); i++) await new Promise((r) => setTimeout(r, 10));
  const cmds = f.got.cmds;
  assert.match(cmds[0], /^EHLO /);
  assert.equal(cmds[1], 'AUTH PLAIN ' + Buffer.from('\0apikey\0pa55').toString('base64'));
  assert.equal(cmds[2], 'MAIL FROM:<noreply@exemple.fr>');
  assert.equal(cmds[3], 'RCPT TO:<sophie@exemple.fr>');
  assert.equal(cmds[4], 'DATA');
  assert.equal(cmds[5], 'QUIT');
  const [head, body] = f.got.data.split('\r\n\r\n');
  assert.match(head, /^From: Bellatrix <noreply@exemple\.fr>/m);
  assert.match(head, /^To: <sophie@exemple\.fr>/m);
  assert.match(head, /^Subject: Votre code Bellatrix$/m);
  assert.match(head, /^Content-Type: text\/plain; charset=UTF-8/m);
  const text = Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8');
  assert.match(text, /482913/); assert.match(text, /Bonjour Sophie/); assert.match(text, /n’avez/);
  /* an accented subject is encoded */
  f.got.cmds.length = 0; f.got.data = '';
  await smtpSend(cfg, { to: 'sophie@exemple.fr', subject: 'Bestätigen Sie Ihre E-Mail-Adresse', text: 'x' });
  assert.match(f.got.data, /^Subject: =\?UTF-8\?B\?/m);
  f.server.close();
});

test('the password is never sent without TLS (unless the settings say it is a local test server)', async () => {
  const f = await fakeSmtp();
  await assert.rejects(smtpSend({ host: '127.0.0.1', port: f.port, from: 'a@exemple.fr', user: 'u', pass: 'p', secure: false }, { to: 'b@exemple.fr', subject: 's', text: 't' }), /no TLS/);
  assert.ok(!f.got.cmds.some((c) => /^AUTH/.test(c)));
  f.server.close();
});

test('the portal: a new account gets a confirmation code (and link), the sign-in code is e-mailed, the code confirms the address', async () => {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-mail-'));
  const sent = [];
  const mailer = { enabled: true, site: 'https://famille.exemple.fr', send(to, subject, text) { sent.push({ to, subject, text }); return Promise.resolve(true); } };
  const portal = createPortal({ dataDir: TMP, log: () => {}, rateLimit: false, mailer });
  const server = http.createServer((req, res) => portal.handle(req, res, new URL(req.url, 'http://localhost')));
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const BASE = 'http://127.0.0.1:' + server.address().port + '/portal/api/';
  const call = async (method, p, body, auth) => {
    const r = await fetch(BASE + p, { method, headers: Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: auth } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
    const t = r.headers.get('content-type') || '';
    return { status: r.status, data: t.includes('json') ? await r.json() : await r.text() };
  };
  const robot = 'mail_' + crypto.randomBytes(5).toString('hex'), key = crypto.randomBytes(32).toString('base64url'), R = 'Robot ' + robot + '.' + key;
  await call('POST', 'robot/hello', { robot, key });
  assert.equal((await call('POST', 'robot/resident', { code: 'P1', label: 'Marie', lang: 'fr' }, R)).status, 200);
  const ask = (email) => call('POST', 'family/request-access', { first: 'Sophie', last: 'Martin', relation: 'fille', phone: '0612345678', email, code: 'P1', resident: 'Marie', lang: 'fr', consent: true, password: 'Soleil2026' });
  const a = await ask('sophie@exemple.fr');
  assert.equal(a.status, 200);
  assert.equal(a.data.me.person.emailVerified, false); assert.equal(a.data.me.person.mailOn, true);
  assert.equal(sent.length, 1); assert.equal(sent[0].to, 'sophie@exemple.fr'); assert.equal(sent[0].subject, 'Confirmez votre adresse e-mail');
  const code = /code de confirmation : (\d{6})/.exec(sent[0].text)[1];
  assert.match(sent[0].text, /https:\/\/famille\.exemple\.fr\/portal\/api\/family\/email\/confirm\?t=/);
  const B = 'Bearer ' + a.data.token;
  assert.equal((await call('POST', 'family/email/verify', { code: code === '000000' ? '111111' : '000000' }, B)).data.error, 'bad-code');
  assert.equal((await call('POST', 'family/email/verify', { code }, B)).data.emailVerified, true);
  assert.equal((await call('GET', 'family/me', undefined, B)).data.person.emailVerified, true);
  /* the link works too (second account), once */
  await ask('paul@exemple.fr');
  const link = /(https:\S+)/.exec(sent[1].text)[1];
  const t = new URL(link).searchParams.get('t');
  const page = await call('GET', 'family/email/confirm?t=' + t);
  assert.equal(page.status, 200); assert.match(page.data, /Adresse e-mail confirmée/);
  assert.equal((await call('GET', 'family/email/confirm?t=' + t)).status, 410, 'a link works once');
  /* the sign-in code goes by e-mail */
  await call('POST', 'family/login/start', { email: 'sophie@exemple.fr' });
  const last = sent[sent.length - 1];
  assert.equal(last.subject, 'Votre code Bellatrix'); assert.match(last.text, /\d{6}/);
  /* no e-mail for an unknown address (same answer as before) */
  const n = sent.length;
  assert.equal((await call('POST', 'family/login/start', { email: 'nobody@exemple.fr' })).status, 200);
  assert.equal(sent.length, n);
  server.close(); fs.rmSync(TMP, { recursive: true, force: true });
});
