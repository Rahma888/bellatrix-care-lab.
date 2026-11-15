# Plan, block C: music recommendation engine (agent R, 9 Nov 2026)

Spec: b1.pdf, block C (C1 to C12). Everything runs on the robot, in the browser, with no outside service.

## Files (only mine)
| File | What |
|---|---|
| `js/reco-config.js` | `RecoConfig`, versioned (`version` + `hash`): signal and feature weights, half-life 21 days, mix 60/30/10, length 15–25 or about 60 min, schedule (Monday 06:00, 1st of the month 06:00), retention 90 days, recent-play windows, `g = 0`. |
| `js/reco.js` | UMD (browser `window.Reco`, node `require`). Pure functions: song features and sparse vectors, metadata gaps, ListenEvent signal weight, profile with recency decay, cold start, next-song score + MMR (max 3, with reasons), playlist generation (candidates, dosage, flow, artist and language rules, overlap cap, widening), phrase parser for "Playlist IA". Plus `Reco.Store`: localStorage layer (consent, events, cold start, exclusions, playlists, logs, retention, schedule), testable in node with a fake storage. |
| `js/reco-staff.js` | Care Team tab "Music" mounted from my own JS: consent, starting profile, playlists (view, add, remove, reorder, approve, feedback), exclusions, deletion, access log. |
| `js/play.js`, `css/play.css`, `js/i18n-play.js` | Play emits ListenEvents, "Next song" cards, DJ / Playlist IA / radio on reco.js, approved weekly and monthly playlists on Home, non-personalised mode without consent. |
| `tests/reco.test.mjs` | C10 tests + `--eval` prints the evaluation of the synthetic residents. |
| `RECO-EVALUATION.md` | Evaluation on 8 synthetic residents, metadata gaps, configuration. |

## Data model (localStorage, same origin for Play and Care Team)
- `bellatrix-reco-consent` `{code: {on, by: resident|representative, at, staff}}`
- `bellatrix-reco-events` `{code: [ListenEvent]}`, ListenEvent `{id, residentId, songId, timestamp, context:{mode: solo|group, zone}, source: resident|staff, playedRatio, event: complete|replay|like|skip|stop}`
- `bellatrix-reco-cold` `{code: {songs:[id], decade, lang, by, at}}`
- `bellatrix-reco-excluded` `{code: {songId: {at, by}}}`
- `bellatrix-reco-playlists` `[Playlist]`, Playlist `{id, residentId, period: week|month, periodKey, items:[{songId, position, reason, bucket}], status: draft|approved|active|archived, generatedAt, configVersion, configHash, seed, approvedBy, approvedAt, log:[{at, action, by}], feedback}`
- `bellatrix-reco-access` access log (staff views and changes), `bellatrix-reco-meta` (last runs).

## Decisions
- Compute on the device (C9): the robot has no backend for Care Team data; Care Team and Play share the storage.
- No cron: `Reco.Store.runDue()` runs when Care Team opens and when the app starts; it generates the playlists of a new week (from Monday 06:00) or month (from the 1st, 06:00) for each resident with consent, as DRAFT.
- Only `approved` and `active` playlists reach Play. Playing it marks it `active`. A new period archives the drafts that were never approved; the last approved playlist stays on Play until a newer one is approved.
- Staff actions on the patient screen ("Calm music now", "Staff is tapping") are logged with `source: staff`, weight 0 for the profile (configurable).
- No popularity data in the catalogue: the popularity prior is a proxy from the catalogue itself (tag `youth`, number of songs of the artist), documented as a gap.
- "Liveliness" for the flow comes only from the existing tags (`calm`, `dance`) and the style; no tempo is invented.
- Without consent: nothing is collected, no profile, no playlist; Play shows the catalogue without listening-based personalisation.

## Steps
1. reco-config.js + reco.js (engine), 2. node tests + evaluation, 3. Play wiring, 4. Care Team tab, 5. headless Chrome check and screenshots, 6. report.

## Questions (noted, not blocking)
- Where should the approval identity come from? No staff login exists: the Music tab asks for the staff member's initials (no prompt) and logs them with every change.
- Offline: the approved playlist is stored on the robot, but the YouTube playback itself needs internet (Play's existing calm-music fallback stays).
- Should the life story (year of birth, favourite music, entered by staff) still shape Play without the music consent? I keep it, since staff enter it on purpose.

## Status (end of the night)
Done: all steps. See RECO-EVALUATION.md and the final report.
