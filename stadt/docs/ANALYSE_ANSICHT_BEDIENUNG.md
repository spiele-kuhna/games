# Analyse: Ansicht und Bedienung – Ist-Stand und Ziel

Stand: 22.11.2026 · Grundlage: micropolisJS Commit `f13a162`, Branch `feature/isometric`
Status: Entscheidungsvorlage vor Phase 2 (ARCHITEKTUR.md) und Phase 3 (PLAN.md)

> Hinweis zu Namen: Das Vorbild (isometrische Städtebauspiele der 1990er, vor allem SimCity 2000) wird hier nur
> zum Vergleich genannt. Für unser Spiel gilt: kein Name „SimCity“, keine Grafiken, Icons, Schriften, Sounds oder
> Bildschirmaufteilung des Vorbilds übernehmen. Wir bauen eine **eigene** Optik mit denselben Grundideen
> (Isometrie, Werkzeugleiste mit Symbolen, Zoom, Drehen), keine Nachbildung.

## 1. Kurzfassung

1. **Die Lücke ist groß, aber zweiteilig.** Ansicht und Bedienung lassen sich auf das Ziel umbauen, ohne die
   Simulation anzufassen. Mehrere sichtbare Merkmale des Vorbilds hängen dagegen an der **Simulation** und sind mit
   der Vorgabe „Simulationslogik unverändert“ nicht machbar: Geländehöhen, Untergrund-Ebene (Wasserrohre, U-Bahn),
   frei aufziehbare Zonenflächen mit unterschiedlich großen Gebäuden, Arkologien.
2. **Der größte Aufwand ist die Grafik, nicht die Mathematik.** Die Projektion und das Picking sind je ein paar
   Zeilen. Aber jede der 1024 Kachelnummern braucht eine isometrische Entsprechung, und rund **70 Gebäude**
   müssen als *ein* Bild mit Höhe gezeichnet werden statt als Mosaik aus 9 bis 36 Einzelkacheln.
3. **Die Schnittstelle ist sauber.** Fast alles, was „Draufsicht“ bedeutet, steckt in `GameCanvas`
   (`src/gameCanvas.js`). Ein `IsoCanvas` mit denselben Methoden kann daneben gestellt und umgeschaltet werden.
   Zwei Stellen außerhalb rechnen ebenfalls mit quadratischen Kacheln (`inputStatus.js`, `game.js`).
4. **iPad ist ein eigenes Arbeitspaket.** micropolisJS unterstützt Touch ausdrücklich nicht (es zeigt sogar eine
   Warnung). Safari auf iOS hat harte Grenzen für Canvas-Größe und Canvas-Speicher, die eine isometrische
   Gesamtkarte überschreiten würde.
5. **Empfehlung:** flache Isometrie (ohne Höhen), prozedural gezeichnete eigene Kacheln in Canvas 2D,
   Bedienung neu mit Pointer Events (Maus + Touch gemeinsam), Drehen in 90°-Schritten und 3 Zoomstufen.
   Veröffentlichung unter `spiele.kuhna.cloud/stadt/`.

## 2. Ist-Stand micropolisJS

### 2.1 Darstellung

| Merkmal | micropolisJS | Fundstelle |
|---|---|---|
| Projektion | Draufsicht, quadratische Kacheln 16 × 16 px | `tileSet.js:17` `TILE_SIZE = 16` |
| Karte | 120 × 100 Kacheln, flach, keine Höhendaten | `gameMap.js:32` |
| Kachelgrafik | eine Grafik `images/tiles.png` mit 1024 Kacheln (32 pro Zeile), Winter-Variante `tilessnow.png` | `tileSet.js`, `tileValues.ts:320` |
| Gebäude | als Mosaik: jede Teilkachel eines 3×3-, 4×4- oder 6×6-Gebäudes hat eine eigene Kachelnummer; die Mittelkachel trägt das `ZONEBIT` | `tileFlags.ts:21` |
| Zeichnen | Canvas 2D, nur sichtbarer Ausschnitt, nur geänderte Kacheln werden neu gezeichnet (Vergleich mit dem letzten Bild) | `gameCanvas.js:514` `_paintTiles` |
| Bewegte Objekte | Zug, Flugzeug, Hubschrauber, Schiff, Monster, Tornado, Explosion als Sprites mit Pixelkoordinaten in Draufsicht-Pixeln | `gameCanvas.js:409`, `sprites/` |
| Animation | Verkehr, Rauch, Feuer, Radar: Kachelnummern werden je Bild ersetzt | `animationManager.js` |
| Zoom / Drehen | nicht vorhanden | – |
| Overlays (Verschmutzung, Kriminalität, Bodenwert) | Daten vorhanden (`blockMaps` in `simulation.js:69`), aber keine Kartenansicht dafür | – |

