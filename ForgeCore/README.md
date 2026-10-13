# ForgeCore

**ForgeCore v0.2.9 – Phase 3 Beta-Vorschau (Medienassistent & Automatisierung).** Eigenständiger Docker-/ZimaOS-Server. Die beigefügte Browser-Erweiterung in `browser-extension/` bleibt unverändert auf **StreamForge 1.8.1**.

> **Abnahmestand:** Automatisierte Node-/HTTP-/Docker-Tests und lokaler HLS/FFmpeg-Medientest sind durchgeführt. **Reale Websites, lange Serienläufe, ZimaOS-Mounts und SMB-Speicherpfade sind noch nicht auf deiner Hardware getestet.** Die App unterstützt ausdrücklich nur ausgewählte unverschlüsselte Formate, nicht jede Streaming-Website.

## Neu in Phase 3 (v0.2.0–v0.2.9)

- **Film-/Serienassistent:** Titel, Typ und Quelle in einem Ablauf eingeben; unterstützte Quell-Links analysieren, Episoden übernehmen und fehlende Folgen vor dem Start anzeigen.
- **Quellenbewertung:** vorhandene Quellen nach technischen Merkmalen und Episodenabdeckung sortieren. Das ist **keine** garantierte Qualitäts-, Geschwindigkeits- oder Verfügbarkeitsmessung.
- **Zeitplan & Geschwindigkeitsbegrenzung:** Downloads starten nur innerhalb der konfigurierten Wochentage/Stunden; optionale Transfer-Obergrenze in KiB/s. Die Container-Zeitzone wird über `FORGECORE_TIMEZONE` gesetzt. Bestehende Transfers laufen nach Ablauf eines Zeitfensters weiter.
- **Externe WebVTT-Untertitel:** WebVTT zu `.de.srt` oder anderen Sprachcodes für **bereits existierende** Filme und Episoden speichern. Bestehende Untertitel nicht überschreiben.
- **Benachrichtigungen & Diagnose:** Status zu erfolgreichen/fehlgeschlagenen Downloads sowie Untertitelimporten; persistente, als gelesen markierbare Einträge und eine einfache Systemübersicht.
- **ZimaOS-Installer:** `./install.sh` für vorgeprüftes Docker-Compose-Deployment mit Medienpfad-Kontrolle. Keine native ZimaOS-App-Store-Paketierung.
- **Datenhaltung:** SQLite-Migration von v0.1.9 auf v0.2.9; Zeitplan-Einstellungen werden im JSON-Backup berücksichtigt.
- **Alpha-/Beta-Tests:** Unit- und Integrationstests für Planer, Zeitfenster, Quellenvorschau, VTT-Konvertierung, Sessions und HTTP-API sowie Container-Smoke-Tests.

**Noch ausstehend bzw. eingeschränkt:** automatische periodische Website-Prüfung, erweiterte Audio-Track-Umschaltung, universelle Adapter für dynamische Websites, native ZimaOS-Store-Installation, bedienbarer Rollback-Assistent und echte Lasttests großer Bibliotheken. Der Versionstitel **v0.2.9** bezeichnet den gemeinsamen Entwicklungsstand, nicht die abgeschlossene Abnahme aller ursprünglichen Phase-3-Ziele.

### Installer und Backup vor dem Upgrade

```bash
cd ForgeCore
cp .env.example .env  # nur beim ersten Mal; bei Updates die bestehende .env behalten
# In .env: FORGECORE_MEDIA_HOST_PATH auf dein echtes schreibbares Jellyfin-Volume setzen
chmod +x install.sh
./install.sh
```

Vor einem Upgrade **`GET /api/backup/export`** in der Weboberfläche verwenden und das Docker-Datenvolume separat sichern. SQLite-Datenmigrationen werden beim Start automatisch ausgeführt; ein Downgrade auf v0.1.9 mit demselben aktualisierten Datenvolume ist **nicht unterstützt**. Für ein Rollback wird ein zu v0.1.9 passendes Volume-Backup benötigt. Keinesfalls `docker compose down -v` verwenden.

## Neu in Phase 2 (v0.1.0–v0.1.9)

