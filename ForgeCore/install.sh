#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null 2>&1 || { echo "Docker erforderlich" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 erforderlich" >&2; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  echo "ForgeCore/.env erstellt: Bitte FORGECORE_MEDIA_HOST_PATH konfigurieren und ./install.sh erneut ausführen."
  exit 0
fi
media_path="$(sed -n 's/^FORGECORE_MEDIA_HOST_PATH=//p' .env | tail -n 1)"
if [ -z "$media_path" ] || [ "$media_path" = "./media" ]; then
  echo "Bitte zuerst FORGECORE_MEDIA_HOST_PATH in .env anpassen." >&2
  exit 1
fi
[ -d "$media_path" ] || { echo "Medienverzeichnis nicht gefunden: $media_path" >&2; exit 1; }
[ -w "$media_path" ] || { echo "Medienverzeichnis nicht schreibbar: $media_path" >&2; exit 1; }
docker compose config --quiet
docker compose up -d --build
echo "ForgeCore gestartet. Test: curl http://127.0.0.1:8787/api/health"
