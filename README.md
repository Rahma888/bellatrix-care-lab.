# Bellatrix Care Lab (version 1.11)

The ten micro-sessions of the Bellatrix field test brief (section 6) on the robot's portrait screen (1080 × 1920), personalised per patient, plus the staff tools the brief asks for: notes after each session (6.1 and 10.1), test matrix (5) and power log (7).

## Start it

Double-click `start.bat`. It starts a small local server and opens Chrome (or Edge) at `http://localhost:8765/`. Close the black server window to stop it.

- Use Chrome or Edge. Voice answers need them, and they need internet.
- Everything else works without internet: hand detection, movement detection and the font are in the `vendor` folder.
- Results, texts, pictures and songs are saved in this browser. Download results in the Results tab before you clear the browser or move to another computer.

## The staff page (Session tab)

1. **Patient.** Type a patient code (P1, P2…; never a name). Everything on the page is saved for that patient:
   - the name Bellatrix greets them with (optional, only with approval, never written into logs or reports);
   - text size, speaking speed, volume and subtitles;
   - all personalised texts, pictures and songs.

   "Copy from another patient" copies everything except the greeting name.
2. **Activity.** Choose one of the ten.
3. **Personalise.** Change anything for this patient:

   | Activity | What you can change |
   |---|---|
   | 1 | plan, picture, message, music |
   | 2 | the three postcards: title, picture, story |
   | 3 | sayings |
   | 4 | songs, with title, kind of music and decade |
   | 5 | which movements, and how many repetitions |
   | 6 | own pictures for the pairs |
   | 7 | menus and activities, with pictures |
   | 8 | songs for each mood |
   | 9 | contact name, photo and lines |
   | 10 | questions |

   Photos are scaled down and stripped of their hidden data (location, camera). Use real photos of residents or family only with the project's approval (brief 6.1). "Back to the defaults" resets one activity for this patient.
4. **How they answer.** Touch always works.
   - Voice.
   - Camera: off, hand signs, or pointing in the air.
   - Movement camera for Activity 5.
5. **Where and who.** Zone, staff name, map and software version, for the report only.

**Start session** runs it and saves it. **Preview** runs it without saving anything.

After **Finish** the staff page comes straight back. The session is in Results, where you can add notes (result, score, the five questions) whenever you have time.

## On the robot screen

- No staff names: Bellatrix only speaks of "the care team".
- Status chips only when they matter:
  - the red chip while the camera is on (brief CAM-01);
  - "Listening" only while the microphone listens;
  - "I heard …" after the person speaks.
- **Seated Move Along** (1.16, `js/move.js`): one part of the body (suggested each day, or chosen), new movements every day (`js/daily.js`, else its own bank), drawings that move, an optional official YouTube video (embedded player only). A counter (● ● ○, "2 / 3") fills with each movement, tapped with "I did one" or seen by the camera. Bellatrix counts out loud, and at the last one the next movement starts by itself.
- **Picture Pair:** point at the screen with one finger, without touching it. A large round pointer follows the finger, and holding still on a picture for about 1.3 seconds chooses it. Stop needs a longer hold (2.2 seconds). Pointing works whenever the camera is on; choose "Point in the air" to use it in every activity.
- **Practice call:** the contact's photo, a different voice, subtitles of what the contact says, a call timer, your own camera picture in a small corner window, and big round buttons for camera and hang up.
- **Subtitles** (per patient) show everything Bellatrix says.

Staff controls during a session:

- Tap the top-left corner three times, or press **L**, to open the staff panel.
- **Esc** ends the session.
- **A** marks a real movement attempt (Activity 5, to check the camera counting).

Keys for testing at home: **1–6** choose, **Enter** presses the main button, **Backspace** goes back, **H** opens help, **S** stops.

## Quick test at home

1. Create P1:
   - Activity 1: add a photo and a song.
   - Activity 6: add three photos.
   - Activity 9: change the contact name and add a photo.
