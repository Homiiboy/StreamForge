# StreamForge — Browser Extension

StreamForge ist eine **Chrome-/Edge-Erweiterung (Manifest V3)** für das Erkennen und lokale Herunterladen unterstützter, nicht DRM-geschützter Medienstreams, sofern eine entsprechende Downloadberechtigung besteht.

## Aktueller Entwicklungsstand

- **Letzte bereitgestellte Version:** 1.6.5
- **Browser:** Chromium-basiert, Chrome ab Version 119
- **Unterstützte Quellen:** direkte Mediendateien sowie unverschlüsseltes HLS/DASH
- **Versionsquelle:** `StreamForge-Browser-Extension-v1.6.5.zip` aus dem Projekt
- **Repository-Status:** Dokumentation eingerichtet; **der vollständige Erweiterungsquellcode ist noch nicht in GitHub importiert**.

> ⚠️ Bis der Import abgeschlossen ist, ist dieser Repository-Stand **nicht installierbar**. Für die Installation wird die vollständige Extension einschließlich `manifest.json`, `background.js`, `offscreen.js`, `popup.html`, `popup.js`, weiterer Module und Icons benötigt.

## Änderungen in v1.6.5

Die wichtigste Änderung behebt ein MPEG-TS-Muxingproblem mit H.264/H.265-B-Frames:

- PTS und DTS werden getrennt verarbeitet und 33-Bit-Zeitstempel korrekt dekodiert.
- Video-PES wird in DTS-Dekodierreihenfolge ausgegeben.
- PCR orientiert sich an DTS.
- HLS-Discontinuities und Zeitstempel-Epochen werden berücksichtigt.
- Transportfehler und MPEG-TS-Synchronisationsverluste werden erkannt.

Aus 1.6.4 bleiben Exportvalidierung, korrektes MIME-/Dateiendungs-Handling, Timeout-/Recovery-Behandlung und weitere Stabilitätsverbesserungen erhalten.

## Teststand

Der bereitgestellte v1.6.5-Quellcode wurde lokal unter Node.js 22 mit `npm test` geprüft: **19 von 19 Testdateien erfolgreich** (13.10.2026). Der Testlauf bestätigt die enthaltenen automatisierten Tests, ersetzt aber keine reale Browser- und Downloadprüfung.

## Aufbau nach vollständigem Import

```text
manifest.json
background.js
content.js
offscreen.js / offscreen.html
popup.js / popup.html / popup.css
hls.js / dash.js
tsmux.js / fmp4mux.js
export.js / network.js
icons/
tests/
package.json
CHANGELOG.md
TEST_REPORT.md
```

## Installation nach vollständigem Import

1. Repository herunterladen bzw. klonen.
2. In Chrome `chrome://extensions` öffnen.
3. Entwicklermodus einschalten.
4. **Entpackte Erweiterung laden** und den Ordner mit `manifest.json` auswählen.

## Tests

```bash
npm test
```

## Sicherheit und Nutzung

StreamForge ist für eigene oder ausdrücklich zum Download freigegebene Medien vorgesehen. DRM-geschützte Inhalte werden nicht unterstützt. Die Erweiterung fordert für ihre Analyse- und Downloadfunktionen weitreichende Browserberechtigungen (`<all_urls>`, Cookies, Downloads und Netzwerk-APIs); diese sollten vor einer Veröffentlichung gesondert geprüft werden.

## Nächster Schritt

Den vollständigen und unveränderten Stand 1.6.5 als Quellcodedateien importieren und anschließend README, Changelog, Testreport und den Release-Tag mit der tatsächlichen Repository-Version synchronisieren.
