# ForgeCore

**ForgeCore** ist die zukünftige, eigenständige ZimaOS-/Docker-Serverkomponente von StreamForge.

> **Status: technisches Grundgerüst, noch keine automatische Webseitenanalyse und kein HLS-/DASH-Download im Server.**

## Warum ein eigener Ordner?

- `/StreamForge/` bleibt die vorhandene Browser-Erweiterung und wird durch diese Änderung nicht verändert.
- `/ForgeCore/browser-extension/` ist eine **unveränderte Kopie der aktiven Dateien aus dem offiziellen Git-Tag `v1.8.1`**. Die historischen, für den Extension-Build irrelevanten Uploads aus `StreamForge/archive/unclassified/` sind bewusst ausgeschlossen.
- `/ForgeCore/server/` wird die separate App für ZimaOS. Sie kann langfristig Medienprojekte, Quellenadapter, Warteschlange und Jellyfin-Integration verwalten.
- `/ForgeCore/compose.yaml` ist die lokale Docker-Startkonfiguration. **Keine Abhängigkeit vom laufenden Chrome.**

## Projektstruktur

```text
ForgeCore/
├── README.md
├── compose.yaml
├── .env.example
├── browser-extension/     # StreamForge v1.8.1 Snapshot (nicht 1.8.1)
│   ├── manifest.json
│   ├── background.js
│   ├── popup.html
│   ├── ...
│   └── tests/
└── server/
    ├── Dockerfile
    ├── package.json
    ├── src/
    │   └── server.mjs
    └── tests/
        └── server.test.mjs
```

## Lokaler Start auf ZimaOS / Docker

Aus dem Verzeichnis `ForgeCore/`:

```bash
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
```

Die Compose-Konfiguration bindet aus Sicherheitsgründen nur an `127.0.0.1:8787`. Zugriff von anderen Geräten wird **noch nicht** aktiviert; dafür sind eine Authentifizierung, sichere Freigabe und eine bewusste Portkonfiguration nötig.

Logs: `docker compose logs -f forgecore` · Beenden: `docker compose down`.

## Entwicklungs- und Testbefehle

```bash
cd server
npm test
node src/server.mjs
```

Der Server hat derzeit **nur lesende, harmlose Diagnose-Endpunkte**:

- `GET /api/health` → Status der App
- `GET /api/status` → Name, Version, Entwicklungsphase und bereitgestellte Fähigkeiten

Es findet **keine** automatische Mediensuche, Webseitenabfrage, Netzwerküberwachung oder Dateibearbeitung statt.

## Geplante Meilensteine

1. Serverarchitektur, persistenten Speicher, Authentifizierung und sichere API festlegen.
2. Medienprojekte für Filme und Serien mit Metadaten anlegen.
3. Quellenadapter für technisch zugängliche und rechtmäßig nutzbare Websites entwickeln.
4. Berechtigt zugängliche HLS-/DASH-Medien erkennen und sichere Download-Warteschlangen implementieren.
5. Jellyfin-Bibliothek und vorhandene Ordner/Staffeln mit ZimaOS-Volumes synchronisieren.

## Lizenz und Grenzen

Das Browser-Snapshot stammt aus dem eigenen Projekt `StreamForge`; seine Dateien wurden anhand des Git-Tags `v1.8.1` übernommen. Die Lizenzlage weiterer, später integrierter Komponenten muss jeweils gesondert geprüft werden. DRM-Umgehung und das Umgehen von Zugangs- oder Nutzungsbeschränkungen sind **nicht** Teil der geplanten Funktionen.

**Wichtig:** Das hier ist das Fundament der neuen ZimaOS-App, noch keine vollständige Sonarr-/Radarr-Alternative.