- Quellen-URLs für Filme/Serien im Dashboard speichern, entfernen und analysieren.
- Sicherheitsgeprüfte HTTP(S)-Abrufe mit Prüfung öffentlicher Ziel-IP-Adressen, DNS-Pinning, Redirect-Überprüfung, Zeit-/Größenlimits und ohne Browser-Cookies.
- Eingebaute Adapter für statische HTML-Links zu Manifesten/MP4, unverschlüsselte **HLS-VOD-Playlists** und **DASH-VOD mit expliziter SegmentList**.
- Episoden anhand von `S02E08` oder vergleichbaren Namensmustern entdecken und kontrolliert importieren; neue Serienaufträge einzeln oder als Batch planen.
- SQLite-persistente Download-Warteschlange mit Fortschrittsstatus, sequentieller Verarbeitung, Abbruch und Retry sowie Neustart-Wiederherstellung.
- Segmentweiser Streaming-Transfer auf das persistente Datenvolume; lokale **FFmpeg-Remux-Verarbeitung ohne Codec-Neukodierung**.
- Jellyfin-konformer MP4-Export in `Movies/Titel (Jahr)` oder `Shows/Serie/Season NN`, einschließlich existierender `Staffel N`-Ordner. Ziel-Dateien werden nicht automatisch überschrieben.
- Sicherheitsprüfung der MP4-Signatur, temporäre Übertragungsdateien und Dateiabschluss ohne Überschreiben; Quellen und entdeckte Episoden im JSON-Backup.
- **Keine** DRM-Umgehung, kein automatisches Login/Captcha-Bypass, keine unbeaufsichtigte Websuche jenseits explizit eingetragener Quellen.

**Formatgrenzen:** HLS mit separaten Audio-Playlists, AES-/DRM-geschützte oder Live-Playlists, HLS-Discontinuities und alle DASH-Manifestvarianten außer expliziten `SegmentList`-Profilen werden nicht verarbeitet. Automatische Quellenadapter je beliebiger Streaming-Website sind noch nicht realisiert. Manche Container/Codecs können von FFmpeg nicht verlustfrei in MP4 remuxt werden; der Auftrag schlägt dann nachvollziehbar fehl.

**Sicherheitsrelevant für ZimaOS:** Die Medienfreigabe wird in Phase 2 erstmals **schreibbar** als `/media` gemountet. Verwende einen bewusst freigegebenen Medienpfad und sichere deine Jellyfin-Bibliothek vorher. ForgeCore läuft standardmäßig nur auf `127.0.0.1:8787` und benötigt eine Administratoranmeldung.

## Umfang Phase 1 (v0.0.1–v0.0.9)

- Docker-Dienst mit **dauerhaftem SQLite-Speicher**, versionierten Migrationen und Neustartwiederherstellung wartender Jobs.
- Einrichtung mit **Adminpasswort**, scrypt-basiertem Passwort-Hash, HttpOnly-Sessioncookie, SameSite=Strict, CSRF-Schutz, origin-geprüften Mutationen und Login-Rate-Limits.
- Responsive, deutschsprachige Weboberfläche für Filme, Serien, Staffeln und Episoden, mit Statuspflege, Metadatenfeldern und Metadatenprüfung (lokal, keine Provider-Abfrage).
- **Jellyfin-konforme Vorschau und Read-only-Bibliotheksscan** für `Movies/Titel (Jahr)` und `Shows/Serie/Season NN/Serie SNNENN`. Auch vorhandene `Staffel 2`-Ordner werden erkannt.
- Persistente Hintergrundaufgaben, Retry, Abbruch wartender Jobs und übersichtliche Jobhistorie.
- Sicherung und Wiederherstellung der Film-/Serienprojekte, Episoden und Einstellungen als JSON. **Passwörter und Sessions werden ausdrücklich nicht exportiert.** Wiederherstellung überschreibt bestehende Projekte erst nach expliziter Bestätigung.
- Docker Compose mit **für die Medienablage schreibbarem Medienvolume**, begrenzten Ressourcen, lokalem Port und persistentem Datenvolume.

## Docker / ZimaOS starten

Benötigt Docker Compose v2. Öffne auf dem ZimaOS-Host das Verzeichnis `ForgeCore/` und führe aus:

```bash
cp .env.example .env
# .env bearbeiten und FORGECORE_MEDIA_HOST_PATH auf dein echtes Medienverzeichnis setzen.
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
```

Standardmäßig ist das Web-Dashboard **nur auf dem ZimaOS-Host unter `127.0.0.1:8787`** erreichbar. Für einen sicheren Remote-Zugriff in deinem Heimnetz verwende vorzugsweise einen authentifizierten HTTPS-Reverse-Proxy oder ein VPN; Portfreigabe ins Internet ist nicht vorgesehen. Erstpasswort bei der Einrichtung setzen, **bevor** du die Oberfläche im Netzwerk verfügbar machst. Das Container-Medienvolume ist ab Phase 2 **schreibbar**. Bestehende Mediendateien werden nicht absichtlich überschrieben. Bitte vorher Backup und tatsächlich verfügbare ZimaOS-Schreibrechte prüfen.

