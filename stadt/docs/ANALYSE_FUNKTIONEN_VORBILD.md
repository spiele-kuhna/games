# Analyse: Baufunktionen des Vorbilds, Verkehrsfehler, Wasserversorgung

Stand: 22.11.2026 · Grundlage: Recherche zu SimCity 2000 (Handbuch und Fan-Quellen, siehe unten), Code von
micropolisJS/Dorfplaner (`feature/isometric`, Commit `97f1ad3`)

> Es geht hier nur um **Spielmechaniken**. Grafiken, Texte und Namen des Vorbilds werden nicht übernommen.
> „SimCity“ wird nur zum Vergleich genannt.

## 1. Kurzfassung

1. **Verkehr fehlt wegen eines Fehlers im Original-micropolisJS**, nicht wegen der Darstellung. In `traffic.js`
   scheitert jede Fahrt sofort; die Verkehrsdichte bleibt immer 0. Die Korrektur sind drei Zeilen, ändert aber das
   Verhalten der Simulation (Abschnitt 2) – deshalb nur mit Freigabe.
2. **Wasserversorgung** gibt es im Vorbild (Pumpen, Wassertürme, Kläranlagen, Entsalzung, Rohre in einer
   Untergrundansicht). Müll und Abwasser als eigenes System gibt es dort **nicht** – Müll kam erst im Nachfolger.
3. Wasser ist als neues Teilsystem gut machbar (Abschnitt 4), greift aber in das Zonenwachstum ein. Im Projektauftrag
   stand „Wasserversorgung“ ohnehin als mögliches Alternativ-Feature.
4. Viele weitere Funktionen des Vorbilds (Kraftwerkstypen, Autobahn, U-Bahn, Schulen, Verordnungen, Anleihen,
   Belohnungen) sind jeweils eigene Arbeitspakete mit Eingriff in die Simulation (Abschnitt 5).

## 2. Fund: Verkehr entsteht nie (Fehler in micropolisJS)

**Stelle:** `src/traffic.js`, Funktion `tryDrive`

```js
var drivePos = new Position(startPos);          // Konstruktor erwartet (x, y), bekommt ein Objekt
...
drivePos = Position.move(pos, dir);             // „pos“ gibt es hier gar nicht
...
this._stack.push(new Position(drivePos));       // wieder ein Objekt statt (x, y)
```

`Position` wurde im Original irgendwann nach TypeScript umgestellt (`position.ts`, Konstruktor `(x, y)`); diese
drei Aufrufe wurden dabei nicht angepasst. Folge: Die Startposition jeder Fahrt ist ungültig, `tryGo` findet nie eine
Straße, jede Fahrt endet als „keine Route“. Weil nie eine Route gefunden wird, wird auch die zweite fehlerhafte Zeile
nie erreicht – deshalb stürzt nichts ab und der Fehler fällt nicht auf.

**Auswirkungen heute:** keine Verkehrsdichte, keine Autos (in beiden Ansichten), keine Verkehrsverschmutzung, keine
Meldung „Häufige Staus“, keine Verkehrsklagen in der Bewertung, der Verkehrshubschrauber hat nie ein Ziel. Zonen
schrumpfen dadurch nicht (sie reagieren nur auf „gar keine Straße“), das Spiel ist aber leichter als vorgesehen.

**Test im Browser (nur zur Laufzeit ersetzt, keine Datei geändert):** kleine Stadt, rund 1.900 Einwohner, nach
etwa 14 Spieljahren: Verkehrsdichte bis 240, 10 Straßenstücke von der Simulation selbst als „mit Verkehr“
markiert, Autos sichtbar.

**Korrektur:** `new Position(startPos.x, startPos.y)`, `Position.move(drivePos, dir)`,
`new Position(drivePos.x, drivePos.y)`. Dazu ein Unit-Test, der eine Fahrt zwischen zwei Zonen nachweist.
Das ist ein Eingriff in die Simulation (Fehlerbehebung, die das ursprünglich gewollte Verhalten herstellt).

## 3. Was die 3D-Ansicht jetzt zusätzlich zeigt

