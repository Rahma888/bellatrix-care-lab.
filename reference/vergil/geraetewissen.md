# Gerätewissen: Orionstar-Roboter, ROM und SDK

Was wir am Gerät über die Roboter, ihr ROM und `robotservice.jar`
herausgefunden haben, an den Gerätetagen vom 2026-08-11 bis 2026-11-03. Die
Protokolle mit allen Rohdaten liegen in `docs/archiv/geraetetests-2026.md`;
die Teilnummern unten zeigen dorthin.

Daneben:

- `docs/navigation-stand.md`: Wegplanung, Drehscan, `checkIfHasObstacle`,
  Lidar und die Statuscodes der Navigation.
- `docs/orionstar/anfragen.md`: Fragen an den Hersteller und seine Antworten.
- `docs/m0-geraetetest.md`: was am Gerät noch offen ist.
- `docs/inbetriebnahme.md`: was bei jedem neuen Roboter zu tun ist.
- `robot/AGENTS.md` (Java 8 auf dem Gerät) und `AGENTS.md`, „Am Gerät“
  (die Uhr der adb-Shell, das Logcat mit der Zone des Roboters): die Regeln,
  die daraus folgen.

Wer am Gerät etwas Neues herausfindet, trägt es hier ein und nicht nur ins
Protokoll des Gerätetags.

## Die Roboter

| | Nova | LuckiBot | CarryBot |
|---|---|---|---|
| Modell (`ro.product.model`) | GreetingBot Nova | OS-R-DR02 | OS-R-DR02C |
| ROM | V12.1 (V12.1.2026061516.NVAUUO) | V10.5 | V11.2 |
| Adresse im Büro-WLAN | 192.168.69.102 | 192.168.69.178, bis 2026-10-13 .151 | |
| Schirm | 1920 × 1080, 16:9 | 1280 × 800, 16:10 | |
| Kopf | beweglich | keiner | keiner |
| Heap der App | 512 MB | 512 MB bei 8 GB RAM | |

Dieselbe APK und derselbe Treiber laufen auf allen drei. Der Treiber wird
gewählt, wenn `com.ainirobot.coreservice` da ist, also auf jedem Roboter mit
RobotOS classic. `robotservice.jar` ist die 11.6 aus dem Bauhaus-Projekt; sie
ist neuer als V10.5 und V11.2 und läuft trotzdem, auch `goForward` mit
`avoidObstacle` gibt es auf V10.5. Die richtige Fassung für V12.1 ist
Orionstar-Anfrage 1.

