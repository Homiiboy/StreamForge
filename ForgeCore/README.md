# ForgeCore

**ForgeCore-Version: v0.0.1 (Fundament).** Die unabhängige Versionsreihe startet bei v0.0.1; die unter `browser-extension/` eingefrorene StreamForge-Browserkopie bleibt unverändert auf v1.8.1.

**[Roadmap v0.0.1 → v1.0.0](./ROADMAP.md)** mit Abnahmekriterien für ZimaOS, Datenbank, Quellenverwaltung, Downloads und Jellyfin.

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
├── ROADMAP.md
├── compose.yaml
├── .env.example
├── browser-extension/     # StreamForge v1.8.1 Snapshot (separat versioniert)
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

Die vollständige, in Versionen aufgeteilte Planung steht in der **[ForgeCore-Roadmap](./ROADMAP.md)**. Nächster Schritt ist v0.0.2 (persistente SQLite-Datenbank mit Migrationen).

## Lizenz und Grenzen

Das Browser-Snapshot stammt aus dem eigenen Projekt `StreamForge`; seine Dateien wurden anhand des Git-Tags `v1.8.1` übernommen. Die Lizenzlage weiterer, später integrierter Komponenten muss jeweils gesondert geprüft werden. DRM-Umgehung und das Umgehen von Zugangs- oder Nutzungsbeschränkungen sind **nicht** Teil der geplanten Funktionen.

**Wichtig:** Das hier ist das Fundament der neuen ZimaOS-App, noch keine vollständige Sonarr-/Radarr-Alternative.
