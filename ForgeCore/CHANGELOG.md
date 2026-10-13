# ForgeCore – Changelog

Jede Version baut auf der vorherigen auf; alle folgenden Funktionsbereiche sind im zusammengeführten **v0.0.9**-Stand enthalten. Die Zwischenstände wurden als Entwicklungs-Meilensteine implementiert und dokumentiert, jedoch **nicht als separate GitHub-Releases** veröffentlicht.

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
