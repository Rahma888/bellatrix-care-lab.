# Music recommendation engine: evaluation on synthetic residents (b1, block C)

9 November 2026, agent R. Engine `js/reco.js`, settings `js/reco-config.js` version **1.0.0** (fingerprint `06181489`), then **1.1.0** (fingerprint `11321488`, 10 November, section 0).
Everything below is computed on this PC with the real Play catalogue (574 items) and **synthetic** listening histories only. No real resident data was used.

Run it again:

```
node tests/reco.test.mjs           # the C10 tests, the era balance and the 1,000-song check (20 tests)
node tests/reco.test.mjs --eval    # this evaluation, with every playlist song by song
```

## 0. Settings 1.1.0 (10 November): every era, not only old songs

After the robot test ("why only old songs?"):

- **Popularity stand-in ranked within each decade.** It was the `youth` tag plus the artist's number of songs, so old songs always won. Each decade now has its own well-known songs: the average is 0.50 in every decade from the 1950s to the 2020s. Children's songs count less.
- **Era balance (`balance` in the settings)** for "Vos recommandations", the non-personalised list, DJ Bellatrix's new songs and Playlist IA when the phrase names no era, no artist and no "souvenirs":
  - at least 30 % of songs from 2000 on, when the catalogue has them;
  - at most 50 % from any one decade;
  - the recent songs are spread through the list, and the best match stays first.
- **Weekly and monthly playlists are unchanged on purpose.** They follow what the resident listens to; discovery stays at 10 % or more.

| List (real catalogue) | Before (1.0.0): songs from 2000 on | After (1.1.0) |
|---|---|---|
| Non-personalised list, French resident (8 songs) | 0 / 8 (1938–1979) | 3 / 8 (1938, 1977, 2009, 1960, 2013, 1975, 2010, 1960) |
| Non-personalised list, German resident | 0 / 8 | 3 / 8 |
| Non-personalised list, English resident | 0 / 8 | 3 / 8 |
| R1 (1960s chanson only) "Vos recommandations" | mostly 1950s–1970s | 3 / 8 recent French songs; the best match (1960s) stays first |
| Playlist IA "Musique calme pour se reposer" (20) | 0 / 20 | 6 / 20 |
| Playlist IA "Chansons joyeuses des années 60" | 1960s | still 1960s (the era asked for is kept) |
| DJ Bellatrix without a profile (8) | 0 / 8 | 4 / 8 |

**Play's Home (`js/play.js`):**
- "Hits du moment" (2015 and later), "Années 2000" and "Années 2010" sit right under the hero for everyone.
- "Écouter maintenant" (For you) mixes eras: about 40 % from 2000 on, 30 % 1975–1999 and 30 % older.
- The songs of their youth come first only when the Life story has a year of birth or favourite music. Then "Votre jeunesse" follows the three rows, and For you keeps about 30 % recent songs.

**About 1,000 songs:** the node test adds synthetic songs from 2000–2025 to the real catalogue, up to 1,000 items. On this PC: preparing the songs 7 ms, next song 1.7 ms, recommendations 11 ms, weekly playlist 17 ms, AI playlist 77 ms. All the C10 rules still hold. Play also keeps its Home lists in memory until something changes (a heart, a play, an event, Premium), so a tap does not recompute them.

## 1. The settings (documented, versioned)

