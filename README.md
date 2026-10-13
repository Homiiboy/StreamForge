# StreamForge

**StreamForge Browser Extension — Version 1.6.5**

StreamForge ist eine Chrome-/Edge-Erweiterung (Manifest V3) für das Erkennen und Herunterladen unterstützter, nicht DRM-geschützter Medienstreams bei entsprechender Berechtigung.

## Projektstruktur

Die installierbare Erweiterung liegt im Unterordner [StreamForge](./StreamForge/).

```text
StreamForge/
├── manifest.json          # Manifest V3, Version 1.6.5
├── background.js          # Service Worker
├── content.js             # Content Script
├── offscreen.html
├── offscreen.js
├── popup.html
├── popup.js
├── popup.css
├── *.js                   # Streaming-, Export- und Muxing-Module
├── icons/                 # icon16, icon32, icon48, icon128
├── tests/
│   ├── *.test.mjs         # 19 automatisierte Testdateien
│   ├── dash-browser-test.html
│   └── fixtures/          # MPEG-TS-Testdaten
├── archive/
│   └── unclassified/      # Zusätzliche Upload-Dateien, nicht zugeordnet
├── README.md              # Technische Details
├── CHANGELOG.md
├── TEST_REPORT.md
└── package.json
```

Die Dateien in `archive/unclassified/` gehören **nicht** zum aktiven Extension-Build und wurden zur verlustfreien Aufbewahrung getrennt. Die darin befindlichen CSS-Dateien mit Hashnamen sowie `api.js.Herunterladen` sind bislang nicht als Teil der Extension identifiziert.

## Installation

1. Dieses Repository herunterladen oder klonen.
2. `chrome://extensions` in Chrome bzw. `edge://extensions` in Edge öffnen.
3. Entwicklermodus aktivieren.
4. **Entpackte Erweiterung laden** auswählen.
5. Den lokalen **`StreamForge/`**-Ordner mit `manifest.json` auswählen.

## Tests

Mit Node.js im Ordner `StreamForge/`:

```bash
npm test
```

Das Projekt enthält 19 Testdateien. Ein erfolgreicher historischer Testlauf ist in [TEST_REPORT.md](./StreamForge/TEST_REPORT.md) dokumentiert; **nach der GitHub-Neuordnung wurden die Tests hier noch nicht erneut ausgeführt**.

## Version und Änderungen

Siehe [Changelog](./StreamForge/CHANGELOG.md) und [technische Beschreibung](./StreamForge/README.md). 1.6.5 verbessert insbesondere MPEG-TS-Muxing mit B-Frames, PTS/DTS-Reihenfolge und HLS-Discontinuities.

## Sicherheit

Nur Medien herunterladen, für die eine entsprechende Berechtigung besteht. DRM-geschützte Inhalte werden nicht unterstützt. Berechtigungen der Erweiterung vor produktiver Nutzung prüfen.