2. Run Activity 1 by touch. Your photo, message and song should appear.
3. Run Activity 5 with the movement camera on. Raise one hand three times: the counter fills, and the next movement starts by itself.
4. Run Activity 6 with the camera set to hand signs or pointing. Point at a picture without touching it, hold still, then point at its partner.
5. Run Activity 9 with the camera on. Check the subtitles, the timer, the small camera window and the hang up button.
6. Switch to P2: none of P1's things should appear. Then copy from P1 and check that they do.
7. Finish a session: the staff page comes back. Add notes in Results and download the report.

## At the office with the robot

Step by step, in French: `TEST-AU-BUREAU.md`.

### The robot's head screen (Android 9, 1920 × 1080, Wi-Fi): two apps

- **Install on robot.bat** builds and installs, over Wi-Fi (address in `tools/robot-address.txt`):
  - **Bellatrix Care Team** (teal icon, `android/Bellatrix.apk`): choose and personalise, results. It also holds the patient screen, so both share the patients, pictures, songs and results.
  - **Bellatrix Patient** (pink heart, `android/BellatrixPatient.apk`): its own icon on the robot's home screen; it opens that patient screen.
  - **The voices**: the robot (Android 9) has no multi-language speech engine, so the app carries the sherpa-onnx library (`android/lib/arm64-v8a`, Apache-2.0; Java mirror of its API in `android/src/com/k2fsa/sherpa/onnx`) and the install script copies three offline Piper voices from `android/voices` into the app's folder on the robot: English "lessac" (medium), French "siwis" (medium), German "thorsten" (medium; "high" took up to 6 s per sentence on the robot). See `android/voices/VOICES.txt`. A language without a voice falls back to subtitles. The older single-voice engine in `android/voice` stays as the English fallback.
- **Language** per patient (Session tab, section 1): English, French or German for everything the patient sees and hears. Texts live in `js/i18n.js` (module), `js/i18n-core.js` (engine, patient screen) and `js/i18n-activities.js` (the eleven activities); the English text is the key. Activity defaults can be `{ en, fr, de }`. Voice answers (laptop Chrome only) stay English.
- **Care Team screen** (1.7): a patient card, the activities as app tiles (picture, category, favourites per patient, "played" badges, filters), the chosen activity's page below, and a Start bar that stays at the bottom. The radio input inside each tile is still the choice, so the rest of `js/staff.js` is unchanged; the robot WebView (Chrome 95) has no `:has()` or `color-mix()`, so the script sets the chosen tile's class.
- **Chess** (Activity 11): rules and Bellatrix's opponent (three levels) in `labland/packs/board-games/chess.js` (Board games pack since 1.9) (no library, perft-tested); the board is a 64-button grid (`style: 'board'`), so touch and pointing in the air work like on every other screen. Against Bellatrix or two players.
- **Ludo** (Activity 12): rules and Bellatrix's player in `labland/packs/board-games/ludo.js` (17 rule tests, 12,000 simulated games); board, dice and the game flow in `labland/packs/board-games/ludo-ui.js` (Board games pack since 1.9). 2, 4 or 6 players (cross board, or a six-branch board), 1, 2 or 4 tokens each, easy or classic rules. Between robots on the same Wi-Fi: each robot app runs a small message server (`NetServer.java`, port 8780: `/room/<room>/send`, `/room/<room>/since/<n>?wait=s`) and announces open games by UDP broadcast (`NetDiscovery.java`, port 8781). The robot that creates the game holds it and sends every new position to the others; Bellatrix plays the free places. A laptop can join with `?ludohost=<robot address>`.
- **Face**: Bellatrix's face (`Lab.faceHtml`) blinks, looks around and moves its mouth while she speaks (the app reports when the sound starts and ends).
- **Mood** before and after each activity (three faces, optional per patient): stored as `mood.before` / `mood.after` (3 good, 2 okay, 1 not so good), shown per patient as a chart in Results and in the CSV/Markdown exports.
- The patient screen lays itself out wide on this screen: words and buttons left, picture or answers right.
- No voice answers on this screen: the robot's own assistant keeps the microphone (other apps get silence), so the Voice option is hidden and no prompt asks to "say" anything. Touch, hand signs and pointing in the air work.
- Reports saved on the robot ("Download …" buttons) go to the app's folder; **Collect results from robot.bat** fetches them.
- Rebuild only: `android/build.ps1` (javac, d8, aapt2 from `android/sdk`, no Android Studio).