### 2.2 Bedienung

| Merkmal | micropolisJS |
|---|---|
| Layout | Karte füllt die ganze Seite, darüber schwebende HTML-Kästen: Info (Stadt, Datum, Geld), Aktionen (Budget, Bewertung, Katastrophen, Speichern, Einstellungen, Foto, Pause), RCI-Anzeige, Werkzeugpalette |
| Werkzeuge | 20 Textknöpfe mit Preis, farbig, keine Symbole, keine Gruppierung |
| Verschieben der Karte | **nur Tastatur** (Pfeiltasten / WASD), kein Ziehen mit der Maus, keine Bildlaufleisten, kein Klick auf eine Übersichtskarte |
| Bauen | Werkzeug wählen, Klick setzt Gebäude, Ziehen bei Straße/Schiene/Leitung; Mausrahmen zeigt Größe und Farbe |
| Abfrage | Werkzeug „Query“ öffnet Infofenster |
| Ereignisse | die Maus-Handler werden erst bei `mouseenter` angemeldet (`inputStatus.js:158`) |
| Touch | **nicht unterstützt**; beim ersten `touchstart` erscheint eine Warnung (`game.js:531`, `index.html:459`) |
| Geschwindigkeit | nur Pause/Weiter über den Knopf |

### 2.3 Wo die Draufsicht im Code fest verdrahtet ist

| Stelle | Annahme | Bedeutung für Isometrie |
|---|---|---|
| `gameCanvas.js` (ganze Datei) | Kachel = Quadrat, `x * tileWidth`, `y * tileWidth` | wird durch `IsoCanvas` ersetzt bzw. ergänzt |
| `gameCanvas.js:279–360` | Bildschirm ↔ Kachel durch Division | Kern der Umrechnung, isometrisch neu |
| `gameCanvas.js:444` `_processMouse` | Bau-Vorschau als Rechteck | wird zur Raute bzw. Rautenfläche |
| `gameCanvas.js:514` `_paintTiles` | nur geänderte Kacheln neu zeichnen | funktioniert nicht mehr, weil sich Kacheln in Isometrie überdecken |
| `gameCanvas.js:409` `_processSprites` | Sprite-Pixel = Draufsicht-Pixel, fest `* 16` | Sprite-Position in Kachelkoordinaten umrechnen und projizieren |
| `gameCanvas.js:376` `_screenshot` | Gesamtkarte als ein Canvas | in Isometrie zu groß für iPad (siehe 5.3) |
| `inputStatus.js:178, 222` | Ziehen: `mouseX / tileWidth` | muss über die Canvas-Umrechnung laufen |
| `game.js:74, 454, 630` | übergibt `tileWidth`, nutzt `canvasCoordinateTo…` | bleibt, wenn `IsoCanvas` dieselben Methoden hat |
| `game.js:504–516` `handleInput` | Tastatur verschiebt Ursprung nach Norden/Süden… | „Norden“ ist in Isometrie diagonal; bei Drehung zusätzlich umrechnen |
| `monsterTV.js` | zweites Mini-Canvas mit `GameCanvas` | kann Draufsicht bleiben |

## 3. Ziel-Bild (Vorbild) im Vergleich

Grundlage: der vorgelegte Bildschirmfoto-Vergleich, Wikipedia-Artikel zu SimCity 2000 und eigene Kenntnis des
Spiels. Angaben ohne Quelle sind als „Kenntnis, nicht belegt“ markiert.

