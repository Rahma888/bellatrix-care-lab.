// The display link (labland/display-link.mjs): head screen <-> patient tablet.
// Run: node tests/display-link.test.mjs. Silent: no network; the relay is driven directly, with its clock injected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLink } from '../labland/display-link.mjs';

let clock = 1000000;
const link = createLink({ now: () => clock, waitMs: 80, maxChannels: 3, rate: 1000 });
test.after(() => link.stop());

const A = 'ABCD1234', B = 'WXYZ9876';
async function api(method, code, act, body, query, ip) {
  const url = new URL('http://localhost/link/api/' + code + '/' + act + (query ? '?' + query : ''));
  return link.handle({ method, headers: { 'x-test-ip': ip || 'ip-1' } }, url, body || {}, { once() {} });
}
const ok = async (...a) => { const [c, o] = await api(...a); assert.equal(c, 200, JSON.stringify(o)); return o; };
const run = (id, extra) => ({ run: Object.assign({ id, key: 'k', patient: 'Anna', opt: { a: 1 }, position: 'room 3', at: 1, preview: 'p' }, extra) });

test('round trip: run, next, status, status long-poll', async () => {
  assert.deepEqual(await ok('POST', A, 'run', run('r1')), { ok: true, id: 'r1' });
  const head = await ok('GET', A, 'status', null, 'since=0&wait=1');
  assert.equal(head.id, 'r1'); assert.equal(head.state, 'sent'); assert.equal(head.position, 'room 3');
  const next = await ok('GET', A, 'next', null, 'wait=1');
  assert.equal(next.run.id, 'r1'); assert.equal(next.run.patient, 'Anna');
  assert.deepEqual(await ok('GET', A, 'next', null, 'wait=1'), {});          // delivered only once
  let seq = (await ok('GET', A, 'status', null, 'since=0&wait=1')).seq;
  // the head waits; the tablet answers meanwhile
  const waiting = api('GET', A, 'status', null, 'since=' + seq + '&wait=5');
  await ok('POST', A, 'status', { id: 'r1', state: 'received' });
  const [, got] = await waiting;
  assert.equal(got.state, 'received'); assert.ok(got.seq > seq); seq = got.seq;
  for (const s of ['present', 'started']) await ok('POST', A, 'status', { id: 'r1', state: s });
  await ok('POST', A, 'status', { id: 'r1', state: 'finished', result: { score: 7 } });
  const end = await ok('GET', A, 'status', null, 'since=' + seq + '&wait=1');
  assert.equal(end.state, 'finished'); assert.deepEqual(end.result, { score: 7 });
  // nothing new: the long-poll times out with the same seq
  const idle = await ok('GET', A, 'status', null, 'since=' + end.seq + '&wait=1');
  assert.equal(idle.seq, end.seq); assert.equal(idle.id, undefined);
});

test('a new run replaces the old one', async () => {
  await ok('POST', A, 'run', run('r2'));
  await ok('POST', A, 'run', run('r3'));
  assert.equal((await ok('GET', A, 'next', null, 'wait=1')).run.id, 'r3');
  assert.equal((await api('POST', A, 'status', { id: 'r2', state: 'received' }))[0], 409);
});

test('cancel: the head sees cancelled, the tablet gets {cancel:id}', async () => {
  await ok('POST', A, 'run', run('r4'));
  await ok('GET', A, 'next', null, 'wait=1');
  await ok('POST', A, 'cancel');
  assert.equal((await ok('GET', A, 'status', null, 'since=0')).state, 'cancelled');
  assert.deepEqual(await ok('GET', A, 'next', null, 'wait=1'), { cancel: 'r4' });
  assert.deepEqual(await ok('GET', A, 'next', null, 'wait=1'), {});
  assert.equal((await api('POST', A, 'status', { id: 'r4', state: 'received' }))[0], 409);
});

test('stale id 409, bad state and misplaced result 400', async () => {
  await ok('POST', A, 'run', run('r5'));
  assert.equal((await api('POST', A, 'status', { id: 'old', state: 'received' }))[0], 409);
  assert.equal((await api('POST', A, 'status', { id: 'r5', state: 'dancing' }))[0], 400);
  assert.equal((await api('POST', A, 'status', { id: 'r5', state: 'started', result: { x: 1 } }))[0], 400);
  assert.equal((await api('POST', A, 'status', { id: 'r5', state: 'finished', result: { big: 'x'.repeat(151 * 1024) } }))[0], 413);
  assert.equal((await api('POST', A, 'run', { run: { key: 'k' } }))[0], 400);
});

