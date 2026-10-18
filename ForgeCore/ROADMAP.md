# ForgeCore – Entwicklungsroadmap

**Eigenständige Versionierung:** ForgeCore startet bei **v0.0.1**. Die Kopie unter `ForgeCore/browser-extension/` wurde durch die bewusste Integration auf **StreamForge v1.8.8** angehoben. Die zwei Versionsnummern sind unabhängig.

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

**Entwicklungsstand v0.2.9: Beta-Vorschau implementiert.** Film-/Serienassistent, Quellenranking (technische Heuristik), Download-Zeitfenster, Bandbreitenlimit, WebVTT→SRT-Export, Benachrichtigungen, Diagnose und Docker-Installer stehen im Code. Noch nicht fertig sind automatische periodische Quellenprüfungen, volle Audio-/Spurauswahl, natives ZimaOS-App-Store-Paket, Rollback-Automatik und reale Langzeit-/Lasttests. **Phase 3 ist deshalb noch nicht hardwareseitig abgeschlossen.**


| Version | Schwerpunkt |
| --- | --- |
| **v0.2.0** | Durchgängiger Film-/Serienassistent: Titel → Quelle → Folgen → Download → Jellyfin |
| **v0.2.1** | Mehrere rechtmäßig nutzbare Quellen pro Medienprojekt und manuelle Quellenwahl |
| **v0.2.2** | Zeitpläne, Bandbreitenlimits, automatische Prüfintervalle |
| **v0.2.3** | Erweiterte Untertitel- und Sprachverwaltung |
| **v0.2.4** | Benachrichtigungen, Fehlerdiagnose und detaillierte Jobhistorie |
| **v0.2.5** | ZimaOS-App-Installation und Update-Migrationspfad inkl. Rollback |
| **v0.2.6–v0.2.9** | Beta-Stabilisierung, Sicherheit, UX, große Bibliotheken und Langzeittests |

## Phase 4 – Download-Recovery und Medienintegrität (v0.3.x)

**ForgeCore v0.3.9 als Alpha umgesetzt:** SHA-256-geprüfter Cache abgeschlossener HLS-/DASH-Segmente; Resume dieser Segmente nach Neustart/Fehler; automatische begrenzte Backoff-Retries; FFprobe-Dateiprüfung; teilweise HLS-Mehrsprach-Audiogruppen; vollständiges SQLite-Backup und Download-Ereignisprotokoll. **Noch offen:** bytegenauer HTTP-Range-Resume, komplexe mehrspurige Formate, ZimaOS-/SMB- und Langzeitabnahme.

## Phase 5 – Quellen- und Episodenautomatisierung (v0.4.x)

**v0.4.9 als Alpha implementiert:** Opt-in-Regeln pro unterstützter Serienquelle, regelmäßige HTML-Link-Discovery, neue Episoden, separat aktivierbare Downloads fehlender Folgen, Prüfverlauf, Backoff und Konfiguration in der Weboberfläche. Nicht universell für alle Websites und ohne ZimaOS-Hardwareabnahme.

## Weitere Vorschlagsphasen (noch nicht implementiert)
## Phase 6 – Quellenadapter und Jellyfin-API (v0.5.x)

**ForgeCore v0.5.9 als Alpha implementiert:** Auswahl integrierter HTML/HLS/DASH-Adapter je Quelle, ergänzender HTML-Attribut-Adapter, Jellyfin-API-Anmeldung, Verbindungstest, manuelle und optional automatische Bibliotheksaktualisierung sowie nicht-destruktive Vorschau und bestätigter Episodenabgleich. Kein ausführbarer Plugin-Marktplatz; noch keine Abnahme auf realem ZimaOS/Jellyfin.

## Phase 7 – ZimaOS Lifecycle und Beta-Tests (v0.6.x–v0.9.x)

**Gemeinsamer Beta-Code-Stand v0.9.9:** Sichere ZimaOS-Host-Installation, konsistente Volumesicherungen, Healthcheck-gestütztes Update mit automatischem Rollback, manuelle Wiederherstellung, authentifizierte Systemdiagnose, neue System-Webansicht und erste Last-/Lifecycle-Regressionstests.

**Offen:** Native ZimaOS-App-Store-Bereitstellung, echte SMB-/Volume-/Upgrade-Abnahme auf deiner Hardware, dauerhafter HTTPS-Zugang, mehrtägige Soak-Tests, Streaming-/Codec-Prüfung und Wiederherstellung nach Stromverlust. Diese Abnahmekriterien bleiben vor v1.0.0 verpflichtend.

## Phase 8 – v1.0.0 (Releasekandidat; Hardware-Abnahme ausstehend)

**Code-Stand v1.0.0 umgesetzt:** Zusammenführung der Phasen 1–7, zusätzliche Authentifizierungs-/Backup-/SQLite-Regressionen und gehärtete Volume-Rollbacks mit SHA-256-Prüfung und Datenvolume-Abgleich. Die GitHub-Veröffentlichung wird als **Prerelease** gekennzeichnet, bis die realen ZimaOS-/SMB-/Jellyfin-/Langzeittests bestanden sind.

Das verbindliche Prüfprotokoll steht unter [ACCEPTANCE-v1.0.0.md](./ACCEPTANCE-v1.0.0.md). Die v1.0.0-Versionsnummer bedeutet **nicht**, dass die Prüfung auf deiner Hardware bereits bestanden wurde.

## Anforderungen für den späteren stabilen Betrieb

**v1.0.0** ist erst geplant, wenn ForgeCore auf einer unterstützten ZimaOS-Installation Filme und Serien von technisch unterstützten, berechtigt nutzbaren Quellen vollständig verwalten kann und Installation, Updates, Sicherheit, Jellyfin-Export und Recovery praktisch überprüft sind.

## Architekturprinzipien

1. **Versionen strikt trennen:** ForgeCore ab v0.0.1, Browser-Snapshot nun StreamForge v1.8.8. Änderungen am Snapshot erfolgen nicht unbemerkt.
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

**Nächster Entwicklungsschritt:** Phase-8-Abnahmekriterien mit ForgeCore v1.0.0 auf dem echten ZimaOS erfüllen und dokumentieren. Erst danach darf der Beta-/Prerelease-Status als produktiv stabiles Release entfallen.
