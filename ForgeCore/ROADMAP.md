# ForgeCore – Entwicklungsroadmap

**Eigenständige Versionierung:** ForgeCore startet bei **v0.0.1**. Die Kopie unter `ForgeCore/browser-extension/` bleibt auf **StreamForge v1.8.1** eingefroren, bis eine spätere bewusste Integration beschlossen wird. Die zwei Versionsnummern sind unabhängig.

**Produktziel:** Eine auf ZimaOS/Docker laufende, lokal verwaltete Medien-App, die Filme und Serien als Projekte organisiert, autorisierte Quellen nach freigegebenen Medien untersucht, unterstützte HLS-/DASH-Downloads koordiniert und fertig geprüfte Dateien Jellyfin-konform ablegt.

> **Phase 1 und Phase-2-Alpha implementiert:** Die Entwicklungsmeilensteine v0.0.1–v0.0.9 sind im gemeinsamen **ForgeCore v0.0.9 Alpha-Code-Stand** umgesetzt; die Zwischenstände sind im Changelog dokumentiert, nicht als separate Releases veröffentlicht. Phase 3 und spätere Versionen sind weiterhin geplant; für Phase 2 existiert eine bewusst begrenzte HLS-/DASH-Implementation (Details im Changelog). **Echte ZimaOS-/SMB-Abnahme steht noch aus.**

## Phase 1 – Technisches Fundament (v0.0.x)

| Version | Schwerpunkt | Fertig, wenn … | Status |
| --- | --- | --- | --- |
| **v0.0.1** | **ForgeCore-Grundgerüst** | Eigenständiger Node-/Docker-Server, Gesundheitsstatus und eingefrorene StreamForge-1.8.1-Basis | **Implementiert** |
| **v0.0.2** | Persistente Datenbank | SQLite, Migrationen, Datenvolume und bestätigter JSON-Backup/Restore | **Implementiert** |
| **v0.0.3** | Sichere Konfiguration | Administrator-Setup, Passwort-Hash, Sessions, CSRF-Schutz, lokale Standardbindung | **Implementiert** |
| **v0.0.4** | Weboberfläche | Responsives Dashboard, Setup, Bibliothek, Jobs und Einstellungen | **Implementiert** |
| **v0.0.5** | Bibliotheksverwaltung | CRUD für Filme/Serien/Episoden, Status, Duplikatschutz | **Implementiert** |
| **v0.0.6** | Jellyfin-/ZimaOS-Volumes | Read-only Volumescans, Pfadvorschau, `Season NN`/`Staffel N` Erkennung | **Implementiert; SMB-Praxistest ausstehend** |
| **v0.0.7** | Hintergrundaufgaben | Persistente Jobliste, FIFO, Abbruch wartender Jobs, Retry, Recovery | **Implementiert; manuelle Priorisierung später** |
| **v0.0.8** | Metadaten | Manuelle Metadatenfelder und Offline-Validierung | **Implementiert; externe Anbieter später** |
| **v0.0.9** | Alpha-Härtung | Integrationstests, Container-Ressourcenlimits, Fehlerbehandlung, Doku, CI | **Automatisiert geprüft; Langzeittest auf ZimaOS ausstehend** |

## Phase 2 – Quellen- und Stream-Engine (v0.1.x)

**Implementierter gemeinsamer Alpha-Stand: v0.1.9.** Die folgenden Meilensteine haben funktionsfähige Grundimplementierungen, aber nicht alle ursprünglich angedachten Erweiterungen. Grenzen: nur eingebauter Adapter-Satz (kein Drittanbieter-SDK), HTML-Links statt vollständigem Website-Crawler, HLS VOD ohne separate Audio-Playlist, DASH auf SegmentList und einfache SegmentTemplate-Profile begrenzt, keine bytegenaue Wiederaufnahme und keine externe Jellyfin-Refresh-API. Echte ZimaOS/SMB-Abnahme ausstehend.

