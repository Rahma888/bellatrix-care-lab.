# Navigation: Stand, Probleme, offene Punkte

Stand 2026-08-14, nach dem Testtag 2026-08-13 und der Nacht darauf. Branch
`nav/smooth-waypoint-handover`.

Diese Datei ist für die Session gedacht, die die Navigation irgendwann wieder
aufnimmt. Sie beantwortet drei Fragen: Was läuft? Was hat uns aufgehalten und
wie wurde es gelöst? Was ist noch offen?

Ergänzend dazu: Die Prüfschritte am Gerät und die rohen Messreihen stehen im
Archiv der Gerätetests (`docs/archiv/geraetetests-2026.md`, Teil 2 und 3 und
„Der Drehscan"). Die Chronologie der Phase lag in
`docs/IMPLEMENTATION_PLAN.md`; die Datei hat danach andere Phasen getragen,
die alte Fassung findet `git log -- docs/IMPLEMENTATION_PLAN.md`.
Was über SDK und Gerät auch außerhalb der Navigation gilt, steht in
`docs/orionstar/geraetewissen.md`.

## Kurzfassung

Die Navigation funktioniert. Der Roboter plant auf seiner eigenen Karte, fährt
die Route flüssig ab, weicht Hindernissen aus, plant neu, misst seine Umgebung
neu wenn die Karte ihn in die Irre führt, tastet sich an blockierten Stellen
vorbei und fährt zurück, wenn nichts mehr geht.

Der letzte Testlauf am 2026-08-13 um 04:09 Uhr: **22 m Strecke, angekommen nach
4 Minuten 45**, mit fünf Neuplanungen und zwei Messrunden unterwegs. Ein
Hindernis stand im Weg, der Roboter hat es über die andere Seite umfahren.

Das ist langsam, aber es kommt an. Vor dem Testtag brach dieselbe Fahrt ab.

## Wie eine Fahrt abläuft

1. **Planen.** A\* auf dem Belegungsgitter aus der PGM-Karte des Roboters,
   1120×600 Zellen zu 5 cm, beim Laden um 40 cm aufgeblasen. Danach
   Sichtlinien-Vereinfachung: aus rund 430 Gitterzellen werden 12 bis 18
   Wegpunkte.

2. **Fahren, Wegpunkt für Wegpunkt.** Jeder Wegpunkt geht als eigener
   `startNavigation`-Auftrag an das SDK.

3. **Übergabe in Fahrt.** Ein Zwischenwegpunkt gilt als erreicht, sobald der
   Roboter näher als der Übergabe-Radius dran ist, und die laufende Navigation
   wird nicht gestoppt. Ohne das bremst er an jedem Wegpunkt bis zum Stillstand
   und dreht sich zurecht. Am letzten Wegpunkt gibt es keine Übergabe.

4. **Blockade erkennen.** Drei Wege führen dorthin: das Zeitlimit der Etappe,
   Stillstand für 8 Sekunden, oder ein Ausweichmanöver, das nach 12 Sekunden
   nicht vorbei ist. Alle drei enden gleich: die Stelle 90 cm vor dem Roboter
   wird mit 60 cm Radius im eigenen Gitter gesperrt, dann wird neu geplant.

5. **Messen nach drei Fehlversuchen.** Der Roboter dreht sich einmal um sich
   selbst und fragt in acht Richtungen ab, wie weit es frei ist. Was frei
   gemessen wurde, wird im Gitter freigeschnitten, was blockiert gemessen wurde,
   gesperrt. Die Messung schlägt die Karte.

6. **Ausweichschritt.** Bis zu 1,5 m in die gemessene Richtung, die dem Ziel am
   nächsten kommt. Gefahren mit `moveForward`, nicht mit einem
   Navigationsauftrag: der Sinn ist ja, dorthin zu fahren, wo die Karte sagt es
   geht nicht.

7. Schritte 5 und 6 höchstens dreimal je Fahrt.

8. **Rückzug.** Wenn nach sechs Neuplanungen nichts geht: zurück zum Startpunkt
   der Fahrt, und wenn auch das scheitert, zum Standby-Punkt. Nicht nach einem
   STOPP von Hand.

## Was am Gerät gemessen wurde

Das sind die Befunde, die man nicht noch einmal herausfinden muss. Alle am
LuckiBot (OS-R-DR02, 192.168.69.151, V10.5).

### `checkIfHasObstacle` kann genau eine Sache

Die Signatur verspricht einen Winkelbereich. Über Dutzende Abfragen hinweg gilt:
**nur eine Abfrage mit Startwinkel 0 antwortet je „blockiert"**, egal wo das
Objekt steht. Vorne, seitlich, zwei Objekte gleichzeitig, immer dasselbe. Ein
negativer Startwinkel antwortet immer „blockiert", auch in leerer Halle, und ist
als Messung wertlos.

Der Aufruf bedeutet: „ist etwas geradeaus innerhalb von X Metern". Antwortformat
ist `result=1` mit `message=true` oder `message=false`.

Deshalb dreht sich der Roboter. Acht Schritte zu 45°, an jedem Halt eine Abfrage
je Entfernungsstufe.

### Der Lidar sitzt vorne unten

Sichtfeld etwa 90 bis 120°, nach hinten sieht er nichts. **Ein „frei" aus einer
Richtung ohne Sensorsicht heißt „nicht gemessen", nie „frei".** Das ist die
harte Sicherheitsregel, an der die ganze Messerei hängt.

### Dünne Strukturen sieht er nur zeitweise

Elf Scans von derselben Stelle: sieben von acht Sektoren jedes Mal identisch.
Der achte, in dem drei Stative mit dünnen Stangen und dünnen Dreibeinen standen,
sprang zwischen frei und blockiert, sechsmal frei, fünfmal blockiert, mit
Blockadeweiten zwischen 1,25 m und 2,25 m.

Derselbe Punkt mit einem massiven Gegenstand, vier Scans:

```
von 96,1°  0.0|0.5 0.0|0.5 3.0+ 3.0+ 2.75|3.0 2.25|2.5 0.0|0.5 0.0|0.5
von 97,9°  0.0|0.5 0.0|0.5 3.0+ 3.0+ 2.75|3.0 2.25|2.5 0.0|0.5 0.0|0.5
von 93,3°  0.0|0.5 0.0|0.5 3.0+ 3.0+ 2.75|3.0 2.25|2.5 0.0|0.5 0.0|0.5
von 91,0°  0.0|0.5 0.0|0.5 3.0+ 3.0+ 2.75|3.0 2.25|2.5 0.0|0.5 0.75|1.0
```

Viermal derselbe Wert, auf die Stufe genau. Daraus folgt die Asymmetrie im Code:
**ein „blockiert" ist verlässlich, ein „frei" nur für massive Geometrie.**
Deshalb wird schmal und mit Abstand freigeschnitten, aber großzügig gesperrt.

Die einzige Abweichung oben ist Geometrie: die Startrichtung wanderte über die
vier Läufe von 96,1° auf 91,0°, damit wandert jede Sektorgrenze mit, und vorn
rechts fiel etwas aus dem Kegel, das vorher am Rand lag.

### Die Sondenpause ist wirkungslos

22 Scans, Pause zwischen den Abfragen von 50 bis 500 ms durchprobiert. Die
Streuung war bei einer halben Sekunde dieselbe wie bei einem Zwanzigstel. Steht
jetzt auf 100 ms, bleibt aber ein Regler, weil das an einem Roboter gemessen
wurde.

### Das SDK nimmt nie ein neues Ziel bei laufender Fahrt an

Ausnahmslos `-1` (`ACTION_RESPONSE_ALREADY_RUN`). Jede Übergabe läuft also über
den Rückfallpfad: stoppen, kurz warten, neu starten. `stopNavigation` bestätigt
nach 20 bis 40 ms, deshalb steht die Wartezeit auf eskalierend 150/400 ms statt
fest 400.

### Der Antrieb dreht jede Drehung zu kurz

Um 2,5 bis 3°. Deshalb werden die Sektoren bei der Richtung protokolliert, die
wirklich erreicht wurde, und die Drehziele sind absolut statt relativ. Sonst
summiert sich der Fehler über acht Schritte auf 15 bis 20°.

### Codes, die anders bedeuten als sie heißen

| Code | Heißt im SDK | Bedeutet wirklich |
|---|---|---|
| 1018 | local path search failed | Ausweichmanöver beginnt |
| 1019 | local path search succeed | Ausweichmanöver vorbei |
| 1020 | goal outside map | kommt mitten in Fahrten, die sauber enden. **Kein Abbruchgrund** |
| 1025 | global path failed | wirklich kein Weg, Neuplanung sinnvoll |
| -1 | already run | eine Aktion läuft noch, erneut versuchen |
| -109 | timeout | das SDK-eigene Zeitlimit. **Blockade, kein Fehler** |
| -113 | error in destination | steht schon am Ziel. **Erfolg, kein Fehler** |

## Was uns aufgehalten hat

Chronologisch, weil die Reihenfolge zeigt, wie sich das Problem verschoben hat.

**Halt an jedem Wegpunkt.** Drei Ursachen gleichzeitig: das Warten auf die echte
Ankunft, ein `stopNavigation` vor jeder Etappe, und als Ziel-Theta die
Ausfahrtrichtung statt der Einfahrtrichtung. Gelöst durch Übergabe in Fahrt,
Start ohne vorheriges Abräumen, und die Einfahrtrichtung.

**`-109` beendete die ganze Fahrt** statt neu zu planen. Derselbe Sachverhalt
hatte damit zwei verschiedene Ausgänge, je nachdem welche Uhr zuerst ablief.

**Der Übergabe-Radius verschluckte Ausweichrouten.** Ein Radius größer als die
Etappe meldete drei Wegpunkte in 855 ms als erreicht, ohne dass der Roboter sich
bewegt hatte. Gedeckelt auf die halbe Etappenlänge.

**Der Roboter mauerte sich selbst ein.** Jede gescheiterte Etappe stempelte
einen 60-cm-Kreis, nach vier Versuchen lagen die Kreise um einen Roboter herum,
der sich zwischendurch nicht bewegt hatte. Sichtbar wurde das erst durch die
Kartendiagnose: violette Sperrkreise, rote Hindernismarken, blasse frühere
Routen. Die Freimessung ist die Gegenmaßnahme, sie löscht die eigenen Stempel
dort, wo frisch gemessen wurde.

**Die Karte ist veraltet.** Der eigentliche Auslöser für alles ab hier. An der
Stelle, an der die Fahrt aufgab, zeigte die Karte links und hinten Wände, wo
tatsächlich eine Durchfahrt war, und offene Fläche, wo etwas stand. Von innerhalb
des Gitters sind die beiden nicht unterscheidbar, und keine Zahl von
Neuplanungen kommt da raus: sie lesen alle dieselbe Karte.

**Die Sektorsuche halbierte statt zu laufen.** Die erste Fassung des Tiefenscans
nutzte Intervallhalbierung. Deren erste Sonde sitzt in der Mitte der Reichweite,
und ein Fehlmesswert dort schickt die Suche nach außen, ohne je auf das Nähere
zu schauen. Aus einem Flackern wurde so die maximal falsche Antwort. Jetzt wird
von nah nach fern gelaufen, mit Abbruch beim ersten „blockiert". Ein Fehlmesswert
lässt die Suche dann zu früh aufhören, und das ist die harmlose Richtung.

**Der Drehscan kam erst zu spät, dann zu früh.** Erst lief er nur, wenn alle
Neuplanungen aufgebraucht waren, also nach über zwei Minuten Gefahre im selben
falschen Eck. Auf zwei Fehlversuche gestellt war er dann zu eifrig und ging auf
der Rückfahrt an einer Stelle in die Drehung, an der der Roboter von allein
durchgekommen wäre. Steht jetzt auf drei. Die Abwägung ist einfach: eine
Neuplanung kostet Sekunden, ein Scan eine halbe Minute.

**Feste 30 Sekunden je Etappe.** Der größte Zeitfresser. Eine Fahrt von sieben
Minuten verbrachte über vier davon mit Warten auf Etappen, deren Ausgang längst
feststand. Etappen um ein Hindernis herum sind fast immer unter einem Meter, und
die bekamen dieselbe halbe Minute wie eine Zehn-Meter-Gerade. Jetzt richtet sich
das Limit nach der Länge, und Stillstand beziehungsweise endloses Ausweichen
schneiden zusätzlich ab.

**Freischneiden allein reicht nicht.** Die Messung öffnete einen Korridor, der
fast genau aufs Ziel zeigte, und der Planer nahm trotzdem den Umweg in die
andere Richtung. Der Grund: ein freigeschnittener Keil reicht so weit wie der
Sensor sieht, also 2,75 m, und dahinter fängt wieder die alte Karte an. Ein Weg
braucht einen Durchgang, und 2,75 m sind kein Durchgang. Deshalb der
Ausweichschritt.

## Die Zahlen und warum sie so sind

Alle Konstanten stehen im `private companion object` von `VergilNavigator` oder
oben in `NovaDriver.kt`, jeweils mit Begründung im Doc-Kommentar. Die
wichtigsten:

| Wert | Größe | Warum |
|---|---|---|
| 6 s + 4 s/m | Zeitlimit je Etappe | rund 0,25 m/s, halb so schnell wie der Roboter kann |
| 8 s | Stillstand bis Blockade | ein Differentialantrieb dreht am Etappenanfang auf der Stelle, eine halbe Drehung dauert 4 s |
| 12 s | Ausweichen bis Blockade | 15 Manöver im Log: zehn endeten von selbst, neun binnen 10 s, die zwei die nie endeten liefen 28 und 29 s |
| ein Achtel | Geduld gemessen am Etappenlimit | damit der Rückzug mit seinen zwei Minuten nicht an derselben kurzen Leine hängt |
| 3 Fehlversuche | bis zum Drehscan | einer ist Pech, drei auf unveränderter Karte sind eine Aussage über die Karte. Zwei war zu eifrig: auf der Rückfahrt ging der Roboter in die 20-Sekunden-Drehung an einer Stelle, an der er von allein durchgekommen wäre |
| 3 | Messrunden je Fahrt | rund 4,5 m über das hinaus, was die Karte zu wissen glaubt |
| 30° | angenommener Sensorkegel | geschätzt aus dem Verhalten am Gerät, das SDK sagt es nirgends |
| 25 cm | Sicherheitsabstand beim Freischneiden | eine Sondenstufe |
| 1,0 m | Mindesttiefe eines Freischnitts | weniger ist kein Fahrweg |
| 60 cm | schmalste freigeschnittene Gasse | Roboterbreite |
| 50 cm | Tiefe eines gemessenen Hindernisses | der Sensor meldet eine Fläche, der Roboter muss um einen Körper |
| 1,5 m | Ausweichschritt | die Messung reicht 2,75 m, den ganzen Weg zu gehen hieße auf der letzten gemessenen Zelle stehen |
| 1,2 m | Übergabe-Radius | seit 2026-08-14, vorher 0,8. Die Deckelung auf die halbe Etappe trägt die kurzen Etappen ohnehin |

## Was auf der Karte zu sehen ist

| Farbe | Bedeutung |
|---|---|
| grün | geplante Route |
| orange | tatsächlich gefahrene Spur |
| violette Kreise | Flächen, die wir uns selbst gesperrt haben |
| rote Ringe | wo die Hindernisvermeidung des Fahrwerks angeschlagen hat |
| blasse Linien | Routen früherer Versuche derselben Fahrt |
| blasses Grün, 45° | so weit war diese Richtung im Scan frei |
| kräftiges Grün, 30° | so viel davon wurde wirklich freigeschnitten |
| rot | ab hier hat der Sensor etwas gefunden |

Das kräftige Grün ist absichtlich schmaler als das blasse. Eine Karte, die einen
breiteren Korridor verspricht als der Planer bekommt, wäre schlimmer als gar
keine.

## Offen: was eine Stufe 3 enthalten würde

Nach Nutzen sortiert.

### 1. Niemand hört zu, was der Ausweichschritt antwortet

Der klarste Defekt, gefunden im Log des letzten Laufs und bewusst nicht mehr
behoben. `Ral.moveForward` gibt nichts zurück, es ist ein Zuruf ohne Antwort.
Die Antwort kommt aber, sie steht im Log und niemand wertet sie aus. Wir pollen
stattdessen die Pose, bis die Zielstrecke erreicht ist oder 15 Sekunden um sind.

Vier Ausweichschritte in einer Nacht, mit dem, was der Roboter jeweils
geantwortet hat:

```
04:09:20  goForward(1.5 m)   → result=1 succeed            nach  6,3 s
04:11:37  goForward(1.25 m)  → result=1 failed             nach 15,0 s
04:12:51  goForward(1.5 m)   → result=1 Motion avoid stop  nach  1,2 s
04:18:36  goForward(1.5 m)   → result=1 succeed            nach  6,3 s
```

Drei Befunde daraus.

**Zweimal lief es einwandfrei.** Der Mechanismus funktioniert, wenn der Weg
wirklich frei ist. Trotzdem stand der Roboter jedes Mal die restlichen 9
Sekunden herum, weil niemand das `succeed` gelesen hat.

**Einmal kam „Motion avoid stop" nach 1,2 Sekunden.** Die Hindernisvermeidung
des Fahrwerks hat abgebrochen. Sebastian hat sich die Stelle angesehen: **da war
definitiv nichts im Weg.** Damit ist die naheliegende Erklärung erledigt, der
Sensorkegel sei schmaler als angenommen. Wo nichts steht, kann ein schmaler
Kegel auch nichts übersehen. Übrig bleibt der Verdacht, dass die
Live-Hindernisschicht des SDK an dieser Stelle noch festhält, was vorher da war,
und der Roboter vor seiner eigenen Erinnerung bremst. Das ist beim nächsten
Testtag zu prüfen und führt direkt zu Punkt 3.

**Einmal kam 15 Sekunden lang gar keine Antwort**, und der Roboter legte in der
Zeit 47 cm zurück. Das `failed` kam 25 ms nach unserem eigenen `stopMove`, war
also unsere Reaktion und nicht seine. Dieser Fall braucht wirklich eine
Stillstandserkennung.

Die Behebung hat damit zwei Teile, beide klein. `moveForward` muss eine Antwort
zurückgeben, so wie `driveTo` es tut, dann sind zwei der vier Fälle sofort
erledigt. Und für den vierten dieselbe Stillstandserkennung wie bei einer
Etappe. Zusammen kosten die Ausweichschritte dann Sekunden statt der 20, die
heute pauschal anfallen.

### 2. Temporäre Sperren und Freischnitte haben keinen Sicherheitsring

Die Karte wird beim Laden um 40 cm aufgeblasen. Unsere eigenen Stempel nicht,
und ein Freischnitt hebt das Aufblasen an dieser Stelle sogar auf. Die
freigemessene Gasse ist am Roboter genau roboterbreit, und A\* darf am Rand
entlang planen.

Bewusst nicht angefasst, weil die naheliegende Korrektur Blockaden so groß
macht, dass in einem Gang kein Weg mehr bleibt. Die richtige Lösung ist
vermutlich, den Ring nur beim Freischneiden anzuwenden und die Stempel zu
lassen.

### 3. Die Live-Hindernisschicht des SDK

Der Roboter führt selbst eine Karte der Dinge, die er gerade sieht. Wir lesen
sie nicht. Täten wir es, bräuchte es den Drehscan an vielen Stellen gar nicht,
und die Messung wäre nebenbei da statt für 20 Sekunden Stillstand.

Dieselbe Schicht ist der Hauptverdächtige für das „Motion avoid stop" aus Punkt
1. Wenn der Roboter dort bremst, wo nichts steht, bremst er vermutlich vor
etwas, das er sich vorhin gemerkt hat. **Der erste Test beim nächsten Testtag:**
den Roboter an eine nachweislich freie Stelle stellen, an der er sich vorher
festgefahren hat, und `moveForward` von Hand auslösen. Kommt dann wieder „Motion
avoid stop", ist es die Schicht.

`clearCurNaviMap` aus dem SDK gehört in dieselbe Ecke und ist ungetestet.
Könnte genau diese Schicht zurücksetzen, könnte auch die richtige Karte
wegwerfen. **Nicht ohne Rücksprache anfassen**, und wenn, dann an einem Roboter,
dessen Karte man notfalls neu aufspielen kann.

### 4. Messen während der Fahrt statt im Stand

Der Drehscan kostet 20 Sekunden Stillstand. Ein Roboter, der beim Fahren
mitmisst, hätte dieselbe Information umsonst. Setzt Punkt 3 voraus oder eine
andere Sensorquelle als `checkIfHasObstacle`.

### 5. Die Karte wirklich aktualisieren

Alles, was gemessen wird, gilt heute nur bis zum nächsten `clearTemporaryBlocks`,
also faktisch für eine Fahrt. Eine Halle, in der dreimal am Tag dieselbe Palette
steht, lernt der Roboter nie. Das ist aber eine Entscheidung mit Folgen, kein
Feature: eine Karte, die sich selbst schreibt, kann sich auch selbst zumauern.
Gehört in ein ADR, bevor eine Zeile davon entsteht.

### 6. Ein reaktiver lokaler Planer

Heute ist der Ablauf bei einem Hindernis: anhalten, sperren, komplett neu planen.
Ein lokaler Planer (DWA oder ähnlich) würde in der Fahrt daran vorbeilenken. Das
ist der eigentliche Sprung in der Flüssigkeit und gleichzeitig der größte
Brocken. Erst sinnvoll, wenn 1 bis 3 erledigt sind.

### 7. Keine Unit-Tests für Treiber und Navigator

`robot/navigation/` hat 55 Tests, davon 7 für die Keil-Geometrie der Freimessung. RAL
und `VergilNavigator` haben keine, weil sie am SDK hängen, das auf dem
Entwicklungsrechner nicht existiert. Geprüft wird am Gerät, im Reiter „Karte"
des Entwicklerzugangs; der Ablauf steht im Archiv der Gerätetests
(`docs/archiv/geraetetests-2026.md`, Teil 3). Ein Fake-SDK wäre möglich, war
bisher den Aufwand nicht wert.

## Wie man es prüft

APK bauen und aufspielen:

```bash
cd robot
JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-17.0.20.8-hotspot" \
  ./gradlew :navigation:test :app:installDebug
```

Mitlesen:

```bash
ADB="/c/Users/seb_vesper/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" -s 192.168.69.151:5555 logcat -d -v time -s VergilRal:V VergilNav:V
```

Zwei Fallen, die sonst Zeit kosten:

- **Der Roboter muss lokalisiert sein**, sonst verweigert das SDK fast alles.
- **Nach Handbetrieb landet er in einem Zustand, aus dem jede Navigation mit
  1020 abbricht.** Von einer sauberen Position starten. Ein 1020 während einer
  laufenden Fahrt ist dagegen normal.

Die Versionszeile auf dem Bildschirm zeigt den Commit, aus dem die APK gebaut
wurde, mit einem `+` wenn ungetrackte Dateien danebenlagen. Nach jedem Commit neu
aufspielen, sonst zeigt der Bildschirm etwas anderes als `git log`.