Im Admin heißt der LuckiBot „Luckibot". Der Nova steht im Backend zweimal:
als Studio-Roboter von LabLand (`concierge-nova@studio`) und als Roboter des
Sonderpreis (Mandant `spb-schwetz`). Welcher er gerade ist, entscheidet das
Geräte-Token in `backend.properties` im Dateiverzeichnis der App
(Entwicklerzugang, Reiter „Edition").

## Installieren und starten

- **Start per adb geht auf V12.1**, entgegen der Orionstar-Doku:
  `adb shell am start -n de.labland.vergil/.MainActivity`. CoreService und
  SkillApi verbinden sich, auch wenn die App nie per Icon gestartet wurde
  (2026-08-12). Auf V10.5 und V11.2 ist das offen; dort im Zweifel das Icon.
- **Welche APK läuft:** `adb -s <ip>:5555 shell dumpsys package
  de.labland.vergil | findstr lastUpdateTime`. Sicher ist nur die
  Prüfsumme: `adb -s <ip>:5555 shell pm path de.labland.vergil`, dann
  `adb -s <ip>:5555 shell md5sum <Pfad>` gegen
  `Get-FileHash -Algorithm MD5 robot\app\build\outputs\apk\debug\app-debug.apk`.
  Am 2026-10-15 lief eine APK aus dem falschen Checkout, und der Stadtplan
  fehlte (Teil 14). Den App-Stand samt Commit meldet auch das Lebenszeichen
  (Admin, Roboterliste, Spalte „Gerät").
- **`RECORD_AUDIO`** ist eine gefährliche Berechtigung und kommt mit der
  Installation nicht mit: `adb -s <ip>:5555 shell pm grant de.labland.vergil
  android.permission.RECORD_AUDIO`. Sie übersteht Neustarts und
  `adb install -r`. Weg ist sie nach Deinstallieren, Zurücksetzen, auf einem
  neuen Gerät oder wenn sie jemand entzieht. Ohne sie ist der Mikrofon-Knopf
  blau, bis ein Gast drückt, dann grau: `Ear` prüft erst beim Aufnehmen
  (Teil 7).
- **Boot-App:** Die Registrierung über `action.orionstar.default.app`
  übersteht ein Update der APK, geprüft am CarryBot
  (`docs/backend/architektur.md`, Abschnitt 14).
- **Nach dem Hochfahren** liegt rund eine Minute der Selbsttest
  `com.ainirobot.home/.SystemActivity` über allem. Unsere App läuft da
  schon, meldet aber `SUSPENDED`.
- **Entwicklerzugang:** fünf Tipps in drei Sekunden in die linke obere Ecke,
  zurück über den Reiter „App". Ein Neustart der App schließt ihn wieder.
- **Auf der Ladesäule gibt RobotOS die Steuerung nie an uns ab.** Dann liegt
  der Übernahme-Schirm über den Gästeschirmen; mit offenem Entwicklerzugang
  bleibt er weg (`robot/AGENTS.md`, „Diagnose auf dem Schirm“, `__FUCKWITHME__.md`, „Roboter lädt"). Fahren geht
  dann nicht. Die Probeansicht meldet dort `showing`, auch wenn der
  Übernahme-Schirm sie verdeckt (Teil 24).
- **App beenden:** `adb -s <ip>:5555 shell am force-stop de.labland.vergil`.
  Nicht über die Orionstar-Einstellungen: Deren Oberfläche stürzt dabei ab
  („com.ainirobot.settings-induced crash" im Crash-Log, auf Nova und
  LuckiBot, 2026-10-15). Unsere App ist es nicht.

## adb-Handgriffe

- **Die Verbindung fällt nach einigen Minuten Ruhe weg.** `adb devices`
  zeigt noch „device", der nächste Befehl scheitert mit „device offline",
  das Gerät antwortet nicht auf Ping. `adb disconnect`, dann `adb connect`,
  sobald es wieder im Netz ist. „already connected" heißt hier nicht
  erreichbar.
- **Logcat immer mit der Zone des Roboters**, sonst liegen die Zeiten 6 bis
  7 Stunden daneben (`AGENTS.md`, „Am Gerät“):
  `adb -s <ip>:5555 shell 'TZ=$(getprop persist.sys.timezone) logcat -s <Tags>'`.
  Windows hat kein `grep`; `findstr /i vergil` oder `rg`.
  Der Grund (geklärt am 2026-10-22 am Nova): Die Systemuhr geht richtig (NTP
  an, `persist.sys.timezone` auf `Europe/Berlin`), aber der Hersteller setzt
  in `/vendor/etc/init/hw/init.qcom.rc` die Zeile `export TZ GMT-8`. In POSIX
  ist das UTC+8, also Peking, und jedes native Programm hinter adb erbt es:
  `adb logcat` und `adb shell date`, im Sommer 6 Stunden daneben, im Winter
  7. Der LuckiBot zeigte am 2026-10-15 dasselbe Bild. Ältere Notizen, die Uhr
  des Roboters „gehe vor“, meinen genau das. Die App ist nicht betroffen:
  Java liest die Zone aus `persist.sys.timezone` und ignoriert `TZ`, genauso
  die Android-Dienste (`dumpsys alarm` zeigte 19:31, das Logcat im selben
  Moment 01:31). `LocalDate.now()` und die Zeitstempel der Ereignisse
  stimmen also. Abstellen lässt es sich nicht, die Vendor-Partition ist ohne
  Root schreibgeschützt. Dasselbe Präfix brauchen `date` und alle anderen
  Shell-Werkzeuge mit Uhrzeit, `dumpsys` nicht.
- **Nach einem Hänger hilft der ANR-Bericht, nicht das Logcat.** Ein
  Neustart leert das Logcat, die Berichte des Systems bleiben:
  `adb -s <ip>:5555 shell "dumpsys dropbox --print data_app_anr"` zeigt
  jeden Stillstand der App mit dem Stapel aller Fäden, der Faden `"main"`
  sagt, worauf sie wartete. `dumpsys dropbox` ohne `--print` listet die
  Einträge mit Uhrzeit (2026-11-13, Teil 30).
- **Bildschirmfoto:** `adb exec-out screencap -p > datei.png` geht nur in
  cmd, PowerShell verdirbt Binärdaten hinter `>`. Über die SD-Karte geht es
  überall:
  `adb -s <ip>:5555 shell screencap -p /sdcard/x.png`, dann
  `adb -s <ip>:5555 pull /sdcard/x.png $HOME\Desktop\x.png`.
- **Eine Datei aus dem App-Verzeichnis holen:** `adb pull` aus `/data/data/`
  geht nicht. Binärsicher ist der Umweg über die SD-Karte, die Umleitung
  läuft auf dem Gerät:
  `adb -s <ip>:5555 shell "run-as de.labland.vergil cat files/<datei> > /sdcard/<datei>"`,
  dann `pull`. Löschen genauso mit `run-as … rm files/<pfad>` (nur
  Debug-Build).
- **Speicher der App:** `adb -s <ip>:5555 shell dumpsys meminfo
  de.labland.vergil`, Zeile TOTAL PSS. Den Heap liest man in den Zeilen der
  Laufzeit („GC freed …, 383MB/407MB"):
  `adb -s <ip>:5555 logcat -d | findstr /C:"GC freed"`. Nicht über
  `totalMemory - freeMemory`, das zählt den Müll mit (Teil 13, Befund 1).
- **WebView untersuchen:** Debug-Build, dann
  `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` und
  im Desktop-Chrome `chrome://inspect`. Logcat schweigt oft, wenn ein Rahmen
  leer bleibt (Teil 10).
- **Offline-Tests gehen nicht vom Schreibtisch:** adb läuft über dasselbe
  WLAN, das man abschaltet.

## Fallstricke beim Bauen gegen `robotservice.jar`

Alle drei haben am ersten Gerätetag Zeit gekostet (2026-08-11, Teil 1):

1. **Gson fehlt.** `SkillApi.<init>` baut einen `GsonBuilder`, und eine Jar
   bringt ihre Abhängigkeiten nicht mit. Ohne `com.google.code.gson:gson`
   stirbt die App beim Start mit `NoClassDefFoundError`: grauer Schirm,
   keine Meldung.
2. **Eine Berechtigung fehlt.** `RobotApi.connectServer` liest die
   Cloud-Zone aus `RobotSettingProvider`. Ohne
   `com.ainirobot.coreservice.robotSettingProvider` im Manifest fliegt eine
   `SecurityException`.
3. **Rohe NPEs.** Ein nicht verbundener Dienst liefert keinen Fehlercode,
   sondern einen `null`-Binder. Deshalb läuft jeder SDK-Aufruf im
   `NovaDriver` durch eine Schutzhülle; ein Absturz aus einem Klick-Handler
   kostet am Gerät eine ganze Testrunde.
4. **`connectServer` meldet sich nicht zweimal.** Ist der Dienst schon
   verbunden, bleibt der zweite Aufruf ohne Rückmeldung. Deshalb hält
   `RalHolder` genau einen Treiber je Prozess, und `connect()` ist
   idempotent. Nicht rückbauen.
5. **Jeder Befehl wartet auf den Kerndienst.** Auch die Befehle mit
   Rückmeldung über einen Listener (`stopNavigation`, `stopMove`) sind
   synchrone Binder-Aufrufe in `com.ainirobot.coreservice`. Am 2026-11-13
   kam `stopNavigation` am Nova nicht zurück (Teil 30, „Anhalten“ während
   der Fahrt; der Halt per `stopMove` davor wirkte). Vom UI-Thread gerufen,
   stand damit die App, und Android 9 hält dann jede Berührung zurück, auch
   das Herunterziehen der Leiste: Das Gerät wirkt ganz eingefroren, bis man
   es ausschaltet. Warum der Dienst nicht antwortete, verrät der Bericht
   nicht (`exe_chassis_remote` lag bei 150 % CPU). Deshalb geht kein
   SDK-Aufruf vom UI-Thread aus (`robot/AGENTS.md`, „Karte und Fahrt“).

Und eine Regel für jeden weiteren Aufruf: **`result=1` heißt bei diesem SDK
nicht Erfolg.** Wirkung prüfen, nicht dem Rückgabewert glauben (nächster
Abschnitt).

## Karte und Punkte

- **`setLocation` legt an und verschiebt** einen Punkt gleichen Namens, ist
  also ein Upsert. Es klappt auf allen drei ROMs, ohne
  `ERROR_NOT_ESTIMATE`; der Fehler aus dem Bauhaus-Projekt war nie eine
  ROM-Frage (2026-08-12).
- **`removeLocation` löscht auf keinem Roboter etwas.** Die Antwort kommt
  nach 6 ms als `result=1` mit dem Text `HWService not registered`, und der
  Punkt steht weiter in `getPlaceList()` und im Kartenwerkzeug. Der
  `NovaDriver` prüft die Liste danach selbst nach. Für ADR-0004 heißt das:
  Anlegen und Verschieben gehen vom Backend aus, Löschen und Umbenennen
  nicht. Ein gesetzter Punkt bleibt auf dem Roboter.
- **`setLocation` schreibt nur auf den Roboter.** Der Punkt war im
  Kartenwerkzeug am Gerät zu sehen, nicht im Orionstar-Portal. Für den
  Upload hat die Jar eigene Aufrufe (`uploadMapPlaceList`,
  `postSetPlaceToServer`, `uploadMapToServer`), die wir nicht nutzen.
- **Ein Punkt lässt sich nur in freie Fläche setzen.** Ist die Zelle als
  Hindernis eingezeichnet, auch als veralteter Möbelschatten, lehnt der
  Karteneditor ab. Hindernis ausradieren, dann klappt es (2026-08-25).
- **Die Punktliste kommt ohne Neustart der App.** `refreshNavStatus`
  liefert nach einer Änderung im Orionstar-Werkzeug die neue Liste
  (2026-10-01). Eine bearbeitete Karte behält aber ihren Namen; deshalb liest
  jede Fahrt die Karte neu (`robot/AGENTS.md`, „Karte und Fahrt“). Bezahlbar ist das: Lesen, Parsen und
  Aufblasen brauchten auf dem Nova zusammen 209 ms für 780 × 1120 Zellen.
  Zugleich sind damit die Stempel der letzten Fahrt weg; früher geschah das
  nur nach einer Ankunft, nie nach einem Abbruch, und das Gitter wurde von
  Fahrt zu Fahrt blockierter. Am 2026-09-01 kostete die alte Kopie einen
  Abend: Die Karte war im Orionstar-Werkzeug korrigiert, die App plante
  weiter auf der Kopie von Stunden vorher.
- **Die Ladepunkte des Herstellers** heißen `Aufladepunkt` und `Ladestapel`.
  Die App bietet sie nicht als Ziel an, der Spiegel im Backend zeigt sie.
- **Der Roboter muss lokalisiert sein**, sonst verweigert das SDK fast jeden
  Navigationsaufruf. Nach dem Einschalten oder Verschieben: auf die
  Ladesäule stellen. Schieben allein bringt den Nova nicht aus der
  Lokalisierung (2026-08-25).
- **Nach freiem Fahren** mit `goForward` oder `turnLeft` lehnt die
  Navigation jedes Ziel mit 1020 ab; von einer sauberen Position aus fahren
  alle drei Roboter ihre Punkte an. Ein 1020 mitten in einer Fahrt ist
  normal. Der CarryBot kam mit 1025 nicht zum WC, zu dem der LuckiBot fuhr:
  Er ist breiter, und auf dem Weg liegt eine Engstelle. Die übrigen Codes
  stehen in `docs/navigation-stand.md`.

## Bewegung

- **`goForward(id, speed, distance, listener)` fährt blind**, ohne Sensorik.
  Erst die Überladung mit `avoidObstacle = true` schaltet die
  Hindernisvermeidung des Fahrwerks zu (im Log `Motion avoid stop`).
- **Rückwärts gibt es keine solche Variante.** Der Nova hat hinten keine
  Sensorik. Rückwärts also nur kurze Strecken und nur dort, wo der Roboter
  gerade selbst hergefahren ist.
- **STOPP hält sofort**, auch unter Last.
- **Not-Halt:** `getEmergencyStatus` antwortet `0`, wenn er frei ist, der
  Listener hängt an `status_emergency`. Nach dem Lösen fährt der Roboter
  nicht von selbst weiter.
- **Ein Not-Halt muss beide Ebenen erreichen.** Die SDK-Fahrt anzuhalten
  genügt nicht, solange die eigene Wegpunktschleife weiterläuft: Sie
  schickt sonst den nächsten Fahrbefehl. `VergilNavigator.stop()` setzt
  deshalb das Abbruch-Kennzeichen, bricht den Auftrag ab **und** stoppt das
  SDK.
- **Der Coroutine-Scope eines Bildschirms trägt keine Fahrt.** Compose
  verwirft `rememberCoroutineScope` beim Verlassen der Composition; ein
  Reiterwechsel während der Fahrt beendet sie dann lautlos. Alles, was den
  Roboter bewegt, läuft im Lebenszyklus des Navigators
  (`RalHolder.navigator`).
- **Drehungen fallen 2,5 bis 3° zu kurz** (`docs/navigation-stand.md`).

## Kopf

- **Die senkrechte Achse ist im SDK umgekehrt:** Ein positiver Wert senkt
  den Kopf. Der `NovaDriver` dreht das Vorzeichen, im RAL gilt „positiv =
  hoch". Die waagrechte Achse ist ungeprüft.
- **LuckiBot und CarryBot haben keinen beweglichen Kopf:** `status=2
  unsupported`, danach `result=3 move head timeout`. Das ist erwartet.
- **Unbekannt:** ob der Kopf nach dem Loslassen der Zuwendung
  (`stopFaceTrack`) in die Neutrale geht. Bleibt er schief stehen, braucht
  `stopFacing()` ein `resetHead`.

## Personen und Zuwendung

- **Personen findet man nur durch Abfragen mit Reichweite.** Der Callback
  `personChanged()` feuert unzuverlässig, `getAllBodyList()` ohne Argument
  liefert eine leere Liste. Richtig ist zyklisches
  `getAllBodyList(reichweiteInMetern)`. `getAllPersons()` braucht ein
  Gesicht und findet niemanden, der dem Roboter den Rücken zudreht.
- **Die Reichweite ist ein Filter**, keine Einstellung des Sensors. Sie
  begrenzt, welche Silhouetten zurückkommen. Ein Winkelfilter
  (`body.angle`) gehört dazu, sonst reagiert der Roboter auf Leute neben
  sich.
- **Die Erkennung verliert eine Person laufend und findet sie sofort
  wieder**, auch 40 cm vor dem Roboter. Jede Regel, die an „niemand mehr in
  Sicht" hängt, flattert. Ein Totbereich über den Abstand hilft nur gegen
  das Flattern des Abstands, nicht gegen das des Vorhandenseins (Teil 8).
- **Die ID ist immer `0`.** Der Nova nummeriert Silhouetten nicht. Wer
  einmal zwischen zwei Personen umschalten will, bleibt hier hängen.
- **`startFaceTrack` nimmt die ID aus `getAllBodyList()`** an (`status=1013
  Track target succeed`), obwohl der eine Aufruf Silhouetten liest und der
  andere nach Gesichtern klingt. Das SDK gibt nach seinem eigenen
  Verlust-Timer von selbst auf (`FOCUS_LOST_MILLIS`). Rückfälle, falls es
  einmal scheitert: `startFocusFollow` mit denselben Argumenten (deprecated),
  oder selbst drehen über `angle` und `turnLeft`/`turnRight`.
- **Eine Drehgeschwindigkeit gibt das SDK nicht her** (`FaceTrackBean` hat
  keine, `Definition` keine Konstante, `RobotApi` nur das lesende
  `getNaviAngSpeed`). Deshalb hat die Zuwendung eine Uhr
  (`turnToGuestSeconds`, `turnToGuestPauseSeconds`).
- **`startBodyFollowAction` fährt hinterher.** Für einen Concierge hinter
  einer Theke ist das ein Fehler.
- **Offen: hört das Mikrofon die Motoren?** Heute tritt das nicht auf:
  Aufgenommen wird im Escort und im Finder, gedreht nur auf der
  Willkommensseite. Wer das ändert, prüft es am Gerät.

## Sprachausgabe

- **Die Sprachausgabe von Orionstar ist ein Cloud-Dienst** mit
  Google-WaveNet-Stimmen. Jeder Satz braucht Internet. Am 2026-08-11 fiel
  sie auf beiden Novas aus, auf verschiedene Weise:
  - M03SHW2A2602601161E5: SkillApi verbindet, die Synthese antwortet mit
    HTTP 500 und 0 Byte Audio, und `onComplete()` feuert trotzdem. Die API
    meldet Erfolg bei völliger Stille. Am 2026-08-12 ging sie plötzlich,
    ohne dass jemand etwas geändert hatte.
  - M03SHW1A10024135Q47F: `com.ainirobot.speechasrservice` ist deaktiviert
    (`enabled=2`, `lastDisabledCaller: shell`), und die Shell darf es nicht
    zurückschalten. Erklärt am 2026-11-06: Der Roboter läuft als AgentOS,
    und das ROM schaltet den Dienst dann selbst ab (`anfragen.md`,
    Anfrage 9).
- **Eine Android-TTS-Engine gibt es nicht** (`tts_default_synth` ist
  `null`).
- **Der Android-`MediaPlayer` erreicht den Lautsprecher**, während der
  CoreService läuft (2026-08-26). Darauf baut unsere Sprachausgabe: Das
  Backend erzeugt, der Roboter spielt ab.
- **Der Lautsprecher braucht rund eine Sekunde aus dem Standby**
  (`start_output_stream`, `out_write: first time … delay 100ms`). Hat er
  länger nichts gespielt, kann der Anfang einer Ansage verschluckt wirken.
- **Die Lautstärke ist eine Systemeinstellung** und keine Codefrage.

## Mikrofon

Gemessen am Nova, 2026-08-27 (Teil 6) und danach.

- **Die App kann aufnehmen, während der CoreService läuft.** Alle vier
  probierten Quellen liefern Signal, keine ist gesperrt. Im Systemprotokoll
  steht dazu nur
  `audio_hw_primary: in_set_parameters: kvpairs=bottom=;input_source=1;routing=-2147483644`,
  kein Fehler.
- **Eine Person auf rund 1 m:** 16 kHz, mono, 16 bit; Spitze 67 %
  (−3,4 dBFS, kein Clipping), Mittel −20,6 dBFS.
- **Der Hersteller hört immer mit.** `com.ainirobot.bms` nimmt seit dem
  Systemstart durchgehend zweikanalig mit 16 kHz auf (`dumpsys audio`). Jede
  unserer Aufnahmen lief parallel dazu, sauber. Ein Wake-Word ist für uns
  gegenstandslos; ein deutsches gibt es ohnehin nicht (Anfrage 1).
- **Echounterdrückung und Rauschunterdrückung** (AEC, NoiseSuppressor) gibt
  es, eine automatische Verstärkung (AGC) meldet das ROM nicht.
- **Der Roboter kann zuhören, während er spricht:**

  | Was lief | Spitze | Mittel |
  |---|---|---|
  | Person spricht, keine Effekte | 67 % | −20,6 dBFS |
  | nur Lautsprecher, keine Effekte | 25 % | −43,6 dBFS |
  | nur Lautsprecher, AEC und NS an | 0 % | −70,9 dBFS |
  | Lautsprecher und Person, AEC und NS an | 67 % | −20,6 dBFS |

  Der eigene Lautsprecher liegt rund 23 dB unter einer Stimme, die
  Echounterdrückung drückt ihn um weitere 27 dB, und die Stimme kommt
  unverändert durch. Damit darf ein Gast dem Roboter ins Wort fallen.
- **Der Raum:** Im leeren Studio −70,9 dBFS, am 2026-09-02 −76,7 dBFS.
  **−100,0 dB ist kein Messwert**, sondern „digital still": Der Nova liefert
  rund 27 % exakte Nullen, und war die Messung so leise, meldet der
  Pegelmesser seinen Anschlag. Die Schwelle fällt dann auf ihre Untergrenze
  von −60 dBFS (`MIN_THRESHOLD_DBFS`).
- **Ein fester Tipp auf „Sprechen" kommt mit −12 dBFS am Mikrofon an**, so
  laut wie eine Stimme, und klingt eine halbe Sekunde nach (2026-11-03).
  Deshalb ist der Raum ein gewichtetes Mittel (`ROOM_EDGE_WEIGHT`) und die
  Schwelle nach oben bei −30 dBFS gedeckelt (`MAX_THRESHOLD_DBFS`).
  Gemessen danach: fester Tipp Raum −37, Schwelle −25; sanfter Tipp −100 und
  −60.
- **Wer in die Raummessung hineinspricht, wird selbst zum Raum.** Ein Raum
  um −20 dB in der Entwicklerzeile heißt genau das; vor der Obergrenze
  blieb die Stimme dann grau (−21 / −9).

## Schirm und Darstellung

- **Nova:** `wm size` 1920x1080, `wm density` 280 (physisch 560). Das
  Lebenszeichen meldet Dichte 1,75 und 1097 × 617 dp. Am ersten Gerätetag,
  bei 560 dpi, sah die App nur rund 308 × 548 dp, und Layouts, die die
  Höhe mit `weight()` verteilen, quetschten Bedienelemente zusammen.
- **Chinesisch** kommt am Roboter aus Noto Sans CJK, alles andere aus der
  Roboto der App.
- **Ein animiertes WebP zeichnet Android 9 in seiner dekodierten Größe**,
  gleich welche Grenzen das Drawable hat. Die App skaliert deshalb die
  Leinwand (`canvasTransform`, `robot/AGENTS.md`, „Zeichnen“).
- **Der WebView ist Chromium 95** und nimmt die Systemdichte (280).
  - Aus Compose bekommt er ein „höchstens"-Maß, und Prozenthöhen werden
    dann 0: Die Google-Karte war geladen, das iframe aber 0 px hoch. Mit
    `MATCH_PARENT`-LayoutParams rendert sie (2026-09-21).
  - Unter 200 CSS-Pixeln Höhe blendet die Embed-Karte von Google ihre
    Routenkarte aus.
  - Bei einem Ladefehler malt Chromium seine Fehlerseite mit der vollen
    Adresse in den Rahmen. `MapFrame` nimmt den Rahmen dann vom Schirm.
  - Beim Verlassen wird er wirklich zerstört: zehnmal Kalender auf und zu,
    PSS 287 MB vorher, 237 MB nachher (Teil 9).
  - Berührungen im WebView kommen am `pointerInput` der Session an, der
    Ruhezustand kennt sie also.
- **Dauerlauf:** Bildfolge über eine Stunde, Speicher stabil, kein Ruckeln
  (2026-08-14).

## Speicher und Katalog

**Was auf dem Rechner schnell ist, ist auf dem Roboter langsam.** Der
Sicherheitssaum um die Hindernisse brauchte dort 56 Sekunden, weil der
geerbte Code je berührter Zelle ein Objekt anlegte; jetzt sind es 56 ms.
Alles, was über die ganze Karte oder den ganzen Katalog läuft, wird auf dem
Gerät gemessen.

Die Heap-Grenze der App ist auf Nova und LuckiBot 512 MB. Gemessen mit
100.000 synthetischen Produkten (`synth_catalog`), Katalogdatei 81 bis
85 MB:

| | Nova | LuckiBot |
|---|---|---|
| Teil 11, ganzer Index im Speicher: Kaltstart | 12 s | 14 s |
| Teil 11: zweiter großer Sync | `OutOfMemoryError` | `OutOfMemoryError` |
| Teil 13, SQLite: Sync | 33 bis 47 s | 39 bis 47 s |
| Teil 13: Kaltstart | 2 bis 3 s | 2 bis 3 s |
| Teil 13: TOTAL PSS | 108 MB | 67 MB |
| Teil 13: Heap nach Bereinigung, höchstens | 307 bis 382 MB | 383 MB |
| Teil 13: Neubau der Datenbank beim ersten Start | 24 s | 27 s |

Mit dem ganzen Index im Speicher (Teil 11) lagen 448 MB TOTAL PSS und
353 MB Heap allein für den Index; an welchem der beiden Roboter, steht im
Protokoll nicht.

Was daraus folgt:

- **Der Bau hält fast das Fünffache der Datei** (383 MB für 81 MB). Daher
  `CATALOG_HEAP_FACTOR` 5, und der freie Heap wird nach einer Bereinigung
  gemessen: Direkt nach einer Installation zählten noch 434 MB Müll als
  belegt.
- **Ein Katalog, der nicht passt, friert vorher den Schirm ein.** Ohne die
  Größenprüfung stand der LuckiBot eine Minute (ANR, „Waiting for a blocking
  GC Alloc"), bis der Fehler kam. Deshalb wird vor dem Parsen abgewiesen.
- **Die Grenze ist weiter der Speicher, nur später.** Bei 512 MB Heap sind
  das rund 120.000 Produkte im Format von `synth_catalog`, echte mit
  längeren Texten weniger. Darüber hilft nur ein Bau, der den Katalog nicht
  ganz im Speicher hält (Vorhaben „Retail großer Katalog“ in
  `docs/FAHRPLAN.md`). Ein `OutOfMemoryError` beim Installieren bleibt ein
  Befund und kein Absturz, die alte Edition läuft weiter (ADR-0008).
- **Eine neue Edition mit unverändertem Katalog baut nicht neu**, sie
  kopiert Katalogdatei und Datenbank von der laufenden oder wartenden
  Edition, wie jedes Medium mit gleichem Hash (ADR-0008, Nachtrag; Bauplan
  `docs/plans/2026-11-01-medien-wiederverwenden.md`). Wer am Gerät eine
  abgewiesene Edition braucht, muss deshalb eine Datei fehlen lassen, die der
  Roboter noch nicht hat. Nach einem APK-Update mit 100.000 Produkten steht
  für den Neubau (wenn die Datei fehlt, kaputt ist oder eine ältere `VERSION`
  trägt) eine halbe Minute der Ladeschirm.
- **Alle Zahlen gelten für die Katalogdatenbank in Fassung 2.** Fassung 3
  (Dreiergruppen, seit 2026-10-31) ist am 2026-11-10 mit 100.000 Produkten
  am Studio-Nova durchgelaufen, auch der zweite große Sync (Archiv, Abschnitt
  „Gerätetag 2026-11-10“). Ihre Zahlen stehen hier noch nicht.

## Netz

- **Schwaches WLAN bricht den Download ab.** Mit geschlossener Tür zum
  Serverraum verband sich der Nova 6 s nach dem Start des Syncs neu mit dem
  Access Point, dann kam ein Timeout zum Backend (2026-10-15). Seit dem
  Kommando-Kanal kommt ein solcher Abgleich nach 1, 2, 4 … 30 Minuten
  wieder.
- **Zeitstempel der Ereignisse** sind Epoche in UTC; die falsche Zone der
  adb-Shell trifft sie nicht.

## RobotOS

- **Systemübernahme:** Muss sich der Roboter neu lokalisieren, holt RobotOS
  die Hersteller-App nach vorn. Erwartet ist, dass der Concierge sich etwa
  anderthalb Sekunden nach `onRecovery` zurückholt, im Log „RobotOS is done,
  bringing the concierge back to the front". Gesehen hat das noch niemand:
  Die Übernahme ließ sich nicht provozieren (2026-08-25). Beobachten im
  Betrieb, `docs/inbetriebnahme.md`.
- **Der Nova `spe` läuft als AgentOS**, und das ROM schaltet Dienste je
  Betriebsart um (`anfragen.md`, Anfrage 9).
