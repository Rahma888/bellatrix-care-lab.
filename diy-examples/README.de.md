# So erstellen Sie Ihr Spiel und bringen es auf den Roboter

Der Roboter kann Spiele zeigen, die das Pflegeteam selbst gemacht hat, zum Beispiel mit ChatGPT oder Claude.
Das Spiel erscheint groß auf dem Tablet des Patienten. Die Bewohnerin oder der Bewohner spielt durch Antippen oder durch Zeigen in der Luft (die Hand etwa eine Sekunde ruhig auf einem Knopf halten).

Fertiges Beispiel: **`memory.zip`** in diesem Ordner. Ein Memory-Spiel (6, 8 oder 12 Karten; Blumen, Tiere oder Bayern; auf Deutsch, Französisch und Englisch). Sie können es so, wie es ist, auf den Roboter schicken (Schritt 3) oder als Vorlage nehmen.

---

## 1. Das Spiel bei Ihrer KI bestellen

Kopieren Sie den Text unten in ChatGPT, Claude oder eine andere KI. Ersetzen Sie nur die Zeile in eckigen Klammern durch Ihre Idee. Diese Regeln sorgen dafür, dass das Spiel auf dem Roboter läuft.

```text
Erstelle mir ein kleines Spiel für ältere Menschen in einer Pflegeeinrichtung. Es wird auf
einem großen Touch-Tablet im Hochformat gezeigt (etwa 1080 × 1580 Pixel).

Das Spiel: [BESCHREIBEN SIE HIER IHR SPIEL, zum Beispiel „ein Memory mit Gartenblumen“
oder „ein Quiz über alte Schlager“].

Technische Regeln (Pflicht):
1. Eine einzige Datei index.html, mit HTML, CSS und JavaScript darin.
   Kein React, kein Vite, kein npm, kein Build-Schritt.
2. Keine Verbindung zum Internet: kein CDN, keine Google Fonts, keine Bilder oder Töne
   aus dem Internet. Zeichne die Bilder als SVG direkt in die Datei.
   Schrift: Arial oder die Systemschrift.
3. Benutze weder localStorage noch sessionStorage, Cookies oder IndexedDB: alles bleibt im Speicher.
   Kein alert(), confirm() oder prompt(), keine neuen Fenster, keine Links zu anderen Seiten,
   keine Formulare.
4. Alles, was man antippen kann, ist ein echtes <button>-Element, mindestens 120 Pixel hoch,
   mit mindestens 40 Pixel großer Schrift. Das Spiel reagiert nur auf das Ereignis "click":
   kein Hover nötig, kein Ziehen und Ablegen, kein Doppelklick, keine Tastatur.
5. Die Seite füllt den ganzen Bildschirm, ohne Scrollen, und passt sich der Fenstergröße an.
6. Einfaches JavaScript, das in Chrome 95 läuft (keine ganz neuen Funktionen).

Für ältere Menschen:
7. Weißer Hintergrund, ruhige Farben, starker Kontrast, kaum gerundete Ecken (höchstens 5 Pixel),
   keine Farbverläufe, keine Emojis.
8. Keine Uhr, die abläuft, keine Minuspunkte, nie „verloren“ oder „falsch“:
   nur freundliche Ermutigung.
9. Sehr wenig Text. Standardmäßig auf Deutsch, mit Knöpfen DE / FR / EN zum Wechseln der Sprache.

Gib mir die vollständige Datei index.html.
```

Öffnen Sie die Datei auf Ihrem Computer (Doppelklick) und schauen Sie sie an. Wenn etwas nicht passt, sagen Sie es der KI einfach („die Knöpfe sind zu klein“, „nimm die Uhr weg“).
Wenn die KI mehrere Dateien liefert (`index.html`, `style.css`, `game.js` …), ist das auch gut: Legen Sie sie zusammen in einen Ordner.

## 2. Das Spiel auf GitHub stellen oder eine .zip-Datei machen

**Am einfachsten: eine Datei.** Ein Spiel aus einer einzigen Datei `index.html` kann direkt geschickt werden.
Mehrere Dateien: Legen Sie sie in einen Ordner, dann Rechtsklick auf den Ordner → **Senden an** → **ZIP-komprimierter Ordner** (am Mac: **Komprimieren**). So entsteht eine `.zip`-Datei.