### 3.1 Ansicht

| Merkmal Vorbild | micropolisJS | Machbar ohne Simulationsänderung? |
|---|---|---|
| Dimetrische „Isometrie“ im Verhältnis 2:1 (Raute doppelt so breit wie hoch), 2D-Grafiken, kein 3D | Draufsicht | **ja** – reine Darstellung |
| Gebäude mit sichtbarer Höhe, ragen über Nachbarkacheln | flaches Mosaik | **ja**, aber Gebäude als *ein* Bild an der Mittelkachel zeichnen (siehe 4.3) |
| Geländehöhen, Hänge, Klippen, Wasser auf unterschiedlichen Höhen (bis 64 Höhenstufen laut Wikipedia) | Karte flach, keine Höhendaten | **nein** – Höhen müssten in Kartendaten, Bauregeln und Kartengenerator; rein dekorative Höhen würden mit Bauregeln kollidieren |
| Karte 128 × 128 (Quellenlage uneinheitlich, auch 256 × 256 genannt) | 120 × 100 | bleibt 120 × 100 |
| Drehen der Ansicht in 4 Richtungen | – | **ja** – nur Koordinatentausch in Projektion und Picking (Kenntnis, nicht belegt: Vorbild hat Drehknöpfe; im Screenshot sichtbar als blaue Pfeile) |
| Mehrere Zoomstufen | – | **ja** – Kachelgröße als Parameter |
| Untergrund-Ansicht (Rohre, U-Bahn) | – | **nein** – kein Untergrund in der Simulation |
| Sichtbare Bäume, Schatten, Bebauungsdetails | Bäume als Kacheltextur | **ja** – Grafikfrage |
| Fahrzeuge, Züge, Flugzeuge | Sprites vorhanden | **ja**, Positionen projizieren, Grafiken neu |

### 3.2 Bedienung

| Merkmal Vorbild | micropolisJS | Machbar ohne Simulationsänderung? |
|---|---|---|
| Menüleiste (Datei, Tempo, Optionen, Katastrophen, Fenster) | schwebende Knöpfe | **ja** – HTML/CSS |
| Statuszeile oben: Datum, Stadtname, Geld | Infokasten | **ja** |
| Senkrechte Werkzeugleiste mit Symbolen, Untermenüs je Gruppe (Straße/Schiene, Zonen, Versorgung, Notdienste …) | 20 Textknöpfe | **ja** – eigene Symbole zeichnen |
| Karte mit Maus ziehen / Bildlaufleisten / Klick auf Übersichtskarte | nur Tastatur | **ja** |
| Zonen als beliebig große Fläche aufziehen; Gebäude wachsen in unterschiedlicher Größe (1×1 bis 3×3) | feste 3×3-Zonen | **nein** – das ist ein anderes Zonenmodell in der Simulation |
| Tempostufen (Pause, langsam, mittel, schnell) | Pause/Weiter | **ja** – Simulation kennt bereits Pause/langsam/mittel/schnell (`simulation.js:135` `setSpeed`); fehlt nur in der Bedienung |
| Übersichtskarte mit Einblendungen (Verschmutzung, Kriminalität, Bodenwert, Verkehr) | – | **ja** – Daten liegen in `blockMaps`, werden nur gelesen |
| Wasserversorgung, Verordnungen, Anleihen, Nachbarstädte, Arkologien | – | **nein** – neue Simulationsteile |
| Touch | – | im Vorbild nicht vorhanden; für unser iPad-Ziel **neu nötig** |

### 3.3 Folgerung

Mit der Vorgabe „Simulation unverändert“ erreichen wir **den Look einer flachen isometrischen Stadt mit
moderner Bedienung**, nicht den Funktionsumfang des Vorbilds. Hügel und Untergrund wären ein eigenes,
deutlich größeres Projekt mit Eingriff in Kartenmodell, Kartengenerator, Bauregeln und Speicherformat.

## 4. Technischer Ansatz (Vorschlag für Phase 3)

