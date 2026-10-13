# ForgeCore – Changelog

Die Phase-2-Meilensteine v0.1.0–v0.1.9 sind im gemeinsamen **v0.1.9 Alpha-Stand** umgesetzt, nicht einzeln veröffentlicht. Reale ZimaOS-/SMB-Tests und unterschiedliche Quellseiten sind noch ausstehend.

## v0.1.9 – Phase-2-Alpha-Härtung
- Sicherheits- und Regressionstests für Quellen, SSRF, HTML-Discovery, HLS-/DASH-Parsing, Transfers, SQLite-Migration und Backup/Restore.
- Docker mit FFmpeg und eigenständiger Release-/CI-Prüfung. Lokaler HLS-TS→MP4-Remuxtest erfolgreich.
- Die Formate sind bewusst begrenzt; v0.1.9 ist **keine universelle Website-Download-Engine**.

## v0.1.8 – Medienbibliotheksabgleich
- Vorhandene Filme/Episoden über Dateinamen und vorhandene Staffelordner prüfen, vorhandene Episoden im Serienbatch auslassen.
- Keine automatische Jellyfin-API-Aktualisierung.

## v0.1.7 – Jellyfin-Export
- Jellyfin-konformer MP4-Zielpfad, vorhandene `Season NN`-/`Staffel N`-Ordner erkennen, vorhandene Dateien nicht überschreiben.
- Sichere Pfadgrenzen und atomarer finaler Dateieintrag auf Dateisystemen mit Hardlink-Unterstützung.

## v0.1.6 – Serien-Warteschlange
- Einzelne oder bis zu 200 gefundene Episoden als fehlende Folgen einreihen.
- Persistente SQLite-Transfers, sequentielle Verarbeitung, manuelle Cancel-/Retry-Aktionen und Recovery nach Neustart.
- **Keine** manuelle Priorisierungssteuerung, Zeitplanung oder bytegenaue Segment-Resume-Funktion.

## v0.1.5 – FFmpeg-Muxing und Validierung
- Lokaler Remux von unterstützten HLS-TS und DASH-SegmentList-/SegmentTemplate-Tracks in MP4.
- MP4-Signatur- und Dateigrößenprüfung, verworfene fehlerhafte Dateien.

## v0.1.4 – Download-Engine
- Segmentweiser, größenbegrenzter Netzwerkdownload von ungeschützten HLS-/DASH-Medien und direkten MP4-Dateien.
- Temporäre Daten auf der persistenten Festplatte statt im RAM-/tmpfs-Speicher.

## v0.1.3 – HLS-/DASH-Analyse
- HLS-VOD mit Master-/Mediaplaylists, unverschlüsselt, ohne separate Audio-Playlists.
- DASH explizite SegmentList und einfache SegmentTemplate-VOD-Manifestvarianten; DRM/Live/unsupported-Profile abweisen.

## v0.1.2 – Episoden-Discovery
- HTML-Links zu HLS/DASH/MP4 erkennen und SxxExx-Namen staffel- und episodenweise importieren.
- Kein allgemeines JavaScript-Rendering, Captcha-Bypass oder automatischer Website-Crawler.

## v0.1.1 – Quellenadapter-Grundlage
- Eingebaute Adaptertypen (HTML-Links, HLS, DASH) und URL-Sicherheitsgrenzen mit DNS-Pinning, Redirect-, Netzwerk- und Größenbeschränkungen.
- Ein dynamisches Drittanbieter-Plugin-SDK ist noch nicht implementiert.

## v0.1.0 – Quellenverwaltung
- Quellen pro Film/Serie speichern, analysieren, entfernen und in der UI zu Downloadjobs zuordnen.
- Datenbankmigration, Sources und SourceItems werden im Backup berücksichtigt.

## v0.0.9 – Alpha-Härtung
- API-, Datenbank-, Authentifizierungs-, Neustart- und Volume-Integrationstests.
- Request-Begrenzungen, geschützter JSON-Import, Pfadvalidierung, Docker-Ressourcenbegrenzungen und Fehlerbehandlung.
- Dokumentation, Deploy-Checks und CI für Docker und Node.

## v0.0.8 – Offline-Metadaten
- Film-/Serien-Titel, Jahr, externe ID und Notizen; Episodentitel, Staffeln und Episodennummern.
- Persistente lokale Metadatenprüfung als Jobtyp; **noch keine externen Anbieter**.

## v0.0.7 – Hintergrundaufgaben
- SQLite-basierte Queue mit Status, Retry, Abbruch wartender Aufgaben und Recovery laufender Aufgaben nach Neustart.
- Read-only Scan und Metadaten-Validierung als erste unterstützte Jobtypen.

## v0.0.6 – ZimaOS-/Jellyfin-Volume
- Optionales, schreibgeschütztes Docker-Medienvolume.
- Pfadvorschau und read-only Dateiabgleich mit Jellyfin-konformen Filmen, Serien, Staffeln und alternativen `Staffel N`-Ordnernamen.
- Root-Berechtigungsprüfung und Pfadgrenzen ohne Medienänderungen.

## v0.0.5 – Medienbibliothek
- Film-, Serien- und Episodenmodelle samt REST CRUD, Duplikatschutz und einfacher UI.

## v0.0.4 – Weboberfläche
- Responsive deutschsprachige Oberfläche: Übersicht, Medienbibliothek, Aufgaben und Einstellungen.

## v0.0.3 – Zugangsschutz
- Einmalige Admin-Einrichtung, scrypt-Passwort-Hash, persistente Sessionverwaltung, HttpOnly-Cookies, CSRF-Prüfung, Login-Limit.

## v0.0.2 – Persistente Datenhaltung
- SQLite-Datenbank mit Migrationen, Indizes, Transaktionen, persistenter Datenvolume und JSON-Backup/Restore.

## v0.0.1 – Grundgerüst
- Eigenständiger Node.js-/Docker-Dienst und eingefrorene Browserkopie von StreamForge v1.8.1.
- Read-only Basisendpunkte `/api/health` und `/api/status`.
