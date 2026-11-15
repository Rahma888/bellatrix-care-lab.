# Plan B1 · Block A: free group karaoke (agent K, 9 Nov 2026)

## Choice of audio: option 1, generated accompaniment
Each song is stored as notes: the public-domain melody, one note group per syllable, plus chord names.
The tablet plays it with WebAudio (`js/music.js`): guide melody, bass and soft chords. There are no
audio files, no recordings and no network. Lyrics sync comes from the same notes, so it is exact by
construction: per line, and per word (the syllables of a word are its notes).

## Files (only mine, see coordination.md)
| File | Role |
|---|---|
| `data/karaoke-licences.json` | Versioned licence register: one row per song, plus the `removed` list with the reason for each. |
| `js/karaoke-songs.js` | `KaraokeSongs`: song data (notes, syllables, chords), an embedded copy of the register, and pure functions (parse, timeline, word timing, accompaniment, "complete register" filter). No DOM, so it also loads in Node. |
| `js/karaoke.js` | `Lab.define({ key: 'karaoke', zone: 'COMMUNITY_CIRCLE' })`: screens, controls, A8 edge cases, hygiene flag, demo contract. It also mounts the Care Team section (playlists and exclusions, A6) on staff.html. |
| `js/music.js` | New `Music.track(events, opts)`: a look-ahead scheduler with pause, resume, tempo, `pos()` in beats and the volume cap. Existing calls are unchanged. |
| `js/i18n-karaoke.js` | FR and DE texts (English is the key), for both the patient side and the Care Team side. |
| `css/karaoke.css` | Huge lyrics, staff control bar, portrait first, plus `.land`. |
| `tests/karaoke.test.mjs` | `node tests/karaoke.test.mjs`: sync logic, the register filter, data consistency. `--sync` rewrites the embedded register from the JSON file. |

## Data model (adapted from A7)
- Song: `{ id, lang, cat: popular|christmas|children, title, bpm, meter, pickup, lines: [{ s, n, c, ch }] }`
  - `s`: the text, with `/` between syllables (`lu/ne`).
  - `n`: one token per syllable, where `+` joins the notes of a melisma, `C4:2` means 2 beats, and `R` is a rest.
  - `c`: chords with their beats (`C:2 G7:2`); per line, the chord beats equal the note beats.
  - `ch`: chorus line.
- `KaraokeSongs.lyrics(song)` gives the A7 shape: `[{ startMs, endMs, text, isChorus, words: [{ startMs, endMs, text }] }]` at the nominal tempo. The player works in beats, so slower and faster never break the sync.
- Register row: title, language, category, textAuthor and textAuthorDeathYear, composer and composerDeathYear (a year, or `"anonymous"` together with a first-publication year), textSource, audioSource `"generated"`, audioLicence, verifiedOn, verifiedBy.
  - A song appears only if its row is complete and every year is at least 70 years ago (life + 70, or publication + 70 for anonymous works).
- Care Team store, `localStorage['bellatrix-karaoke-v1']`: `{ v: 1, playlists: [{ id, name, language, songIds[], createdBy, createdAt }], exclusions: [{ scope: group|resident, id, songIds[] }] }`.

## Screens (A5)
1. **Choice.** A language filter (FR / DE / EN / all) and at most 3 big type cards (popular, Christmas, nursery rhymes). Prepared playlists sit under one button.
2. **Song.** 3 titles per screen, then "More choices".
3. **Lyrics.**
   - The current line is huge and lit, word by word; the previous and next lines are dimmer, with a smooth scroll and no cut words.
   - A staff bar is always visible: Pause/Resume, Volume − / +, Slower / Faster, Next song, Stop, "Chorus only", and "Another one!".
4. **End.** "Thank you all, that was a lovely moment." Then "Another one!" or Finish.
   - No score, no ranking, no jingle.

## Contracts
- `Lab.start('karaoke', { direct: true, data: { song, demo: true } })` goes straight to the song. The record is marked as a preview, so nothing is saved.
- At the end of a real group session (not a preview or demo, at least one song started), the app sets `localStorage['bellatrix-hygiene-due'] = { kind: 'karaoke', at }`.
  - It does this through a one-shot wrapper around `Lab.onSessionEnd`, so it works whichever way the session ends.

## Steps
1. Plan, format, 2 example songs, validator.
2. Research and song data per language (3 parallel forks), each with sources; doubtful songs go to `removed`.
3. `Music.track` and the sync loop.
4. Screens, controls, edge cases (missing audio, offline, long lines, language change, Stop, volume cap).
5. Care Team section (playlists, exclusions).
6. Node tests, then headless Chrome (offline: requests blocked) with screenshots at 1080×1920 and 1920×1080.

## Questions noted (not invented)
- In `js/staff.js`, `CATS` and `DESC` have no entry for `karaoke`, so the tile falls under "Other". The fix is a one-line hook in T's file.
- Which group sits in a session? The session's patient code is used as the group id, plus an optional "residents present" field.

## Status (9 Nov, 17:35)
- Done: 24 songs (8 FR, 7 DE, 9 EN) with a complete register row; 9 titles in `removed`, each with its reason.
  - Screens A5, Music.track, A8 edge cases, hygiene flag, demo contract, Care Team section (playlists and songs to avoid).
- Tests:
  - `node tests/karaoke.test.mjs`: 37/37.
  - Headless Chrome: 44/44, including a fully offline run with every URL blocked. Script: scratchpad `karaoke/test-karaoke.js`; screenshots `karaoke/k-*.png`.
- Not tested on the robot (no adb, by rule). Chords are our own simple harmonisations; a musician should listen once on the robot.
