# Plan: Care V1 modules B (Album de vie) and C (Lecture gratuite), Premium books

Agent L, night of 9 to 10 November 2026. Only the files listed for L in the coordination note are edited.
Version stays 1.14.0. Nothing goes to the robot.

## B. Album de vie: activity key `album`

- `js/album-data.js`: `window.Album`, the store (exposed first, so agent M can test against it).
  - Metadata in localStorage `bellatrix-album-v1`. Each picture is in its own key, `bellatrix-album-img-<id>`, as a resized JPEG data URL. Likes and sessions are written often and must not rewrite the pictures.
  - `Album.add(code, {theme, src, caption, question, addedBy})` takes a data URL or a server URL. A server URL is cached as a data URL when the robot can fetch it, so it works offline. `Album.list(code)`, likes, hidden photos and themes, notes, sessions, stats and "Photo du jour".
  - 7 themes: family, travel, childhood, work, animals, celebrations, town. Theme names in FR and DE are accepted too.
  - Plan B: 21 generic cards (3 per theme), drawn as flat SVG in the file. No picture is downloaded. Free-licence photos can replace them later.
- `js/album.js`: patient session.
  - 3 big theme cards, then one picture at a time with a big caption and the opening question.
  - Précédente / Suivante (pair) and J'aime (heart): 3 main buttons. Back, Help and Stop come from the core.
  - After about 12 minutes (Personalise) or 3 themes: "Merci pour ce beau moment".
- `js/album-staff.js`: Care Team tab "Album & Lecture", mounted by the script itself.
  - Per resident: add a photo from the device (resized), caption, theme and question. Family photos carry a "de la famille" mark. Hide a photo or a theme, and keep free notes.
  - Dashboard: most liked photos, themes avoided or hidden, session lengths.
  - "Photo du jour" on the robot's waiting screen: an observer in album.js adds it without touching patient.js; the clean hook is proposed in the report.
  - Reading settings live in the same tab: weather place, and Premium status and requests.

## C. Lecture gratuite: activity key `reading`

- `js/reading-data.js`: stories (public domain, from Wikisource and Gutenberg, verbatim), horoscope messages written in-house, "Il y a 50 ans" facts with sources, weather code names.
- `data/reading-licences.json`: one row per text. A story whose row is missing or incomplete is never shown (the filter is tested).
- `js/reading.js`:
  - First "Aujourd'hui": date, moment of the day, time, and the weather from Open-Meteo. Only coordinates are sent; the result is cached, and there is a clear offline line.
  - Then a 3-choice menu: Histoires / Horoscope (pour le plaisir) / Il y a 50 ans.
  - Stories: big type, page by page, read by TTS, with the speed adjustable on screen.
  - Premium books carry a crown. Locked, they say "ask the team" and write `bellatrix-play-premium-request`. No price is ever shown.
  - With Premium: "reprendre où on s'était arrêté" and favourites.
  - The sign comes from the Personalise field, or from `Lab.opt.life.birthday`.
- Pure logic, testable in node, is exposed as `Reading._t`: licence filter, Premium lock, sign, weather cache and fallback, pages.

## Shared

- `js/i18n-album-reading.js`: FR and DE for the patient and Care Team texts (English is the key).
- `css/album-reading.css`: portrait 1080×1920 and `.land` 1920×1080. Chrome 95: no `:has`, `color-mix` or blend modes.
- Tests:
  - `tests/album-reading.test.mjs` (node).
  - A headless-Chrome check in portrait and landscape, with screenshots in the scratchpad `album-reading` folder.
