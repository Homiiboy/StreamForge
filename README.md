# StreamForge

**StreamForge Browser Extension – Version 1.8.1**

StreamForge ist eine Chrome-/Edge-Erweiterung (Manifest V3) zum Erkennen und lokalen Herunterladen unterstützter, nicht DRM-geschützter Medienstreams, sofern du über die entsprechenden Rechte verfügst.

[**Aktuelle Version 1.8.1 herunterladen**](https://github.com/Homiiboy/StreamForge/releases/tag/v1.8.1) · [Changelog](./StreamForge/CHANGELOG.md) · [Technische Dokumentation](./StreamForge/README.md)

## Funktionsumfang

- Erkennung direkter Medien, HLS und DASH sowie Auswahl unterstützter Video- und Audiospuren.
- Persistente HLS-/DASH-Warteschlange mit Pause für wartende Aufträge, Abbruch, Priorisierung und Wiederherstellung nach Browser-Neustart.
- Download-Center mit Fortschritt, Geschwindigkeit, Restzeit und lokalem Verlauf.
- Adaptive Leistungsprofile und RAM-abhängige Begrenzung gleichzeitiger Segment-Downloads.
- Segmentvalidierung sowie Stichprobenprüfung von MPEG-TS-Kopf und -Endbereich.
- Direkter WebVTT-Export und unterstützte HLS-WebVTT-Untertitel als separate SRT-Dateien.
- Jellyfin-kompatible Film-/Serienbenennung und kopierbare relative Ordnerpfade.
- Wiederholbarer finaler Export bereits gemuxter Dateien bei unterstützten Speicherfehlern.

## Neu in 1.8.1 – Staffelordner-Erkennung

Bei Serien in einem freigegebenen Medienordner kann StreamForge bestehende `Season NN`- oder `Staffel N`-Ordner erkennen und zur Übernahme anbieten. Du kannst weiterhin neue Staffelnummern manuell eingeben. Bestehende Ordner werden bei der Ablage wiederverwendet.

## Neu in 1.8.0 – Automatische Jellyfin-Ordner

- Filme automatisch in `Movies/Titel (Jahr)/Titel (Jahr).mp4` speichern.
- Serien automatisch in `Shows/Serienname/Season 01/Serienname S01E01.mp4` speichern.
- HLS/DASH: Einen vorhandenen Medien-, Serien- oder Staffelordner auswählen und dank Browserfreigabe direkt beschreiben.
- Bestehende Ordner werden wiederverwendet; vorhandene Episoden nicht ohne Weiteres überschrieben.
- Direkte Videolinks können in Unterordnern des Chrome-Download-Verzeichnisses gespeichert werden.
- Bei fehlenden Rechten auf ZimaOS-Netzfreigaben öffnet StreamForge für fertige HLS/DASH-Dateien den normalen Speicherdialog.

## Neuerungen der 1.7.X-Reihe

| Version | Wesentliche Neuerung |
| --- | --- |
| 1.7.0 | Persistente Download-Warteschlange und Leistungsprofile |
| 1.7.1 | Stabilisierung der Wiederherstellung und konkurrierender Speicheroperationen |
| 1.7.2 | Video-/Audioauswahl und Untertitel-Erkennung |
| 1.7.3 | Download-Center und lokaler Verlauf |
| 1.7.4 | Schutz vor leeren/ungültigen Mediensegmenten |
| 1.7.5 | WebVTT-/SRT-Untertitelexport |
| 1.7.6 | Jellyfin-Ordner- und Dateipfade |
| 1.7.7 | Speicherbewusste Download-Parallelität |
| 1.7.8 | Stichprobenartige MPEG-TS-Integritätsprüfung |
| 1.7.9 | Priorisierung wartender Downloads |

## Neues ZimaOS-Projekt: ForgeCore

Die künftige Server-App heißt **[ForgeCore](./ForgeCore/)**. Unter `ForgeCore/browser-extension/` liegt eine vollständige Kopie der aktiven Browser-Erweiterung aus dem **Git-Release v1.8.1** (ohne das nicht aktive Upload-Archiv). Der neue `ForgeCore/server/`-Bereich enthält das eigenständige Docker-/ZimaOS-Grundgerüst.

Die eigenständige ForgeCore-App startete bei **v0.0.1**. Die Meilensteine der Phasen 1 und 2 sowie eine Phase-3-Beta-Vorschau sind bis **[ForgeCore v0.9.9](./ForgeCore/)** umgesetzt: SQLite, Admin-Anmeldung, Dashboard, Film-/Serienbibliothek, Jellyfin-Scan, Quellenverwaltung, begrenzte HLS-/DASH-VOD-Transfers, Hintergrundjobs und Backups; Phase 3 ergänzt einen Serienassistenten, Zeitpläne, Benachrichtigungen, eine Bandbreitenbegrenzung und WebVTT-Untertitel. **Phase 4** ergänzt geprüfte Segment-Wiederaufnahme, begrenzte Retry-Strategien, HLS-Audiosprachen, ffprobe-Medienprüfung und vollständige SQLite-Snapshots. **Phase 5** ergänzt optionale Quellenüberwachung, Episodenprüfung und das regelbasierte Einreihen fehlender Episoden. **Phase 6** ergänzt auswählbare integrierte Quellenadapter, Jellyfin-API-Anbindung, Bibliotheksaktualisierung und eine vorsichtige, bestätigte Episodensynchronisation. **Phase 7** ergänzt ZimaOS-Betriebsdiagnose, Datenvolume-Sicherungen und kontrollierte Updates mit Rollback (Beta-Vorschau, Praxistest ausstehend). Die [Roadmap](./ForgeCore/ROADMAP.md) und das [ForgeCore-Changelog](./ForgeCore/CHANGELOG.md) dokumentieren den Stand und die nächsten Phasen.

**StreamForge selbst bleibt unverändert:** Die ursprüngliche Erweiterung unter `StreamForge/` entwickelt sich getrennt weiter. ForgeCore ist aktuell eine eigenständige Alpha-Verwaltungs-App, **eine Alpha/Beta-Entwicklung mit einem Downloader für einen begrenzten Satz ungeschützter HLS-/DASH-/MP4-Quellen; echte ZimaOS- und Quellseiten-Tests stehen noch aus**. Ein realer ZimaOS-/SMB-Test steht aus.

## Installation

1. Das [ZIP von StreamForge 1.8.1](https://github.com/Homiiboy/StreamForge/releases/download/v1.8.1/StreamForge-v1.8.1.zip) herunterladen und entpacken.
2. `chrome://extensions` (Chrome) oder `edge://extensions` (Edge) öffnen.
3. Den Entwicklermodus aktivieren und **Entpackte Erweiterung laden** auswählen.
4. Den entpackten Ordner `StreamForge/` auswählen, in dem sich die `manifest.json` befindet.

## Projektstruktur

Die eigentliche Erweiterung liegt in [`StreamForge/`](./StreamForge/): Manifest, Service Worker, Content Script, Offscreen-Muxing, Popup, Module, Icons und Tests. Historische Upload-Dateien sind unter `StreamForge/archive/unclassified/` getrennt abgelegt und gehören nicht zum installierbaren ZIP.

## Automatisierte Tests

Das Projekt enthält **34 Testdateien**. Die Test-Suite kann mit Node.js aus dem Unterordner ausgeführt werden:

```bash
cd StreamForge
npm test
```

GitHub Actions prüft Tests, Versionen und JavaScript-Syntax und erzeugt Release-ZIP-Dateien. Siehe [GitHub Actions](https://github.com/Homiiboy/StreamForge/actions).

## Bekannte Grenzen

- **Keine DRM-Umgehung.** Nur Streams nutzen, für die eine Downloadberechtigung besteht.
- Ein bereits aktiver HLS-/DASH-Transfer wird nach Unterbrechung **nicht bytegenau fortgesetzt**. Die persistente Warteschlange betrifft wartende Aufträge.
- Jellyfin-Pfade sind Vorschläge. Die Erweiterung kann Browser-/Dateisystemberechtigungen für ZimaOS-Netzlaufwerke nicht umgehen.
- Die Medienintegritätsprüfung ist stichprobenartig, keine vollständige Codec-Dekodierung.
- Nicht alle Untertitelvarianten sind als SRT konvertierbar; Untertitel werden nicht automatisch in MP4 eingemuxt.
- Reale Langzeit- und ZimaOS-Netzlaufwerkstests sind zusätzlich zu CI weiterhin notwendig.

Technische Details und ausführliche Änderungen stehen in [`StreamForge/README.md`](./StreamForge/README.md) und im [Changelog](./StreamForge/CHANGELOG.md).
