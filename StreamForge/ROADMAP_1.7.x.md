# StreamForge 1.7.x – Entwicklungsfahrplan

## 1.7.0 – Basisrelease (main)
- Persistente serielle HLS-/DASH-Warteschlange
- Wartende Aufträge stornieren und Queue pausieren/fortsetzen
- Adaptive Leistungsprofile
- CI-Tests und installierbares Actions-Artefakt

## 1.7.1 – Stabilisierung
- Queue-Race-Conditions und Statusübergänge härten
- Neustart-/Fehlerfälle und beschädigte Persistenzdaten testen
- Export-Recovery, große Dateien und Netzlaufwerksfehler diagnostizieren

## 1.7.2 – Medienauswahl
- HLS/DASH-Qualitäts- und Audioauswahl verfeinern
- Verfügbare Untertitel erkennen und separat exportieren, wo technisch erlaubt
- Metadaten und Jellyfin-Dateinamen ausbauen

## 1.7.3 – UI und Release-Härtung
- Download-Center mit Verlauf, Warteschlange und verständlichen Diagnosen
- Bedienung und Tastaturnavigation verbessern
- Browser-End-to-End-Testmatrix, Performance/Regression und Release-Paket

## Grundsatz
Keine DRM-Umgehung. Ein umfangreicheres Codec-/Container-Remuxing und bytegenaues Resume werden nur mit belastbarer Dateisystem- und Medientestabdeckung freigegeben. Reale Tests auf Chrome/Edge und dem ZimaOS-Netzlaufwerk sind zusätzlich zu CI erforderlich.