**Oder auf GitHub** (praktisch für spätere Änderungen):
1. Legen Sie ein kostenloses Konto auf github.com an.
2. Oben rechts **+** → **New repository**. Geben Sie einen Namen ein (zum Beispiel `memory-blumen`), wählen Sie **Public**, dann **Create repository**.
3. Klicken Sie auf **uploading an existing file**, ziehen Sie Ihre Dateien in die Seite, dann **Commit changes**.
4. Kopieren Sie die Adresse der Seite aus dem Browser, zum Beispiel `https://github.com/ihr-name/memory-blumen`.

Das Projekt muss **öffentlich** (Public) sein: Der Roboter lädt es ohne Passwort herunter.

## 3. Das Spiel auf den Roboter schicken

1. Auf dem Bildschirm am Kopf des Roboters (Care Team), neben **Aktivität wählen**, tippen Sie auf **Spiel hinzufügen**. Ein QR-Code und ein Code erscheinen.
2. Scannen Sie den QR-Code mit dem Handy (oder öffnen Sie die angezeigte Adresse am Computer und geben Sie den Code ein).
3. Fügen Sie den GitHub-Link ein, **oder** tippen Sie auf **Datei wählen (.zip oder .html)**.
4. Geben Sie dem Spiel einen **Namen**. **Für wen** ist freiwillig. Bei **Sprache des Spiels** wählen Sie die Sprache des Spiels: Der Patientenbildschirm rund um das Spiel (der Knopf **Fertig**) spricht dann diese Sprache.
5. Tippen Sie auf **Senden**. Warten Sie: Herunterladen → Prüfung → Installation → **Bereit**.

Der Roboter prüft das Spiel. Fehlt etwas, sagt er es in einfachen Worten (siehe unten).
Für eine neue Version: Schicken Sie denselben Link noch einmal (oder dieselbe Datei mit demselben Namen). Die alte Version wird ersetzt, es entsteht kein Doppel. Ein Spiel von GitHub lässt sich auch am Kopf des Roboters erneuern: **Aktualisieren**.

## 4. Ausprobieren, dann mit einem Bewohner spielen

1. Am Kopf des Roboters erscheint das Spiel unter **Spiele des Teams**, mit **Neu**. Tippen Sie es an.
2. Tippen Sie auf **Ausprobieren**: Das Spiel erscheint wie auf dem Tablet. Prüfen Sie, ob alles gut lesbar ist und die Knöpfe reagieren. Schließen.
3. Wählen Sie den Bewohner (und das Zimmer), dann **Auf dem Patientenbildschirm starten**, wie bei den anderen Aktivitäten.
4. Auf dem Tablet füllt das Spiel den Bildschirm. Der große Knopf **Fertig** unten beendet die Sitzung. Sie erscheint danach in den Ergebnissen.

Ein Spiel entfernen: in der Liste antippen, dann **Entfernen** (zweimal, zur Bestätigung).

## Wenn der Roboter das Spiel ablehnt

| Der Roboter sagt … | Was tun |
| --- | --- |
| Dieses Projekt muss zuerst gebaut werden | Bitten Sie die KI: „Gib mir eine Version in einfachem HTML, CSS und JavaScript, ohne Build.“ |
| Wir haben in Ihrem Projekt keine index.html gefunden | Die Hauptdatei muss `index.html` heißen. |
| Das Spiel lädt Dateien aus dem Internet | Bitten Sie die KI, alle Internet-Links zu entfernen (CDN, Google Fonts, Bilder aus dem Netz). |
| Wir haben dieses Projekt nicht gefunden | Prüfen Sie den Link und ob das GitHub-Projekt **Public** ist. |
| Dieser Code stimmt nicht | Geben Sie den Code unter dem QR-Code am Roboter noch einmal ein. |

Ein Knopf reagiert nicht, wenn man in der Luft darauf zeigt? Bitten Sie die KI, dass alles Antippbare ein echtes `<button>` ist.

---

**Für die Technik.** Die Dateien des Memorys liegen in `memory/` (`index.html`, `style.css`, `game.js`, `pictures.js` und die Schrift Roboto Condensed in `fonts/`). Nach einer Änderung baut `node diy-examples/make-zip.mjs` die Datei `memory.zip` neu. Vollständiger Test (echter Import, Spiel mit Zeigen in der Luft gespielt): `node tests/diy-memory.test.mjs`.