In `compose.yaml` lässt sich die Bind-Adresse nur bewusst über `FORGECORE_BIND_ADDRESS` verändern. Bei einem HTTPS-Reverse-Proxy kann `FORGECORE_SECURE_COOKIE=1` für Secure-Cookies gesetzt werden, **nur** wenn dein Proxy auch wirklich HTTPS bereitstellt.

Zum Stoppen: `docker compose down`. Die SQLite-Daten bleiben im benannten Volume `forgecore-data` erhalten. **Nicht** `docker compose down -v` verwenden, wenn du Daten behalten möchtest.

### Lokale Entwicklung

```bash
cd ForgeCore/server
npm test
npm run check
npm start
```

Node.js 22.13+ wird benötigt (`node:sqlite` ist in Node 22 noch experimentell). Die Tests nutzen eine temporäre SQLite-Datenbank und lokale HTTP-Requests.

### API (Auswahl)

| Endpoint | Zweck |
| --- | --- |
| `GET /api/health` | Gesundheitsprüfung |
| `GET /api/status` | Version / tatsächliche Fähigkeiten |
| `POST /api/setup` | Einmalige Administrator-Einrichtung |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` | Anmeldung / Sitzung |
| `GET/POST /api/media`, `GET/PATCH/DELETE /api/media/:id` | Medienprojekte |
| `GET/POST /api/media/:id/episodes`, `PATCH/DELETE /api/episodes/:id` | Episoden |
| `GET /api/media/:id/preview` | Jellyfin-Dateien nur lesend erkennen |
| `GET/POST /api/media/:id/sources` | Film-/Serienquellen verwalten |
| `POST /api/sources/:id/analyze`, `GET /api/sources/:id/items` | Quelle analysieren, entdeckte URLs anzeigen |
| `POST /api/sources/:id/import-episodes` | Erkannte Episoden kontrolliert importieren |
| `GET/POST /api/transfers`, `POST /api/transfers/batch` | Medien-Downloads einzeln oder als Serien-Batch planen |
| `POST /api/transfers/:id/cancel`, `POST /api/transfers/:id/retry` | Downloads abbrechen / erneut versuchen |
| `GET/PUT /api/config` | App-Einstellungen, Jellyfin-Adresse als Konfiguration |
| `GET/POST /api/jobs`, `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry` | Persistente Aufgaben |
| `GET /api/backup/export`, `POST /api/backup/import` | JSON-Backup und bestätigtes Restore |

Geschützte APIs benötigen einen Sessioncookie. Schreibaufrufe zusätzlich `X-ForgeCore-CSRF`, wie bei der Anmeldung bzw. `GET /api/me` erhalten; Einrichtung und Anmeldung verwenden `X-ForgeCore-Request: 1`.

## Versions- und Releasepolitik

- **ForgeCore:** eigene Versionsnummer ab `v0.0.1`. Der aktuelle Phase-3-Beta-Vorschau-Stand ist `v0.2.9`.
- **Browser-Snapshot:** `ForgeCore/browser-extension/` bleibt auf **StreamForge v1.8.1**; Änderungen erfolgen ausschließlich bewusst und separat.
- Release-Tags für ForgeCore tragen den Präfix `forgecore-vX.Y.Z`, um mit der bestehenden Browser-Erweiterung keine Tags zu kollidieren.
- Die detaillierten Meilensteine stehen in [ROADMAP.md](./ROADMAP.md), die konkreten Änderungen in [CHANGELOG.md](./CHANGELOG.md).

## Grenzen und Sicherheitskonzept

- Nur explizit vom Benutzer eingetragene, berechtigt zugängliche Quellen. Keine DRM-/Zugangsbeschränkungsumgehung, kein automatisches Account-Login.
- Downloads verwenden öffentliche HTTP(S)-Ziele ohne mitgesendete Browser-Cookies. Schutz gegen private IPs, Redirects und gefährliche Port-Adressen.
- Jellyfin-Adresse bleibt zunächst eine gespeicherte Konfiguration; es erfolgt **kein** automatischer Jellyfin-API-Refresh. Die Ablage neuer Dateien und lokaler Bibliotheks-Scan sind vorhanden.
- DASH unterstützt explizite SegmentList sowie begrenzte SegmentTemplate-Profile mit Nummern- oder Timeline-Fragmenten. Eine separate HLS-Audio-Playlist führt zu einer verständlichen Fehlermeldung.
- Eine ZimaOS-/SMB-Dateifreigabe muss für den ForgeCore-Docker-Benutzer schreibbar sein. Reale Heimnetz-Abnahme steht aus.
- SQLite und temporäre Medienfiles liegen auf dem persistenten `forgecore-data`-Volume. Ausreichend freien Speicher einplanen.
- Internetzugriff auf die App ist nicht vorgesehen; vor bewusster LAN-Freigabe sichere HTTPS-/Login-Konfiguration einrichten.