| Version | Schwerpunkt | Fertig, wenn … |
| --- | --- | --- |
| **v0.1.0** | Quellenverwaltung | Benutzer können zulässige Website-URLs speichern, prüfen und einem Medienprojekt zuordnen |
| **v0.1.1** | Adapter-Schnittstelle | Dokumentiertes Plugin-Interface für erlaubte Quellen, Sandbox/Timeouts, sichere URL-Validierung gegen SSRF |
| **v0.1.2** | Episoden-Discovery | Unterstützte Quellenseiten liefern Episodenliste, Staffelzuordnung, Vorschaustatus und Korrekturmöglichkeit |
| **v0.1.3** | HLS-/DASH-Analyse | Frei zugängliche Manifeste prüfen, Qualitäts-/Audiospuren anzeigen, DRM/Ausnahmen erkennen und abbrechen |
| **v0.1.4** | Download-Engine | Autorisierte ungeschützte Streams werden mit kontrollierter Parallelität und Retry geladen |
| **v0.1.5** | Medienvalidierung und Muxing | Container-/Segmentintegrität prüfen, Audio-/Videospuren korrekt zusammenführen, fehlerhafte Ausgaben verhindern |
| **v0.1.6** | Serien-Warteschlange | Mehrere Folgen planen, begrenzen, pausieren, priorisieren und nach Neustarts kontrolliert fortsetzen |
| **v0.1.7** | Jellyfin-Export | Sichere Ordnerablage nach `Shows/Serie/Season NN/Serie SNNENN.ext` bzw. `Movies/Titel (Jahr)/...` |
| **v0.1.8** | Bibliotheksabgleich | Vorhandene Dateien berücksichtigen, nur fehlende Episoden vorschlagen, optional Jellyfin-Refresh |
| **v0.1.9** | Geschlossene Alpha | End-to-End-Tests mit Testquellen, längere ZimaOS-Läufe, Fehler- und Ressourcenmessungen |

## Phase 3 – Alltagstaugliche ZimaOS-App (v0.2.x)

| Version | Schwerpunkt |
| --- | --- |
| **v0.2.0** | Durchgängiger Film-/Serienassistent: Titel → Quelle → Folgen → Download → Jellyfin |
| **v0.2.1** | Mehrere rechtmäßig nutzbare Quellen pro Medienprojekt und manuelle Quellenwahl |
| **v0.2.2** | Zeitpläne, Bandbreitenlimits, automatische Prüfintervalle |
| **v0.2.3** | Erweiterte Untertitel- und Sprachverwaltung |
| **v0.2.4** | Benachrichtigungen, Fehlerdiagnose und detaillierte Jobhistorie |
| **v0.2.5** | ZimaOS-App-Installation und Update-Migrationspfad inkl. Rollback |
| **v0.2.6–v0.2.9** | Beta-Stabilisierung, Sicherheit, UX, große Bibliotheken und Langzeittests |

## Phase 4 – Erste stabile Version

**v1.0.0** ist erst geplant, wenn ForgeCore auf einer unterstützten ZimaOS-Installation Filme und Serien von technisch unterstützten, berechtigt nutzbaren Quellen vollständig verwalten kann und Installation, Updates, Sicherheit, Jellyfin-Export und Recovery praktisch überprüft sind.

## Architekturprinzipien

1. **Versionen strikt trennen:** ForgeCore ab v0.0.1, Browser-Snapshot StreamForge v1.8.1. Änderungen am Snapshot erfolgen nicht unbemerkt.
2. **Server-first:** Hintergrundaufgaben laufen als eigenständiger Docker-Dienst; ein offener Browser ist nicht zwingend nötig.
3. **Sichere Medienverwaltung:** Keine Überschreibungen ohne ausdrückliche Zustimmung, atomare/validierte Exporte, nachvollziehbare Fehler und Duplikatschutz.
4. **Security by default:** Authentifizierung vor Netzwerkfreigabe, SSRF-Schutz bei nutzereingegebenen URLs, Ressourcenlimits und keine DRM- oder Zugangsbeschränkungsumgehung.
5. **ZimaOS-kompatibel:** Konfigurierbare Volumes, überprüfbare Schreibrechte, Neustartfestigkeit und schlanke Container.
6. **Tests vor Version:** Automatisierte Unit-/Integrationstests plus echte Browser-/ZimaOS-Abnahme für speicher- und netzwerkabhängige Features.

## Definition of Done für jede Version

- Features und Abnahmekriterien implementiert
- Automatisierte Tests erfolgreich, bestehende Versionen regressionsfrei
- Migrations- und Datensicherheitsaspekte berücksichtigt
- Dokumentation und Changelog aktualisiert
- Docker-Build geprüft; tatsächliche ZimaOS-Kompatibilität nur behaupten, wenn praktisch getestet
- Version und Git-Tag nur nach bestandenem Release-Gate veröffentlicht

**Nächster Entwicklungsschritt:** ZimaOS-Abnahme für v0.1.9 (Volumes, Netzwerk- und Speicherrechte, Login, Quellen- und Transferablauf) und Ausbau der unterstützten Quellformate. Danach Phase 3 v0.2.x.
