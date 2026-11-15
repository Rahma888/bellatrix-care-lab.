/* Music recommendation settings, versioned (briefing b1, block C, C9).
   Every number here is a starting value to adjust by trying, not a truth. Each playlist records
   `version` and `hash()` of the settings it was made with (and a copy of them), so the same data
   and the same settings give the same playlist again.
   Change a value: also raise `version` (and write why in RECO-EVALUATION.md). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecoConfig = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var C = {
    version: '1.1.0',
    date: '2026-11-10',

    /* C3: weight of each listening signal. */
    signals: {
      like: 3,          /* "J'aime" (heart) or added to a list */
      replay: 2,        /* chosen again on purpose */
      complete: 1,      /* listened to the end */
      partial: 0.5,     /* more than partialAbove of the song, then "next" */
      skipEarly: -1,    /* "next" before earlyBelow of the song */
      stop: -2          /* explicit "not this song": also left out of the next playlist */
    },
    partialAbove: 0.5,
    earlyBelow: 0.2,
    /* Who acted: a carer who skips a song to manage a group does not express the resident's taste.
       0 = ignored for the individual profile. */
    sourceWeight: { resident: 1, staff: 0 },
    /* Listening in a group session says less about one person than listening alone. */
    contextWeight: { solo: 1, group: 0.5 },

    /* C2: weight of each feature group in the song vector (language and style count more than the
       artist). Only fields the catalogue really has: no tempo, mood or duration is invented. */
    features: { decade: 1.0, language: 1.3, style: 1.3, ambiance: 0.5, content: 0.5, kind: 0.4, artist: 0.7 },
    /* Soft decade: a song counts for neighbouring decades too (1970 is close to 1960 and 1980). */
    decadeBlurYears: 15,

    /* C2: recency, exponential decay. */
    halfLifeDays: 21,
    /* C5.1: how far back the profile looks. */
    profileWindowDays: { next: 84, week: 28, month: 84 },

    /* C4: score(c) = a*sim(current or profile, c) + b*affinity(profile, c) + g*co(c, current)
       + d*novelty(c) - penalties(c). co-listening is outside the MVP: g = 0, interface only. */
    score: { a: 0.6, b: 0.3, g: 0, d: 0.1 },
    penalties: { sameArtistAsCurrent: 0.05, disliked: 0.5 },
    mmrLambda: 0.75,
    nextMax: 3,
    /* Exclusion windows for songs played very recently. */
    recentHours: { next: 6, playlist: 48 },

    /* C5.4: dosage close / neighbour / discovery. */
    mix: { close: 0.6, neighbour: 0.3, discovery: 0.1 },
    minDiscovery: 0.1,
    /* 1.1.0, "why only old songs?": recommendations, the non-personalised list, DJ Bellatrix and the
       AI playlists without an era mix the eras: at least recentShare of songs from recentFrom on
       (when the catalogue has them), at most maxDecadeShare from any one decade. The popularity
       stand-in is ranked within each decade, so it no longer favours old songs. */
    balance: { recentFrom: 2000, recentShare: 0.3, maxDecadeShare: 0.5 },
    /* Similarity bands (cosine to the profile) for the three parts, widened step by step when the
       catalogue runs out after exclusions (C6). */
    bands: { closeMin: 0.7, neighbourMin: 0.5, discoveryMin: 0.25, discoveryMax: 0.5, widenStep: 0.1 },
    candidatesTop: 100,

    /* C5.6: length. The catalogue has no durations: about 3.5 minutes per song is assumed. */
    playlistLength: { min: 15, max: 25, targetMinutes: 60, assumedSongMinutes: 3.5 },
    /* C6: at most this share of songs shared with the previous playlist of the same kind. */
    overlapMax: 0.5,
    /* C5.5: the order: gentle opening, livelier middle, calm end. Liveliness comes only from the
       catalogue's tags (calm, dance) and style. */
    flow: { openingShare: 0.2, endingShare: 0.2 },
    /* Never the same artist twice in a row (always), and at most this many songs per artist. */
    maxPerArtist: 3,

    /* C5 cold start and C6 "little data": below minEvents signals the profile leans on the
       starting profile chosen by staff and the general popularity, and says "profile in progress". */
    coldStart: { minEvents: 8, minSongs: 3, maxSongs: 5, initialWeight: 4, popularityWeight: 0.15 },
    /* C6: a resident who rejects almost everything: smaller discovery share, information for staff. */
    rejection: { minPlays: 8, share: 0.6 },

    /* C5: no cron on the robot; the job runs when Care Team opens or the app starts, once the time
       below has passed (weekday 1 = Monday). The cron strings document the same rule. */
    schedule: { weekly: { weekday: 1, hour: 6, cron: '0 6 * * 1' }, monthly: { day: 1, hour: 6, cron: '0 6 1 * *' } },

    /* C7: listening data kept 90 days, then deleted. */
    retentionDays: 90,
    maxEventsPerResident: 4000,
    /* The access log (who opened or changed a resident's music data) is kept longer. */
    accessLogDays: 365,

    /* Several profiles per resident ("calm / evening", "lively / morning"): data model only, after the MVP. */
    multiProfile: false
  };

  /* A short stable fingerprint of the settings (FNV-1a over the sorted JSON). */
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]') return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().filter(function (k) { return typeof v[k] !== 'function'; }).map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function hash(cfg) {
    var s = stable(cfg || C), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul ? Math.imul(h, 0x01000193) >>> 0 : (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  /* A plain copy (for a playlist record, or for a test that changes one value). */
  function copy(cfg) { return JSON.parse(JSON.stringify(cfg || C)); }

  Object.defineProperty(C, 'hash', { value: function (cfg) { return hash(cfg || C); }, enumerable: false });
  Object.defineProperty(C, 'copy', { value: function (cfg) { return copy(cfg || C); }, enumerable: false });
  return C;
}));
