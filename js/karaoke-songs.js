/* Free group karaoke: public-domain songs with melody, chords and timed lyrics (briefing b1, block A).
   Nothing here uses the network, YouTube, LRCLIB or the Play catalogue: every song is written out as
   notes and played by Bellatrix's own synthesiser (js/music.js), so the music is ours and the lyrics
   sync comes from the same notes ("exact by construction").

   A song:   { id, lang: fr|de|en, cat: popular|christmas|children, title, bpm, meter, pickup, lines }
   A line:   { s, n, c, ch }
     s   the words, "/" between the syllables of a word ("lu/ne"), "_" joins two words sung as one
         syllable ("re_un" is shown "re un"). Tokens without letters ("!", "–") belong to the word before.
     n   one token per syllable: a note is PITCH[:beats] (C4, F#4, Bb3; 1 beat when no length), "+" joins
         the notes of one syllable (a melisma), "R:2" is a rest (no syllable).
     c   the chords and their beats ("C:2 G7:2"); their beats add up to the beats of the line. "N" = none.
     ch  true for a chorus line ("Chorus only" mode).
   The licence register (data/karaoke-licences.json) is embedded below between the REGISTER markers;
   `node tests/karaoke.test.mjs --sync` copies it from the JSON file. A song is shown only when its
   register row is complete (see complete()). */