### 4.1 Projektion

Rautenkachel mit Breite `TW` und Höhe `TH = TW / 2` (z. B. 64 × 32 bei Zoom 1).
Kachel (x, y) → Bildschirmpunkt der oberen Rautenspitze:

```
screenX = (x - y) * TW / 2 + offsetX
screenY = (x + y) * TH / 2 + offsetY
```

Umkehrung (Picking, Bildschirm → Kachel):

```
a = (screenX - offsetX) / (TW / 2)
b = (screenY - offsetY) / (TH / 2)
x = floor((a + b) / 2)
y = floor((b - a) / 2)
```

Drehen um 90°: vor der Projektion `(x, y)` durch `(W-1-y, x)` usw. ersetzen, beim Picking rückwärts.
Beides sind reine Rechenfunktionen und gut mit Unit-Tests abzusichern (Hin- und Rückweg müssen dieselbe Kachel
liefern).

### 4.2 Zeichenreihenfolge

Painter's Algorithm: von hinten nach vorn, also nach `x + y` aufsteigend, innerhalb einer Diagonale nach `x`.
Weil Gebäude über die eigene Kachel hinausragen, wird der sichtbare Ausschnitt **jedes Bild komplett neu
gezeichnet**; das bisherige „nur geänderte Kacheln“-Verfahren entfällt.
Abschätzung: Bildschirm 1920 × 1080 bei 64 × 32 → ca. 30 × 68 ≈ 2.000 `drawImage`-Aufrufe je Bild. Das ist für
Canvas 2D auf Desktop unkritisch und auf einem aktuellen iPad voraussichtlich ausreichend (Annahme, in Phase 4
messen).

### 4.3 Gebäude aus mehreren Kacheln

Die Simulation speichert ein 3×3-Gebäude als 9 Kachelnummern. Für die Isometrie:

1. Mittelkachel (`ZONEBIT`) erkennen → Gebäudetyp, Größe und Ausbaustufe aus einer Tabelle ablesen.
2. Ein Gebäudebild an der **vordersten** Kachel des Gebäudes zeichnen (für die Reihenfolge entscheidend), die
   übrigen Teilkacheln nur als Boden.
3. Tabelle aus `tileValues.ts` ableiten, nicht raten:

| Gruppe | Kachelbereich | Anzahl Bilder |
|---|---|---|
| Wohnen 3×3 | 261–404 (Mitte ab `RZB` 265) | 16 Stufen |
| Einzelhäuser in leerer Wohnzone | 249–260 | 12 |
| Gewerbe 3×3 | 432–611 (Mitte ab `CZB` 436) | 20 Stufen |
| Industrie 3×3 | 621–692 (Mitte ab `IZB` 625) | 8 Stufen |
| Leere Zonen W/G/I | 240, 423, 612 | 3 |
| Krankenhaus, Kirche | 405, 414 | 2 |
| Feuerwehr, Polizei 3×3 | 761, 770 | 2 |
| Kohle-, Kernkraftwerk, Hafen, Stadion (leer/voll) 4×4 | 745, 811, 693, 779/800 | 5 |
| Flughafen 6×6 | 709 | 1 |
| **Summe** | | **≈ 69** |

Die Bereichsgrenzen sind aus den Konstanten errechnet (je 9 Kacheln pro Stufe) und in Phase 2 am Code zu
bestätigen. Dazu kommen Boden, Wasser, Küsten, Wald, Straßen-, Schienen- und Leitungsstücke inkl. Kreuzungen und
Brücken, Trümmer, Feuer, Überschwemmung.

### 4.4 Grafiken

Alle isometrischen Grafiken **selbst erzeugen**: prozedural im Canvas (Quader mit drei Flächen in hell/mittel/dunkel,
Dach, Fensterraster; Höhe nach Ausbaustufe, Farbe nach Zonentyp). Vorteil: keine Lizenzfrage, Zoomstufen ohne
Qualitätsverlust, Schüler können die Zeichenfunktionen nachvollziehen. Die Draufsicht-Grafiken aus `tiles.png`
bleiben für die Draufsicht bestehen.

