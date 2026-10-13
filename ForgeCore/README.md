# ForgeCore

**ForgeCore v0.0.9 — Phase 1 abgeschlossen (Alpha-Fundament).** Eigenständiger ZimaOS-/Docker-Server. Die hier archivierte Browser-Erweiterung in `browser-extension/` bleibt **unverändert StreamForge v1.8.1** und hat eine komplett separate Versionierung.

> ForgeCore v0.0.9 ist **kein** autonomer HLS-/DASH-Downloader. Quellenadapter, automatische Serien-/Episodensuche, Muxing und tatsächliches Laden von Websites folgen erst in Phase 2. Die echte Installation auf deinem ZimaOS-Host muss gesondert getestet werden.

## Umfang Phase 1 (v0.0.1–v0.0.9)

- Docker-Dienst mit **dauerhaftem SQLite-Speicher**, versionierten Migrationen und Neustartwiederherstellung wartender Jobs.
- Einrichtung mit **Adminpasswort**, scrypt-basiertem Passwort-Hash, HttpOnly-Sessioncookie, SameSite=Strict, CSRF-Schutz, origin-geprüften Mutationen und Login-Rate-Limits.
- Responsive, deutschsprachige Weboberfläche für Filme, Serien, Staffeln und Episoden, mit Statuspflege, Metadatenfeldern und Metadatenprüfung (lokal, keine Provider-Abfrage).
- **Jellyfin-konforme Vorschau und Read-only-Bibliotheksscan** für `Movies/Titel (Jahr)` und `Shows/Serie/Season NN/Serie SNNENN`. Auch vorhandene `Staffel 2`-Ordner werden erkannt.
- Persistente Hintergrundaufgaben, Retry, Abbruch wartender Jobs und übersichtliche Jobhistorie.
- Sicherung und Wiederherstellung der Film-/Serienprojekte, Episoden und Einstellungen als JSON. **Passwörter und Sessions werden ausdrücklich nicht exportiert.** Wiederherstellung überschreibt bestehende Projekte erst nach expliziter Bestätigung.
- Docker Compose mit **read-only Medienvolume**, begrenzten Ressourcen, lokalem Port und persistentem Datenvolume.

## Docker / ZimaOS starten

Benötigt Docker Compose v2. Öffne auf dem ZimaOS-Host das Verzeichnis `ForgeCore/` und führe aus:

```bash
cp .env.example .env
# .env bearbeiten und FORGECORE_MEDIA_HOST_PATH auf dein echtes Medienverzeichnis setzen.
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
```

Standardmäßig ist das Web-Dashboard **nur auf dem ZimaOS-Host unter `127.0.0.1:8787`** erreichbar. Für einen sicheren Remote-Zugriff in deinem Heimnetz verwende vorzugsweise einen authentifizierten HTTPS-Reverse-Proxy oder ein VPN; Portfreigabe ins Internet ist nicht vorgesehen. Erstpasswort bei der Einrichtung setzen, **bevor** du die Oberfläche im Netzwerk verfügbar machst. Das Container-Medienvolume ist absichtlich **schreibgeschützt**; ForgeCore Phase 1 verändert keine Jellyfin-Medien.

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
| `GET/PUT /api/config` | App-Einstellungen, Jellyfin-Adresse als Konfiguration |
| `GET/POST /api/jobs`, `POST /api/jobs/:id/cancel`, `POST /api/jobs/:id/retry` | Persistente Aufgaben |
| `GET /api/backup/export`, `POST /api/backup/import` | JSON-Backup und bestätigtes Restore |

Geschützte APIs benötigen einen Sessioncookie. Schreibaufrufe zusätzlich `X-ForgeCore-CSRF`, wie bei der Anmeldung bzw. `GET /api/me` erhalten; Einrichtung und Anmeldung verwenden `X-ForgeCore-Request: 1`.

## Versions- und Releasepolitik

- **ForgeCore:** eigene Versionsnummer ab `v0.0.1`. Der aktuelle Phase-1-Stand ist `v0.0.9`.
- **Browser-Snapshot:** `ForgeCore/browser-extension/` bleibt auf **StreamForge v1.8.1**; Änderungen erfolgen ausschließlich bewusst und separat.
- Release-Tags für ForgeCore tragen den Präfix `forgecore-vX.Y.Z`, um mit der bestehenden Browser-Erweiterung keine Tags zu kollidieren.
- Die detaillierten Meilensteine stehen in [ROADMAP.md](./ROADMAP.md), die konkreten Änderungen in [CHANGELOG.md](./CHANGELOG.md).

## Grenzen und Sicherheitskonzept

- Kein Download, Streaming-Scraping, DRM-Handling oder Zugriff auf externe Metadatenanbieter.
- Eine konfigurierte Jellyfin-URL erzeugt **noch keine** Jellyfin-API-Verbindung. Der Bibliotheksscan liest Dateinamen nur aus dem gemounteten Volume.
- Das Jellyfin-Volume wird bewusst nur lesend verwendet; ein späterer Dateiexport benötigt ein eigenes Sicherheits-/Integritätskonzept.
- Die SQLite-Datenbank liegt persistent unter `/data/forgecore.sqlite`. Verwende für reguläre Backups die integrierte JSON-Sicherungsfunktion sowie geeignete ZimaOS-Volume-Backups.
- Reverse-Proxy-Betrieb und echte SMB-/ZimaOS-Rechte sowie Langzeitverhalten müssen in einer realen Installation abgenommen werden.
