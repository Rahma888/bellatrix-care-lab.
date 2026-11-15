// The call relay (labland/call-relay.mjs): the 1:1 call as before, and the group call of 1.16
// (the resident + up to 3 relatives, one call, peers join and leave). Run: node tests/call-relay.test.mjs
// Silent: no network, no media; the relay is driven directly with a temporary invite file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRelay } from '../labland/call-relay.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bellatrix-call-'));
const relay = createRelay({ dataFile: path.join(TMP, 'call-data.json'), log: () => {}, waitMs: 60, ringMs: 400, ice: { iceServers: [] } });
test.after(() => { relay.stop(); fs.rmSync(TMP, { recursive: true, force: true }); });

const ROBOT = 'robot_test_0001', OTHER_ROBOT = 'robot_test_0002';
const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n';
async function api(method, p, body) {
  const url = new URL('http://localhost/call/api/' + p);
  const res = { once() {} };
  return relay.handle({ method, headers: {} }, url, body || {}, res);
}
const ok = async (method, p, body) => { const [code, out] = await api(method, p, body); assert.equal(code, 200, p + ' ' + JSON.stringify(out)); return out; };
async function setRobot(residents) {
  const r = {};
  for (const k of Object.keys(residents)) r[k] = { acceptNow: residents[k], next: '' };
  await ok('POST', 'robot/state', { robot: ROBOT, state: 'idle', residents: r });
}
async function invite(resident, contactId, label) { return (await ok('POST', 'invite', { robot: ROBOT, resident, contactId, label: label || 'Maman', lang: 'fr' })).token; }
async function events(c, since, peer) { return (await ok('GET', 'call/' + c + '/wait?since=' + (since || 0) + (peer ? '&peer=' + peer : ''))).events; }
async function robotEvents(since) { return (await ok('GET', 'robot/wait?robot=' + ROBOT + '&since=' + (since || 0))).events; }

test('1:1 call keeps working as before (no peer id needed by the old pages)', async () => {
  await setRobot({ P1: true });
  const t = await invite('P1', 'c1');
  assert.equal((await ok('GET', 'status?t=' + t)).state, 'available');
  const r = await ok('POST', 'call', { t, sdp: SDP });
  assert.equal(r.state, 'ringing'); assert.ok(r.call);
  const ev = (await robotEvents(0)).filter((e) => e.type === 'call' && e.call === r.call);
  assert.equal(ev.length, 1); assert.equal(ev[0].sdp, SDP);
  // the robot answers; the family (polling without a peer id, like the old page) gets the answer
  await ok('POST', 'call/' + r.call, { type: 'answer', robot: ROBOT, sdp: SDP + 'a' });
  assert.ok((await events(r.call, 0)).some((e) => e.type === 'answer' && e.sdp === SDP + 'a'));
  assert.equal((await ok('GET', 'status?t=' + t)).state, 'live');           // the same resident could join
  // a call of ANOTHER resident of this robot is busy
  const t2 = await invite('P2', 'c9'); await setRobot({ P1: true, P2: true });
  assert.equal((await ok('GET', 'status?t=' + t2)).state, 'busy');
  // hang up by the (only) family, old style: token only
  const h = await ok('POST', 'call/' + r.call, { type: 'hangup', t });
  assert.equal(h.state, 'ended');
  assert.ok((await robotEvents(0)).some((e) => e.type === 'hangup' && e.call === r.call && e.by === 'family'));
  assert.equal((await ok('GET', 'status?t=' + t)).state, 'available');
});

test('1:1 rules: not-now, offline, revoked, wrong token, decline, missed', async () => {
  await setRobot({ P1: false });
  const t = await invite('P1', 'c1');
  assert.equal((await ok('GET', 'status?t=' + t)).state, 'notnow');
  assert.equal((await ok('POST', 'call', { t, sdp: SDP })).state, 'notnow');
  await setRobot({ P1: true });
  assert.equal((await api('POST', 'call', { t: 'x'.repeat(22), sdp: SDP }))[0], 404);
  assert.equal((await api('POST', 'call', { t, sdp: '' }))[0], 400);
  const r = await ok('POST', 'call', { t, sdp: SDP });
  assert.equal((await api('POST', 'call/' + r.call, { type: 'decline', t }))[0], 403);           // only the robot declines
  await ok('POST', 'call/' + r.call, { type: 'decline', robot: ROBOT });
  assert.ok((await events(r.call, 0)).some((e) => e.type === 'decline'));
  const r2 = await ok('POST', 'call', { t, sdp: SDP });
  await new Promise((s) => setTimeout(s, 520));                                                    // ringMs 400
  assert.ok((await events(r2.call, 0)).some((e) => e.type === 'missed'));
  await ok('POST', 'revoke', { robot: ROBOT, token: t });
  assert.equal((await api('GET', 'status?t=' + t))[0], 410);
  assert.equal((await api('POST', 'call', { t, sdp: SDP }))[0], 410);
});

