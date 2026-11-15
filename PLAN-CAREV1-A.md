# Care V1, module A: family messages, family portal, family Premium offer (agent M)

Night of 9 to 10 November 2026. Spec: Bellatrix_Care_V1_Briefing.pdf, parts 2, 3, 6, 7, 8, 10.
Files: only those listed for M in the coordination file. Version stays 1.14.0.

## Pieces

1. **Server** `labland/family-portal.mjs`, mounted by `store-server.mjs` under `/portal/api/` (a few lines).
   Plain Node, data in `labland/data/portal/portal.json`, photos in `labland/data/portal/photos/<random id>.jpg`.
   - Robot: registers once (`robot/hello`, robot id + random key, trust on first use); then every call carries
     `Authorization: Robot <id>.<key>`. Residents (patient code + the first name the family uses, chosen by the team),
     invitations (8-character code, 14 days, single use), team-created accounts, sign-in codes to read out,
     queue, decisions (validate / postpone / refuse + internal reason + show-at time + "announced by the team" + album),
     feed of validated messages, "shown" statuses, Premium offers (activate / later), erase a resident's data.
   - Family: `Authorization: Bearer <session token>` (random, 180 days, only its hash on disk). Register with an
     invitation code + RGPD consent; sign in with email + one-time code (6 digits, 15 min, 5 tries; shown in the
     Care Team because no email is sent). Send a message (text <= 300 characters, or a JPEG photo <= 1600 px with an
     optional caption; no links), history with Reçu / Validé / Montré, delete a message, offer Premium (1, 3 or 12
     months, demo payment), stop it in one click, revoke consent (deletes the account and its data), sign out.
   - No names or codes in URLs: ids and tokens travel in bodies and headers. CORS open (the robot app is another origin).
   - Retention: shown or refused messages and their photos are deleted after 30 days, unreviewed ones after 30 days,
     invitations after 14 days, sign-in codes after 15 min, sessions after 180 days. Withdrawn messages leave only a
     tombstone id (no content) so the robot deletes its copy.
2. **Portal** `portail.html`, `js/portail.js`, `css/portail.css`, `portail.webmanifest`, `sw-portail.js`: installable PWA,
   FR / DE / EN (texts in `js/i18n-messages.js`), mobile first. Tabs "Message" and "Offrir Premium", history,
   "Mon compte" (language, consent, sign out, delete). Voice shown as "bientôt" (V2). Gentle wording, no countdown.
   Payment: a demo screen with no card field and a clear TODO (Stripe Checkout needs the owner's account).
3. **Care Team** `js/messages-staff.js`: its own "Messages" tab with a badge. Queue "Messages à valider" with an exact
   1080 x 1920 preview (the same renderer as the robot), Valider / Reporter / Refuser, internal reason, show-at time,
   "à annoncer par l'équipe", "pour l'album" (`window.Album.add`, guarded). Premium offer banner (Activer calls
   `PlayPremium.activate('single')`, Plus tard). Accounts per resident: invitation + QR + print, create an account,
   sign-in codes to read out, delete. Erase all family data of a resident. Server address = the Family tab one.
4. **Robot** `js/messages.js`: cache of validated messages (metadata in localStorage, photos in IndexedDB) for
   offline use; the patient screen proposes a due message when idle (9:00 to 20:00 by default): "Vous avez un message
   de Sophie. Voulez-vous le voir ?" Oui / Plus tard; then photo and name big, text read by TTS, Réécouter / Suivant,
   Stop from the core. "Montré" goes back to the server (outbox, retried). Activity key `messages` for the Care Team.
   Never shows anything not validated; never presents a message marked "à annoncer par l'équipe".
5. **Tests** `tests/messages.test.mjs` (node): invitation, account, message, validate, shown; refuse; postpone;
   Premium offer, activation, stop; consent revoke; deletion; retention; links refused. Headless Chrome: portal at
   phone size, Care Team tab, patient screen in portrait. Screenshots in the scratchpad `messages` folder.

## Added during the night (coordinator and agent T)
- Album feeding by the family: portal tab "Album" (photo, theme Famille/Voyages/Enfance/Métier/Animaux/Fêtes/Ma ville,
  caption <= 90, optional question), same validation queue marked "album", then `Album.add(code, {theme, src, caption,
  question, addedBy: 'family'})` (agent L's ids: family, travel, childhood, work, animals, celebrations, town); waits on
  the device when Album is missing; `FamilyMessages.albumShown(pictureId)` lets the album report "Montré".
- "Envoyés": every item the family sent, Reçu / Validé / Montré / Non affiché, never the reason.
- "Appel vidéo avec [Prénom]": the care team attaches the relative's Family-tab call link to the portal account.
- Deletion from the portal: delete all my messages and photos (account kept); withdraw consent (account deleted).
- Agent T: no automatic offer in "Personnel seulement" mode, only on the top-level patient.html; checklist line
  through `StaffTools.addDaySource`.

## Decided alone (to confirm)
- One family offer turns on the device-wide `bellatrix-play-premium` (plan `single`); stopping or expiry turns it off
  only if it was off before the family offer.
- A photo may carry an optional caption (<= 300 characters).
- Refused messages show "Pas affiché" to the family with a fixed gentle sentence, never the reason.
- Robot trust on first use for its key; the server prints sign-in codes in its own window too (local demo only).