### 4.5 Rendering-Technik: Optionen

| Option | Bewertung |
|---|---|
| **Canvas 2D, eigener `IsoCanvas` (empfohlen)** | keine neue Abhängigkeit, gleiche Technik wie Bestand, für Schüler lesbar |
| PixiJS (WebGL-2D) | schneller bei vielen Sprites, aber neue Abhängigkeit und eigenes Konzept; nur falls Canvas 2D auf dem iPad zu langsam ist |
| Three.js (echtes 3D) | Vorbild: Projekt *3d.city* von lo-th nutzt die micropolisJS-Simulation in einem Web Worker mit Three.js-Darstellung. Zeigt, dass die Trennung Simulation/Darstellung trägt, ist aber für dieses Projekt zu groß |

## 5. Risiken

1. **Umfang Grafik** – ca. 70 Gebäude plus Netzstücke; größter Zeitposten. Gegenmaßnahme: zuerst einfache
   farbige Quader je Zonentyp, Details später.
2. **Gebäude-Tabelle** – fehlerhafte Zuordnung Kachelnummer → Gebäude zeigt falsche Bilder. Gegenmaßnahme:
   Tabelle per Unit-Test gegen `tileValues.ts` prüfen.
3. **iPad-Grenzen (Safari)** – laut WebKit-Bugtracker und Entwicklerberichten: ein Canvas höchstens
   16.777.216 Pixel Fläche bzw. lange Zeit 4096 × 4096, Gesamtspeicher aller Canvas je nach Version
   ca. 224–384 MB. Die ganze Karte isometrisch bei 64 × 32 wäre ca. 7.040 × 3.520 px ≈ 24,8 Mio. Pixel → **zu
   groß**. Folge: nur den Ausschnitt zeichnen, keine Gesamtkarte vorrendern, Foto-Funktion begrenzen. Aktuelle
   Grenzen sind nicht sicher belegt, deshalb am Gerät testen.
4. **Picking bei hohen Gebäuden** – ein Klick auf eine Fassade trifft die Kachel *dahinter*. Üblich und
   akzeptabel, wenn die Bau-Vorschau (Raute am Boden) klar sichtbar ist.
5. **Sprites** – Positionen kommen als Draufsicht-Pixel; Umrechnung in Kachelkoordinaten (`/ 16`) und dann
   Projektion. Die Draufsicht-Grafiken passen optisch nicht; einfache eigene Iso-Sprites nötig.
6. **Touch** – die Maus-Logik ist an `mouseenter`/`mousedown` gebunden. Umstellung auf Pointer Events (in Safari
   seit iOS 13) für Maus und Finger gemeinsam; Gesten: ein Finger baut, zwei Finger verschieben/zoomen.
7. **Build in der Cloud** – `webpack.config.js` liest die Build-Kennung mit `git log … main`. In GitHub Actions
   mit flachem Checkout oder auf einem anderen Branch scheitert das → vollständigen Checkout verwenden
   oder auf `HEAD` umstellen (kleine Änderung an der Build-Konfiguration, nicht an der Simulation).

## 6. Veröffentlichung

| Punkt | Umsetzung |
|---|---|
| Repo | öffentliches Repo `spiele-kuhna/games` als Spielesammlung; das Stadtspiel liegt in `stadt/` mit **vollständiger Historie** von micropolisJS (Nachweis der Herkunft, GPL) |
| Lizenz | `LICENSE`, `COPYING`, `MicropolisPublicNameLicense.md` bleiben in `stadt/`; README und About-Seite: „veränderte Fassung von micropolisJS“, Link zum Quellcode. Jedes weitere Spiel bringt seine eigene Lizenz in seinem Ordner mit |
| Build und Hosting | GitHub Actions baut `stadt/dist/` und lädt es per SFTP auf den Webspace der Subdomain; jeder Push auf `main` = neue Spielversion |
| Adresse | `https://spiele.kuhna.cloud/stadt/` |
| Datenschutz | keine Anfragen an Drittanbieter: Twitter-Knopf entfernt, Google Fonts durch Systemschrift ersetzt, Spielstände nur im Browser |
| Nebeneffekt | iPad-Test direkt über die öffentliche HTTPS-Adresse, ohne lokalen Server |