(function (root) {
  'use strict';

  /* ---------- the register (copied from data/karaoke-licences.json, do not edit by hand) ---------- */
  var REGISTER = /* REGISTER-BEGIN */ {
    "register": "Bellatrix free group karaoke: licence register",
    "version": "1.2.0",
    "updated": "2026-11-11",
    "rule": "A song is shown in the app only when its row is complete: every field below filled in, audioSource \"generated\", verifiedOn a date, and text and melody free (author dead for at least 70 full years, or for an anonymous work first published at least 70 full years ago). See KaraokeSongs.complete() in js/karaoke-songs.js. The rows are research by Claude and must be confirmed by LabLand before any commercial use.",
    "fields": {
      "textAuthorDeathYear": "year, or \"anonymous\" together with textFirstPublished (year)",
      "composerDeathYear": "year, or \"anonymous\" together with melodyFirstPublished (year)",
      "audioSource": "\"generated\": synthesised on the robot from the notes in js/karaoke-songs.js; no recording",
      "verifiedBy": "who checked the row"
    },
    "songs": [
      {
        "id": "fr-clair-lune",
        "title": "Au clair de la lune",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous (traditional, 18th century)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1843,
        "composer": "Anonymous (traditional; the old attribution to Lully is not supported)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1843,
        "textSource": "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Au_clair_de_la_lune",
        "textVersion": "Verses 1 and 2 as in Weckerlin, Chansons et rondes enfantines (Garnier, 1870), pp. 48-49 (scan on Wikisource); melody as in the same edition, transposed from G to C.",
        "sources": [
          "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Au_clair_de_la_lune",
          "https://fr.wikisource.org/wiki/Au_clair_de_la_lune_(chanson)",
          "https://fr.wikipedia.org/wiki/Au_clair_de_la_lune"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "French Wikipedia: earliest known printing of the text 1843 (Th. M. Dumersan). Weckerlin notes the first half of the tune as early as 1576 (Chardavoine). Author and composer unknown."
      },
      {
        "id": "fr-frere-jacques",
        "title": "Frère Jacques",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous (traditional)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1811,
        "composer": "Anonymous (disputed attribution to Jean-Philippe Rameau, died 1764)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1811,
        "textSource": "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Fr%C3%A8re_Jacques",
        "textVersion": "Weckerlin 1870 (p. 103): one verse, sung three times in unison (the source is a two-voice round; its short coda is left out). Wording of the source, including \"Dig’, din, don\".",
        "sources": [
          "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Fr%C3%A8re_Jacques",
          "https://fr.wikipedia.org/wiki/Fr%C3%A8re_Jacques_(chanson)"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "First printed 1811 in the Recueil de Capelle (French Wikipedia); a manuscript of about 1772 attributes it to Rameau. Free either way."
      },
      {
        "id": "fr-pont-avignon",
        "title": "Sur le pont d’Avignon",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous (traditional)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1870,
        "composer": "Anonymous (traditional)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1870,
        "textSource": "https://fr.wikisource.org/wiki/Sur_le_pont_d%E2%80%99Avignon_(Weckerlin_1870)",
        "textVersion": "Refrain and first couplet (\"Les messieurs… les dames…\") as in Weckerlin 1870 (p. 34); couplets 2 and 3 use the variants listed on the same page (abbés, soldats, buveurs, gamins).",
        "sources": [
          "https://fr.wikisource.org/wiki/Sur_le_pont_d%E2%80%99Avignon_(Weckerlin_1870)",
          "https://fr.wikipedia.org/wiki/Sur_le_pont_d%27Avignon"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Anonymous, possibly 15th century; made popular in 1853 by Adolphe Adam (Le Sourd ou l’Auberge pleine). 1870 is the edition checked here."
      },
      {
        "id": "fr-planter-choux",
        "title": "Savez-vous planter les choux ?",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous (traditional)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1870,
        "composer": "Anonymous (traditional)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1870,
        "textSource": "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Savez-vous_planter_les_choux",
        "textVersion": "Weckerlin 1870 (p. 108): the first stanza sung as a refrain between the couplets main, pied, coud’ (source order). Melody transposed from F to C.",
        "sources": [
          "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Savez-vous_planter_les_choux"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Traditional game song; 1870 is the earliest edition checked here."
      },
      {
        "id": "fr-cadet-rousselle",
        "title": "Cadet Rousselle",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous in the source (French Wikipedia credits Gaspard de Chenu, 1792; his death year was not found)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1870,
        "composer": "Anonymous (traditional tune)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1870,
        "textSource": "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Cadet_Rousselle",
        "textVersion": "Weckerlin 1870 (pp. 90-94): couplets \"trois maisons\", \"trois habits\", \"trois gros chiens\", with the refrain \"Ah ! ah ! ah ! mais vraiment\". Melody transposed from B-flat to G.",
        "sources": [
          "https://fr.wikisource.org/wiki/Chansons_et_rondes_enfantines/Cadet_Rousselle",
          "https://fr.wikipedia.org/wiki/Cadet_Rousselle_(chanson)"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Written 1792 (French Wikipedia). With the attribution too, the text is long free: Chenu was a notable of Auxerre born in 1717 (Wikipedia footnote). To confirm: his death year."
      },
      {
        "id": "fr-claire-fontaine",
        "title": "À la claire fontaine",
        "language": "fr",
        "category": "popular",
        "textAuthor": "Anonymous (traditional, 15th to 18th century)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1848,
        "composer": "Anonymous (traditional)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1880,
        "textSource": "https://fr.wikisource.org/wiki/%C3%80_la_claire_fontaine",
        "textVersion": "Verses 1-4 as in Jameson & Heacox, Chants de France (1922), p. 121, refrain after each; the refrain is written \"Il y a longtemps\" (source: \"Lui ya\", which its own footnote explains as \"il y a\"). Melody as in Gagnon, Chansons populaires du Canada (1880 ed.), the same tune as in Jameson & Heacox.",
        "sources": [
          "https://fr.wikisource.org/wiki/%C3%80_la_claire_fontaine",
          "https://fr.wikisource.org/wiki/Chansons_populaires_du_Canada,_1880/p001",
          "https://fr.wikipedia.org/wiki/%C3%80_la_claire_fontaine"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "French Wikipedia: earliest cited printing of the text 1848 (Huston, Répertoire national). Gagnon’s first edition is 1865; the 1880 edition is the one checked."
      },
      {
        "id": "fr-pres-de-ma-blonde",
        "title": "Auprès de ma blonde",
        "language": "fr",
        "category": "popular",
        "textAuthor": "Anonymous (traditional, 1704; presumed author André Joubert du Collet, death year not found)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1883,
        "composer": "Anonymous (traditional)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1883,
        "textSource": "https://fr.wikisource.org/wiki/Aupr%C3%A8s_de_ma_blonde",
        "textVersion": "Rolland, Recueil de chansons populaires, t. 1 (1883), pp. 240-241 (Loiret version, with its score): verses 1-3, refrain after each. Spelling \"rafraîchir\" and \"dormir\" (source: \"rafraichir\", \"dormi\").",
        "sources": [
          "https://fr.wikisource.org/wiki/Aupr%C3%A8s_de_ma_blonde",
          "https://fr.wikipedia.org/wiki/Aupr%C3%A8s_de_ma_blonde"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Written 1704 (\"Le Prisonnier de Hollande\"), sung by soldiers by 1712 (French Wikipedia). 1883 is the edition checked here."
      },
      {
        "id": "fr-divin-enfant",
        "title": "Il est né, le divin Enfant",
        "language": "fr",
        "category": "christmas",
        "textAuthor": "Anonymous (traditional carol)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1818,
        "composer": "Anonymous (old hunting tune \"La Tête bizarde\")",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1819,
        "textSource": "https://fr.wikisource.org/wiki/Il_est_n%C3%A9_le_divin_enfant",
        "textVersion": "Rossat, Chansons populaires recueillies dans la Suisse romande, t. 2 (1917), p. 162, with its score: refrain (\"sonnez, musettes\") and verses 1-3. \"attendions\" sung in four syllables (at-ten-di-ons), as the score requires.",
        "sources": [
          "https://fr.wikisource.org/wiki/Il_est_n%C3%A9_le_divin_enfant",
          "https://fr.wikipedia.org/wiki/Il_est_n%C3%A9_le_divin_enfant"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Text printed 1818 (Montpellier, Nouveau recueil de cantiques spirituels), tune 1819 (Sellier, Amiens), per French Wikipedia."
      },
      {
        "id": "de-alle-voegel",
        "title": "Alle Vögel sind schon da",
        "language": "de",
        "category": "children",
        "textAuthor": "August Heinrich Hoffmann von Fallersleben (1798–1874)",
        "textAuthorDeathYear": 1874,
        "textFirstPublished": 1837,
        "composer": "Traditional folk tune (anonymous; 18th-century farewell song “Nun so reis ich weg von hier”)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1844,
        "textSource": "https://de.wikisource.org/wiki/Fr%C3%BChlings_Ankunft",
        "textVersion": "All three stanzas of Hoffmann von Fallersleben’s poem (written 1835, printed in his Gedichte 1837), modern spelling (Musiziern, Tiriliern, einmarschiern as usually sung).",
        "sources": [
          "https://de.wikisource.org/wiki/Fr%C3%BChlings_Ankunft",
          "https://de.wikipedia.org/wiki/Alle_V%C3%B6gel_sind_schon_da",
          "https://de.wikisource.org/wiki/August_Heinrich_Hoffmann_von_Fallersleben",
          "https://de.wikibooks.org/wiki/Liederbuch/_Alle_V%C3%B6gel_sind_schon_da"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Tune first printed with this text in the Liederbuch des Rauhen Hauses, Hamburg 1844. Melody checked against the Wikibooks songbook (notes only; our chords)."
      },
      {
        "id": "de-haenschen-klein",
        "title": "Hänschen klein",
        "language": "de",
        "category": "children",
        "textAuthor": "Franz Wiedemann (1821–1882)",
        "textAuthorDeathYear": 1882,
        "textFirstPublished": 1860,
        "composer": "Traditional folk tune (anonymous; tune of the hunting song “Jägerlust”)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1807,
        "textSource": "https://de.wikipedia.org/wiki/H%C3%A4nschen_klein",
        "textVersion": "Wiedemann’s three stanzas (1860, “Alte Lieder, neue Worte” in Samenkörner für Kinderherzen) in the usual school wording; modern spelling.",
        "sources": [
          "https://de.wikipedia.org/wiki/H%C3%A4nschen_klein",
          "https://de.wikibooks.org/wiki/Liederbuch/_H%C3%A4nschen_klein"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Tune printed 1807 in Büsching/von der Hagen, Sammlung deutscher Volkslieder (with “Jägerlust”). Not the modern parody verses. Small wording variants exist in verse 3 (“ruft sie schon” / “spricht sie schon”); to be checked against a scan by LabLand."
      },
      {
        "id": "de-mond-aufgegangen",
        "title": "Der Mond ist aufgegangen",
        "language": "de",
        "category": "popular",
        "textAuthor": "Matthias Claudius (1740–1815)",
        "textAuthorDeathYear": 1815,
        "textFirstPublished": 1779,
        "composer": "Johann Abraham Peter Schulz (1747–1800)",
        "composerDeathYear": 1800,
        "melodyFirstPublished": 1790,
        "textSource": "https://de.wikisource.org/wiki/Abendlied_(Matthias_Claudius)",
        "textVersion": "Stanzas 1, 2 and 3 of Claudius’s “Abendlied” (Musen-Almanach für 1779), modern spelling.",
        "sources": [
          "https://de.wikisource.org/wiki/Abendlied_(Matthias_Claudius)",
          "https://de.wikipedia.org/wiki/Abendlied_(Matthias_Claudius)",
          "https://de.wikipedia.org/wiki/Johann_Abraham_Peter_Schulz",
          "https://wiki.jurtenland.eu/wiki/Der_Mond_ist_aufgegangen"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Melody by Schulz, Lieder im Volkston (1790); transposed to E flat for older voices. Not the gender-neutral 2017 rewording."
      },
      {
        "id": "de-gedanken-frei",
        "title": "Die Gedanken sind frei",
        "language": "de",
        "category": "popular",
        "textAuthor": "Traditional (anonymous broadsheets c. 1780–1800; version printed by Hoffmann von Fallersleben and Richter, 1842)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1842,
        "composer": "Traditional (anonymous, c. 1810–1820)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1842,
        "textSource": "https://de.wikisource.org/wiki/Die_Gedanken_sind_frei",
        "textVersion": "Stanzas “Die Gedanken sind frei”, “Ich denke, was ich will” and “Und sperrt man mich ein” of the 1842 version (Schlesische Volkslieder mit Melodien, Leipzig: Breitkopf & Härtel), modern spelling.",
        "sources": [
          "https://de.wikisource.org/wiki/Die_Gedanken_sind_frei",
          "https://de.wikipedia.org/wiki/Die_Gedanken_sind_frei",
          "https://de.wikibooks.org/wiki/Liederbuch/_Die_Gedanken_sind_frei"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Text and tune first printed together in 1842 (the tune earlier in Lieder der Brienzer Mädchen, Bern). Transposed to B flat. Hoffmann von Fallersleben (died 1874) edited the 1842 version, so it is free either way."
      },
      {
        "id": "de-o-tannenbaum",
        "title": "O Tannenbaum",
        "language": "de",
        "category": "christmas",
        "textAuthor": "Ernst Anschütz (1780–1861); first lines after August Zarnack (1777–1827)",
        "textAuthorDeathYear": 1861,
        "textFirstPublished": 1824,
        "composer": "Traditional folk tune (anonymous; the “Lauriger Horatius” form)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1799,
        "textSource": "https://de.wikipedia.org/wiki/O_Tannenbaum",
        "textVersion": "Anschütz’s three-stanza Christmas text (Musikalisches Schulgesangbuch, Leipzig 1824), modern spelling; stanza 3 “gibt Trost und Kraft” as in Anschütz (often sung “Mut und Kraft”).",
        "sources": [
          "https://de.wikipedia.org/wiki/O_Tannenbaum",
          "https://de.wikisource.org/wiki/Ernst_Ansch%C3%BCtz",
          "https://de.wikisource.org/wiki/Volkslieder",
          "https://wiki.jurtenland.eu/wiki/O_Tannenbaum"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "The tune is first printed in the Mildheimisches Liederbuch (1799); sung today in the “Lauriger Horatius” form. Transposed to E flat. Zarnack’s 1819 love-song stanzas are not used."
      },
      {
        "id": "de-stille-nacht",
        "title": "Stille Nacht, heilige Nacht",
        "language": "de",
        "category": "christmas",
        "textAuthor": "Joseph Mohr (1792–1848)",
        "textAuthorDeathYear": 1848,
        "textFirstPublished": 1833,
        "composer": "Franz Xaver Gruber (1787–1863)",
        "composerDeathYear": 1863,
        "melodyFirstPublished": 1833,
        "textSource": "https://de.wikisource.org/wiki/Stille_Nacht!_Heilige_Nacht!",
        "textVersion": "Mohr’s stanzas 1, 6 and 2 (order of the 1833 Dresden print) in the usual sung wording (“Christ” for “Jesus”, “von fern und nah”).",
        "sources": [
          "https://de.wikisource.org/wiki/Stille_Nacht!_Heilige_Nacht!",
          "https://de.wikisource.org/wiki/Joseph_Mohr",
          "https://de.wikipedia.org/wiki/Stille_Nacht,_heilige_Nacht"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Written 1816, set to music 1818, first printed 1833 (A. R. Friese, Dresden). Melody in the usual hymnal form, transposed to A, counted in eighths (6/8)."
      },
      {
        "id": "de-aennchen-tharau",
        "title": "Ännchen von Tharau",
        "language": "de",
        "category": "popular",
        "textAuthor": "Simon Dach (1605–1659), High German version by Johann Gottfried Herder (1744–1803)",
        "textAuthorDeathYear": 1803,
        "textFirstPublished": 1778,
        "composer": "Friedrich Silcher (1789–1860)",
        "composerDeathYear": 1860,
        "melodyFirstPublished": 1827,
        "textSource": "https://de.wikisource.org/wiki/%C3%84nnchen_von_Tharau",
        "textVersion": "Herder’s first two stanzas (Volkslieder, 1778), each with its closing couplet, modern spelling; Herder’s archaic rhymes “schlahn / stahn” kept.",
        "sources": [
          "https://de.wikisource.org/wiki/%C3%84nnchen_von_Tharau",
          "https://de.wikisource.org/wiki/Aennchen_von_Tharau_und_Simon_Dach",
          "https://de.wikipedia.org/wiki/%C3%84nnchen_von_Tharau",
          "https://de.wikipedia.org/wiki/Friedrich_Silcher",
          "https://de.wikibooks.org/wiki/Liederbuch/_Anke_van_Tharaw"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Silcher’s melody (1827; the Kommersbuch says 1825), not Heinrich Albert’s 1642 setting. Closing couplet sung to the second half of the tune. Transposed to G."
      },
      {
        "id": "en-amazing-grace",
        "title": "Amazing Grace",
        "language": "en",
        "category": "popular",
        "textAuthor": "John Newton",
        "textAuthorDeathYear": 1807,
        "textFirstPublished": 1779,
        "composer": "Traditional American tune NEW BRITAIN (anonymous)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1829,
        "textSource": "https://hymnary.org/text/amazing_grace_how_sweet_the_sound",
        "textVersion": "Newton's stanzas 1–3 (Olney Hymns, 1779, Book I no. 41) in modern spelling. The later stanza 'When we've been there ten thousand years' (not by Newton) is not used.",
        "sources": [
          "https://hymnary.org/text/amazing_grace_how_sweet_the_sound",
          "https://people.bethel.edu/~rhomar/TunePages/NewBritain.html",
          "https://en.wikipedia.org/wiki/Amazing_Grace"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Newton 1725–1807. Tune NEW BRITAIN first printed in Columbian Harmony (Cincinnati, 1829), joined to this text in Southern Harmony (1835); composer unknown. Melody transposed to F."
      },
      {
        "id": "en-silent-night",
        "title": "Silent Night",
        "language": "en",
        "category": "christmas",
        "textAuthor": "Joseph Mohr (German text 1818), English translation by John Freeman Young",
        "textAuthorDeathYear": 1885,
        "textFirstPublished": 1863,
        "composer": "Franz Xaver Gruber",
        "composerDeathYear": 1863,
        "textSource": "https://hymnary.org/text/silent_night_holy_night_all_is_calm_all",
        "textVersion": "John Freeman Young's translation (1859, first printed 1863): his three stanzas 'Silent night… Round yon Virgin', '…Shepherds quake at the sight', '…Son of God, love's pure light'. No modern revision (e.g. the 1984 revision) is used.",
        "sources": [
          "https://hymnary.org/text/silent_night_holy_night_all_is_calm_all",
          "https://hymnary.org/person/Young_JF",
          "https://en.wikipedia.org/wiki/Silent_Night"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Mohr 1792–1848, Young 1820–1885, Gruber 1787–1863. Death year given is the later of text author and translator. Melody transposed to A."
      },
      {
        "id": "en-jingle-bells",
        "title": "Jingle Bells",
        "language": "en",
        "category": "christmas",
        "textAuthor": "James Lord Pierpont",
        "textAuthorDeathYear": 1893,
        "textFirstPublished": 1857,
        "composer": "James Lord Pierpont",
        "composerDeathYear": 1893,
        "melodyFirstPublished": 1857,
        "textSource": "https://imslp.org/wiki/The_One_Horse_Open_Sleigh_(Pierpont,_James)",
        "textVersion": "Verse 1 and chorus (chorus sung twice) in the wording and tune commonly sung today. Pierpont's 1857 print ('The One Horse Open Sleigh', Oliver Ditson, Boston) differs slightly (e.g. 'o'er the hills', 'what joy it is to ride'); these small changes are anonymous folk variants of unknown date. The modern interjection 'hey!' is not sung (instrumental rest).",
        "sources": [
          "https://imslp.org/wiki/The_One_Horse_Open_Sleigh_(Pierpont,_James)",
          "https://themorgan.org/music-manuscripts-and-printed-music/310171",
          "https://en.wikipedia.org/wiki/Jingle_Bells"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Pierpont 1822–1893; copyrighted 16 Sept 1857. If LabLand prefers the exact 1857 words, the three changed words can be swapped back. Melody in F."
      },
      {
        "id": "en-auld-lang-syne",
        "title": "Auld Lang Syne",
        "language": "en",
        "category": "popular",
        "textAuthor": "Robert Burns",
        "textAuthorDeathYear": 1796,
        "textFirstPublished": 1796,
        "composer": "Traditional Scottish melody (anonymous)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1799,
        "textSource": "https://en.wikisource.org/wiki/Burns%27_Popular_Songs/Auld_Lang_Syne",
        "textVersion": "Stanza 1 and chorus as in the Wikisource 'Burns' Popular Songs' text ('days o' lang syne', 'my dear'), plus Burns's stanza 'And there's a hand, my trusty fiere'. Chorus after each stanza. Scots spelling kept.",
        "sources": [
          "https://en.wikisource.org/wiki/Burns%27_Popular_Songs/Auld_Lang_Syne",
          "https://en.wikipedia.org/wiki/Auld_Lang_Syne",
          "https://abcnotation.com/tunePage?a=pghardy.net/tunebooks/pgh_songs_tunebook/0001"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Burns 1759–1796 (sent the song to the Scots Musical Museum in 1788). The tune sung today was first printed in George Thomson's Select Songs of Scotland (1799). Melody in D."
      },
      {
        "id": "en-home-on-the-range",
        "title": "Home on the Range",
        "language": "en",
        "category": "popular",
        "textAuthor": "Brewster M. Higley (poem 'My Western Home'); words as collected by John A. Lomax",
        "textAuthorDeathYear": 1911,
        "textFirstPublished": 1873,
        "composer": "Daniel E. Kelley",
        "composerDeathYear": 1905,
        "textSource": "https://www.gutenberg.org/files/21300/21300-h/21300-h.htm",
        "textVersion": "The version printed in John A. Lomax, Cowboy Songs and Other Frontier Ballads (1910): stanza 'Oh, give me a home…', refrain 'Home, home on the range…', stanza 'How often at night…', refrain.",
        "sources": [
          "https://www.gutenberg.org/files/21300/21300-h/21300-h.htm",
          "https://en.wikipedia.org/wiki/Home_on_the_Range",
          "https://en.wikipedia.org/wiki/Daniel_E._Kelley",
          "https://www.kansashistory.gov/kansapedia/brewster-higley/18138",
          "https://abcnotation.com/tunePage?a=trillian.mit.edu/~jc/music/abc/mirror/musicaviva.com/tunes/usa/home-on-the-range/0000"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Higley 1823–1911 (Kansas Historical Society gives 1909; the later year is kept). Kelley 1843–1905. Lomax (collector) died 1948, also more than 70 years ago. Poem first printed in the Smith County Pioneer, 1873 or 1874. Melody in G."
      },
      {
        "id": "en-swing-low",
        "title": "Swing Low, Sweet Chariot",
        "language": "en",
        "category": "popular",
        "textAuthor": "Traditional African-American spiritual (attributed to Wallace Willis, Choctaw freedman; death year not documented)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1873,
        "composer": "Traditional spiritual (anonymous; attributed to Wallace Willis)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1873,
        "textSource": "https://hymnary.org/text/i_looked_over_jordan_and_what_did_i_see",
        "textVersion": "Refrain 'Swing low, sweet chariot', stanzas 'I looked over Jordan…' and 'If you get there before I do…', as printed for the Fisk Jubilee Singers (The Jubilee Singers, 1873; J. B. T. Marsh, The Story of the Jubilee Singers, 1876); standard spelling except 'comin'' as in every old print.",
        "sources": [
          "https://hymnary.org/text/i_looked_over_jordan_and_what_did_i_see",
          "https://en.wikipedia.org/wiki/Swing_Low,_Sweet_Chariot",
          "https://abcnotation.com/tunePage?a=sniff.numachi.com/~rickheit/dtrad/abc_dtrad.tar.gz/abc_dtrad/SWINGLOW/0000"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Treated as anonymous (no documented author death year); first printed 1873. Melody in E."
      },
      {
        "id": "en-coming-round-the-mountain",
        "title": "She’ll Be Coming Round the Mountain",
        "language": "en",
        "category": "children",
        "textAuthor": "Traditional American (anonymous)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1927,
        "composer": "Traditional (anonymous; tune of the spiritual 'When the Chariot Comes')",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1899,
        "textSource": "https://archive.org/details/americansongbag00sandb",
        "textVersion": "Stanzas 1–3 as in Carl Sandburg, The American Songbag (1927), pp. 372–73 (coming round the mountain / driving six white horses / we'll all go to meet her), with 'Oh' added before stanza 3 lines and modern spelling ('coming' for 'comin'').",
        "sources": [
          "https://rpo.library.utoronto.ca/poems/shell-be-comin-round-mountain",
          "https://en.wikipedia.org/wiki/She%27ll_Be_Coming_%27Round_the_Mountain",
          "https://abcnotation.com/tunePage?a=sniff.numachi.com/~rickheit/dtrad/abc_dtrad.tar.gz/abc_dtrad/COMRND2/0000"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Anonymous folk song; first printed 1927 (Sandburg), so free in the EU (anonymous + 70 years) and in the US (published 1927, public domain since 2023). Tune printed 1899 in Old Plantation Hymns. Modern children's-book verses (e.g. Fox 1985) are not used. Melody in G."
      },
      {
        "id": "en-twinkle",
        "title": "Twinkle, Twinkle, Little Star",
        "language": "en",
        "category": "children",
        "textAuthor": "Jane Taylor (poem 'The Star', Rhymes for the Nursery, with her sister Ann Taylor)",
        "textAuthorDeathYear": 1866,
        "textFirstPublished": 1806,
        "composer": "French melody 'Ah ! vous dirai-je, maman' (anonymous)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1761,
        "textSource": "https://en.wikisource.org/wiki/Rhymes_for_the_Nursery/The_Star",
        "textVersion": "Stanzas 1–2 of 'The Star' (1806); as usually sung, the first two lines come back at the end of each stanza.",
        "sources": [
          "https://en.wikisource.org/wiki/Rhymes_for_the_Nursery/The_Star",
          "https://en.wikipedia.org/wiki/Twinkle,_Twinkle,_Little_Star"
        ],
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-09",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)",
        "notes": "Not in the A4 list, added as an English nursery song. Jane Taylor 1783–1824; the collection is credited to Jane and Ann Taylor, so Ann's death year (1866) is kept. Tune first printed 1761; poem and tune printed together in 1838. Melody in D."
      },
      {
        "id": "fr-vous-dirai-je",
        "title": "Ah ! vous dirai-je, maman",
        "language": "fr",
        "category": "children",
        "textAuthor": "Anonymous (traditional, 18th century)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1774,
        "composer": "Anonymous (traditional French tune, “La Confidence naïve”, 18th century)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1774,
        "textSource": "https://fr.wikisource.org/wiki/Ah_!_vous_dirai-je,_maman",
        "textVersion": "First stanza of the traditional children’s text (“Papa veut que je raisonne…”), sung twice; melody in C.",
        "sources": [
          "https://fr.wikipedia.org/wiki/Ah_!_vous_dirai-je,_maman",
          "https://fr.wikisource.org/wiki/Ah_!_vous_dirai-je,_maman"
        ],
        "notes": "Anonymous text and tune, printed in the 18th century (the tune is attested from about 1761). Same tune as Twinkle, Twinkle. The exact year of the first print was not re-checked; any print before 1955 gives the same result.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "fr-mon-beau-sapin",
        "title": "Mon beau sapin",
        "language": "fr",
        "category": "christmas",
        "textAuthor": "Anonymous (traditional French adaptation of “O Tannenbaum”; the German text is by Ernst Anschütz, 1824, died 1861)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1900,
        "composer": "Anonymous (traditional German tune, 16th century; “Ach Tannenbaum”)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1799,
        "textSource": "https://fr.wikipedia.org/wiki/Mon_beau_sapin",
        "textVersion": "First stanza of the traditional French text (“Mon beau sapin, roi des forêts…”), in the key of the German O Tannenbaum already in this app.",
        "sources": [
          "https://fr.wikipedia.org/wiki/Mon_beau_sapin",
          "https://de.wikipedia.org/wiki/O_Tannenbaum"
        ],
        "notes": "DOUBTFUL point: the author and the first print of the French words were not found; the text is treated as anonymous and “first published not later than 1900” (it is in French school songbooks of the 19th century). Please confirm. The melody is the old German folk tune.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "de-alle-entchen",
        "title": "Alle meine Entchen",
        "language": "de",
        "category": "children",
        "textAuthor": "Anonymous (traditional children’s song)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1900,
        "composer": "Anonymous (traditional folk tune)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1900,
        "textSource": "https://de.wikisource.org/wiki/Alle_meine_Entchen",
        "textVersion": "Stanza 1 (Entchen), stanza 2 (Hühner) and stanza 1 again; traditional wording as usually sung.",
        "sources": [
          "https://de.wikipedia.org/wiki/Alle_meine_Entchen",
          "https://de.wikisource.org/wiki/Alle_meine_Entchen"
        ],
        "notes": "DOUBTFUL point: text and tune are anonymous; the earliest print was not re-checked here (the song is in German songbooks of the 19th century). Registered as “first published not later than 1900”. Please confirm.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "de-weihnachtsmann",
        "title": "Morgen kommt der Weihnachtsmann",
        "language": "de",
        "category": "christmas",
        "textAuthor": "August Heinrich Hoffmann von Fallersleben (1798–1874)",
        "textAuthorDeathYear": 1874,
        "textFirstPublished": 1835,
        "composer": "Anonymous (traditional French tune “Ah ! vous dirai-je, maman”, 18th century)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1774,
        "textSource": "https://de.wikisource.org/wiki/Morgen_kommt_der_Weihnachtsmann",
        "textVersion": "Stanza 1 of Hoffmann von Fallersleben’s poem (1835), sung twice; the tune is the one of Ah ! vous dirai-je, maman.",
        "sources": [
          "https://de.wikisource.org/wiki/Morgen_kommt_der_Weihnachtsmann",
          "https://de.wikipedia.org/wiki/Morgen_kommt_der_Weihnachtsmann"
        ],
        "notes": "Text 1835, Hoffmann died 1874. Only stanza 1 is used (the other stanzas were not checked against a source).",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "en-row-your-boat",
        "title": "Row, Row, Row Your Boat",
        "language": "en",
        "category": "children",
        "textAuthor": "Anonymous (traditional nursery rhyme; first printed 1852)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1852,
        "composer": "Anonymous (traditional; first printed 1852)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1852,
        "textSource": "https://en.wikipedia.org/wiki/Row,_Row,_Row_Your_Boat",
        "textVersion": "The one traditional stanza, sung three times.",
        "sources": [
          "https://en.wikipedia.org/wiki/Row,_Row,_Row_Your_Boat"
        ],
        "notes": "Wikipedia: earliest printing 1852 (Eliphalet Oram Lyte is named as the author or arranger of that printing; he died 1913, so the work is free either way). Registered as anonymous, first published 1852. The 6/8 triplets are written in simple quarter and eighth notes.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "en-london-bridge",
        "title": "London Bridge Is Falling Down",
        "language": "en",
        "category": "children",
        "textAuthor": "Anonymous (traditional nursery rhyme, printed 1744 and 1842)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1842,
        "composer": "Anonymous (traditional nursery tune)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1850,
        "textSource": "https://en.wikipedia.org/wiki/London_Bridge_Is_Falling_Down",
        "textVersion": "Four of the traditional verses (falling down; wood and clay; wash away; iron bars), as in Halliwell, Nursery Rhymes of England (1842).",
        "sources": [
          "https://en.wikipedia.org/wiki/London_Bridge_Is_Falling_Down"
        ],
        "notes": "DOUBTFUL point: the text is attested in the 18th century (Tommy Thumb’s Pretty Song Book, 1744) and in Halliwell 1842; the first print of this exact tune was not re-checked, so it is registered as “not later than 1850”. Please confirm.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      },
      {
        "id": "en-we-wish-you",
        "title": "We Wish You a Merry Christmas",
        "language": "en",
        "category": "christmas",
        "textAuthor": "Anonymous (traditional English carol, West Country)",
        "textAuthorDeathYear": "anonymous",
        "textFirstPublished": 1935,
        "composer": "Anonymous (traditional English carol tune)",
        "composerDeathYear": "anonymous",
        "melodyFirstPublished": 1935,
        "textSource": "https://en.wikipedia.org/wiki/We_Wish_You_a_Merry_Christmas",
        "textVersion": "Traditional stanzas “We wish you a merry Christmas”, “Now bring us some figgy pudding” and “We won’t go until we get some”; the “Good tidings” chorus is not used.",
        "sources": [
          "https://en.wikipedia.org/wiki/We_Wish_You_a_Merry_Christmas"
        ],
        "notes": "DOUBTFUL point: traditional West Country carol; the best-known printed form is the 1935 arrangement by Arthur Warrell (Bristol University Madrigal Society). Only the traditional words and tune are used (own arrangement), registered as anonymous, first published 1935. Please confirm the 1935 date and that the Warrell arrangement is not copied.",
        "audioSource": "generated",
        "audioLicence": "Generated on the robot by Bellatrix (WebAudio synthesis of the public-domain melody and chords); no recording used. Arrangement: Labland own work.",
        "verifiedOn": "2026-11-11",
        "verifiedBy": "Claude (research, to be confirmed by LabLand)"
      }
    ],
    "removed": [
      {
        "title": "Le Temps des cerises",
        "language": "fr",
        "reason": "Free (text Jean-Baptiste Clément, died 1903; music Antoine Renard, died 1872), but not added yet: the only text-based score found (Wikisource) has a garbled 6/8 rhythm, while the original is a 3/4 waltz. Add it once the melody is transcribed from Renard’s own score (IMSLP).",
        "sources": [
          "https://fr.wikisource.org/wiki/Le_Temps_des_cerises",
          "https://imslp.org/wiki/Le_temps_des_cerises_(Renard,_Antoine)"
        ]
      },
      {
        "title": "Alouette, gentille alouette",
        "language": "fr",
        "reason": "Free (anonymous, first printed 1879 in a McGill College songbook), but not added yet: no public-domain score of the verse melody was found in this pass (the Wikisource page of Jameson & Heacox 1922 has the words only). The cumulative verses also make a long song.",
        "sources": [
          "https://fr.wikisource.org/wiki/Alouette",
          "https://fr.wikipedia.org/wiki/Alouette_(chanson)"
        ]
      },
      {
        "title": "Il était un petit navire",
        "language": "fr",
        "reason": "Not checked in this pass: no old edition with a score was found quickly on Wikisource, and the verses vary a lot between editions.",
        "sources": []
      },
      {
        "title": "Les Compagnons de la Marjolaine",
        "language": "fr",
        "reason": "Not added in this pass (a long question-and-answer ronde). An old score exists: Weckerlin 1870, \"Qu’est-ce qui passe ici si tard ?\".",
        "sources": [
          "https://fr.wikisource.org/wiki/Compagnons_de_la_Marjolaine"
        ]
      },
      {
        "title": "Kommt ein Vogel geflogen",
        "language": "de",
        "reason": "Origin unclear: earliest known text is Karl von Holtei’s 1824 adaptation of older material, the 1807 Tyrolean stanzas have a different tune, and our sources give no documented first publication of today’s melody. Probably free, but not documented well enough for the register.",
        "sources": [
          "https://de.wikipedia.org/wiki/Kommt_ein_Vogel_geflogen"
        ]
      },
      {
        "title": "Muss i denn zum Städtele hinaus",
        "language": "de",
        "reason": "Not encoded yet (no verified melody source reached on 2026-11-09). Free: verse 1 traditional, verses 2–3 Heinrich Wagner (1783–1863, written 1824), melody arranged by Friedrich Silcher (1789–1860), published 1827. Not encoded tonight: no reliable text source for the melody was reachable (folktunefinder blocked); to be added later.",
        "status": "pending",
        "sources": [
          "https://de.wikipedia.org/wiki/Mu%C3%9F_i_denn",
          "https://de.wikisource.org/wiki/Allgemeines_Deutsches_Kommersbuch/Liedverzeichnis"
        ]
      },
      {
        "title": "Weißt du, wie viel Sternlein stehen",
        "language": "de",
        "reason": "Not encoded yet (no verified melody source reached on 2026-11-09). Free: text Wilhelm Hey (1789–1854), 1837; melody folk tune documented 1818 (Groos/Klein). Not encoded tonight: melody source seen only in garbled form; to be added later.",
        "status": "pending",
        "sources": [
          "https://de.wikipedia.org/wiki/Wei%C3%9Ft_du,_wie_viel_Sternlein_stehen"
        ]
      },
      {
        "title": "Danny Boy",
        "language": "en",
        "reason": "Licence OK but not included now. Frederic Weatherly wrote the words (1910, set to the Londonderry Air in 1913, Boosey & Co.) and died on 7 Sept 1929, so the text is free in the EU and UK (life + 70) and in the US (published 1913); the tune is traditional (Petrie, 1855). Not encoded because the Londonderry Air spans about an octave and a sixth, wider than the G3–D5 range used for older group voices, and a long rhythmically free melody that could not be checked note by note tonight. Can be added later in a lower key if LabLand wants it.",
        "sources": [
          "https://en.wikipedia.org/wiki/Danny_Boy",
          "https://en.wikipedia.org/wiki/Fred_Weatherly",
          "https://imslp.org/wiki/Danny_Boy_(Weatherly,_Frederic_Edward)"
        ]
      },
      {
        "title": "Greensleeves",
        "language": "en",
        "reason": "Text and tune are anonymous 16th century (registered 1580, printed in A Handefull of Pleasant Delites, 1584), so free; not included because the syllable underlay of the old text differs between editions and could not be checked against a public-domain score tonight. Deferred, not a licence problem.",
        "sources": [
          "https://en.wikipedia.org/wiki/Greensleeves"
        ]
      }
    ]
  } /* REGISTER-END */;

  /* ---------- the songs ---------- */
  var SONGS = /* SONGS-BEGIN */ [
    { id: "fr-clair-lune", lang: "fr", cat: "children", title: "Au clair de la lune", bpm: 100, meter: 4, pickup: 0,
      lines: [
        { s: "Au clair de la lu/ne,", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "mon a/mi Pier/rot,", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" },
        { s: "Prê/te-/moi ta plu/me", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "pour é/cri/re_un mot.", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" },
        { s: "Ma chan/del/le_est mor/te,", n: "D4 D4 D4 D4 A3:2 A3:2", c: "Dm:4 Am:4" },
        { s: "je n’ai plus de feu.", n: "D4 C4 B3 A3 G3:4", c: "G7:4 G:4" },
        { s: "Ou/vre-/moi ta por/te", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "pour l’a/mour de Dieu.", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" },
        { s: "Au clair de la lu/ne,", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "Pier/rot ré/pon/dit :", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" },
        { s: "Je n’ai pas de plu/me,", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "je suis dans mon lit.", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" },
        { s: "Va chez la voi/si/ne,", n: "D4 D4 D4 D4 A3:2 A3:2", c: "Dm:4 Am:4" },
        { s: "je crois qu’elle y est,", n: "D4 C4 B3 A3 G3:4", c: "G7:4 G:4" },
        { s: "Car dans sa cui/si/ne", n: "C4 C4 C4 D4 E4:2 D4:2", c: "C:6 G:2" },
        { s: "on bat le bri/quet.", n: "C4 E4 D4 D4 C4:4", c: "C:2 G7:2 C:4" }
      ] },
    { id: "fr-frere-jacques", lang: "fr", cat: "children", title: "Frère Jacques", bpm: 104, meter: 2, pickup: 0,
      lines: [
        { s: "Frè/re Jac/ques, Frè/re Jac/ques,", n: "F4 G4 A4 F4 F4 G4 A4 F4", c: "F:8" },
        { s: "Dor/mez-/vous ? Dor/mez-/vous ?", n: "A4 Bb4 C5:2 A4 Bb4 C5:2", c: "F:8" },
        { s: "Son/nez les ma/ti/nes, son/nez les ma/ti/nes,", n: "C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4 C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" },
        { s: "Dig’, din, don ! Dig’, din, don !", n: "F4 C4 F4 R:1 F4 C4 F4 R:1", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" },
        { s: "Frè/re Jac/ques, Frè/re Jac/ques,", n: "F4 G4 A4 F4 F4 G4 A4 F4", c: "F:8" },
        { s: "Dor/mez-/vous ? Dor/mez-/vous ?", n: "A4 Bb4 C5:2 A4 Bb4 C5:2", c: "F:8" },
        { s: "Son/nez les ma/ti/nes, son/nez les ma/ti/nes,", n: "C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4 C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" },
        { s: "Dig’, din, don ! Dig’, din, don !", n: "F4 C4 F4 R:1 F4 C4 F4 R:1", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" },
        { s: "Frè/re Jac/ques, Frè/re Jac/ques,", n: "F4 G4 A4 F4 F4 G4 A4 F4", c: "F:8" },
        { s: "Dor/mez-/vous ? Dor/mez-/vous ?", n: "A4 Bb4 C5:2 A4 Bb4 C5:2", c: "F:8" },
        { s: "Son/nez les ma/ti/nes, son/nez les ma/ti/nes,", n: "C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4 C5:0.5 D5:0.5 C5:0.5 Bb4:0.5 A4 F4", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" },
        { s: "Dig’, din, don ! Dig’, din, don !", n: "F4 C4 F4 R:1 F4 C4 F4 R:1", c: "F:1 C7:1 F:2 F:1 C7:1 F:2" }
      ] },
    { id: "fr-pont-avignon", lang: "fr", cat: "children", title: "Sur le pont d’Avignon", bpm: 100, meter: 2, pickup: 0,
      lines: [
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "G:2 D:2", ch: true },
        { s: "L’on y pas/se, l’on y dan/se,", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 F#4:0.75 G4:0.25 A4:0.5 D4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "Em:2 D:2", ch: true },
        { s: "L’on y dan/se tout en rond.", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 A4:0.5 F#4:0.5 G4:0.5 R:0.5", c: "G:2 D7:1 G:1", ch: true },
        { s: "Les mes/sieurs font comm’ ça,", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "G:2 C:1 G:1" },
        { s: "les da/mes font comm’ ça.", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "C:2 D7:1 G:1" },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "G:2 D:2", ch: true },
        { s: "L’on y pas/se, l’on y dan/se,", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 F#4:0.75 G4:0.25 A4:0.5 D4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "Em:2 D:2", ch: true },
        { s: "L’on y dan/se tout en rond.", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 A4:0.5 F#4:0.5 G4:0.5 R:0.5", c: "G:2 D7:1 G:1", ch: true },
        { s: "Les ab/bés font comm’ ça,", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "G:2 C:1 G:1" },
        { s: "les sol/dats font comm’ ça.", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "C:2 D7:1 G:1" },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "G:2 D:2", ch: true },
        { s: "L’on y pas/se, l’on y dan/se,", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 F#4:0.75 G4:0.25 A4:0.5 D4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "Em:2 D:2", ch: true },
        { s: "L’on y dan/se tout en rond.", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 A4:0.5 F#4:0.5 G4:0.5 R:0.5", c: "G:2 D7:1 G:1", ch: true },
        { s: "Les bu/veurs font comm’ ça,", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "G:2 C:1 G:1" },
        { s: "les ga/mins font comm’ ça.", n: "G4:0.75 G4:0.25 G4:0.5 G4:0.5 A4 G4:0.5 R:0.5", c: "C:2 D7:1 G:1" },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "G:2 D:2", ch: true },
        { s: "L’on y pas/se, l’on y dan/se,", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 F#4:0.75 G4:0.25 A4:0.5 D4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Sur le pont d’A/vi/gnon,", n: "G4:0.5 G4:0.5 G4 A4:0.5 A4:0.5 A4", c: "Em:2 D:2", ch: true },
        { s: "L’on y dan/se tout en rond.", n: "B4:0.75 C5:0.25 D5:0.5 G4:0.5 A4:0.5 F#4:0.5 G4:0.5 R:0.5", c: "G:2 D7:1 G:1", ch: true }
      ] },
    { id: "fr-planter-choux", lang: "fr", cat: "children", title: "Savez-vous planter les choux ?", bpm: 180, meter: 6, pickup: 3,
      lines: [
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12", ch: true },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3", ch: true },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3", ch: true },
        { s: "À la mo/de de chez nous ?", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3", ch: true },
        { s: "On les plan/te_a/vec la main,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12" },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3" },
        { s: "On les plan/te_a/vec la main,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3" },
        { s: "À la mo/de de chez nous.", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3" },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12", ch: true },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3", ch: true },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3", ch: true },
        { s: "À la mo/de de chez nous ?", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3", ch: true },
        { s: "On les plan/te_a/vec le pied,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12" },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3" },
        { s: "On les plan/te_a/vec le pied,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3" },
        { s: "À la mo/de de chez nous.", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3" },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12", ch: true },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3", ch: true },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3", ch: true },
        { s: "À la mo/de de chez nous ?", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3", ch: true },
        { s: "On les plan/te_a/vec le coud’,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12" },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3" },
        { s: "On les plan/te_a/vec le coud’,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3" },
        { s: "À la mo/de de chez nous.", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3" },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:12", ch: true },
        { s: "À la mo/de, à la mo/de,", n: "B3:2 C4 D4:2 D4 C4:2 D4 E4:2 C4", c: "G7:9 C:3", ch: true },
        { s: "Sa/vez-/vous plan/ter les choux,", n: "C4:2 E4 G4:2 C5 G4:2 E4 C4:3", c: "C:3 C7:6 F:3", ch: true },
        { s: "À la mo/de de chez nous ?", n: "B3:2 C4 D4:2 F4 E4:2 D4 C4:2 R:1", c: "G7:9 C:3", ch: true }
      ] },
    { id: "fr-cadet-rousselle", lang: "fr", cat: "children", title: "Cadet Rousselle", bpm: 180, meter: 6, pickup: 3,
      lines: [
        { s: "Ca/det Rous/selle a trois mai/sons,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "Ca/det Rous/selle a trois mai/sons,", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:3", c: "D7:9 G:3" },
        { s: "Qui n’ont ni pou/tres, ni che/vrons,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "Qui n’ont ni pou/tres, ni che/vrons :", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:2 R:1", c: "D:3 Em:3 A7:3 D:3" },
        { s: "C’est pour lo/ger les hi/ron/del/les ;", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D:3 D7:9" },
        { s: "Que di/rez-/vous d’Ca/det Rous/sel/le ?", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D7:12" },
        { s: "Ah ! Ah ! Ah ! mais, vrai/ment,", n: "G4:3 G4:3 G4 F#4 E4 D4:3", c: "G:3 C:3 Em:3 G:3", ch: true },
        { s: "Ca/det Rous/selle est bon en/fant !", n: "G4 F#4 G4 A4:2 A4 G4:2 F#4 G4:2 R:1", c: "Em:3 Am:3 D7:3 G:3", ch: true },
        { s: "Ca/det Rous/selle a trois ha/bits,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "Ca/det Rous/selle a trois ha/bits,", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:3", c: "D7:9 G:3" },
        { s: "Deux jau/nes, l’au/tre_en pa/pier gris,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "Deux jau/nes, l’au/tre_en pa/pier gris ;", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:2 R:1", c: "D:3 Em:3 A7:3 D:3" },
        { s: "Il met ce/lui-/là quand il gè/le,", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D:3 D7:9" },
        { s: "Ou quand il pleut, ou quand il grê/le :", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D7:12" },
        { s: "Ah ! Ah ! Ah ! mais, vrai/ment,", n: "G4:3 G4:3 G4 F#4 E4 D4:3", c: "G:3 C:3 Em:3 G:3", ch: true },
        { s: "Ca/det Rous/selle est bon en/fant !", n: "G4 F#4 G4 A4:2 A4 G4:2 F#4 G4:2 R:1", c: "Em:3 Am:3 D7:3 G:3", ch: true },
        { s: "Ca/det Rous/selle a trois gros chiens,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "Ca/det Rous/selle a trois gros chiens,", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:3", c: "D7:9 G:3" },
        { s: "L’un court au lièvr’, l’au/tre_au la/pin,", n: "D4 E4 F#4 G4:2 G4 G4:2 B4 G4:3", c: "D7:3 G:9" },
        { s: "L’un court au lièvr’, l’au/tre_au la/pin ;", n: "A4 A4 A4 A4:2 G4 F#4:2 E4 D4:2 R:1", c: "D:3 Em:3 A7:3 D:3" },
        { s: "L’_troi/sièm’ s’en/fuit quand on l’ap/pel/le,", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D:3 D7:9" },
        { s: "Comm’ le chien de Jean de Ni/vel/le :", n: "A4 A4 A4 A4:2 B4 C5:2 B4 B4:2 A4", c: "D7:12" },
        { s: "Ah ! Ah ! Ah ! mais, vrai/ment,", n: "G4:3 G4:3 G4 F#4 E4 D4:3", c: "G:3 C:3 Em:3 G:3", ch: true },
        { s: "Ca/det Rous/selle est bon en/fant !", n: "G4 F#4 G4 A4:2 A4 G4:2 F#4 G4:2 R:1", c: "Em:3 Am:3 D7:3 G:3", ch: true }
      ] },
    { id: "fr-claire-fontaine", lang: "fr", cat: "popular", title: "À la claire fontaine", bpm: 84, meter: 2, pickup: 0,
      lines: [
        { s: "À la clai/re fon/tai/ne", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:0.5", c: "F:4" },
        { s: "M’en al/lant pro/me/ner,", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4", c: "Dm:2 C7:1 F:1" },
        { s: "J’ai trou/vé l’eau si bel/le", n: "A4 A4:0.5 G4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:0.5", c: "F:1 C7:1 F:2" },
        { s: "Que je m’y suis bai/gné.", n: "C5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 G4", c: "F:3 C7:1" },
        { s: "Il_y a long/temps que je t’ai/me,", n: "C4 F4:0.5 A4:0.5 A4:0.5 G4:0.25 F4:0.25 A4:0.5 F4:0.5", c: "F:4", ch: true },
        { s: "Ja/mais je ne t’ou/blie/rai.", n: "A4 A4:0.5 G4:0.25 F4:0.25 A4:0.5 G4:0.5 F4", c: "Dm:1 Bb:1 C7:1 F:1", ch: true },
        { s: "Sous les feuil/les d’un chê/ne", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:0.5", c: "F:4" },
        { s: "Je me suis fait sé/cher ;", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4", c: "Dm:2 C7:1 F:1" },
        { s: "Sur la plus hau/te bran/che", n: "A4 A4:0.5 G4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:0.5", c: "F:1 C7:1 F:2" },
        { s: "Le ros/si/gnol chan/tait.", n: "C5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 G4", c: "F:3 C7:1" },
        { s: "Il_y a long/temps que je t’ai/me,", n: "C4 F4:0.5 A4:0.5 A4:0.5 G4:0.25 F4:0.25 A4:0.5 F4:0.5", c: "F:4", ch: true },
        { s: "Ja/mais je ne t’ou/blie/rai.", n: "A4 A4:0.5 G4:0.25 F4:0.25 A4:0.5 G4:0.5 F4", c: "Dm:1 Bb:1 C7:1 F:1", ch: true },
        { s: "Chan/te, ros/si/gnol, chan/te,", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:0.5", c: "F:4" },
        { s: "Toi qui as le cœur gai ;", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4", c: "Dm:2 C7:1 F:1" },
        { s: "Tu as le cœur à ri/re,", n: "A4 A4:0.5 G4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:0.5", c: "F:1 C7:1 F:2" },
        { s: "Moi je l’ai à pleu/rer.", n: "C5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 G4", c: "F:3 C7:1" },
        { s: "Il_y a long/temps que je t’ai/me,", n: "C4 F4:0.5 A4:0.5 A4:0.5 G4:0.25 F4:0.25 A4:0.5 F4:0.5", c: "F:4", ch: true },
        { s: "Ja/mais je ne t’ou/blie/rai.", n: "A4 A4:0.5 G4:0.25 F4:0.25 A4:0.5 G4:0.5 F4", c: "Dm:1 Bb:1 C7:1 F:1", ch: true },
        { s: "J’ai per/du ma maî/tres/se", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4:0.5 G4:0.5", c: "F:4" },
        { s: "Sans l’a/voir mé/ri/té,", n: "F4 F4:0.5 A4:0.5 A4:0.5 G4:0.5 A4", c: "Dm:2 C7:1 F:1" },
        { s: "Pour un bou/quet de ro/ses", n: "A4 A4:0.5 G4:0.5 F4:0.5 A4:0.5 C5:0.5 A4:0.5", c: "F:1 C7:1 F:2" },
        { s: "Que je lui re/fu/sai.", n: "C5 C5:0.5 A4:0.5 F4:0.5 A4:0.5 G4", c: "F:3 C7:1" },
        { s: "Il_y a long/temps que je t’ai/me,", n: "C4 F4:0.5 A4:0.5 A4:0.5 G4:0.25 F4:0.25 A4:0.5 F4:0.5", c: "F:4", ch: true },
        { s: "Ja/mais je ne t’ou/blie/rai.", n: "A4 A4:0.5 G4:0.25 F4:0.25 A4:0.5 G4:0.5 F4", c: "Dm:1 Bb:1 C7:1 F:1", ch: true }
      ] },
    { id: "fr-pres-de-ma-blonde", lang: "fr", cat: "popular", title: "Auprès de ma blonde", bpm: 180, meter: 6, pickup: 1,
      lines: [
        { s: "Au jar/din de mon pè/re", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "les lau/riers sont fleu/ris,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "Au jar/din de mon pè/re", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "les lau/riers sont fleu/ris,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "Tous les oi/seaux du mon/de", n: "C5 D5:2 D5 D5:2 A4 Bb4:3 Bb4:2", c: "F:1 Bb:3 Dm:3 Bb:5" },
        { s: "vien/nent s’y ra/fraî/chir.", n: "Bb4 D5:2 D5 Bb4:2 Bb4 A4:3", c: "Bb:4 C7:3 F:3" },
        { s: "Au/près de ma blon/de,", n: "F4:3 G4 A4 Bb4 G4:2 C5", c: "F:3 C7:6", ch: true },
        { s: "qu’il fait bon, fait bon, fait bon !", n: "G4:2 Bb4 A4:2 G4 F4:2 D4 C4:2", c: "C7:3 F:3 Dm:3 C7:2", ch: true },
        { s: "Au/près de ma blon/de,", n: "F4 G4 A4 Bb4 G4:2 C5", c: "F:1 C7:6", ch: true },
        { s: "qu’il fait bon dor/mir !", n: "G4:2 Bb4 A4:2 G4 F4:5", c: "C7:3 F:2 C7:1 F:5", ch: true },
        { s: "Tous les oi/seaux du mon/de", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "vien/nent s’y ra/fraî/chir,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "Tous les oi/seaux du mon/de", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "vien/nent s’y ra/fraî/chir,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "La cail/le,_la tour/te/rel/le", n: "C5 D5:2 D5 D5:2 A4 Bb4:3 Bb4:2", c: "F:1 Bb:3 Dm:3 Bb:5" },
        { s: "et ma jo/lie per/drix.", n: "Bb4 D5:2 D5 Bb4:2 Bb4 A4:3", c: "Bb:4 C7:3 F:3" },
        { s: "Au/près de ma blon/de,", n: "F4:3 G4 A4 Bb4 G4:2 C5", c: "F:3 C7:6", ch: true },
        { s: "qu’il fait bon, fait bon, fait bon !", n: "G4:2 Bb4 A4:2 G4 F4:2 D4 C4:2", c: "C7:3 F:3 Dm:3 C7:2", ch: true },
        { s: "Au/près de ma blon/de,", n: "F4 G4 A4 Bb4 G4:2 C5", c: "F:1 C7:6", ch: true },
        { s: "qu’il fait bon dor/mir !", n: "G4:2 Bb4 A4:2 G4 F4:5", c: "C7:3 F:2 C7:1 F:5", ch: true },
        { s: "La cail/le,_la tour/te/rel/le", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "et ma jo/lie per/drix,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "La cail/le,_la tour/te/rel/le", n: "F4 G4:2 Bb4 A4:2 G4 F4:3 F4:2", c: "C7:7 F:5" },
        { s: "et ma jo/lie per/drix,", n: "A4 C5:2 C5 D5:2 D5 C5:5", c: "F:4 Bb:3 F:5" },
        { s: "Et ma blan/che co/lom/be", n: "C5 D5:2 D5 D5:2 A4 Bb4:3 Bb4:2", c: "F:1 Bb:3 Dm:3 Bb:5" },
        { s: "qui chan/te jour et nuit.", n: "Bb4 D5:2 D5 Bb4:2 Bb4 A4:3", c: "Bb:4 C7:3 F:3" },
        { s: "Au/près de ma blon/de,", n: "F4:3 G4 A4 Bb4 G4:2 C5", c: "F:3 C7:6", ch: true },
        { s: "qu’il fait bon, fait bon, fait bon !", n: "G4:2 Bb4 A4:2 G4 F4:2 D4 C4:2", c: "C7:3 F:3 Dm:3 C7:2", ch: true },
        { s: "Au/près de ma blon/de,", n: "F4 G4 A4 Bb4 G4:2 C5", c: "F:1 C7:6", ch: true },
        { s: "qu’il fait bon dor/mir !", n: "G4:2 Bb4 A4:2 G4 F4:5", c: "C7:3 F:2 C7:1 F:5", ch: true }
      ] },
    { id: "fr-divin-enfant", lang: "fr", cat: "christmas", title: "Il est né, le divin Enfant", bpm: 96, meter: 2, pickup: 1,
      lines: [
        { s: "Il est né, le di/vin En/fant !", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Jou/ez, haut/bois, son/nez, mu/set/tes,", n: "G4:0.5 A4:0.5 B4:0.5 C5:0.25 B4:0.25 A4:0.5 G4:0.5 A4:0.5 A4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Il est né, le di/vin En/fant,", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Chan/tons tous son a/vè/ne/ment !", n: "G4:0.5 A4:0.5 B4:0.5 A4:0.25 B4:0.25 D5:0.5 D5:0.5 G4", c: "G:2 D7:1 G:1", ch: true },
        { s: "De/puis plus de qua/tre mille ans,", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Nous at/ten/di/ons sa pro/mes/se,", n: "B4:0.5 B4:0.25 C5:0.25 D5:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 D4:0.5", c: "G:1 D7:2 G:1" },
        { s: "De/puis plus de qua/tre mille ans,", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Nous at/ten/di/ons le beau temps.", n: "B4:0.5 D5:0.5 D5:0.5 D5:0.25 D5:0.25 C5:0.5 B4:0.5 A4", c: "G:2 D7:2" },
        { s: "Il est né, le di/vin En/fant !", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Jou/ez, haut/bois, son/nez, mu/set/tes,", n: "G4:0.5 A4:0.5 B4:0.5 C5:0.25 B4:0.25 A4:0.5 G4:0.5 A4:0.5 A4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Il est né, le di/vin En/fant,", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Chan/tons tous son a/vè/ne/ment !", n: "G4:0.5 A4:0.5 B4:0.5 A4:0.25 B4:0.25 D5:0.5 D5:0.5 G4", c: "G:2 D7:1 G:1", ch: true },
        { s: "Oh ! qu’il est beau, qu’il est char/mant !", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Oh ! que ses grâ/ces sont par/fai/tes !", n: "B4:0.5 B4:0.25 C5:0.25 D5:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 D4:0.5", c: "G:1 D7:2 G:1" },
        { s: "Oh ! qu’il est beau, qu’il est char/mant !", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Qu’il est doux ce di/vin En/fant !", n: "B4:0.5 D5:0.5 D5:0.5 D5:0.25 D5:0.25 C5:0.5 B4:0.5 A4", c: "G:2 D7:2" },
        { s: "Il est né, le di/vin En/fant !", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Jou/ez, haut/bois, son/nez, mu/set/tes,", n: "G4:0.5 A4:0.5 B4:0.5 C5:0.25 B4:0.25 A4:0.5 G4:0.5 A4:0.5 A4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Il est né, le di/vin En/fant,", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Chan/tons tous son a/vè/ne/ment !", n: "G4:0.5 A4:0.5 B4:0.5 A4:0.25 B4:0.25 D5:0.5 D5:0.5 G4", c: "G:2 D7:1 G:1", ch: true },
        { s: "U/ne_é/ta/ble_est son lo/ge/ment,", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Un peu de pail/le_est sa cou/chet/te,", n: "B4:0.5 B4:0.25 C5:0.25 D5:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 D4:0.5", c: "G:1 D7:2 G:1" },
        { s: "U/ne_é/ta/ble_est son lo/ge/ment,", n: "B4:0.5 B4:0.25 B4:0.25 D5:0.5 D5:0.5 B4:0.5 B4:0.5 D5", c: "G:4" },
        { s: "Pour un Dieu quel a/bais/se/ment !", n: "B4:0.5 D5:0.5 D5:0.5 D5:0.25 D5:0.25 C5:0.5 B4:0.5 A4", c: "G:2 D7:2" },
        { s: "Il est né, le di/vin En/fant !", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Jou/ez, haut/bois, son/nez, mu/set/tes,", n: "G4:0.5 A4:0.5 B4:0.5 C5:0.25 B4:0.25 A4:0.5 G4:0.5 A4:0.5 A4:0.5", c: "G:2 D7:2", ch: true },
        { s: "Il est né, le di/vin En/fant,", n: "D4:0.5 G4:0.5 G4:0.5 B4:0.25 G4:0.25 D4:0.5 G4:0.5 G4", c: "G:4", ch: true },
        { s: "Chan/tons tous son a/vè/ne/ment !", n: "G4:0.5 A4:0.5 B4:0.5 A4:0.25 B4:0.25 D5:0.5 D5:0.5 G4", c: "G:2 D7:1 G:1", ch: true }
      ] },
    { id: "de-alle-voegel", lang: "de", cat: "children", title: "Alle Vögel sind schon da", bpm: 108, meter: 4, pickup: 0,
      lines: [
        { s: "Al/le Vö/gel sind schon da,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "al/le Vö/gel, al/le!", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" },
        { s: "Welch ein Sin/gen, Mu/si/ziern,", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "Pfei/fen, Zwit/schern, Ti/ri/liern!", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "Früh/ling will nun ein/mar/schiern,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "kommt mit Sang und Schal/le.", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" },
        { s: "Wie sie al/le lus/tig sind,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "flink und froh sich re/gen!", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" },
        { s: "Am/sel, Dros/sel, Fink und Star", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "und die gan/ze Vo/gel/schar", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "wün/schen dir ein fro/hes Jahr,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "lau/ter Heil und Se/gen.", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" },
        { s: "Was sie uns ver/kün/den nun,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "neh/men wir zu Her/zen:", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" },
        { s: "Wir auch wol/len lus/tig sein,", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "lus/tig wie die Vö/ge/lein,", n: "G4 G4 F4 F4 E4 G4:0.5+E4:0.5 D4:2", c: "C:2 F:2 C:2 G7:2" },
        { s: "hier und dort, feld/aus, feld/ein,", n: "C4:1.5 E4:0.5 G4 C5 A4 C5:0.5+A4:0.5 G4:2", c: "C:4 F:2 C:2" },
        { s: "sin/gen, sprin/gen, scher/zen.", n: "F4:1.5 G4:0.5 E4 C4 D4:2 C4:2", c: "G7:2 C:2 G7:2 C:2" }
      ] },
    { id: "de-haenschen-klein", lang: "de", cat: "children", title: "Hänschen klein", bpm: 116, meter: 4, pickup: 0,
      lines: [
        { s: "Häns/chen klein ging al/lein", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "in die wei/te Welt hi/nein.", n: "D4 E4 F#4 G4 A4 A4 A4:2", c: "D:8" },
        { s: "Stock und Hut steht ihm gut,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "ist gar wohl/ge/mut.", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" },
        { s: "A/ber Mut/ter wei/net sehr,", n: "E4 E4 E4 E4 E4 F#4 G4:2", c: "A7:8" },
        { s: "hat ja nun kein Häns/chen mehr!", n: "F#4 F#4 F#4 F#4 F#4 G4 A4:2", c: "D:8" },
        { s: "„Wünsch dir Glück!“, sagt ihr Blick,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "„kehr nur bald zu/rück!“", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" },
        { s: "Sie/ben Jahr trüb und klar", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "Häns/chen in der Frem/de war.", n: "D4 E4 F#4 G4 A4 A4 A4:2", c: "D:8" },
        { s: "Da be/sinnt sich das Kind,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "eilt nach Haus ge/schwind.", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" },
        { s: "Doch nun ist’s kein Häns/chen mehr,", n: "E4 E4 E4 E4 E4 F#4 G4:2", c: "A7:8" },
        { s: "nein, ein gro/ßer Hans ist er.", n: "F#4 F#4 F#4 F#4 F#4 G4 A4:2", c: "D:8" },
        { s: "Braun ge/brannt Stirn und Hand,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "wird er wohl er/kannt?", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" },
        { s: "Eins, zwei, drei gehn vor/bei,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "wis/sen nicht, wer das wohl sei.", n: "D4 E4 F#4 G4 A4 A4 A4:2", c: "D:8" },
        { s: "Schwes/ter spricht: „Welch Ge/sicht?“,", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "kennt den Bru/der nicht.", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" },
        { s: "Kommt da/her die Mut/ter sein,", n: "E4 E4 E4 E4 E4 F#4 G4:2", c: "A7:8" },
        { s: "schaut ihm kaum ins Aug’ hi/nein,", n: "F#4 F#4 F#4 F#4 F#4 G4 A4:2", c: "D:8" },
        { s: "ruft sie schon: „Hans, mein Sohn!", n: "A4 F#4 F#4:2 G4 E4 E4:2", c: "D:4 A7:4" },
        { s: "Grüß dich Gott, mein Sohn!“", n: "D4 F#4 A4 A4 D4:4", c: "D:2 A7:2 D:4" }
      ] },
    { id: "de-mond-aufgegangen", lang: "de", cat: "popular", title: "Der Mond ist aufgegangen", bpm: 84, meter: 4, pickup: 1,
      lines: [
        { s: "Der Mond ist auf/ge/gan/gen,", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "die gold/nen Stern/lein pran/gen", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "am Him/mel hell und klar.", n: "G4 G4 G4 Ab4 G4 F4:3", c: "Eb:3 Bb7:1 Eb:1 Bb:3" },
        { s: "Der Wald steht schwarz und schwei/get,", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "und aus den Wie/sen stei/get", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "der wei/ße Ne/bel wun/der/bar.", n: "G4 G4 G4 Ab4 G4 F4 F4 Eb4", c: "Eb:3 Bb7:1 Eb:1 Bb7:2 Eb:1" },
        { s: "Wie ist die Welt so stil/le", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "und in der Dämm/rung Hül/le", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "so trau/lich und so hold!", n: "G4 G4 G4 Ab4 G4 F4:3", c: "Eb:3 Bb7:1 Eb:1 Bb:3" },
        { s: "Als ei/ne stil/le Kam/mer,", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "wo ihr des Ta/ges Jam/mer", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "ver/schla/fen und ver/ges/sen sollt.", n: "G4 G4 G4 Ab4 G4 F4 F4 Eb4", c: "Eb:3 Bb7:1 Eb:1 Bb7:2 Eb:1" },
        { s: "Seht ihr den Mond dort ste/hen?", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "Er ist nur halb zu se/hen", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "und ist doch rund und schön.", n: "G4 G4 G4 Ab4 G4 F4:3", c: "Eb:3 Bb7:1 Eb:1 Bb:3" },
        { s: "So sind wohl man/che Sa/chen,", n: "Eb4 F4 Eb4 Ab4 G4 F4:2 Eb4", c: "Eb:1 Bb7:2 Ab:1 Eb:1 Bb:2 Eb:1" },
        { s: "die wir ge/trost be/la/chen,", n: "G4 G4 G4 C5 Bb4 Ab4:2 G4", c: "Eb:3 Ab:1 Eb:1 Bb7:2 Eb:1" },
        { s: "weil uns/re Au/gen sie nicht sehn.", n: "G4 G4 G4 Ab4 G4 F4 F4 Eb4:4", c: "Eb:3 Bb7:1 Eb:1 Bb7:2 Eb:4" }
      ] },
    { id: "de-gedanken-frei", lang: "de", cat: "popular", title: "Die Gedanken sind frei", bpm: 126, meter: 3, pickup: 1,
      lines: [
        { s: "Die Ge/dan/ken sind frei,", n: "F4:0.5 F4:0.5 Bb4 Bb4 D5:0.5+Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "wer kann sie er/ra/ten?", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "Sie flie/hen vor/bei", n: "F4 Bb4 Bb4 D5:0.5+Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "wie nächt/li/che Schat/ten.", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "Kein Mensch kann sie wis/sen,", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "kein Jä/ger er/schie/ßen", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "mit Pul/ver und Blei:", n: "Bb4 G4 G4 Bb4:0.5+G4:0.5 F4:2", c: "Bb:1 Eb:3 Bb:2" },
        { s: "Die Ge/dan/ken sind frei!", n: "Bb4:0.5 D5:0.5 D5:0.5+C5:0.5 Bb4 A4 Bb4:2", c: "Bb:1 F7:3 Bb:2" },
        { s: "Ich den/ke, was ich will", n: "F4 Bb4 Bb4 D5:0.5 Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "und was mich be/glü/cket,", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "doch al/les in der Still’", n: "F4 Bb4 Bb4 D5:0.5 Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "und wie es sich schi/cket.", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "Mein Wunsch und Be/geh/ren", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "kann nie/mand ver/weh/ren,", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "es blei/bet da/bei:", n: "Bb4 G4 G4 Bb4:0.5+G4:0.5 F4:2", c: "Bb:1 Eb:3 Bb:2" },
        { s: "Die Ge/dan/ken sind frei!", n: "Bb4:0.5 D5:0.5 D5:0.5+C5:0.5 Bb4 A4 Bb4:2", c: "Bb:1 F7:3 Bb:2" },
        { s: "Und sperrt man mich ein", n: "F4 Bb4 Bb4 D5:0.5+Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "im fins/te/ren Ker/ker,", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "das al/les sind rein", n: "F4 Bb4 Bb4 D5:0.5+Bb4:0.5 F4:2", c: "Bb:6" },
        { s: "ver/geb/li/che Wer/ke;", n: "F4 Eb4 C4 F4 D4 Bb3", c: "Bb:1 F7:3 Bb:2" },
        { s: "denn mei/ne Ge/dan/ken", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "zer/rei/ßen die Schran/ken", n: "Bb4 A4 C5 A4 Bb4 D5", c: "Bb:1 F7:3 Bb:2" },
        { s: "und Mau/ern ent/zwei:", n: "Bb4 G4 G4 Bb4:0.5+G4:0.5 F4:2", c: "Bb:1 Eb:3 Bb:2" },
        { s: "Die Ge/dan/ken sind frei!", n: "Bb4:0.5 D5:0.5 D5:0.5+C5:0.5 Bb4 A4 Bb4:3", c: "Bb:1 F7:3 Bb:3" }
      ] },
    { id: "de-o-tannenbaum", lang: "de", cat: "christmas", title: "O Tannenbaum", bpm: 88, meter: 3, pickup: 1,
      lines: [
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6.5" },
        { s: "wie treu sind dei/ne Blät/ter!", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4 R:0.5", c: "Eb:0.5 Bb7:4 Eb:1.5" },
        { s: "Du grünst nicht nur zur Som/mer/zeit,", n: "Bb4:0.5 Bb4:0.5 G4:0.5 C5:1.5 Bb4:0.5 Bb4:0.5 Ab4:0.5 Ab4:1.5", c: "Eb:3.5 Bb7:2.5" },
        { s: "nein, auch im Win/ter, wenn es schneit.", n: "Ab4:0.5 Ab4:0.5 F4:0.5 Bb4:1.5 Ab4:0.5 Ab4:0.5 G4:0.5 G4:1.5", c: "Bb7:3.5 Eb:2.5" },
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3:0.5 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6" },
        { s: "wie treu sind dei/ne Blät/ter!", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4", c: "Eb:0.5 Bb7:4 Eb:1" },
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6.5" },
        { s: "du kannst mir sehr ge/fal/len!", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4 R:0.5", c: "Eb:0.5 Bb7:4 Eb:1.5" },
        { s: "Wie oft hat nicht zur Weih/nachts/zeit", n: "Bb4:0.5 Bb4:0.5 G4:0.5 C5:1.5 Bb4:0.5 Bb4:0.5 Ab4:0.5 Ab4:1.5", c: "Eb:3.5 Bb7:2.5" },
        { s: "ein Baum von dir mich hoch er/freut!", n: "Ab4:0.5 Ab4:0.5 F4:0.5 Bb4:1.5 Ab4:0.5 Ab4:0.5 G4:0.5 G4:1.5", c: "Bb7:3.5 Eb:2.5" },
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3:0.5 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6" },
        { s: "du kannst mir sehr ge/fal/len!", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4", c: "Eb:0.5 Bb7:4 Eb:1" },
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6.5" },
        { s: "dein Kleid will mich was leh/ren:", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4 R:0.5", c: "Eb:0.5 Bb7:4 Eb:1.5" },
        { s: "Die Hoff/nung und Be/stän/dig/keit", n: "Bb4:0.5 Bb4:0.5 G4:0.5 C5:1.5 Bb4:0.5 Bb4:0.5 Ab4:0.5 Ab4:1.5", c: "Eb:3.5 Bb7:2.5" },
        { s: "gibt Trost und Kraft zu je/der Zeit.", n: "Ab4:0.5 Ab4:0.5 F4:0.5 Bb4:1.5 Ab4:0.5 Ab4:0.5 G4:0.5 G4:1.5", c: "Bb7:3.5 Eb:2.5" },
        { s: "O Tan/nen/baum, o Tan/nen/baum,", n: "Bb3:0.5 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6" },
        { s: "dein Kleid will mich was leh/ren!", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4:3", c: "Eb:0.5 Bb7:4 Eb:3" }
      ] },
    { id: "de-stille-nacht", lang: "de", cat: "christmas", title: "Stille Nacht, heilige Nacht", bpm: 84, meter: 3, pickup: 0,
      lines: [
        { s: "Stil/le Nacht, hei/li/ge Nacht!", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4 C#4:3", c: "A:12" },
        { s: "Al/les schläft, ein/sam wacht", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "nur das trau/te hoch/hei/li/ge Paar.", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "Hol/der Kna/be im lo/cki/gen Haar,", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "schlaf in himm/li/scher Ruh!", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:2 R:1", c: "E7:6 A:6" },
        { s: "Schlaf in himm/li/scher Ruh!", n: "A4:1.5 E4:0.5 C#4 E4:1.5 D4:0.5 B3:1+A3:5 R:1", c: "A:3 E7:3 A:6" },
        { s: "Stil/le Nacht, hei/li/ge Nacht!", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4 C#4:3", c: "A:12" },
        { s: "Hir/ten erst kund/ge/macht", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "durch der En/gel Hal/le/lu/ja", n: "F#4:2 F#4 A4:1.5+G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "tönt es laut von fern und nah:", n: "F#4:2 F#4 A4:1.5+G#4:0.5 F#4 E4:1.5+F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "Christ, der Ret/ter, ist da!", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:2 R:1", c: "E7:6 A:6" },
        { s: "Christ, der Ret/ter, ist da!", n: "A4:1.5 E4:0.5 C#4 E4:1.5 D4:0.5 B3:1+A3:5 R:1", c: "A:3 E7:3 A:6" },
        { s: "Stil/le Nacht, hei/li/ge Nacht!", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4 C#4:3", c: "A:12" },
        { s: "Got/tes Sohn, o wie lacht", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "Lieb’ aus dei/nem gött/li/chen Mund,", n: "F#4:2 F#4 A4:1.5+G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "da uns schlägt die ret/ten/de Stund’,", n: "F#4:2 F#4 A4:1.5+G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "Christ, in dei/ner Ge/burt!", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:2 R:1", c: "E7:6 A:6" },
        { s: "Christ, in dei/ner Ge/burt!", n: "A4:1.5 E4:0.5 C#4 E4:1.5 D4:0.5 B3:1+A3:5 R:1", c: "A:3 E7:3 A:6" }
      ] },
    { id: "de-aennchen-tharau", lang: "de", cat: "popular", title: "Ännchen von Tharau", bpm: 100, meter: 3, pickup: 0,
      lines: [
        { s: "Änn/chen von Tha/rau ist’s, die mir ge/fällt,", n: "D4:1.5 E4:0.5 D4 D4 G4 G4 A4:1.5 B4:0.5 A4 G4:2 R:1", c: "G:6 D7:3 G:3" },
        { s: "sie ist mein Le/ben, mein Gut und mein Geld.", n: "F#4 F#4 F#4 A4:1.5 G4:0.5 F#4 E4:1.5 F#4:0.5 E4 D4:2 R:1", c: "D:3 D7:3 A7:3 D:3" },
        { s: "Änn/chen von Tha/rau hat wie/der ihr Herz", n: "D4:1.5 D4:0.5 E4 F#4 D4 E4 F#4 F#4 G4 A4:2 R:1", c: "G:3 D7:5 G:1 D:3" },
        { s: "auf mich ge/rich/tet in Lieb’ und in Schmerz.", n: "G4 A4 B4 C5:1.5 B4:0.5 A4 G4 A4 F#4 G4:2 R:1", c: "G:3 C:2 D7:1 G:1 D7:2 G:3" },
        { s: "Änn/chen von Tha/rau, mein Reich/tum, mein Gut,", n: "D4:1.5 D4:0.5 E4 F#4 D4 E4 F#4 F#4 G4 A4:2 R:1", c: "G:3 D7:5 G:1 D:3" },
        { s: "du mei/ne See/le, mein Fleisch und mein Blut!", n: "G4 A4 B4 C5:1.5 B4:0.5 A4 G4 A4 F#4 G4:2 R:1", c: "G:3 C:2 D7:1 G:1 D7:2 G:3" },
        { s: "Käm’ al/les Wet/ter gleich auf uns zu schlahn,", n: "D4:1.5 E4:0.5 D4 D4 G4 G4 A4:1.5 B4:0.5 A4 G4:2 R:1", c: "G:6 D7:3 G:3" },
        { s: "wir sind ge/sinnt, bei/ei/nan/der zu stahn.", n: "F#4 F#4 F#4 A4:1.5 G4:0.5 F#4 E4:1.5 F#4:0.5 E4 D4:2 R:1", c: "D:3 D7:3 A7:3 D:3" },
        { s: "Krank/heit, Ver/fol/gung, Be/trüb/nis und Pein", n: "D4:1.5 D4:0.5 E4 F#4 D4 E4 F#4 F#4 G4 A4:2 R:1", c: "G:3 D7:5 G:1 D:3" },
        { s: "soll uns/rer Lie/be Ver/kno/ti/gung sein.", n: "G4 A4 B4 C5:1.5 B4:0.5 A4 G4 A4 F#4 G4:2 R:1", c: "G:3 C:2 D7:1 G:1 D7:2 G:3" },
        { s: "Änn/chen von Tha/rau, mein Licht, mei/ne Sonn’,", n: "D4:1.5 D4:0.5 E4 F#4 D4 E4 F#4 F#4 G4 A4:2 R:1", c: "G:3 D7:5 G:1 D:3" },
        { s: "mein Le/ben schließ’ ich um dei/nes he/rum.", n: "G4 A4 B4 C5:1.5 B4:0.5 A4 G4 A4 F#4 G4:2 R:1", c: "G:3 C:2 D7:1 G:1 D7:2 G:3" }
      ] },
    { id: "en-amazing-grace", lang: "en", cat: "popular", title: "Amazing Grace", bpm: 84, meter: 3, pickup: 1,
      lines: [
        { s: "A/ma/zing grace, how sweet the sound", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "F:4 F7:3 Bb:3 F:2" },
        { s: "That saved a wretch like me!", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 C5:5", c: "F:4 Dm:3 C:3 C7:2" },
        { s: "I once was lost, but now am found,", n: "A4 C5:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "C7:1 F:3 F7:3 Bb:3 F:2" },
        { s: "Was blind, but now I see.", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:5", c: "F:4 C7:3 F:5" },
        { s: "’Twas grace that taught my heart to fear,", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "F:4 F7:3 Bb:3 F:2" },
        { s: "And grace my fears re/lieved;", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 C5:5", c: "F:4 Dm:3 C:3 C7:2" },
        { s: "How pre/cious did that grace ap/pear", n: "A4 C5:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "C7:1 F:3 F7:3 Bb:3 F:2" },
        { s: "The hour I first be/lieved!", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:5", c: "F:4 C7:3 F:5" },
        { s: "Through ma/ny dan/gers, toils and snares", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "F:4 F7:3 Bb:3 F:2" },
        { s: "I have al/rea/dy come;", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 C5:5", c: "F:4 Dm:3 C:3 C7:2" },
        { s: "’Tis grace hath brought me safe thus far,", n: "A4 C5:2 A4:0.5+F4:0.5 A4:2 G4 F4:2 D4 C4:2", c: "C7:1 F:3 F7:3 Bb:3 F:2" },
        { s: "And grace will lead me home.", n: "C4 F4:2 A4:0.5+F4:0.5 A4:2 G4 F4:5", c: "F:4 C7:3 F:5" }
      ] },
    { id: "en-silent-night", lang: "en", cat: "christmas", title: "Silent Night", bpm: 84, meter: 3, pickup: 0,
      lines: [
        { s: "Si/lent night, ho/ly night,", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4+C#4:3", c: "A:12" },
        { s: "All is calm, all is bright,", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "Round yon Vir/gin, Mo/ther and Child.", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4+C#4:3", c: "D:6 A:6" },
        { s: "Ho/ly In/fant so ten/der and mild,", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "Sleep in hea/ven/ly peace,", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:3", c: "E7:6 A:6" },
        { s: "Sleep in hea/ven/ly peace.", n: "A4 E4 C#4 E4:1.5 D4:0.5 B3+A3:6", c: "A:3 E7:3 A:6" },
        { s: "Si/lent night, ho/ly night,", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4+C#4:3", c: "A:12" },
        { s: "Shep/herds quake at the sight;", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "Glo/ries stream from hea/ven a/far,", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4+C#4:3", c: "D:6 A:6" },
        { s: "Hea/ven/ly hosts sing Al/le/lu/ia!", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4 C#4:3", c: "D:6 A:6" },
        { s: "Christ the Sa/viour is born!", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:3", c: "E7:6 A:6" },
        { s: "Christ the Sa/viour is born!", n: "A4 E4 C#4 E4:1.5 D4:0.5 B3+A3:6", c: "A:3 E7:3 A:6" },
        { s: "Si/lent night, ho/ly night,", n: "E4:1.5 F#4:0.5 E4+C#4:3 E4:1.5 F#4:0.5 E4+C#4:3", c: "A:12" },
        { s: "Son of God, love’s pure light", n: "B4:2 B4 G#4:3 A4:2 A4 E4:3", c: "E7:6 A:6" },
        { s: "Ra/diant beams from Thy ho/ly face", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4+C#4:3", c: "D:6 A:6" },
        { s: "With the dawn of re/deem/ing grace,", n: "F#4:2 F#4 A4:1.5 G#4:0.5 F#4 E4:1.5 F#4:0.5 E4+C#4:3", c: "D:6 A:6" },
        { s: "Je/sus, Lord, at Thy birth,", n: "B4:2 B4 D5:1.5 B4:0.5 G#4 A4:3+C#5:3", c: "E7:6 A:6" },
        { s: "Je/sus, Lord, at Thy birth.", n: "A4 E4 C#4 E4:1.5 D4:0.5 B3+A3:6", c: "A:3 E7:3 A:6" }
      ] },
    { id: "en-jingle-bells", lang: "en", cat: "christmas", title: "Jingle Bells", bpm: 116, meter: 4, pickup: 0,
      lines: [
        { s: "Dash/ing through the snow,", n: "C4 A4 G4 F4 C4:3", c: "F:7" },
        { s: "in a one-/horse o/pen sleigh,", n: "C4:0.5 C4:0.5 C4 A4 G4 F4 D4:4", c: "F:5 Bb:4" },
        { s: "o’er the fields we go,", n: "D4 Bb4 A4 G4 E4:4", c: "Gm:4 C:4" },
        { s: "laugh/ing all the way.", n: "C5 C5 Bb4 G4 A4:4", c: "C7:4 F:4" },
        { s: "Bells on bob/tail ring,", n: "C4 A4 G4 F4 C4:4", c: "F:8" },
        { s: "mak/ing spir/its bright.", n: "C4 A4 G4 F4 D4:3", c: "F:2 F7:2 Bb:3" },
        { s: "What fun it is to ride and sing", n: "D4 D4 Bb4 A4 G4 C5 C5 C5:1.5", c: "Bb:1 Gm:4 C:3.5" },
        { s: "a sleigh/ing song to/night!", n: "C5:0.5 D5 C5 Bb4 G4 F4:4", c: "C:0.5 C7:4 F:4" },
        { s: "Jin/gle bells, jin/gle bells,", n: "A4 A4 A4:2 A4 A4 A4:2", c: "F:8", ch: true },
        { s: "jin/gle all the way!", n: "A4 C5 F4:1.5 G4:0.5 A4:4", c: "Dm:2 C:2 F:2 F7:2", ch: true },
        { s: "Oh, what fun it is to ride", n: "Bb4 Bb4 Bb4:1.5 Bb4:0.5 Bb4 A4 A4", c: "Bb:4 F:3", ch: true },
        { s: "in a one-/horse o/pen sleigh!", n: "A4:0.5 A4:0.5 A4 G4 G4 A4 G4:2 R:2", c: "F:1 G7:4 C7:4", ch: true },
        { s: "Jin/gle bells, jin/gle bells,", n: "A4 A4 A4:2 A4 A4 A4:2", c: "F:8", ch: true },
        { s: "jin/gle all the way!", n: "A4 C5 F4:1.5 G4:0.5 A4:4", c: "Dm:2 C7:2 F:2 F7:2", ch: true },
        { s: "Oh, what fun it is to ride", n: "Bb4 Bb4 Bb4:1.5 Bb4:0.5 Bb4 A4 A4", c: "Bb:4 F:3", ch: true },
        { s: "in a one-/horse o/pen sleigh!", n: "A4:0.5 A4:0.5 C5 C5 Bb4 G4 F4:2 R:2", c: "F:1 C7:4 F:4", ch: true },
        { s: "Jin/gle bells, jin/gle bells,", n: "A4 A4 A4:2 A4 A4 A4:2", c: "F:8", ch: true },
        { s: "jin/gle all the way!", n: "A4 C5 F4:1.5 G4:0.5 A4:4", c: "Dm:2 C:2 F:2 F7:2", ch: true },
        { s: "Oh, what fun it is to ride", n: "Bb4 Bb4 Bb4:1.5 Bb4:0.5 Bb4 A4 A4", c: "Bb:4 F:3", ch: true },
        { s: "in a one-/horse o/pen sleigh!", n: "A4:0.5 A4:0.5 A4 G4 G4 A4 G4:2 R:2", c: "F:1 G7:4 C7:4", ch: true },
        { s: "Jin/gle bells, jin/gle bells,", n: "A4 A4 A4:2 A4 A4 A4:2", c: "F:8", ch: true },
        { s: "jin/gle all the way!", n: "A4 C5 F4:1.5 G4:0.5 A4:4", c: "Dm:2 C7:2 F:2 F7:2", ch: true },
        { s: "Oh, what fun it is to ride", n: "Bb4 Bb4 Bb4:1.5 Bb4:0.5 Bb4 A4 A4", c: "Bb:4 F:3", ch: true },
        { s: "in a one-/horse o/pen sleigh!", n: "A4:0.5 A4:0.5 C5 C5 Bb4 G4 F4:4", c: "F:1 C7:4 F:4", ch: true }
      ] },
    { id: "en-auld-lang-syne", lang: "en", cat: "popular", title: "Auld Lang Syne", bpm: 88, meter: 4, pickup: 1,
      lines: [
        { s: "Should auld ac/quain/tance be for/got,", n: "A3 D4:1.5 D4:0.5 D4 F#4 E4:1.5 D4:0.5 E4", c: "A:1 D:4 A:3" },
        { s: "and ne/ver brought to mind?", n: "F#4 D4:1.5 D4:0.5 F#4 A4 B4:3", c: "A:1 D:4 G:3" },
        { s: "Should auld ac/quain/tance be for/got,", n: "B4 A4:1.5 F#4:0.5 F#4 D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3" },
        { s: "and days o’ lang syne?", n: "F#4 D4:1.5 B3:0.5 B3+A3 D4:3", c: "A:1 G:4 D:3" },
        { s: "For auld lang syne, my dear,", n: "B4 A4:1.5+F#4:0.5 F#4+D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3", ch: true },
        { s: "for auld lang syne,", n: "B4 A4:1.5+F#4:0.5 F#4+A4 B4:3", c: "A:1 D:4 G:3", ch: true },
        { s: "we’ll tak a cup o’ kind/ness yet,", n: "D5 A4:1.5 F#4:0.5 F#4 D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3", ch: true },
        { s: "for auld lang syne.", n: "F#4 D4:1.5+B3:0.5 B3+A3 D4:3", c: "A:1 G:4 D:3", ch: true },
        { s: "And there’s a hand, my trus/ty fiere!", n: "A3 D4:1.5 D4:0.5 D4 F#4 E4:1.5 D4:0.5 E4", c: "A:1 D:4 A:3" },
        { s: "and gie’s a hand o’ thine!", n: "F#4 D4:1.5 D4:0.5 F#4 A4 B4:3", c: "A:1 D:4 G:3" },
        { s: "And we’ll tak a right gude-/wil/lie waught,", n: "B4:0.5 B4:0.5 A4:1.5 F#4:0.5 F#4 D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3" },
        { s: "for auld lang syne.", n: "F#4 D4:1.5+B3:0.5 B3+A3 D4:3", c: "A:1 G:4 D:3" },
        { s: "For auld lang syne, my dear,", n: "B4 A4:1.5+F#4:0.5 F#4+D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3", ch: true },
        { s: "for auld lang syne,", n: "B4 A4:1.5+F#4:0.5 F#4+A4 B4:3", c: "A:1 D:4 G:3", ch: true },
        { s: "we’ll tak a cup o’ kind/ness yet,", n: "D5 A4:1.5 F#4:0.5 F#4 D4 E4:1.5 D4:0.5 E4", c: "G:1 D:4 A:3", ch: true },
        { s: "for auld lang syne.", n: "F#4 D4:1.5+B3:0.5 B3+A3 D4:3", c: "A:1 G:4 D:3", ch: true }
      ] },
    { id: "en-home-on-the-range", lang: "en", cat: "popular", title: "Home on the Range", bpm: 104, meter: 3, pickup: 1,
      lines: [
        { s: "Oh, give me a home where the buf/fa/lo roam,", n: "D4 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5 C5:2", c: "G:7 C:5" },
        { s: "where the deer and the an/te/lope play,", n: "B4:0.5 C5:0.5 D5:1.5 G4:0.5 G4 G4 F#4 G4 A4:4 R:1", c: "C:1 G:6 D7:5" },
        { s: "where sel/dom is heard a dis/cour/ag/ing word,", n: "D4 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5 C5:2", c: "D7:1 G:6 C:5" },
        { s: "and the skies are not cloud/y all day.", n: "C5:0.5 C5:0.5 B4:1.5 A4:0.5 G4 F#4 G4 A4 G4:4 R:2", c: "C:1 G:3 D7:3 G:6" },
        { s: "Home, home on the range,", n: "D5:3 C5 B4:1.5 A4:0.5 B4:4 R:1", c: "G:3 D7:3 G:5", ch: true },
        { s: "where the deer and the an/te/lope play;", n: "D4:0.5 D4:0.5 G4:1.5 G4:0.5 G4 G4 F#4 G4 A4:4 R:1", c: "G:7 D7:5", ch: true },
        { s: "where sel/dom is heard a dis/cour/ag/ing word,", n: "D4 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5 C5:2", c: "D7:1 G:6 C:5", ch: true },
        { s: "and the skies are not cloud/y all day.", n: "C5:0.5 C5:0.5 B4:1.5 A4:0.5 G4 F#4 G4 A4 G4:4 R:1", c: "C:1 G:3 D7:3 G:5", ch: true },
        { s: "How of/ten at night when the hea/vens are bright", n: "D4 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5 C5:2", c: "G:7 C:5" },
        { s: "with the light from the glit/ter/ing stars,", n: "B4:0.5 C5:0.5 D5:1.5 G4:0.5 G4 G4 F#4 G4 A4:4 R:1", c: "C:1 G:6 D7:5" },
        { s: "have I stood here a/mazed and asked as I gazed", n: "D4:0.5 D4:0.5 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5:3", c: "D7:1 G:6 C:5" },
        { s: "if their glo/ry ex/ceeds that of ours.", n: "C5:0.5 C5:0.5 B4:1.5 A4:0.5 G4 F#4 G4 A4 G4:4 R:2", c: "C:1 G:3 D7:3 G:6" },
        { s: "Home, home on the range,", n: "D5:3 C5 B4:1.5 A4:0.5 B4:4 R:1", c: "G:3 D7:3 G:5", ch: true },
        { s: "where the deer and the an/te/lope play;", n: "D4:0.5 D4:0.5 G4:1.5 G4:0.5 G4 G4 F#4 G4 A4:4 R:1", c: "G:7 D7:5", ch: true },
        { s: "where sel/dom is heard a dis/cour/ag/ing word,", n: "D4 D4 G4 A4 B4:2 G4:0.5 F#4:0.5 E4 C5 C5 C5:2", c: "D7:1 G:6 C:5", ch: true },
        { s: "and the skies are not cloud/y all day.", n: "C5:0.5 C5:0.5 B4:1.5 A4:0.5 G4 F#4 G4 A4 G4:4 R:2", c: "C:1 G:3 D7:3 G:6", ch: true }
      ] },
    { id: "en-swing-low", lang: "en", cat: "popular", title: "Swing Low, Sweet Chariot", bpm: 76, meter: 4, pickup: 0,
      lines: [
        { s: "Swing low, sweet char/i/ot,", n: "G#4 E4:2 G#4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home,", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 B4 B4:4", c: "E:4 B7:4", ch: true },
        { s: "swing low, sweet char/i/ot,", n: "C#5:0.5+B4:0.5 G#4:2 B4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home.", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 F#4 E4:3", c: "E:3 B7:1 E:3", ch: true },
        { s: "I looked o/ver Jor/dan, and what did I see,", n: "G#4 B4 E4:0.5 C#4 E4:0.5 E4:0.5 E4:0.5 E4:0.5 E4:0.5 E4 C#4:0.5+B3:1.5", c: "E:5 A:2 E:2" },
        { s: "com/in’ for to car/ry me home?", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 B4 B4:3", c: "E:4 B7:3" },
        { s: "A band of an/gels com/in’ af/ter me,", n: "B4 C#5:0.5+B4:0.5 G#4 G#4 E4 E4:0.5 E4:0.5 E4:0.5 E4:0.5 C#4:0.5+B3:1.5", c: "E:3 A:2 E:4" },
        { s: "com/in’ for to car/ry me home.", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 F#4 E4:4", c: "E:3 B7:1 E:4" },
        { s: "Swing low, sweet char/i/ot,", n: "G#4 E4:2 G#4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home,", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 B4 B4:4", c: "E:4 B7:4", ch: true },
        { s: "swing low, sweet char/i/ot,", n: "C#5:0.5+B4:0.5 G#4:2 B4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home.", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 F#4 E4:3", c: "E:3 B7:1 E:3", ch: true },
        { s: "If you get there be/fore I do,", n: "G#4 B4 E4:0.5 C#4 E4 E4:0.5 E4:2 C#4:0.5+B3:1.5", c: "E:5 A:2 E:2" },
        { s: "com/in’ for to car/ry me home,", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 B4 B4:3", c: "E:4 B7:3" },
        { s: "tell all my friends I’m com/in’ too,", n: "B4 C#5:0.5+B4:0.5 G#4 G#4 E4 E4 E4 C#4:0.5+B3:1.5", c: "E:3 A:2 E:4" },
        { s: "com/in’ for to car/ry me home.", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 F#4 E4:4", c: "E:3 B7:1 E:4" },
        { s: "Swing low, sweet char/i/ot,", n: "G#4 E4:2 G#4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home,", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 B4 B4:4", c: "E:4 B7:4", ch: true },
        { s: "swing low, sweet char/i/ot,", n: "C#5:0.5+B4:0.5 G#4:2 B4 E4:2 E4:0.5 C#4:0.75+B3:0.75", c: "E:4 A:2 E:2", ch: true },
        { s: "com/in’ for to car/ry me home.", n: "E4:0.5 E4:0.5 E4:0.5 E4:0.5 G#4:0.5 G#4:0.5 F#4 E4:4", c: "E:3 B7:1 E:4", ch: true }
      ] },
    { id: "en-coming-round-the-mountain", lang: "en", cat: "children", title: "She’ll Be Coming Round the Mountain", bpm: 120, meter: 4, pickup: 2,
      lines: [
        { s: "She’ll be com/ing round the moun/tain", n: "D4 E4 G4 G4 G4 G4 E4 D4", c: "G:8" },
        { s: "when she comes,", n: "D4 E4 G4:5 R:1", c: "G:8" },
        { s: "she’ll be com/ing round the moun/tain", n: "G4 A4 B4 B4 B4 B4 D5 B4", c: "G:8" },
        { s: "when she comes,", n: "A4 G4 A4:5 R:1", c: "G:2 D:6" },
        { s: "she’ll be com/ing round the moun/tain,", n: "D5 C5 B4 B4 B4 B4 A4 G4", c: "D7:2 G:6" },
        { s: "she’ll be com/ing round the moun/tain,", n: "G4 G4 E4 G4 G4 G4 A4 G4", c: "G:2 C:6" },
        { s: "she’ll be com/ing round the moun/tain", n: "F#4 E4 D4 D4 D4 D4 B4 A4", c: "D7:2 G:4 D7:2" },
        { s: "when she comes.", n: "G4 F#4 G4:5 R:1", c: "D7:2 G:6" },
        { s: "She’ll be driv/ing six white hor/ses", n: "D4 E4 G4 G4 G4 G4 E4 D4", c: "G:8" },
        { s: "when she comes,", n: "D4 E4 G4:5 R:1", c: "G:8" },
        { s: "she’ll be driv/ing six white hor/ses", n: "G4 A4 B4 B4 B4 B4 D5 B4", c: "G:8" },
        { s: "when she comes,", n: "A4 G4 A4:5 R:1", c: "G:2 D:6" },
        { s: "she’ll be driv/ing six white hor/ses,", n: "D5 C5 B4 B4 B4 B4 A4 G4", c: "D7:2 G:6" },
        { s: "she’ll be driv/ing six white hor/ses,", n: "G4 G4 E4 G4 G4 G4 A4 G4", c: "G:2 C:6" },
        { s: "she’ll be driv/ing six white hor/ses", n: "F#4 E4 D4 D4 D4 D4 B4 A4", c: "D7:2 G:4 D7:2" },
        { s: "when she comes.", n: "G4 F#4 G4:5 R:1", c: "D7:2 G:6" },
        { s: "Oh, we’ll all go to meet her", n: "D4+E4 G4 G4 G4 G4 E4 D4", c: "G:8" },
        { s: "when she comes,", n: "D4 E4 G4:5 R:1", c: "G:8" },
        { s: "oh, we’ll all go to meet her", n: "G4+A4 B4 B4 B4 B4 D5 B4", c: "G:8" },
        { s: "when she comes,", n: "A4 G4 A4:5 R:1", c: "G:2 D:6" },
        { s: "oh, we’ll all go to meet her,", n: "D5+C5 B4 B4 B4 B4 A4 G4", c: "D7:2 G:6" },
        { s: "oh, we’ll all go to meet her,", n: "G4:2 E4 G4 G4 G4 A4 G4", c: "G:2 C:6" },
        { s: "oh, we’ll all go to meet her", n: "F#4+E4 D4 D4 D4 D4 B4 A4", c: "D7:2 G:4 D7:2" },
        { s: "when she comes.", n: "G4 F#4 G4:5 R:1", c: "D7:2 G:6" }
      ] },
    { id: "en-twinkle", lang: "en", cat: "children", title: "Twinkle, Twinkle, Little Star", bpm: 92, meter: 4, pickup: 0,
      lines: [
        { s: "Twin/kle, twin/kle, lit/tle star,", n: "D4 D4 A4 A4 B4 B4 A4:2", c: "D:4 G:2 D:2" },
        { s: "how I won/der what you are!", n: "G4 G4 F#4 F#4 E4 E4 D4:2", c: "G:2 D:2 A7:2 D:2" },
        { s: "Up a/bove the world so high,", n: "A4 A4 G4 G4 F#4 F#4 E4:2", c: "D:2 G:2 D:2 A:2" },
        { s: "like a dia/mond in the sky.", n: "A4 A4 G4 G4 F#4 F#4 E4:2", c: "D:2 G:2 D:2 A:2" },
        { s: "Twin/kle, twin/kle, lit/tle star,", n: "D4 D4 A4 A4 B4 B4 A4:2", c: "D:4 G:2 D:2" },
        { s: "how I won/der what you are!", n: "G4 G4 F#4 F#4 E4 E4 D4:2", c: "G:2 D:2 A7:2 D:2" },
        { s: "When the blaz/ing sun is gone,", n: "D4 D4 A4 A4 B4 B4 A4:2", c: "D:4 G:2 D:2" },
        { s: "when he no/thing shines up/on,", n: "G4 G4 F#4 F#4 E4 E4 D4:2", c: "G:2 D:2 A7:2 D:2" },
        { s: "then you show your lit/tle light,", n: "A4 A4 G4 G4 F#4 F#4 E4:2", c: "D:2 G:2 D:2 A:2" },
        { s: "twin/kle, twin/kle, all the night.", n: "A4 A4 G4 G4 F#4 F#4 E4:2", c: "D:2 G:2 D:2 A:2" },
        { s: "Twin/kle, twin/kle, lit/tle star,", n: "D4 D4 A4 A4 B4 B4 A4:2", c: "D:4 G:2 D:2" },
        { s: "how I won/der what you are!", n: "G4 G4 F#4 F#4 E4 E4 D4:2", c: "G:2 D:2 A7:2 D:2" }
      ] },
    { id: "fr-vous-dirai-je", lang: "fr", cat: "children", title: "Ah ! vous dirai-je, maman", bpm: 100, meter: 4, pickup: 0,
      lines: [
        { s: "Ah ! vous di/rai-/je, ma/man,", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "ce qui cau/se mon tour/ment ?", n: "F4 F4 E4 E4 D4 D4 C4:2", c: "F:2 C:2 G7:2 C:2" },
        { s: "Pa/pa veut que je rai/sonne", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "com/me_u/ne gran/de per/sonne ;", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "moi, je dis que les bon/bons", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "va/lent mieux que la rai/son.", n: "F4 F4 E4 E4 D4 D4 C4:2", c: "F:2 C:2 G7:2 C:2" },
        { s: "Ah ! vous di/rai-/je, ma/man,", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "ce qui cau/se mon tour/ment ?", n: "F4 F4 E4 E4 D4 D4 C4:2", c: "F:2 C:2 G7:2 C:2" },
        { s: "Pa/pa veut que je rai/sonne", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "com/me_u/ne gran/de per/sonne ;", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "moi, je dis que les bon/bons", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "va/lent mieux que la rai/son.", n: "F4 F4 E4 E4 D4 D4 C4:2", c: "F:2 C:2 G7:2 C:2" }
      ] },
    { id: "fr-mon-beau-sapin", lang: "fr", cat: "christmas", title: "Mon beau sapin", bpm: 88, meter: 3, pickup: 1,
      lines: [
        { s: "Mon beau sa/pin, roi des fo/rêts,", n: "Bb3 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6.5" },
        { s: "que j’ai/me ta ver/du/re !", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4 R:0.5", c: "Eb:0.5 Bb7:4 Eb:1.5" },
        { s: "Quand par l’hi/ver, bois et gué/rets", n: "Bb4:0.5 Bb4:0.5 G4:0.5 C5:1.5 Bb4:0.5 Bb4:0.5 Ab4:0.5 Ab4:1.5", c: "Eb:3.5 Bb7:2.5" },
        { s: "sont dé/pouil/lés de leurs at/traits,", n: "Ab4:0.5 Ab4:0.5 F4:0.5 Bb4:1.5 Ab4:0.5 Ab4:0.5 G4:0.5 G4:1.5", c: "Bb7:3.5 Eb:2.5" },
        { s: "Mon beau sa/pin, roi des fo/rêts,", n: "Bb3:0.5 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6" },
        { s: "tu gar/des ta pa/ru/re !", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4", c: "Eb:0.5 Bb7:4 Eb:1" },
        { s: "Mon beau sa/pin, roi des fo/rêts,", n: "Bb3 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6.5" },
        { s: "que j’ai/me ta ver/du/re !", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4 R:0.5", c: "Eb:0.5 Bb7:4 Eb:1.5" },
        { s: "Mon beau sa/pin, roi des fo/rêts,", n: "Bb3:0.5 Eb4:0.75 Eb4:0.25 Eb4:1.5 F4:0.5 G4:0.75 G4:0.25 G4:1.5", c: "Eb:6" },
        { s: "tu gar/des ta pa/ru/re !", n: "G4:0.5 F4:0.5 G4:0.5 Ab4 D4 F4 Eb4:3", c: "Eb:0.5 Bb7:4 Eb:3" }
      ] },
    { id: "de-alle-entchen", lang: "de", cat: "children", title: "Alle meine Entchen", bpm: 104, meter: 4, pickup: 0,
      lines: [
        { s: "Al/le mei/ne Ent/chen", n: "C4 D4 E4 F4 G4:2 G4:2", c: "C:4 C:4" },
        { s: "schwim/men auf dem See,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "schwim/men auf dem See,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "Köpf/chen in das Was/ser,", n: "F4 F4 F4 F4 E4:2 E4:2", c: "F:4 C:4" },
        { s: "Schwänz/chen in die Höh’.", n: "D4 D4 D4 D4 C4:4", c: "G7:4 C:4" },
        { s: "Al/le mei/ne Hüh/ner", n: "C4 D4 E4 F4 G4:2 G4:2", c: "C:4 C:4" },
        { s: "schar/ren in dem Stroh,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "schar/ren in dem Stroh,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "fin/den sie ein Körn/chen,", n: "F4 F4 F4 F4 E4:2 E4:2", c: "F:4 C:4" },
        { s: "sind sie al/le froh.", n: "D4 D4 D4 D4 C4:4", c: "G7:4 C:4" },
        { s: "Al/le mei/ne Ent/chen", n: "C4 D4 E4 F4 G4:2 G4:2", c: "C:4 C:4" },
        { s: "schwim/men auf dem See,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "schwim/men auf dem See,", n: "A4 A4 A4 A4 G4:4", c: "F:4 C:4" },
        { s: "Köpf/chen in das Was/ser,", n: "F4 F4 F4 F4 E4:2 E4:2", c: "F:4 C:4" },
        { s: "Schwänz/chen in die Höh’.", n: "D4 D4 D4 D4 C4:4", c: "G7:4 C:4" }
      ] },
    { id: "de-weihnachtsmann", lang: "de", cat: "christmas", title: "Morgen kommt der Weihnachtsmann", bpm: 100, meter: 4, pickup: 0,
      lines: [
        { s: "Mor/gen kommt der Weih/nachts/mann,", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "kommt mit sei/nen Ga/ben.", n: "F4 F4 E4 E4 D4 C4:2", c: "F:2 C:2 G7:1 C:2" },
        { s: "Trom/mel, Pfei/fen und Ge/wehr,", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "Fahn’ und Sä/bel und noch mehr,", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "ja, ein gan/zes Krie/ges/heer", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "möcht’ ich ger/ne ha/ben.", n: "F4 F4 E4 E4 D4 C4:2", c: "F:2 C:2 G7:1 C:2" },
        { s: "Mor/gen kommt der Weih/nachts/mann,", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "kommt mit sei/nen Ga/ben.", n: "F4 F4 E4 E4 D4 C4:2", c: "F:2 C:2 G7:1 C:2" },
        { s: "Trom/mel, Pfei/fen und Ge/wehr,", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "Fahn’ und Sä/bel und noch mehr,", n: "G4 G4 F4 F4 E4 E4 D4:2", c: "C:2 F:2 C:2 G:2" },
        { s: "ja, ein gan/zes Krie/ges/heer", n: "C4 C4 G4 G4 A4 A4 G4:2", c: "C:4 F:2 C:2" },
        { s: "möcht’ ich ger/ne ha/ben.", n: "F4 F4 E4 E4 D4 C4:2", c: "F:2 C:2 G7:1 C:2" }
      ] },
    { id: "en-row-your-boat", lang: "en", cat: "children", title: "Row, Row, Row Your Boat", bpm: 100, meter: 4, pickup: 0,
      lines: [
        { s: "Row, row, row your boat,", n: "C4:1 C4:1 C4:0.75 D4:0.25 E4:1", c: "C:4" },
        { s: "gent/ly down the stream.", n: "E4:0.75 D4:0.25 E4:0.75 F4:0.25 G4:2", c: "C:2 G7:2" },
        { s: "Mer/ri/ly, mer/ri/ly, mer/ri/ly, mer/ri/ly,", n: "C5:0.5 C5:0.25 C5:0.25 G4:0.5 G4:0.25 G4:0.25 E4:0.5 E4:0.25 E4:0.25 C4:0.5 C4:0.25 C4:0.25", c: "C:4" },
        { s: "life is but a dream.", n: "G4:0.75 F4:0.25 E4:0.75 D4:0.25 C4:2", c: "G7:2 C:2" },
        { s: "Row, row, row your boat,", n: "C4:1 C4:1 C4:0.75 D4:0.25 E4:1", c: "C:4" },
        { s: "gent/ly down the stream.", n: "E4:0.75 D4:0.25 E4:0.75 F4:0.25 G4:2", c: "C:2 G7:2" },
        { s: "Mer/ri/ly, mer/ri/ly, mer/ri/ly, mer/ri/ly,", n: "C5:0.5 C5:0.25 C5:0.25 G4:0.5 G4:0.25 G4:0.25 E4:0.5 E4:0.25 E4:0.25 C4:0.5 C4:0.25 C4:0.25", c: "C:4" },
        { s: "life is but a dream.", n: "G4:0.75 F4:0.25 E4:0.75 D4:0.25 C4:2", c: "G7:2 C:2" },
        { s: "Row, row, row your boat,", n: "C4:1 C4:1 C4:0.75 D4:0.25 E4:1", c: "C:4" },
        { s: "gent/ly down the stream.", n: "E4:0.75 D4:0.25 E4:0.75 F4:0.25 G4:2", c: "C:2 G7:2" },
        { s: "Mer/ri/ly, mer/ri/ly, mer/ri/ly, mer/ri/ly,", n: "C5:0.5 C5:0.25 C5:0.25 G4:0.5 G4:0.25 G4:0.25 E4:0.5 E4:0.25 E4:0.25 C4:0.5 C4:0.25 C4:0.25", c: "C:4" },
        { s: "life is but a dream.", n: "G4:0.75 F4:0.25 E4:0.75 D4:0.25 C4:2", c: "G7:2 C:2" }
      ] },
    { id: "en-london-bridge", lang: "en", cat: "children", title: "London Bridge Is Falling Down", bpm: 100, meter: 4, pickup: 0,
      lines: [
        { s: "Lon/don Bridge is fall/ing down,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "fall/ing down, fall/ing down.", n: "D4:0.5 E4:0.5 F4:1 D4:0.5 E4:0.5 F4:1", c: "G7:4" },
        { s: "Lon/don Bridge is fall/ing down,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "my fair la/dy.", n: "D4:1 G4:1 E4:1 C4:1", c: "G7:2 C:2" },
        { s: "Build it up with wood and clay,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "wood and clay, wood and clay.", n: "D4:0.5 E4:0.5 F4:1 D4:0.5 E4:0.5 F4:1", c: "G7:4" },
        { s: "Build it up with wood and clay,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "my fair la/dy.", n: "D4:1 G4:1 E4:1 C4:1", c: "G7:2 C:2" },
        { s: "Wood and clay will wash a/way,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "wash a/way, wash a/way.", n: "D4:0.5 E4:0.5 F4:1 D4:0.5 E4:0.5 F4:1", c: "G7:4" },
        { s: "Wood and clay will wash a/way,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "my fair la/dy.", n: "D4:1 G4:1 E4:1 C4:1", c: "G7:2 C:2" },
        { s: "Build it up with i/ron bars,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "i/ron bars, i/ron bars.", n: "D4:0.5 E4:0.5 F4:1 D4:0.5 E4:0.5 F4:1", c: "G7:4" },
        { s: "Build it up with i/ron bars,", n: "G4:0.75 A4:0.25 G4:0.5 F4:0.5 E4:0.5 F4:0.5 G4:1", c: "C:2 G7:2" },
        { s: "my fair la/dy.", n: "D4:1 G4:1 E4:1 C4:1", c: "G7:2 C:2" }
      ] },
    { id: "en-we-wish-you", lang: "en", cat: "christmas", title: "We Wish You a Merry Christmas", bpm: 112, meter: 3, pickup: 1,
      lines: [
        { s: "We wish you a mer/ry Christ/mas,", n: "D4:1 G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "We wish you a mer/ry Christ/mas,", n: "E4:1 A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 D4:1", c: "C:1 D:4 G:1" },
        { s: "We wish you a mer/ry Christ/mas,", n: "D4:1 B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "and a hap/py New Year !", n: "D4:0.5 D4:0.5 E4:1 A4:1 F#4:1 G4:2", c: "C:2 D:2 G:2" },
        { s: "Now bring us some fig/gy pud/ding,", n: "D4:1 G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "Now bring us some fig/gy pud/ding,", n: "E4:1 A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 D4:1", c: "C:1 D:4 G:1" },
        { s: "Now bring us some fig/gy pud/ding,", n: "D4:1 B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "and bring it right here !", n: "D4:1 E4:1 A4:1 F#4:1 G4:2", c: "C:2 D:2 G:2" },
        { s: "We won’t go un/til we get some,", n: "D4:1 G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "We won’t go un/til we get some,", n: "E4:1 A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 D4:1", c: "C:1 D:4 G:1" },
        { s: "We won’t go un/til we get some,", n: "D4:1 B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "so bring it right here !", n: "D4:1 E4:1 A4:1 F#4:1 G4:2", c: "C:2 D:2 G:2" },
        { s: "We wish you a mer/ry Christ/mas,", n: "D4:1 G4:1 G4:0.5 A4:0.5 G4:0.5 F#4:0.5 E4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "We wish you a mer/ry Christ/mas,", n: "E4:1 A4:1 A4:0.5 B4:0.5 A4:0.5 G4:0.5 F#4:1 D4:1", c: "C:1 D:4 G:1" },
        { s: "We wish you a mer/ry Christ/mas,", n: "D4:1 B4:1 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:1 E4:1", c: "D:1 G:3 C:2" },
        { s: "and a hap/py New Year !", n: "D4:0.5 D4:0.5 E4:1 A4:1 F#4:1 G4:3", c: "C:2 D:2 G:3" }
      ] }
  ] /* SONGS-END */;

  /* ---------- notes and chords ---------- */
  var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var QUALITY = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6], dim7: [0, 3, 6, 9],
    aug: [0, 4, 8], sus4: [0, 5, 7], sus2: [0, 2, 7], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 2] };
  var LETTER = /[A-Za-z0-9À-ɏ]/;

  function midiOf(p) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(p);
    if (!m) return null;
    return 12 * (parseInt(m[3], 10) + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function beatsOf(s) {
    if (s === undefined || s === '') return 1;
    var v = Number(s);
    if (!(v > 0) || !isFinite(v)) throw new Error('bad length "' + s + '"');
    return v;
  }
  /* "C4 E4:2 A4:0.5+F4:0.5 R:1" -> [{ rest, beats, notes: [{ midi, beats }] }] */
  function parseNotes(str) {
    return String(str || '').trim().split(/\s+/).filter(Boolean).map(function (tok) {
      var parts = tok.split('+'), notes = [], beats = 0;
      parts.forEach(function (p) {
        var q = p.split(':'), b = beatsOf(q[1]);
        if (q[0] === 'R') { if (parts.length > 1) throw new Error('a rest cannot be part of a syllable: "' + tok + '"'); notes.push({ midi: null, beats: b }); }
        else { var m = midiOf(q[0]); if (m === null) throw new Error('bad note "' + p + '"'); notes.push({ midi: m, beats: b }); }
        beats += b;
      });
      return { rest: notes[0].midi === null, beats: beats, notes: notes };
    });
  }
  /* "G7:2 C:2" -> [{ name, root, pcs, beats }] (name N = no chord) */
  function parseChords(str) {
    return String(str || '').trim().split(/\s+/).filter(Boolean).map(function (tok) {
      var q = tok.split(':'), b = beatsOf(q[1]);
      if (q[0] === 'N') return { name: 'N', root: null, pcs: [], beats: b };
      var m = /^([A-G])(#|b)?(.*)$/.exec(q[0]);
      if (!m || !QUALITY.hasOwnProperty(m[3])) throw new Error('bad chord "' + tok + '"');
      var root = (STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
      return { name: q[0], root: root, pcs: QUALITY[m[3]].map(function (i) { return (root + i) % 12; }), beats: b };
    });
  }
  /* The words of a line as shown, each with its number of syllables. */
  function words(s) {
    var out = [];
    String(s || '').trim().split(/\s+/).filter(Boolean).forEach(function (tok) {
      var text = tok.replace(/\//g, '').replace(/_/g, ' ');
      if (!LETTER.test(tok)) { if (out.length) out[out.length - 1].text += ' ' + text; else out.push({ text: text, syl: 0 }); return; }
      out.push({ text: text, syl: tok.split('/').length });
    });
    return out;
  }
  function lineText(s) { return words(s).map(function (w) { return w.text; }).join(' '); }
  function sum(list) { return list.reduce(function (a, x) { return a + x.beats; }, 0); }
  function near(a, b) { return Math.abs(a - b) < 1e-6; }

  /* Everything wrong with a song, as short English sentences (an empty list means it can play). */
  function check(song) {
    var bad = [];
    if (!song || !song.id) return ['no id'];
    if (['fr', 'de', 'en'].indexOf(song.lang) < 0) bad.push('language must be fr, de or en');
    if (!(song.bpm >= 40 && song.bpm <= 220)) bad.push('bpm out of range');
    if ([2, 3, 4, 6].indexOf(song.meter || 4) < 0) bad.push('meter must be 2, 3, 4 or 6');
    if (!song.lines || !song.lines.length) bad.push('no lines');
    (song.lines || []).forEach(function (ln, i) {
      try {
        var toks = parseNotes(ln.n), ch = parseChords(ln.c);
        var syl = words(ln.s).reduce(function (a, w) { return a + w.syl; }, 0), sung = toks.filter(function (t) { return !t.rest; }).length;
        if (syl !== sung) bad.push('line ' + (i + 1) + ': ' + syl + ' syllables but ' + sung + ' notes');
        if (!near(sum(toks), sum(ch))) bad.push('line ' + (i + 1) + ': notes last ' + sum(toks) + ' beats but chords ' + sum(ch));
        if (!sung) bad.push('line ' + (i + 1) + ': nothing to sing');
      } catch (e) { bad.push('line ' + (i + 1) + ': ' + e.message); }
    });
    return bad;
  }

  /* ---------- the timeline, in beats ----------
     Beat 0 is the first beat of a two-bar introduction (the home chord, then its dominant), so the
     group hears the key and the speed before the first word. With a pickup (anacrusis) the second
     bar is shorter, and the first full bar of the song still falls on a downbeat. */
  function build(song) {
    var bad = check(song);
    if (bad.length) throw new Error((song && song.id) + ': ' + bad.join('; '));
    var meter = song.meter || 4, pickup = song.pickup || 0, intro = Math.max(meter, 2 * meter - pickup);
    var lines = [], notes = [], chords = [], b = intro;
    var all = song.lines.map(function (ln) { return parseChords(ln.c); });
    var lastLine = all[all.length - 1], home = lastLine[lastLine.length - 1];
    if (home.root === null) home = { root: 0 };
    chords.push({ b: 0, d: meter, name: 'intro', pcs: [0, 4, 7].map(function (i) { return (home.root + i) % 12; }), root: home.root });
    if (intro > meter) chords.push({ b: meter, d: intro - meter, name: 'intro', pcs: [7, 11, 14, 17].map(function (i) { return (home.root + i) % 12; }), root: (home.root + 7) % 12 });
    song.lines.forEach(function (ln, li) {
      var toks = parseNotes(ln.n), syl = [], t = b;
      toks.forEach(function (tok) {
        if (!tok.rest) {
          syl.push({ b0: t, b1: t + tok.beats });
          var u = t;
          tok.notes.forEach(function (n) { notes.push({ b: u, d: n.beats, midi: n.midi, line: li }); u += n.beats; });
        }
        t += tok.beats;
      });
      var k = 0, ws = words(ln.s).map(function (w) {
        if (!w.syl) return { text: w.text, b0: syl[0].b0, b1: syl[0].b0 };
        var x = { text: w.text, b0: syl[k].b0, b1: syl[k + w.syl - 1].b1 };
        k += w.syl;
        return x;
      });
      var c = b;
      all[li].forEach(function (ch) { chords.push({ b: c, d: ch.beats, name: ch.name, pcs: ch.pcs, root: ch.root }); c += ch.beats; });
      lines.push({ i: li, text: lineText(ln.s), ch: !!ln.ch, start: b, end: t, b0: syl[0].b0, b1: syl[syl.length - 1].b1, words: ws });
      b = t;
    });
    return { id: song.id, bpm: song.bpm, meter: meter, intro: intro, beats: b, lines: lines, notes: notes, chords: chords,
      chorus: lines.some(function (l) { return l.ch; }) };
  }

  /* Milliseconds per beat at a tempo factor (1 = as written, 0.8 = slower). */
  function msPerBeat(bpm, tempo) { return 60000 / (bpm * (tempo || 1)); }
  /* The lyrics in the briefing's shape (A7), at the written tempo. */
  function lyrics(song, tempo) {
    var tl = build(song), k = msPerBeat(song.bpm, tempo);
    function ms(b) { return Math.round(b * k); }
    return tl.lines.map(function (l) {
      return { startMs: ms(l.b0), endMs: ms(l.b1), text: l.text, isChorus: l.ch,
        words: l.words.map(function (w) { return { startMs: ms(w.b0), endMs: ms(w.b1), text: w.text }; }) };
    });
  }
  function durationMs(song, tempo) { return Math.round(build(song).beats * msPerBeat(song.bpm, tempo)); }

  /* Where the singing is at a beat: the current line (shown a little before its first word, at most
     `lead` beats and never before the line before it is sung), the current word, and the end.
     line -1 = the introduction; word -1 = the line is up but its first word not yet. */
  function at(tl, beat, lead) {
    lead = lead === undefined ? 1 : lead;
    var li = -1, i;
    for (i = 0; i < tl.lines.length; i++) {
      var l = tl.lines[i], gap = i ? l.b0 - tl.lines[i - 1].b1 : lead;
      if (beat >= l.b0 - Math.max(0, Math.min(lead, gap))) li = i; else break;
    }
    var wi = -1;
    if (li >= 0) {
      var ws = tl.lines[li].words;
      for (i = 0; i < ws.length; i++) { if (beat >= ws[i].b0) wi = i; else break; }
    }
    return { line: li, word: wi, end: beat >= tl.beats };
  }

  /* ---------- the accompaniment ----------
     Melody (a guide for the group), a bass on the chord roots and soft chords on the off-beats:
     oom-pah in 2/4 and 3/4, root-chord-fifth-chord in 4/4. Every chord change gets its bass note.
     Events: { b, d, midi, v: 'mel' | 'bass' | 'chord' } in beats from the start. */
  var PATTERN = { 2: ['B', 'C'], 3: ['B', 'C', 'C'], 4: ['B', 'C', 'F', 'C'], 6: ['B', '', 'C', 'F', '', 'C'] };
  function place(pc, lo) { return lo + ((pc - lo) % 12 + 12) % 12; }
  function arrange(tl) {
    var ev = [], pat = PATTERN[tl.meter] || PATTERN[4];
    tl.notes.forEach(function (n) { ev.push({ b: n.b, d: n.d, midi: n.midi, v: 'mel' }); });
    tl.chords.forEach(function (ch) {
      if (ch.root === null || !ch.pcs.length) return;
      var end = ch.b + ch.d, beat = ch.b, first = true;
      while (beat < end - 1e-6) {
        var whole = Math.abs(beat - Math.round(beat)) < 1e-6, pos = Math.round(beat) % tl.meter, role = whole ? pat[pos] : '';
        var d = Math.min(1, end - beat);
        if (first || role === 'B' || role === 'F') ev.push({ b: beat, d: d * 0.9, midi: place(first || role === 'B' ? ch.root : (ch.root + 7) % 12, 40), v: 'bass' });
        if (role === 'C') ch.pcs.slice(0, 4).forEach(function (pc) { ev.push({ b: beat, d: Math.min(0.6, d), midi: place(pc, 53), v: 'chord' }); });
        first = false;
        beat = Math.floor(beat + 1e-6) + 1;
      }
    });
    ev.sort(function (a, b) { return a.b - b.b; });
    return ev;
  }

  /* ---------- the register ----------
     A row is complete when every field is filled in, the audio is generated by us, the date of
     verification is a date, and the text and the melody are free: their author died at least 70
     full years ago, or, for an anonymous work, it was first published at least 70 full years ago. */
  var FIELDS = ['id', 'title', 'language', 'category', 'textAuthor', 'textAuthorDeathYear', 'composer', 'composerDeathYear',
    'textSource', 'audioSource', 'audioLicence', 'verifiedOn', 'verifiedBy'];
  function filled(v) { return v !== undefined && v !== null && String(v).trim() !== ''; }
  function freeYear(died, published, limit) {
    if (died === 'anonymous') return typeof published === 'number' && published % 1 === 0 && published <= limit;
    return typeof died === 'number' && died % 1 === 0 && died <= limit;
  }
  function complete(row, year) {
    year = year || new Date().getFullYear();
    var limit = year - 71;
    if (!row || typeof row !== 'object') return false;
    for (var i = 0; i < FIELDS.length; i++) if (!filled(row[FIELDS[i]])) return false;
    if (['fr', 'de', 'en'].indexOf(row.language) < 0) return false;
    if (row.audioSource !== 'generated') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.verifiedOn)) return false;
    if (!freeYear(row.textAuthorDeathYear, row.textFirstPublished, limit)) return false;
    if (!freeYear(row.composerDeathYear, row.melodyFirstPublished, limit)) return false;
    return row.enabled !== false;
  }
  function rowOf(register, id) {
    var list = (register && register.songs) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /* The songs that may be shown: playable data, a complete register row, not excluded.
     opts: { register, songs, lang, cat, exclude: [ids], year } */
  function available(opts) {
    opts = opts || {};
    var reg = opts.register || REGISTER, ex = opts.exclude || [];
    return (opts.songs || SONGS).filter(function (s) {
      if (opts.lang && s.lang !== opts.lang) return false;
      if (opts.cat && s.cat !== opts.cat) return false;
      if (ex.indexOf(s.id) >= 0) return false;
      if (s.enabled === false || check(s).length) return false;
      var row = rowOf(reg, s.id);
      return complete(row, opts.year) && row.language === s.lang;
    });
  }
  function byId(id) { for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === id) return SONGS[i]; return null; }

  /* ---------- the Care Team's playlists and songs to avoid (A6) ----------
     js/karaoke.js keeps them in localStorage['bellatrix-karaoke-v1']:
     { v: 1, playlists: [{ id, name, language (fr|de|en|''), songIds: [...in order], createdBy, createdAt }],
       exclusions: [{ scope: 'group' | 'resident', id (a code, or '*' = every session), songIds: [...] }] } */
  function ids(list) { return (Array.isArray(list) ? list : []).filter(function (x) { return typeof x === 'string' && x; }); }
  function cleanStore(o) {
    o = o && typeof o === 'object' ? o : {};
    return {
      v: 1,
      playlists: (Array.isArray(o.playlists) ? o.playlists : []).filter(function (p) { return p && p.id && String(p.name || '').trim(); }).map(function (p) {
        return { id: String(p.id), name: String(p.name).trim(), language: ['fr', 'de', 'en'].indexOf(p.language) >= 0 ? p.language : '', songIds: ids(p.songIds),
          createdBy: String(p.createdBy || ''), createdAt: String(p.createdAt || '') };
      }),
      exclusions: (Array.isArray(o.exclusions) ? o.exclusions : []).filter(function (x) { return x && (x.scope === 'group' || x.scope === 'resident') && String(x.id || '').trim(); }).map(function (x) {
        return { scope: x.scope, id: String(x.id).trim(), songIds: ids(x.songIds) };
      })
    };
  }
  /* "P1, P3 ; p4" -> ['P1', 'P3', 'P4'] */
  function codes(str) { return String(str || '').split(/[\s,;]+/).map(function (c) { return c.trim().toUpperCase(); }).filter(Boolean); }
  /* The songs to leave out for a session: the group's list (its code, or '*' for every session), and
     the lists of the resident whose code the session has and of the residents present. */
  function excluded(store, who) {
    store = cleanStore(store); who = who || {};
    var group = String(who.group || '').trim().toUpperCase(), people = codes(Array.isArray(who.residents) ? who.residents.join(',') : who.residents);
    if (group) people.push(group);
    var out = [];
    store.exclusions.forEach(function (x) {
      var id = x.id.toUpperCase();
      var hit = x.scope === 'group' ? (id === '*' || id === group) : people.indexOf(id) >= 0;
      if (hit) x.songIds.forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); });
    });
    return out;
  }
  /* A playlist's songs that may be sung, in its order (unknown, incomplete or excluded ones are skipped). */
  function playlistSongs(store, id, opts) {
    var p = cleanStore(store).playlists.filter(function (x) { return x.id === id; })[0];
    if (!p) return [];
    var ok = available(opts || {}).map(function (s) { return s.id; });
    return p.songIds.filter(function (s) { return ok.indexOf(s) >= 0; }).map(byId);
  }

  var KS = {
    SONGS: SONGS, REGISTER: REGISTER, CATS: ['popular', 'christmas', 'children'], LANGS: ['fr', 'de', 'en'], FIELDS: FIELDS,
    midiOf: midiOf, parseNotes: parseNotes, parseChords: parseChords, words: words, lineText: lineText, check: check,
    build: build, msPerBeat: msPerBeat, lyrics: lyrics, durationMs: durationMs, at: at, arrange: arrange,
    complete: complete, rowOf: rowOf, available: available, byId: byId,
    cleanStore: cleanStore, codes: codes, excluded: excluded, playlistSongs: playlistSongs
  };
  root.KaraokeSongs = KS;
  if (typeof module !== 'undefined' && module.exports) module.exports = KS;
})(typeof window !== 'undefined' ? window : this);
