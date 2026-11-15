// Bellatrix Atelier, the optional AI generator. Mounted by store-server.mjs under /atelier/api/.
// Plain Node (no packages): one HTTPS call to the Claude API with fetch.
//
//   GET  /atelier/api/status                      -> { ai: true | false }
//   POST /atelier/api/generate {prompt, lang, type?} -> { ai: false }                 no key on this server
//                                                    { ai: true, spec }               a game, checked
//                                                    { ai: true, error: '…' }         nothing usable came back
//
// The AI is OFF by default: it answers only when the environment variable ANTHROPIC_API_KEY is set on
// the server (never in the code, a page or the repository). Without it the Atelier page silently uses
// its own offline generator (js/atelier-bank.js), which is free.
// What the model returns is DATA: a JSON game spec, checked by the very same strict validator the
// tablet uses (js/atelier-engine.js). Anything else is refused. No generated code is ever run.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-haiku-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const LANG_NAME = { en: 'English', fr: 'French', de: 'German' };

/* The validator of the tablet, loaded from the browser file (one single definition of a valid game). */
function loadEngine() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(HERE, '..', 'js', 'atelier-engine.js'), 'utf8') + '\n;this.AtelierEngine = AtelierEngine;', ctx, { filename: 'atelier-engine.js' });
  return ctx.AtelierEngine;
}
const Engine = loadEngine();

const SYSTEM = [
  'You write small games for elderly residents of a care home. A carer gives a short request; you answer with ONE JSON object and nothing else (no prose, no code fence).',
  'The game is played on a big screen with a few large buttons, read from two metres: keep every text short, concrete, friendly and easy. Familiar everyday topics, no trick questions, nothing sad or frightening, facts must be correct.',
  'Write every text of the game in the requested language only.',
  'Choose the type the carer asks for; if none is named, choose the one that fits best. The allowed shapes (no other fields):',
  '{"type":"quiz","lang":L,"title":T,"items":[{"q":"question (max 110 characters)","a":"right answer (max 44)","wrong":["1 to 3 wrong answers (max 44 each)"]}]}  5 to 8 items',
  '{"type":"sort","lang":L,"title":T,"cats":["category A","category B"],"items":[{"t":"word (max 36)","c":0}]}  8 to 12 items, c is 0 or 1 (index of the category), at least 3 per category',
  '{"type":"pairs","lang":L,"title":T,"items":[{"a":"word (max 22)","b":"its partner (max 22), or leave b out for two identical cards"}]}  4 items',
  '{"type":"saying","lang":L,"title":T,"items":[{"start":"beginning of a well-known saying or sentence (max 90)","end":"its last word or words (max 36)","wrong":["2 wrong endings (max 36)"]}]}  5 to 8 items',
  '{"type":"odd","lang":L,"title":T,"items":[{"set":["three words that belong together (max 28 each)"],"odd":"the one that does not belong (max 28)","why":"short reason (max 90)"}]}  4 to 6 items',
  '{"type":"order","lang":L,"title":T,"items":[{"q":"what to put in order (max 90)","steps":["3 to 5 steps in the RIGHT order (max 40 each)"]}]}  2 to 4 items',
  'L is "en", "fr" or "de". T is a short title (max 40 characters). Inside one item no two answers may be the same.'
].join('\n');

function clean(v, max) { return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''; }
function firstJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
}

export function createAtelier(opts = {}) {
  const getKey = opts.key !== undefined ? () => opts.key : () => process.env.ANTHROPIC_API_KEY || '';
  const doFetch = opts.fetch || globalThis.fetch;
  const now = opts.now || (() => Date.now());
  const PER_HOUR = opts.perHour || 40;      // the key costs money: a ceiling for the whole server
  const TIMEOUT = opts.timeoutMs || 40000;
  let hits = [];

  async function generate(body) {
    const key = getKey();
    if (!key) return [200, { ai: false }];
    const prompt = clean(body && body.prompt, 200), lang = body && body.lang;
    const type = body && Engine.TYPES.indexOf(body.type) >= 0 ? body.type : '';
    if (!prompt || !LANG_NAME[lang]) return [400, { ai: true, error: 'bad-request' }];
    const t = now();
    hits = hits.filter((h) => t - h < 3600 * 1000);
    if (hits.length >= PER_HOUR) return [429, { ai: true, error: 'too-many' }];
    hits.push(t);
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
    let msg;
    try {
      const res = await doFetch(API, {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: MODEL, max_tokens: 8000, output_config: { effort: 'low' }, system: SYSTEM,
          messages: [{ role: 'user', content: 'Language: ' + LANG_NAME[lang] + ' ("' + lang + '")\n' + (type ? 'Type: ' + type + '\n' : '') + 'The carer\'s request: ' + JSON.stringify(prompt) }]
        })
      });
      if (!res.ok) return [200, { ai: true, error: 'api-' + res.status }];
      msg = await res.json();
    } catch (e) {
      return [200, { ai: true, error: 'unreachable' }];
    } finally { clearTimeout(timer); }
    /* A refusal or a cut-off answer is no game. */
    if (!msg || msg.stop_reason !== 'end_turn' || !Array.isArray(msg.content)) return [200, { ai: true, error: 'no-answer' }];
    const text = msg.content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
    const raw = firstJson(text);
    const v = raw ? Engine.validate(raw) : { ok: false };
    if (!v.ok || v.spec.lang !== lang || v.spec.id !== undefined) return [200, { ai: true, error: 'not-a-game' }];
    v.spec.source = 'ai';
    v.spec.prompt = prompt;
    const again = Engine.validate(v.spec);
    return again.ok ? [200, { ai: true, spec: again.spec }] : [200, { ai: true, error: 'not-a-game' }];
  }

  /* [status, json] for one request; null when the path is not ours. */
  async function api(req, url, body) {
    const p = url.pathname;
    if (p === '/atelier/api/status' && req.method === 'GET') return [200, { ai: !!getKey() }];
    if (p === '/atelier/api/generate' && req.method === 'POST') return generate(body);
    return [404, { error: 'not found' }];
  }
  return { api, generate };
}

export const atelierApi = createAtelier().api;
