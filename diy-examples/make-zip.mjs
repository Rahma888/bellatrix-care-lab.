// Builds diy-examples/memory.zip from the folder diy-examples/memory/ (one top folder "memory/", like
// "Send to > Compressed folder" on Windows). Plain Node, no packages. Run after changing the game:
//   node diy-examples/make-zip.mjs            (or: node diy-examples/make-zip.mjs <folder> <out.zip>)
// The archive is the same byte for byte for the same files (fixed dates, sorted names).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(process.argv[2] || path.join(HERE, 'memory'));
const OUT = path.resolve(process.argv[3] || path.join(HERE, path.basename(SRC) + '.zip'));
const TOP = path.basename(SRC) + '/';

const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
/* 15 Nov 2026, 12:00, in the MS-DOS format of zip files */
const DOS_TIME = (12 << 11), DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 15;

function list(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const r = rel + e.name;
    if (e.isDirectory()) out.push(...list(path.join(dir, e.name), r + '/'));
    else if (e.isFile()) out.push(r);
  }
  return out;
}

export function makeZip(src = SRC, top = TOP) {
  const names = list(src).sort();
  const locals = [], centrals = [];
  let off = 0;
  for (const rel of names) {
    const data = fs.readFileSync(path.join(src, ...rel.split('/')));
    const packed = zlib.deflateRawSync(data, { level: 9 });
    const method = packed.length < data.length ? 8 : 0, body = method === 8 ? packed : data;
    const name = Buffer.from(top + rel, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10); lh.writeUInt16LE(DOS_DATE, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(0x0314, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12); ch.writeUInt16LE(DOS_DATE, 14); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body); centrals.push(ch, name);
    off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return { zip: Buffer.concat([...locals, cd, end]), names: names.map((n) => top + n) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { zip, names } = makeZip();
  fs.writeFileSync(OUT, zip);
  console.log(OUT + ': ' + names.length + ' files, ' + Math.round(zip.length / 1024) + ' KB');
}