- **Autos schon bei geringer Verkehrsdichte:** Die Simulation markiert eine Straße erst ab Dichte 64 (von 240) als
  „mit Verkehr“; die 3D-Ansicht liest die Dichte direkt (nur lesend) und zeigt ab 12 einzelne Autos. Wirkt erst
  nach der Korrektur aus Abschnitt 2.
- **Flugzeuge und Hubschrauber** entstehen nur an einem Flughafen mit Strom (beide Ansichten). Sie waren in der
  3D-Ansicht vorhanden, aber zu klein; jetzt deutlich größer.
- **Feuerwache** (Schlauchturm, Fahrzeughalle, Löschfahrzeuge, Schild „FW“), **Polizeiwache** (Schild „POLIZEI“,
  Funkmast, Streifenwagen), **Kernkraftwerk** (Kühltürme, Reaktorkuppel, Turbinenhalle), **Flughafen** (Terminal,
  Tower, Radar, Hangars, geparkte Flugzeuge, Landebahn).

## 4. Konzept Wasserversorgung (eigene Umsetzung)

So funktioniert es im Vorbild (gesichert laut Handbuch, Zahlen teils nur aus Fan-Quellen):

| Element | Funktion |
|---|---|
| Pumpe | braucht Strom; auf trockenem Land Brunnen, an Süßwasser deutlich mehr Leistung; Leistung schwankt mit Jahreszeit/Wetter |
| Wasserturm | speichert in nassen Monaten, gibt in trockenen ab |
| Kläranlage | ab ca. 1935; Wirkung in den Quellen uneinheitlich (Wasser zurückgewinnen bzw. Verschmutzung senken) |
| Entsalzungsanlage | ab ca. 1990, nur an Salzwasser |
| Rohre | immer unterirdisch; mit dem Rohrwerkzeug wechselt die Ansicht in den Untergrund; Gebäude bringen Hausanschlüsse mit |
| Anzeige | versorgte Netzteile animiert blau, unversorgte nicht animiert; Wasserkarte: versorgte Zonen gelb, unversorgte rot |
| ohne Wasser | Stadt funktioniert, wird aber nicht dicht; Bodenwert sinkt (Fan-Quelle) |

Ein eigenes „kein Wasser“-Symbol an Gebäuden ist in den Quellen **nicht belegt**; für Dorfplaner ist ein
blinkender Wassertropfen analog zum Blitz trotzdem sinnvoll und leicht verständlich.

**Vorschlag für Dorfplaner:**

| Baustein | Umsetzung | Simulation? |
|---|---|---|
| Rohrkarte | eigene Ebene neben den Kachelwerten (wie die Höhenkarte), wird gespeichert | Datenmodell, Speichern |
| Werkzeuge | Rohr (ziehbar), Pumpe (1 Kachel, Strom nötig), Wasserturm (Speicher) | neu |
| Netzberechnung | wie das Stromnetz (`powerManager.js`): von Pumpen aus über Rohre und Gebäude ausbreiten, Kapazität begrenzt; Pumpe an Wasser liefert doppelt | neu, eigener Schritt |
| Wirkung | Zonen ohne Wasser wachsen nur bis zur mittleren Stufe; optional leicht geringerer Bodenwert | **Eingriff in Zonenwachstum** |
| Untergrundansicht | Gebäude ausgeblendet, nur Raster, Straßen schemenhaft; Rohre grau = nicht versorgt, blau = versorgt; schaltet automatisch beim Rohrwerkzeug | nur Darstellung |
| Anzeige | blinkender Wassertropfen an unversorgten Zonen; Übersichtskarte „Wasser“ | nur Darstellung |
| Jahreszeit / Wetter, Kläranlage, Entsalzung | zweite Ausbaustufe | neu |

Aufwand Grundausbau (Rohre, Pumpe, Turm, Netz, Wirkung, Untergrundansicht, Speichern, Tests): **ca. 25 h**.
Zweite Ausbaustufe (Wetter, Kläranlage, Entsalzung): ca. 10 h.

## 5. Weitere Funktionen des Vorbilds im Vergleich