test('group call: 3 relatives join one call, one leaves, it goes on; the 4th relative is refused', async () => {
  await setRobot({ P1: true });
  const tA = await invite('P1', 'c1', 'Maman'), tB = await invite('P1', 'c2', 'Maman'), tD = await invite('P1', 'c4', 'Maman');
  // A calls and rings; B cannot join a call that still rings
  const a = await ok('POST', 'call', { t: tA, sdp: SDP + 'A' });
  assert.ok(a.peer);
  assert.equal((await ok('GET', 'status?t=' + tB)).state, 'ringing');
  assert.equal((await ok('POST', 'call', { t: tB, sdp: SDP })).state, 'ringing');
  await ok('POST', 'call/' + a.call, { type: 'answer', robot: ROBOT, sdp: SDP + 'ans' });
  // B (another link of the same resident) and C (the SAME link as A) join the live call
  assert.equal((await ok('GET', 'status?t=' + tB)).state, 'live');
  const b = await ok('POST', 'call', { t: tB, sdp: SDP + 'B' });
  assert.equal(b.call, a.call); assert.equal(b.joined, true); assert.deepEqual(b.peers, [a.peer]);
  const c = await ok('POST', 'call', { t: tA, sdp: SDP + 'C' });
  assert.equal(c.joined, true); assert.deepEqual(c.peers, [a.peer, b.peer]);
  assert.notEqual(c.peer, a.peer);
  // the 4th relative is refused ("Appel complet"), status says so too
  assert.equal((await ok('GET', 'status?t=' + tD)).state, 'full');
  assert.equal((await ok('POST', 'call', { t: tD, sdp: SDP })).state, 'full');
  // the robot hears the two joiners with their offers
  const rj = (await robotEvents(0)).filter((e) => e.type === 'peer-join' && e.call === a.call);
  assert.deepEqual(rj.map((e) => e.peer), [b.peer, c.peer]);
  assert.equal(rj[0].sdp, SDP + 'B'); assert.equal(rj[0].contactId, 'c2');
  // only the robot answers a peer; the answer reaches that peer only
  assert.equal((await api('POST', 'call/' + a.call, { type: 'peer-answer', t: tB, peer: b.peer, sdp: SDP }))[0], 403);
  await ok('POST', 'call/' + a.call, { type: 'peer-answer', robot: ROBOT, peer: b.peer, sdp: SDP + 'ansB' });
  assert.ok((await events(a.call, 0, b.peer)).some((e) => e.type === 'answer' && e.sdp === SDP + 'ansB'));
  assert.ok(!(await events(a.call, 0, c.peer)).some((e) => e.sdp === SDP + 'ansB'));
  assert.ok(!(await events(a.call, 0, a.peer)).some((e) => e.sdp === SDP + 'ansB'));
  // relative to relative: C offers to A; only A receives it; others cannot forge it
  await ok('POST', 'call/' + a.call + '/signal', { t: tA, peer: c.peer, to: a.peer, kind: 'offer', sdp: SDP + 'CtoA' });
  assert.ok((await events(a.call, 0, a.peer)).some((e) => e.type === 'signal' && e.from === c.peer && e.sdp === SDP + 'CtoA'));
  assert.ok(!(await events(a.call, 0, b.peer)).some((e) => e.type === 'signal'));
  assert.equal((await api('POST', 'call/' + a.call + '/signal', { t: tB, peer: c.peer, to: a.peer, kind: 'offer', sdp: SDP }))[0], 403);   // wrong token for that peer
  assert.equal((await api('POST', 'call/' + a.call + '/signal', { t: 'z'.repeat(22), peer: 'nobody', to: a.peer, kind: 'offer', sdp: SDP }))[0], 403);
  assert.equal((await api('POST', 'call/' + a.call + '/signal', { t: tA, peer: c.peer, to: c.peer, kind: 'offer', sdp: SDP }))[0], 404);   // not to oneself
  assert.equal((await api('POST', 'call/' + a.call + '/signal', { t: tA, peer: c.peer, to: a.peer, kind: 'nope', sdp: SDP }))[0], 400);
  assert.equal((await api('GET', 'call/' + a.call + '/wait?since=0&peer=bogus'))[0], 404);
  // B leaves: the call goes on for A and C, the robot is told which peer left
  const mark = (await ok('GET', 'robot/wait?robot=' + ROBOT + '&since=0')).last;
  assert.equal((await api('POST', 'call/' + a.call, { type: 'hangup', t: 'q'.repeat(22), peer: b.peer }))[0], 403);
  assert.equal((await api('POST', 'call/' + a.call, { type: 'hangup', t: tA, peer: b.peer }))[0], 403);      // another relative's peer id with my token
  const h = await ok('POST', 'call/' + a.call, { type: 'hangup', t: tB, peer: b.peer });
  assert.equal(h.state, 'live');
  assert.ok((await robotEvents(mark)).some((e) => e.type === 'peer-leave' && e.peer === b.peer));
  assert.ok((await events(a.call, 0, a.peer)).some((e) => e.type === 'peer-left' && e.peer === b.peer));
  assert.ok(!(await events(a.call, 0, b.peer)).some((e) => e.type === 'peer-left' && e.peer === b.peer));   // not echoed to the one who left
  assert.ok(!(await robotEvents(mark)).some((e) => e.type === 'hangup'));
  // a place is free again: D joins now
  assert.equal((await ok('GET', 'status?t=' + tD)).state, 'live');
  const d = await ok('POST', 'call', { t: tD, sdp: SDP + 'D' });
  assert.equal(d.joined, true); assert.deepEqual(d.peers, [a.peer, c.peer]);
  assert.equal(d.since > 0, true);
  // the robot refuses a joiner: that peer is told, the others see it leave
  await ok('POST', 'call/' + a.call, { type: 'peer-reject', robot: ROBOT, peer: d.peer });
  assert.ok((await events(a.call, 0, d.peer)).some((e) => e.type === 'decline'));
  // the first relative leaves: still C there
  assert.equal((await ok('POST', 'call/' + a.call, { type: 'hangup', t: tA, peer: a.peer })).state, 'live');
  // hang-up without a peer id and the shared token A: leaves the (still joined) peer C that uses it
  const last = await ok('POST', 'call/' + a.call, { type: 'hangup', t: tA });
  assert.equal(last.state, 'ended');                                           // nobody left: the call ends
  assert.ok((await robotEvents(0)).some((e) => e.type === 'hangup' && e.call === a.call && e.by === 'family'));
  assert.equal((await ok('GET', 'status?t=' + tA)).state, 'available');
});