### The Bellatrix Library (version 1.9, demo on the PC only)

Activities come in packs: **Bellatrix Basics** (always included), **Memory**, **Movement**, **Music** (built into the app, unlocked by the care home's licence) and **Board games** (Chess and Ludo, downloaded as a signed pack). Demo: double-click `Start store demo.bat`; the script for showing it is in `DEMO-STORE.md`.

- **LabLand's side** (`labland/`, never copied onto a robot: the APK only takes `html`, `css`, `js` and `vendor`):
  - `store-server.mjs`: the store server (catalog, packs, licences, trials, requests) and the app pages, on 127.0.0.1.
  - `admin.html`: the admin page (care homes, packs, requests, signatures, security test).
  - `store-tool.mjs`: makes the key and signs the packs and the catalog (`node labland/store-tool.mjs build` after changing a pack in `labland/packs`).
  - `keys/`: the private key.
  - `data/store-data.json`: the server's state, made again at the next start if removed.
- **The robot's side**:
  - `js/store.js` checks every catalog, licence and pack with LabLand's public key (`js/store-key.js`, ECDSA P-256 via WebCrypto). A pack runs only if its code is exactly what LabLand signed.
  - Everything is kept on the device, so it works offline.
  - Only the care home code goes to the Library.
  - Before a robot is first connected, the built-in activities work as in 1.8. After that, a missing or edited licence unlocks nothing beyond Basics.
- **Testing every activity on the PC**: `start.bat` opens the pages with `?allgames`. This PC test mode shows all 12 activities, loads Chess and Ludo straight from `labland/packs`, and uses no Library or licence. It works only on localhost and lasts for that browser tab, so it never applies on a robot.
- **The Care Team app**: `js/library.js` is the Library tab. A locked activity shows 🔒 and cannot be started (staff and patient pages both check).

### Version 1.10 and 1.11: richer activities, the family call, Bellatrix Play (PC only so far)

- **Activities improved**:
  - Hello & Today: date, season, time and a birthday song.
  - Postcards: slow zoom, a yes/no question, family captions.
  - Guess the Song: sing along with the words.
  - Daily Choice: the choices appear at the top of Care Team.
  - My Music Moment: calm mode.
  - Ludo: the die is thrown with a flick of the hand.
  - Chess (Board games pack 1.1.0): stronger at every level, continue tomorrow, checkmate-in-one puzzles.
- **Family call** (`DEMO-APPEL-FAMILLE.md`): real two-way video calls between a family page (`famille.html`) and the patient screen, with signalling in `labland/call-relay.mjs` (served by `labland/store-server.mjs`). The Care Team "Family" tab holds the contacts, links and call times. Run it with `Start family call demo.bat`.
- **Bellatrix Play** (`DEMO-PLAY.md`, `js/play.js`, `js/play-catalog.js`):
  - A personal channel built from the year of birth, language and favourite music, using 90 official YouTube videos played with YouTube's own player (youtube-nocookie).
  - It learns from hearts, skips and songs listened to the end (localStorage `bellatrix-play-taste`), and has a "Calm music now" button in Care Team.
  - It needs internet. LabLand re-checks the catalogue with `node labland/play-check.mjs`.

### The 32" front screen (Chrome, USB or Wi-Fi)

- Since 1.13 patients are prepared on the robot itself (the laptop no longer has an "Export all patients" button). An older export file in Downloads is still copied.
- **Deploy to robot.bat** does the rest in one click:
  - copies that file into `transfer/`;
  - serves this folder on port 8765;
  - finds the robot screen (USB first, or Wi-Fi with pairing);
  - links it with `adb reverse`, so the screen opens `http://localhost:8765` and Chrome allows the camera and microphone;
  - opens the app in Chrome with `?robot=1`, which means full screen and the screen stays awake.

  On the robot screen a blue bar offers the prepared patients: **Load them**.
- **Power log.bat** writes battery, charging, temperature, brightness, Wi-Fi signal and the app in front every 30 minutes to `from-robot/power-<date>.csv`. It covers the front screen, and the robot's head screen if it is reachable.
- **Collect results from robot.bat** copies the reports downloaded on the robot screen into `from-robot/<date>/`.