| Bereich | Vorbild | micropolisJS / Dorfplaner | Aufwand | Simulation? |
|---|---|---|---|---|
| Kraftwerke | 9 Typen (Kohle, Wasser, Öl, Gas, Kern, Wind, Solar, Mikrowelle, Fusion), Erfindungsjahre, Lebensdauer 50 Jahre | Kohle, Kern | mittel | ja |
| Zonen | leicht/dicht je Zonenart, frei aufziehbar, Entzonen | feste 3×3-Zonen | groß | ja (anderes Zonenmodell) |
| Verkehr | Straße, Autobahn, Auffahrt, Tunnel, Bus, Schiene, Bahnhof, U-Bahn (unterirdisch), Nachbarverbindungen | Straße, Schiene, Brücke | mittel bis groß | ja |
| Öffentliche Gebäude | Schule, Hochschule, Bibliothek, Museum, Krankenhaus, Gefängnis, Zoo, Marina, Parks | Polizei, Feuerwehr, Stadion, Park; Krankenhaus/Kirche wachsen von selbst | mittel | ja (neue Kennzahlen, z. B. Bildung) |
| Belohnungen | Bürgermeisterhaus, Rathaus, Statue u. a. bei Einwohnerschwellen; Arkologien | – | klein bis mittel | gering |
| Gelände | 32 Höhenstufen, heben/senken/einebnen, Wasser und Bäume setzen | flach | geplant (AP 8–10) | Kartenmodell, Bauregeln |
| Ansicht | Drehen, 3 Zoomstufen, Ebenen ein-/ausblenden, Untergrund, Kartenfenster mit vielen Einblendungen | Drehen, 5 Zoomstufen; Kartenfenster geplant (AP 7) | – | nein |
| Verwaltung | Steuern je Zonenart, Verordnungen, Anleihen, Zeitung, Nachbarstädte | ein Steuersatz, Haushalt | mittel | ja |
| Müll/Abwasser | **nicht vorhanden** (erst im Nachfolger) | – | – | – |

## 6. Empfehlung

1. **Verkehrsfehler beheben** (klein, sofort sichtbar, stellt das gewollte Verhalten her). Danach erscheinen Autos,
   Verkehrsverschmutzung und Staumeldungen in beiden Ansichten.
2. Wie geplant **AP 6 (Oberfläche)** und **AP 7 (Übersichtskarte)** – die Übersichtskarte bekommt später auch
   eine Wasser-Einblendung.
3. **Wasserversorgung als neues Paket** (AP 12–14), vor oder nach den Geländehöhen (AP 8–10). Beides zusammen ist
   für ein Schulprojekt viel; eine Reihenfolge festzulegen ist sinnvoll.

## Quellen

- Handbuch SimCity 2000 (Abschrift/PDF): <https://classicreload.com/sites/default/files/sim-city-2000-manual.pdf>
- Wasser, Rohre, Untergrund: <https://www.ludo.guide/guide/simcity-2000/water-system>,
  <https://www.ludo.guide/guide/simcity-2000/pipes>, <https://www.ludo.guide/guide/simcity-2000/show-underground>
- Strategie und FAQ (Fan-Quellen): <https://patcoston.com/co/STRAT2.aspx>,
  <https://discmaster.textfiles.com/view/31390/PCPP11.iso/faqs/sc2kfaq.doc>
- Kraftwerke: <https://www.ludo.guide/guide/simcity-2000/power-plant-information>
- Verkehr, Zonen, Belohnungen, Kartenfenster, Gelände, Verordnungen:
  <https://www.ludo.guide/guide/simcity-2000/section-3-6-transportation>,
  <https://www.ludo.guide/guide/simcity-2000/section-3-7-zoning>, <https://www.ludo.guide/guide/simcity-2000/rewards>,
  <https://www.ludo.guide/guide/simcity-2000/section-5-7-the-map-window-mpa>,
  <https://www.ludo.guide/guide/simcity-2000/landscape-tool>,
  <https://www.ludo.guide/guide/simcity-2000/section-5-2-the-ordinances-window-odn>
- Überblick: <https://en.wikipedia.org/wiki/SimCity_2000>, Müll im Nachfolger: <https://en.wikipedia.org/wiki/SimCity_3000>
