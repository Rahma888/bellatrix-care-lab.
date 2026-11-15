// Bellatrix Play - re-check the YouTube catalogue (js/play-catalog.js).
// Usage (from the project folder):  node labland/play-check.mjs  [--delay 400]
// Plain Node 18+ (built-in fetch), no packages. Nothing is downloaded: it only asks
// YouTube's oEmbed endpoint whether each video is still public and embeddable.
//   200 = OK (public + embeddable)   401 = embedding disabled   404 = removed / private
// Exit code 0 = all OK, 1 = at least one video needs replacing, 2 = catalogue could not be read.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'js', 'play-catalog.js');
const di = process.argv.indexOf('--delay');
const delay = di > 0 ? Math.max(0, +process.argv[di + 1] || 0) : 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let catalog;
try {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8') + '\n;this.PLAY_CATALOG = PLAY_CATALOG;', sandbox, { filename: file, timeout: 2000 });
  catalog = sandbox.PLAY_CATALOG;
  if (!catalog || !Array.isArray(catalog.items)) throw new Error('PLAY_CATALOG.items is missing');
} catch (e) {
  console.error('Cannot read ' + file + ': ' + e.message);
  process.exit(2);
}

async function check(id) {
  const url = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const j = r.status === 200 ? await r.json() : null;
      return { status: r.status, author: j && j.author_name, title: j && j.title };
    } catch (e) {
      if (attempt >= 2) return { status: 'ERR', error: e.message };
      await sleep(2000);
    }
  }
}

const items = catalog.items;
console.log('Bellatrix Play check: ' + items.length + ' videos (catalogue checked ' + (catalog.checked || '?') + ')\n');

// Field sanity (no network): duplicate ids, unknown genre, kind or lang.
const GENRES = ['chanson', 'schlager', 'volksmusik', 'pop', 'rock', 'jazz', 'swing', 'classical', 'waltz', 'nature',
  'rap', 'electro', 'rnb', 'latin', 'reggae', 'disco', 'film', 'kids', 'country'];
const KINDS = ['song', 'music', 'video'];
const LANGS = ['fr', 'de', 'en', 'es', 'it', ''];
const seenIds = new Set();
let fieldIssues = 0;
for (const it of items) {
  if (seenIds.has(it.id)) { fieldIssues++; console.log('  duplicate id: ' + it.id + '  ' + it.title); }
  seenIds.add(it.id);
  if (!GENRES.includes(it.genre)) { fieldIssues++; console.log('  unknown genre "' + it.genre + '": ' + it.id + '  ' + it.title); }
  if (!KINDS.includes(it.kind)) { fieldIssues++; console.log('  unknown kind "' + it.kind + '": ' + it.id + '  ' + it.title); }
  if (!LANGS.includes(it.lang)) { fieldIssues++; console.log('  unknown lang "' + it.lang + '": ' + it.id + '  ' + it.title); }
}
if (fieldIssues) console.log('');
const bad = [], netErr = [], renamed = [];
for (let i = 0; i < items.length; i++) {
  const it = items[i];
  const res = await check(it.id);
  if (res.status === 200) {
    process.stdout.write('.');
    if (it.channel && res.author && res.author !== it.channel) renamed.push({ it, res });
  } else if (res.status === 'ERR') {
    process.stdout.write('?');
    netErr.push({ it, res });
  } else {
    process.stdout.write('x');
    bad.push({ it, res });
  }
  if ((i + 1) % 50 === 0) process.stdout.write('\n');
  if (i < items.length - 1) await sleep(delay);
}
process.stdout.write('\n\n');

const why = s => s === 401 ? 'embedding disabled' : s === 404 ? 'removed or private' : s === 403 ? 'forbidden' : 'HTTP ' + s;
if (bad.length) {
  console.log('NO LONGER EMBEDDABLE (' + bad.length + ') - replace these in js/play-catalog.js:');
  for (const { it, res } of bad) console.log('  ' + it.id + '  ' + why(res.status).padEnd(19) + '  ' + (it.artist ? it.artist + ' - ' : '') + it.title);
  console.log('');
}
if (netErr.length) {
  console.log('NOT CHECKED (network error, run again) (' + netErr.length + '):');
  for (const { it, res } of netErr) console.log('  ' + it.id + '  ' + res.error + '  ' + it.title);
  console.log('');
}
if (renamed.length) {
  console.log('Still embeddable, but the channel name changed (check it is still the official upload):');
  for (const { it, res } of renamed) console.log('  ' + it.id + '  "' + it.channel + '" -> "' + res.author + '"  ' + it.title);
  console.log('');
}
const ok = items.length - bad.length - netErr.length;
console.log(ok + '/' + items.length + ' OK' + (bad.length ? ', ' + bad.length + ' to replace' : '') + (netErr.length ? ', ' + netErr.length + ' not checked' : '') + '.');
console.log('Note: oEmbed cannot see country blocks; a video can be embeddable and still blocked in one country.');
process.exit(bad.length ? 1 : 0);
