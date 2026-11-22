# Spiele

Browser-Spiele, die unter <https://spiele.kuhna.cloud/> laufen.

| Ordner | Spiel | Adresse | Lizenz |
|---|---|---|---|
| [`stadt/`](stadt/) | **Dorfplaner** – Städtebau-Simulation, veränderte Fassung von [micropolisJS](https://github.com/graememcc/micropolisJS) | <https://spiele.kuhna.cloud/stadt/> | GPLv3 mit Zusatzbedingungen, siehe [`stadt/LICENSE`](stadt/LICENSE) und [`stadt/COPYING`](stadt/COPYING) |
| [`portal/`](portal/) | Startseite der Sammlung | <https://spiele.kuhna.cloud/> | – |

**Lizenzen gelten je Ordner.** Jedes Spiel bringt seine Lizenzdateien in seinem eigenen Ordner mit. Für das Repo
als Ganzes gibt es bewusst keine gemeinsame Lizenz.

## Dorfplaner (`stadt/`)

Schulprojekt: micropolisJS wird um eine isometrische Ansicht und eine Bedienung für Tablets erweitert.
Die Simulation stammt aus micropolisJS von Graeme McCutcheon bzw. aus dem Micropolis-Quellcode.
Die vollständige Historie von micropolisJS ist in diesem Repo enthalten (`git log -- stadt/`).

Micropolis is a registered trademark of [Micropolis Corporation (Micropolis GmbH)](https://www.micropolis.com) and is
licensed here as a courtesy of the owner under the [Micropolis Public Name License](stadt/MicropolisPublicNameLicense.md).
Dorfplaner steht in keiner Verbindung zu Electronic Arts.

Lokal starten:

```
cd stadt
npm ci --ignore-scripts
npm run dev      # Entwicklungsserver
npm test         # Unit-Tests
npm run build    # fertiger Build nach stadt/dist/
```

Dokumentation: [`stadt/docs/`](stadt/docs/)

## Veröffentlichung

Jeder Push auf `main` baut die Spiele (GitHub Actions, `.github/workflows/deploy.yml`) und lädt sie per SFTP auf den
Webspace von `spiele.kuhna.cloud`. Dateien auf dem Server werden dabei nie gelöscht.

- Benötigte Repo-Secrets: `SFTP_HOST`, `SFTP_USER`, `SFTP_PASS` (Werte nur in den GitHub-Einstellungen, nie im Repo).
- Der SFTP-Benutzer darf nur den Ordner der Subdomain (`/spiele` im Webspace) sehen; dessen Wurzel entspricht
  `https://spiele.kuhna.cloud/`. Sieht der Benutzer die Webspace-Wurzel, bricht der Upload ab.
- Die Startseite (`portal/`) wird erst veröffentlicht, wenn sie keine `[OFFEN: …]`-Platzhalter mehr enthält;
  die Spiele selbst gehen unabhängig davon online.