## 7. Entscheidungen (22.11.2026)

| Frage | Entscheidung |
|---|---|
| Umfang Ansicht | **Isometrie mit Geländehöhen** (bewusste Abweichung vom Projektauftrag „Simulation unverändert“, siehe 7.1) |
| Umfang Bedienung | **alles**: Ziehen/Zoom/Drehen, Touch fürs iPad, Symbolleiste + Menü, Übersichtskarte mit Einblendungen |
| Spielname | **Dorfplaner** (ohne „Sim…“, um Verwechslung mit Marken von Electronic Arts zu vermeiden) |
| Repo | `spiele-kuhna/games`, Spiel im Ordner `stadt/` |
| Adresse | `spiele.kuhna.cloud/stadt/`, Upload per GitHub Actions und SFTP |

### 7.1 Was Geländehöhen konkret bedeuten

Der **Simulationskern** (Zonenwachstum, Strom, Verkehr, Verschmutzung, Kriminalität, Budget) muss dafür nicht
geändert werden. Geändert werden die Teile *um* die Simulation:

| Teil | Änderung |
|---|---|
| Kartenmodell (`gameMap.js`) | zusätzliche Höhenkarte je Kachel (z. B. 0–15), getrennt vom Kachelwert, damit die Simulation die Kachelwerte unverändert liest |
| Kartengenerator (`mapGenerator.js`) | Höhen erzeugen (Rauschen + Glätten), Wasser nur in Senken bzw. auf Höhe 0 |
| Bauregeln (Werkzeuge `*Tool.js`) | Gebäude nur auf ebener Fläche (alle Kacheln gleicher Höhe); Straße/Schiene/Leitung auch am Hang mit max. 1 Stufe; optional Werkzeug „Planieren“ gegen Geld |
| Speichern (`storage.js`) | Höhenkarte mitspeichern; alte Spielstände laden mit Höhe 0 |
| Darstellung | Hangkacheln (je Ecke hoch/tief → 15 Formen plus Klippen), Picking muss die Höhe berücksichtigen |

Restrisiko: Die Bauregeln am Hang ändern das Spielverhalten (weniger bebaubare Fläche). Ob Höhen auch auf
Verkehr oder Bodenwert wirken sollen, ist eine eigene spätere Entscheidung; vorgeschlagen ist: **nein**.

Reihenfolge-Vorschlag: zuerst flache Isometrie fertig und spielbar, danach Höhen als eigenes Arbeitspaket. So gibt
es früh einen lauffähigen Stand und die Höhen-Änderungen bleiben im Git-Verlauf getrennt nachvollziehbar.

### 7.2 Noch offen

1. Impressum und Datenschutzhinweis für die Startseite `spiele.kuhna.cloud`.

## Quellen

- micropolisJS: <https://github.com/graememcc/micropolisJS>
- 3d.city (micropolisJS-Simulation mit Three.js): <https://github.com/loooog/3d.city> (Kopie), Projektübersicht
  <https://awesome.ecosyste.ms/projects/github.com%2Flo-th%2F3d.city>
- MicropolisCore (C++/WebAssembly-Linie von Don Hopkins): <https://github.com/SimHacker/micropolis>
- SimCity 2000, Projektion und Höhenstufen: <https://en.wikipedia.org/wiki/SimCity_2000>
- Kartengröße 128 × 128: <https://www.ludo.guide/guide/simcity-2000/section-2-10-the-terrain-editor-tre>
- Safari Canvas-Fläche: <https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/>
- Safari Canvas-Gesamtspeicher: <https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/>,
  <https://developer.apple.com/forums/thread/112218>
- WebKit 4096 × 4096 / 8192 × 8192: <https://bugs.webkit.org/show_bug.cgi?id=230887>,
  <https://bugs.webkit.org/show_bug.cgi?id=271002>