test('group call: the robot hanging up ends it for everybody; a stale peer cannot join later', async () => {
  await setRobot({ P1: true });
  const t1 = await invite('P1', 'c1'), t2 = await invite('P1', 'c2');
  const a = await ok('POST', 'call', { t: t1, sdp: SDP });
  await ok('POST', 'call/' + a.call, { type: 'answer', robot: ROBOT, sdp: SDP });
  const b = await ok('POST', 'call', { t: t2, sdp: SDP });
  assert.equal((await ok('POST', 'call/' + a.call, { type: 'hangup', robot: ROBOT })).state, 'ended');
  for (const p of [a.peer, b.peer]) assert.ok((await events(a.call, 0, p)).some((e) => e.type === 'hangup' && e.by === 'robot'));
  assert.equal((await api('POST', 'call/' + a.call + '/signal', { t: t1, peer: a.peer, to: b.peer, kind: 'offer', sdp: SDP }))[0], 409);
  // a robot can not hang up another robot's call
  assert.equal((await api('POST', 'call/' + a.call, { type: 'hangup', robot: OTHER_ROBOT }))[0], 403);
  // a revoked link cannot join a running call
  const c = await ok('POST', 'call', { t: t1, sdp: SDP }); await ok('POST', 'call/' + c.call, { type: 'answer', robot: ROBOT, sdp: SDP });
  await ok('POST', 'revoke', { robot: ROBOT, token: t2 });
  assert.equal((await api('POST', 'call', { t: t2, sdp: SDP }))[0], 410);
  await ok('POST', 'call/' + c.call, { type: 'hangup', robot: ROBOT });
});

test('a call the care team started: more relatives join with the same join link, up to the limit', async () => {
  await setRobot({ P1: true });
  const o = await ok('POST', 'outgoing', { robot: ROBOT, resident: 'P1', contactId: 'c1', label: 'Maman', lang: 'fr' });
  const j1 = await ok('POST', 'join', { j: o.token, sdp: SDP });
  assert.ok(j1.peer);
  assert.equal((await ok('POST', 'join', { j: o.token, sdp: SDP })).state, 'ringing');   // not yet answered
  await ok('POST', 'call/' + j1.call, { type: 'answer', robot: ROBOT, sdp: SDP });
  assert.equal((await ok('GET', 'status?j=' + o.token)).state, 'live');
  const j2 = await ok('POST', 'join', { j: o.token, sdp: SDP }), j3 = await ok('POST', 'join', { j: o.token, sdp: SDP });
  assert.equal(j2.joined && j3.joined, true);
  assert.equal((await ok('POST', 'join', { j: o.token, sdp: SDP })).state, 'full');
  assert.equal((await ok('GET', 'status?j=' + o.token)).state, 'full');
  await ok('POST', 'call/' + j1.call, { type: 'hangup', robot: ROBOT });
  assert.equal((await api('GET', 'status?j=' + o.token))[0], 410);                         // used once
});