| Setting | Value | Briefing |
|---|---|---|
| Signal weights | like / added +3, voluntary replay +2, listened to the end +1, more than 50 % then "next" +0.5, "next" before 20 % −1, "Not this song" −2 and left out of the next playlist | C3 |
| Who acted | resident ×1, staff ×0 (a carer's skip or "Calm music now" never shapes the individual profile) | C3 |
| Context | solo ×1, group (zone COMMUNITY_CIRCLE) ×0.5 | C3 |
| Feature weights | decade 1.0 (soft: a song also counts for the neighbouring decades, 15-year blur), language 1.3, style 1.3, calm/dance tags 0.5, nature/animals/concert 0.5, kind 0.4, artist 0.7 | C2 |
| Recency | exponential decay, half-life **21 days**; profile window 28 days (week), 84 days (month, next song) | C2, C5.1 |
| Next-song score | 0.6 × similarity to the current song + 0.3 × affinity to the profile + **g = 0** × co-listening (interface only) + 0.1 × never heard − penalties (same artist 0.05, closeness to disliked songs 0.5); MMR λ 0.75; at most 3 proposals, three different artists | C4 |
| Recent plays left out | 6 h for the next song, 48 h for playlists | C4, C5.2 |
| Mix | 60 % close / 30 % neighbours / 10 % discovery, discovery never below 10 % | C5.4, C6 |
| Similarity bands | close ≥ 0.7 (or already liked), neighbour ≥ 0.5 and never heard, discovery 0.25–0.5 and never heard; widened by 0.1 steps when songs run out | C5, C6 |
| Length | 15 to 25 songs, about 60 min: 17 songs (the catalogue has no durations: 3.5 min assumed) | C5.6 |
| Flow | gentle opening, livelier middle, calm end; never the same artist twice in a row; at most 3 songs per artist; languages alternate when the profile is multilingual | C5.5 |
| Overlap with the previous playlist | at most 50 % | C6 |
| Cold start | below 8 signals the starting profile (3–5 songs or era + language, chosen by staff) weighs more, then less as listening comes in; general popularity added; "profile in progress" | C5, C6 |
| Resident who rejects almost everything | ≥ 8 plays and ≥ 60 % early skips or stops: discovery at its minimum, half the neighbours, information for staff | C6 |
| Schedule | weekly Monday 06:00 (`0 6 * * 1`), monthly on the 1st 06:00 (`0 6 1 * *`); the robot has no cron, so the job runs when the Care Team page opens or the app starts, once that time has passed | C5 |
| Retention | listening data 90 days; archived playlists 90 days; access log 365 days | C7 |

Each playlist stores `configVersion`, `configHash` and a full copy of the settings it was made with.

## 2. The synthetic residents

Six weeks of listening, about four sessions a week, 6 to 10 songs a session (deterministic generator in `tests/reco.test.mjs`). 75 % of the songs come from the resident's taste: mostly listened to the end, a heart now and then, a few replays. The other 25 %: mostly early skips, some ends, a few "Not this song". About 5 % carer actions in a group session (source `staff`), which must not count.

| Id | Resident | Taste used to make the history |
|---|---|---|
| R1 | Chanson française années 60 | French chanson 1955–1972 |
| R2 | Schlager allemand années 70 | Schlager 1965–1984 |
| R3 | Pop anglophone années 80 | English pop, rock, disco 1978–1991 |
| R4 | Multilingue éclectique | French, German and English chanson, schlager, pop, swing, jazz 1950–1985 |
| R5 | Classique et valses | classical, waltzes, instrumental music |
| R6 | Refuse presque tout (C6) | country before 1990, but 70 % of the songs come from elsewhere and are mostly skipped or stopped |
| R7 | New, 3 starting songs | no history; staff chose La vie en rose (Piaf), La mer (Trenet), Les feuilles mortes (Montand) |
| R8 | New, era + language | no history; staff chose the 1950s and German |

## 3. Results (weekly playlist, Monday 9 November 2026)

| Resident | Signals | Songs | Close | Neighbour | Discovery | Fits the known taste | Not heard before | Distinct artists | Duplicates | Same artist in a row | Multilingual | Flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 Chanson française années 60 | 176 | 17 | 59 % | 29 % | 12 % | 82 % | 41 % | 13 | 0 | 0 | no | – |
| R2 Schlager allemand années 70 | 120 | 17 | 59 % | 29 % | 12 % | 76 % | 41 % | 11 | 0 | 0 | no | – |
| R3 Pop anglophone années 80 | 160 | 17 | 59 % | 29 % | 12 % | 76 % | 41 % | 15 | 0 | 0 | no | – |
| R4 Multilingue éclectique | 166 | 17 | 59 % | 29 % | 12 % | 94 % | 41 % | 15 | 0 | 0 | yes, 1 same-language neighbours | – |
| R5 Classique et valses | 164 | 17 | 59 % | 29 % | 12 % | 65 % | 41 % | 13 | 0 | 0 | no | widened |
| R6 Refuse presque tout (C6) | 100 | 17 | 71 % | 18 % | 12 % | 6 % | 35 % | 16 | 0 | 0 | yes, 4 same-language neighbours | rejects-much, widened |
| R7 New, 3 starting songs | 0 | 17 | 59 % | 29 % | 12 % | – | 100 % | 10 | 0 | 0 | no | profile-building |
| R8 New, 1950s + German | 0 | 17 | 59 % | 29 % | 12 % | – | 100 % | 12 | 0 | 0 | no | profile-building, widened |

How to read it: "Close / Neighbour / Discovery" are the shares of the three parts (17 songs: 10 / 5 / 2; with 20 songs it would be exactly 12 / 6 / 2). "Fits the known taste" is the share of songs inside the taste used to make the history (a check, never shown to staff as a score). "Not heard before" is the share of songs the resident had never heard in the window.

What it shows:
- **R1 to R3**: coherent playlists of the expected style, era and language (R1: 15 of 17 French chanson; R2: 15 of 17 schlager), with a few neighbours of the same years never heard, and two small discoveries a little further (R1: GIMS and Céline Dion, in French; R2: Culcha Candela and Rio Reiser, in German; R3: Bing Crosby and a children's song, in English). The discovery part is the weakest: "further but same language" sometimes lands on a children's song or rap. Worth a look with real use; a minimum similarity on the style could be added.
- **R4 multilingual**: French and English alternate (only 1 pair of neighbours in the same language), German appears as a discovery.
- **R5**: the catalogue has only 26 instrumental pieces and 9 waltzes; the engine widened the similarity and filled the neighbours with old swing (Sinatra, Dean Martin). It says so ("widened"). More classical music in the catalogue would help.
- **R6**: flagged "rejects-much" (information for the team, not an alert); the playlist stays on songs the resident did finish (71 % close), discovery at its 10 % minimum.
- **R7, R8**: no error without history; the starting choice leads (R7: 15 of 17 French chanson of the 1940s and 50s; R8: 15 of 17 German, mostly 1950s), "profile in progress" is shown to staff.
- Everywhere: no duplicate, never the same artist twice in a row, at most 3 songs per artist, discovery ≥ 10 %.

The full song lists with the reason of each song are printed by `--eval`. Example, R1, positions 1 to 4:

```
 1. [neighbour] Gilbert Bécaud – Et maintenant (1961) · Not heard yet, close to the usual music (1960s · French · French chanson)
 2. [close] Édith Piaf – Mon Dieu (1960) · Already liked or listened to the end (same artist: Édith Piaf · 1960s · French · French chanson)
 3. [discovery] GIMS – Est-ce que tu m'aimes ? (2015) · A small discovery, a little further away (French)
 4. [close] Édith Piaf – Les amants d'un jour (1956) · Already liked or listened to the end (...)
```

## 4. Automatic tests (C10), all green

`node tests/reco.test.mjs`: 16 tests, 16 pass.

| C10 item | Test |
|---|---|
| Similarity | every 1960s French chanson is closer to every other one than to any 2010s rap; the soft decade puts 1975 nearer 1965 than 1995 |
| Profile → style, with 30 % / 10 % | R1 gives ≥ 60 % chanson and ≥ 80 % French, counts equal to the configured dosage; another dosage (40/30/30) changes the counts; discovery ≥ 10 % for all 8 residents |
| Exclusions | songs excluded by staff, refused (Play's "never again") and stopped since the last playlist never appear, in weekly, monthly and next-song lists; with almost the whole catalogue excluded the list is still not empty ("widened") |
| Recency | a 1-day-old play weighs more than a 40-day-old one; at 21 days the weight is exactly half; signal weights +3 / +2 / +1 / +0.5 / −1 / −2; staff action 0; group ×0.5 |
| Diversity | never the same artist twice in a row (8 residents × week and month), no duplicates, ≤ 3 per artist; multilingual alternation |
| Flow | middle livelier than the opening and the end |
| Next song | 3 proposals, sorted by similarity, three artists, each with a reason; g = 0 changes nothing; works without a profile |
| Cold start | no error without anything; 3 songs or era + language lead; "profile-building" |
| Statuses | without consent: no collection, no generation; a draft is never proposed; approval needs initials and is logged; edits (move, remove, add) are logged; approved → active; consent withdrawn → nothing personal |
| Schedule | nothing before Monday 06:00, one new draft after, once per week; the old unapproved draft is archived; a monthly one on 1 December |
| Reproducibility | same settings + same data = same items and same id; the settings fingerprint is recorded; another setting gives another fingerprint |
| Also | overlap ≤ 50 % with the previous week; "rejects-much"; retention (95-day-old event deleted), deletion on request, staff source ignored, no health / mood / personality label anywhere in the stored data or the code; metadata gaps; FR / EN / DE phrase parser |

The engine was also checked in the real pages with headless Chrome (Care Team tab, consent, drafts, edits and approval, Play Home with the approved playlist, next-song cards, ListenEvents, "Staff is tapping" and "Calm music now" logged as staff, a resident without consent, the tab in German): 38 checks, all passing, plus the earlier Play checks (FR 28, DE 13: video at least 200 x 200, lyrics lock, radio, Playlist IA, DJ, Premium) with no regression. Screenshots: agent R's scratchpad, folder `reco`.

## 5. Metadata gaps in the catalogue (C12.1)

Measured by `Reco.metadataGaps()` on the 574 items; nothing was filled in or invented.

- **Present for every item**: id, title, artist, year, language (songs), style (19 styles, all known), at least one tag. No duplicate id.
- **Absent fields**: tempo (slow / medium / lively), mood beyond the `calm` and `dance` tags, duration, popularity, any audio feature.
  - Duration: the playlist length assumes 3.5 min per song (17 songs ≈ 60 min).
  - Popularity: replaced by a proxy taken from the catalogue itself: the tag `youth` (the classics the catalogue marks for residents' youth) and the number of songs of the artist. No cross-resident counts are used.
  - Tempo / energy for the flow: only the `calm` and `dance` tags, then a fixed liveliness per style (classical 0.25 … disco 0.85). This is an ordering heuristic, not data about the song.
- **50 items** (songs and music) have neither `calm` nor `dance`: their ambiance is unknown (the style decides the flow).
- **22 items** have a year before 1900: classical music carries the year of composition, not of the recording; they form their own era ("before 1900").
- **11 videos** carry their upload year; videos are never in playlists or next-song proposals.
- The tag `youth` is not defined in the catalogue header beyond its name; it is used only for the popularity proxy, not in the song vector.
- Instrumental music (`kind: music`) has no language: it is its own language value, "instrumental".

## 6. Limits and next steps

- Usage indicators in real use (complete plays, hearts, skip rate, the team's smiley) are counted per playlist in the Care Team tab, to adjust the settings, never as a score on the resident.
- After the MVP: group playlists (C5, COMMUNITY_CIRCLE), several profiles per resident (data model has `profileName`), co-listening (`g`, interface `coListen(song, current)`).
- The discovery band (0.25–0.5) is a first guess; real use should tell whether "further" should keep the style or the era.
