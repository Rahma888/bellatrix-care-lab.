/* Music for Guess the Song, Hello & Today, the calm music of Bellatrix Play and the group karaoke (Music.track).
   Every tune is a traditional or classical melody that is long out of copyright, played by a
   small synthesiser in the browser, so no audio files or licences are needed.
   Notes: name + octave, then ":" and the length in beats (default 1). "R" is a rest. */
var Music = (function () {
  'use strict';

  var SONGS = [
    { id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', cat: 'children', bpm: 100,
      notes: 'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2' },
    { id: 'mary', title: 'Mary Had a Little Lamb', cat: 'children', bpm: 112,
      notes: 'E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:3' },
    { id: 'row', title: 'Row, Row, Row Your Boat', cat: 'children', bpm: 96,
      notes: 'C4:1.5 C4:1.5 C4:1 D4:0.5 E4:1.5 E4:1 D4:0.5 E4:1 F4:0.5 G4:3 C5:0.5 C5:0.5 C5:0.5 G4:0.5 G4:0.5 G4:0.5 E4:0.5 E4:0.5 E4:0.5 C4:0.5 C4:0.5 C4:0.5 G4:1 F4:0.5 E4:1 D4:0.5 C4:3' },
    { id: 'frere', title: 'Frère Jacques', cat: 'children', bpm: 110,
      notes: 'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
    { id: 'london', title: 'London Bridge Is Falling Down', cat: 'children', bpm: 112,
      notes: 'G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4 E4 F4:2 E4 F4 G4:2 G4:1.5 A4:0.5 G4 F4 E4 F4 G4:2 D4:2 G4 E4 C4:2' },
    { id: 'macdonald', title: 'Old MacDonald Had a Farm', cat: 'children', bpm: 120,
      notes: 'G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3 D4 G4 G4 G4 D4 E4 E4 D4:2 B4 B4 A4 A4 G4:3' },
    { id: 'jingle', title: 'Jingle Bells', cat: 'children', bpm: 132,
      notes: 'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:0.5 E4:4 F4 F4 F4:1.5 F4:0.5 F4 E4 E4 E4:0.5 E4:0.5 E4 D4 D4 E4 D4:2 G4:2' },
    { id: 'ode', title: 'Ode to Joy (Beethoven)', cat: 'classical', bpm: 112,
      notes: 'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2' },
    { id: 'elise', title: 'Für Elise (Beethoven)', cat: 'classical', bpm: 200,
      notes: 'E5 D#5 E5 D#5 E5 B4 D5 C5 A4:3 C4 E4 A4 B4:3 E4 G#4 B4 C5:3 E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:3 C4 E4 A4 B4:3 E4 C5 B4 A4:4' },
    { id: 'nacht', title: 'Eine kleine Nachtmusik (Mozart)', cat: 'classical', bpm: 128,
      notes: 'G4 R:0.5 D4:0.5 G4 R:0.5 D4:0.5 G4:0.5 D4:0.5 G4:0.5 B4:0.5 D5:2 C5 R:0.5 A4:0.5 C5 R:0.5 A4:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:0.5 D4:2' }
,
    /* Only for birthdays in Hello & Today, never in the song quiz. "Good Morning to All" (1893), long out of copyright. */
    { id: 'birthday', title: 'Happy Birthday', cat: 'special', bpm: 100,
      notes: 'G4:0.75 G4:0.25 A4 G4 C5 B4:2 G4:0.75 G4:0.25 A4 G4 D5 C5:2 G4:0.75 G4:0.25 G5 E5 C5 B4 A4:2 F5:0.75 F5:0.25 E5 C5 D5 C5:2' }
  ];

  /* Moods (Bellatrix Play uses "calm" when there is no internet): which tunes, how fast and with which sound. */
  var MOODS = {
    calm: { songs: ['twinkle', 'mary', 'ode'], tempo: 0.72, wave: 'sine' },
    cheerful: { songs: ['macdonald', 'row', 'jingle'], tempo: 1.05, wave: 'triangle' },
    classical: { songs: ['ode', 'nacht', 'elise'], tempo: 0.95, wave: 'triangle' }
  };

  var OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  var ctx = null, master = null, voices = [], timers = [], playing = false, volume = 0.8, token = 0, audio = null;

  function parse(str) {
    return str.trim().split(/\s+/).map(function (t) {
      var p = t.split(':'), beats = p[1] ? parseFloat(p[1]) : 1;
      if (p[0] === 'R') return { f: 0, beats: beats };
      var m = /^([A-G]#?)(\d)$/.exec(p[0]);
      if (!m) throw new Error('Bad note "' + t + '"');
      var midi = 12 * (parseInt(m[2], 10) + 1) + OFFSET[m[1]];
      return { f: 440 * Math.pow(2, (midi - 69) / 12), beats: beats };
    });
  }
  function byId(id) { return SONGS.filter(function (s) { return s.id === id; })[0]; }

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      var soft = ctx.createBiquadFilter();
      soft.type = 'lowpass'; soft.frequency.value = 2600;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(soft); soft.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function tone(f, at, dur, wave, peak) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = wave; o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(peak * 0.55, at + Math.min(0.25, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + dur + 0.05);
    voices.push(o);
  }

  /* Plays one song. Half a second of silence first: robot speakers wake from standby slowly
     and would swallow the first note. Returns the length in seconds. */
  function play(song, opts) {
    opts = opts || {};
    stop();
    if (!ensure()) { if (opts.onEnd) setTimeout(opts.onEnd, 0); return 0; }
    var my = ++token;
    var notes = parse(song.notes), beat = 60 / (song.bpm * (opts.tempo || 1));
    var t = ctx.currentTime + 0.5, wave = opts.wave || 'triangle';
    notes.forEach(function (n) {
      var d = n.beats * beat;
      if (n.f) tone(n.f, t, Math.max(0.12, d - 0.03), wave, 0.32);
      t += d;
    });
    var total = t - ctx.currentTime;
    playing = true;
    timers.push(setTimeout(function () {
      if (my !== token) return;
      playing = false; voices = [];
      if (opts.onEnd) opts.onEnd();
    }, total * 1000 + 150));
    return total;
  }

  /* Several songs one after another, with a short pause between them. */
  function playList(songs, opts) {
    opts = opts || {};
    var i = 0, my;
    function next() {
      if (i >= songs.length) { if (opts.onEnd) opts.onEnd(); return; }
      var s = songs[i++];
      if (opts.onSong) opts.onSong(s, i - 1);
      play(s, { tempo: opts.tempo, wave: opts.wave, onEnd: function () {
        if (my !== token) return;
        timers.push(setTimeout(next, 900));
      } });
      my = token;
    }
    next();
  }

  /* One of the staff's own clips (see clips.js), cut to `seconds` with a one-second fade.
     Same half second of silence first as for the tunes. */
  function playClip(clip, opts) {
    opts = opts || {};
    stop();
    var my = ++token, a = new Audio(clip.url), limit = (opts.seconds || 15) * 1000;
    audio = a; a.preload = 'auto'; a.volume = volume;
    playing = true;
    function end(err) {
      if (my !== token) return;
      token++; timers.forEach(clearTimeout); timers = [];
      try { a.pause(); } catch (e) { /* already stopped */ }
      if (audio === a) audio = null;
      playing = false;
      if (err && opts.onError) opts.onError(err);
      if (opts.onEnd) opts.onEnd();
    }
    a.onended = function () { end(); };
    a.onerror = function () { end('the file could not be played'); };
    timers.push(setTimeout(function () {
      if (my !== token) return;
      var p = a.play();
      if (p && p.catch) p.catch(function (e) { end(e && e.message ? e.message : 'playback refused'); });
    }, 500));
    timers.push(setTimeout(function () {
      if (my !== token) return;
      var steps = 10, k = 0, from = a.volume;
      var fade = setInterval(function () {
        if (my !== token) { clearInterval(fade); return; }
        k++; a.volume = Math.max(0, from * (1 - k / steps));
        if (k >= steps) { clearInterval(fade); end(); }
      }, 100);
      timers.push(fade);
    }, 500 + limit));
    return limit / 1000;
  }

  /* A soft two-tone ring for the practice call. */
  function ring(times, onEnd) {
    stop();
    if (!ensure()) { if (onEnd) setTimeout(onEnd, 0); return; }
    var my = ++token, t = ctx.currentTime + 0.3, k;
    for (k = 0; k < times; k++) {
      tone(523.25, t, 0.35, 'sine', 0.25); tone(659.25, t + 0.4, 0.35, 'sine', 0.25);
      t += 1.6;
    }
    playing = true;
    timers.push(setTimeout(function () { if (my !== token) return; playing = false; if (onEnd) onEnd(); }, (t - ctx.currentTime) * 1000));
  }

  /* ---------- karaoke tracks (js/karaoke.js) ----------
     A whole arrangement as events in beats: { b, d, midi, v } with v = 'mel' (the tune, a guide for
     the group), 'bass' or 'chord'. A small look-ahead scheduler plays a quarter of a second ahead,
     so the track can pause, resume and change speed at any moment without bending the sound (it is
     synthesised, not stretched). pos() gives the position in beats for the lyrics.
     When the browser gives no sound (no WebAudio, or sound still blocked after a moment), the track
     runs on a silent clock instead and handle.audio() says false: the lyrics keep moving.
     opts: { bpm, tempo, beats (length), from (start beat), onEnd, onNoAudio }. Music.stop() ends it at once. */
  var VOICE = {
    mel: { wave: 'triangle', peak: 0.30, sustain: 0.62 },
    bass: { wave: 'triangle', peak: 0.26, sustain: 0.35 },
    chord: { wave: 'sine', peak: 0.07, sustain: 0.5 }
  };
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function note(e, at, dur) {
    var v = VOICE[e.v] || VOICE.mel, o = ctx.createOscillator(), g = ctx.createGain(), end = at + Math.max(0.08, dur);
    o.type = v.wave; o.frequency.value = hz(e.midi);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v.peak, at + 0.02);
    g.gain.exponentialRampToValueAtTime(v.peak * v.sustain, at + Math.min(0.2, (end - at) * 0.5));
    g.gain.setValueAtTime(v.peak * v.sustain, Math.max(at + 0.03, end - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(end + 0.02);
    o._end = end + 0.05;
    voices.push(o);
  }
  function hush() {
    if (!ctx || !master) return;
    var now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0, now);
    voices.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } });
    voices = [];
    master.gain.setValueAtTime(volume, now + 0.05);
  }
  function track(events, opts) {
    opts = opts || {};
    stop();
    var my = ++token, bpm = opts.bpm || 100, tempo = opts.tempo || 1, paused = false, ended = false, idx = 0;
    var total = opts.beats || events.reduce(function (m, e) { return Math.max(m, e.b + e.d); }, 0);
    var audioOk = ensure() && ctx.state === 'running', asked = !audioOk && !!ctx;
    function clock() { return audioOk ? ctx.currentTime : (window.performance ? performance.now() : Date.now()) / 1000; }
    var anchorB = Math.max(0, opts.from || 0), anchorT = clock() + 0.4;
    function beatAt(t) { return anchorB + (t - anchorT) * bpm * tempo / 60; }
    function timeAt(b) { return anchorT + (b - anchorB) * 60 / (bpm * tempo); }
    function seekIdx(b) { idx = 0; while (idx < events.length && events[idx].b < b - 1e-6) idx++; }
    seekIdx(anchorB);
    function pump() {
      if (my !== token || paused || ended) return;
      var now = clock(), horizon = now + 0.25;
      while (idx < events.length && timeAt(events[idx].b) < horizon) {
        var e = events[idx++];
        if (audioOk) note(e, Math.max(ctx.currentTime + 0.005, timeAt(e.b)), e.d * 60 / (bpm * tempo) - 0.02);
      }
      if (audioOk && voices.length > 64) voices = voices.filter(function (o) { return !(o._end < now); });
      if (beatAt(now) >= total) {
        ended = true; playing = false;
        timers.push(setTimeout(function () { if (my === token && opts.onEnd) opts.onEnd(); }, 300));
      }
    }
    /* Sound blocked until a gesture (a PC browser): ask once more, then go on silently. */
    if (asked) {
      try { ctx.resume(); } catch (e) { /* not allowed */ }
      timers.push(setTimeout(function () {
        if (my !== token || ended) return;
        if (ctx.state === 'running') { var b = paused ? anchorB : beatAt(clock()); audioOk = true; anchorB = b; anchorT = ctx.currentTime + 0.05; seekIdx(b); }
        else if (opts.onNoAudio) opts.onNoAudio();
      }, 450));
    } else if (!audioOk && opts.onNoAudio) timers.push(setTimeout(function () { if (my === token) opts.onNoAudio(); }, 0));
    timers.push(setInterval(pump, 40));
    playing = true;
    pump();
    var handle = {
      pos: function () { return paused || ended ? (ended ? total : anchorB) : beatAt(clock()); },
      beats: function () { return total; },
      audio: function () { return audioOk; },
      paused: function () { return paused; },
      ended: function () { return ended; },
      tempo: function () { return tempo; },
      live: function () { return my === token && !ended; },
      pause: function () {
        if (my !== token || paused || ended) return;
        anchorB = Math.max(0, beatAt(clock())); paused = true; playing = false;
        if (audioOk) hush();
      },
      resume: function () {
        if (my !== token || !paused || ended) return;
        paused = false; playing = true;
        if (audioOk && ctx.state !== 'running') try { ctx.resume(); } catch (e) { /* not allowed */ }
        anchorT = clock() + 0.15; seekIdx(anchorB);
        pump();
      },
      setTempo: function (t) {
        if (my !== token) return tempo;
        t = Math.max(0.5, Math.min(1.5, t));
        if (!paused && !ended) { anchorB = beatAt(clock()); anchorT = clock(); }
        tempo = t;
        return tempo;
      },
      stop: function () { if (my === token) stop(); }
    };
    return handle;
  }

  /* Silence at once: the gain is cut before the oscillators are stopped. */
  function stop() {
    token++;
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); }); timers = [];
    if (audio) { try { audio.pause(); } catch (e) { /* already stopped */ } audio = null; }
    if (ctx && master) {
      var now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(0, now);
      voices.forEach(function (o) { try { o.stop(); } catch (e) { /* already stopped */ } });
      master.gain.setValueAtTime(volume, now + 0.05);
    }
    voices = [];
    var was = playing;
    playing = false;
    return was;
  }

  function setVolume(v) {
    volume = Math.max(0.05, Math.min(1, v));
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    if (audio) audio.volume = volume;
    return volume;
  }

  return {
    SONGS: SONGS, MOODS: MOODS, byId: byId, parse: parse,
    play: play, playList: playList, playClip: playClip, ring: ring, stop: stop, setVolume: setVolume, track: track,
    getVolume: function () { return volume; },
    /* For the automated checks: is anything still sounding or scheduled? */
    _debug: function () { return { voices: voices.length, playing: playing, state: ctx ? ctx.state : 'none', gain: master ? master.gain.value : null }; },
    isPlaying: function () { return playing; },
    unlock: ensure
  };
})();