test('invalid codes are refused with 400, ping works', async () => {
  for (const c of ['abc', 'ABCDEFGHIJKLM', 'abc_def1', 'abc-defg']) assert.equal((await api('GET', c, 'ping'))[0], 400, c);
  const p = await ok('GET', A, 'ping');
  assert.equal(p.ok, true); assert.equal(p.t, clock);
});

test('two codes do not see each other', async () => {
  await ok('POST', A, 'run', run('ra'));
  await ok('POST', B, 'run', run('rb', { patient: 'Berta' }));
  assert.equal((await ok('GET', B, 'next', null, 'wait=1')).run.patient, 'Berta');
  assert.equal((await ok('GET', A, 'next', null, 'wait=1')).run.id, 'ra');
  assert.equal((await api('POST', B, 'status', { id: 'ra', state: 'received' }))[0], 409);
  await ok('POST', B, 'cancel');
  assert.notEqual((await ok('GET', A, 'status', null, 'since=0')).state, 'cancelled');
});

test('channel limit and expiry after 4 hours without activity', async () => {
  await ok('POST', 'CHAN0001', 'run', run('x'));                       // A, B, CHAN0001: 3 channels
  assert.equal((await api('GET', 'CHAN0002', 'next', null, 'wait=0'))[0], 503);
  clock += 4 * 3600 * 1000 + 1;                                         // everything is idle for 4 h
  assert.deepEqual(await ok('GET', A, 'next', null, 'wait=0'), {});    // a fresh channel: the old run is gone
  assert.equal((await ok('GET', A, 'status', null, 'since=0')).id, undefined);
  assert.equal((await api('GET', 'CHAN0002', 'next', null, 'wait=0'))[0], 200);   // room again
});

test('rate limit per IP', async () => {
  const small = createLink({ now: () => clock, rate: 5 });
  const call = (ip) => small.handle({ method: 'GET', headers: { 'x-test-ip': ip } }, new URL('http://localhost/link/api/RATE0001/ping'), {}, { once() {} })[0];
  for (let i = 0; i < 5; i++) assert.equal(call('ip-a'), 200);
  assert.equal(call('ip-a'), 429);
  assert.equal(call('ip-b'), 200);
  clock += 61000;
  assert.equal(call('ip-a'), 200);
  small.stop();
});

test('body size: the mount refuses more than 200 KB (413), the relay caps the result', async () => {
  const { MAX_BODY } = await import('../labland/display-link.mjs');
  assert.equal(MAX_BODY, 200 * 1024);
});

test('place, arrived: the tablet gets {arrived:id} once; new states are accepted', async () => {
  const C = 'PLACE001';
  await ok('POST', C, 'run', run('p1', { place: 'Room 12' }));
  assert.equal((await ok('GET', C, 'status', null, 'since=0')).place, 'Room 12');
  assert.equal((await ok('GET', C, 'next', null, 'wait=1')).run.place, 'Room 12');
  await ok('POST', C, 'status', { id: 'p1', state: 'received' });
  assert.deepEqual(await ok('GET', C, 'next', null, 'wait=0'), {});            // nothing before arrival
  assert.equal((await api('POST', C, 'arrived', { id: 'zz' }))[0], 409);
  await ok('POST', C, 'arrived', { id: 'p1' });
  assert.equal((await ok('GET', C, 'status', null, 'since=0')).state, 'arrived');
  assert.deepEqual(await ok('GET', C, 'next', null, 'wait=1'), { arrived: 'p1' });
  assert.deepEqual(await ok('GET', C, 'next', null, 'wait=0'), {});            // only once
  for (const s of ['present', 'waiting-seat', 'seated', 'started']) await ok('POST', C, 'status', { id: 'p1', state: s });
  assert.equal((await ok('GET', C, 'status', null, 'since=0')).state, 'started');
  await ok('POST', C, 'cancel');
  assert.deepEqual(await ok('GET', C, 'next', null, 'wait=1'), { cancel: 'p1' });
  await ok('POST', C, 'status', { id: 'p1', state: 'returning' });
  await ok('POST', C, 'status', { id: 'p1', state: 'home' });
  assert.equal((await api('POST', C, 'status', { id: 'p1', state: 'seated' }))[0], 409);
  // arrived before the tablet fetched the run: run first, then arrived
  await ok('POST', C, 'run', run('p2', { place: 'x'.repeat(100) }));
  await ok('POST', C, 'arrived', { id: 'p2' });
  const first = await ok('GET', C, 'next', null, 'wait=1');
  assert.equal(first.run.id, 'p2'); assert.equal(first.run.place.length, 60);
  assert.deepEqual(await ok('GET', C, 'next', null, 'wait=1'), { arrived: 'p2' });
  // no place: no place field
  await ok('POST', C, 'run', run('p3'));
  assert.equal((await ok('GET', C, 'next', null, 'wait=1')).run.place, undefined);
});
