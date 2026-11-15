// LabLand store tool: makes LabLand's signing key, then packs and signs the games for the Bellatrix Library.
//   node labland/store-tool.mjs keys    once: the private key (labland/keys, never on a robot) and the
//                                       public key the app checks with (js/store-key.js)
//   node labland/store-tool.mjs build   packs labland/packs/* and signs them and the catalog (labland/store)
//
// A pack is { manifest: <JSON text>, code: <JavaScript>, signature } where the signature is ECDSA P-256 /
// SHA-256 (IEEE P1363, as WebCrypto expects) over  manifest + "\n" + code. The catalog is { catalog: <JSON
// text>, signature } signed the same way, and so is every licence the store server hands out.
// Plain Node (no packages).
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.dirname(HERE);
const KEY_FILE = path.join(HERE, 'keys', 'labland-private.pem');
const PUBLIC_JS = path.join(APP, 'js', 'store-key.js');
const PACKS = path.join(HERE, 'packs');
const STORE = path.join(HERE, 'store');

export function sha256(text) { return createHash('sha256').update(text, 'utf8').digest('hex'); }

export function hasKey() { return fs.existsSync(KEY_FILE); }

export function loadKey() { return createPrivateKey(fs.readFileSync(KEY_FILE, 'utf8')); }

export function signText(text, key) {
  return sign('sha256', Buffer.from(text, 'utf8'), { key: key || loadKey(), dsaEncoding: 'ieee-p1363' }).toString('base64');
}

export function verifyText(text, signature, key) {
  try {
    return verify('sha256', Buffer.from(text, 'utf8'), { key: createPublicKey(key || loadKey()), dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64'));
  } catch (e) {
    return false;
  }
}

export function makeKeys() {
  if (hasKey()) { console.log('LabLand key already there: ' + KEY_FILE); return false; }
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const jwk = publicKey.export({ format: 'jwk' });
  fs.writeFileSync(PUBLIC_JS,
    '/* LabLand\'s public key: the app accepts a game pack, the catalog or a licence only when LabLand\n' +
    '   signed it with the matching private key (kept by LabLand, never on a robot). Made by\n' +
    '   "node labland/store-tool.mjs keys". */\n' +
    'var BELLATRIX_STORE_KEY = ' + JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y }) + ';\n');
  console.log('Made LabLand\'s key: ' + KEY_FILE + ' (private) and ' + PUBLIC_JS + ' (public, in the app)');
  return true;
}

function buildPack(dir, key) {
  const def = JSON.parse(fs.readFileSync(path.join(dir, 'pack.json'), 'utf8'));
  const code = def.files.map((f) => '/* ---- ' + def.id + '/' + f + ' ---- */\n' + fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')).join('\n;\n');
  const manifest = {
    format: 'bellatrix-pack/1', id: def.id, version: def.version, minApp: def.minApp, games: def.games, files: def.files,
    sha256: sha256(code), built: new Date().toISOString(), publisher: 'LabLand'
  };
  const manifestText = JSON.stringify(manifest);
  const pkg = { manifest: manifestText, code, signature: signText(manifestText + '\n' + code, key) };
  const file = 'packages/' + def.id + '-' + def.version + '.json';
  const text = JSON.stringify(pkg);
  fs.mkdirSync(path.join(STORE, 'packages'), { recursive: true });
  fs.writeFileSync(path.join(STORE, file), text);
  return { id: def.id, file, version: def.version, bytes: Buffer.byteLength(text), sha256: manifest.sha256, games: def.games };
}

export function build() {
  makeKeys();
  const key = loadKey();
  const built = {};
  for (const name of fs.readdirSync(PACKS)) {
    const dir = path.join(PACKS, name);
    if (fs.existsSync(path.join(dir, 'pack.json'))) {
      const info = buildPack(dir, key);
      built[info.id] = info;
      console.log('Signed pack ' + info.id + ' ' + info.version + ' (' + Math.round(info.bytes / 1024) + ' KB)');
    }
  }
  const src = JSON.parse(fs.readFileSync(path.join(HERE, 'catalog-src.json'), 'utf8'));
  for (const p of src.packs) {
    if (p.download) {
      if (!built[p.id]) throw new Error('No pack source for ' + p.id);
      p.package = { file: built[p.id].file, version: built[p.id].version, bytes: built[p.id].bytes, sha256: built[p.id].sha256 };
    }
  }
  const catalog = Object.assign({ format: 'bellatrix-catalog/1', published: new Date().toISOString() }, src);
  const catalogText = JSON.stringify(catalog);
  fs.writeFileSync(path.join(STORE, 'catalog.json'), JSON.stringify({ catalog: catalogText, signature: signText(catalogText, key) }));
  console.log('Signed the catalog: ' + catalog.packs.length + ' packs');
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2] || 'build';
  if (cmd === 'keys') makeKeys();
  else if (cmd === 'build') build();
  else { console.log('Use: node labland/store-tool.mjs keys | build'); process.exit(1); }
}
