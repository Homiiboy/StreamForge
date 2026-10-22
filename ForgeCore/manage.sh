#!/usr/bin/env bash
# ForgeCore ZimaOS operations; does not alter Jellyfin media files.
set -Eeuo pipefail
cd "$(dirname "$0")"
umask 077
VERSION=1.3.0
BACKUP_ROOT="$(pwd)/backups"
die(){ echo "[ForgeCore] $*" >&2; exit 1; }
log(){ echo "[ForgeCore] $*"; }
preflight(){
 command -v docker >/dev/null || die "Docker is missing."
 docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required."
 if [ ! -f .env ]; then
  cp .env.example .env
  die "Configured .env template; set FORGECORE_MEDIA_HOST_PATH, then retry."
 fi
 local media
 media="$(sed -n 's/^FORGECORE_MEDIA_HOST_PATH=//p' .env | tail -n 1)"
 [ -n "$media" ] && [ "$media" != "./media" ] || die "Set FORGECORE_MEDIA_HOST_PATH in .env."
 [ -d "$media" ] || die "Media path does not exist: $media"
 [ -r "$media" ] && [ -w "$media" ] || die "Host media path needs read/write access."
 docker compose config --quiet
}
cid(){ docker compose ps -q forgecore; }
image_id(){ docker inspect --format '{{.Image}}' "$1"; }
data_volume(){
 local name
 name="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$1")"
 [[ "$name" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || die "Invalid data volume."
 echo "$name"
}
healthy(){
 local id="$1" status n
 for n in $(seq 1 40); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
  [ "$status" = healthy ] && return 0
  case "$status" in exited|unhealthy|dead) return 1;; esac
  sleep 2
 done
 return 1
}
snapshot(){
 local old_image="$1" volume="$2" target="$3"
 mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
 mkdir -m 700 "$target"
 printf '%s\n' "$old_image" > "$target/image-id"
 printf '%s\n' "$volume" > "$target/data-volume"
 docker run --rm --user 0 -v "$volume:/data:ro" -v "$target:/backup" "$old_image" sh -c 'cd /data && tar -czf /backup/data.tar.gz .'
 [ -s "$target/data.tar.gz" ] || die "Empty backup."
 (cd "$target" && sha256sum data.tar.gz > data.tar.gz.sha256)
 docker run --rm --user 0 -v "$target:/backup:ro" "$old_image" sh -c 'tar -tzf /backup/data.tar.gz >/dev/null'
 log "Consistent stopped-service backup: $target"
}
restore(){
 local target="$1" old_image volume
 [ -f "$target/image-id" ] && [ -f "$target/data-volume" ] && [ -s "$target/data.tar.gz" ] && [ -f "$target/data.tar.gz.sha256" ] || die "Incomplete backup."
 (cd "$target" && sha256sum -c data.tar.gz.sha256) || die "Backup archive checksum mismatch. No data changed."
 old_image="$(cat "$target/image-id")"; volume="$(cat "$target/data-volume")"
 [[ "$old_image" =~ ^sha256:[a-f0-9]{64}$ ]] || die "Invalid image digest."
 [[ "$volume" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]+$ ]] || die "Invalid volume."
 docker image inspect "$old_image" >/dev/null || die "Previous image no longer available."
 local running_volume
 running_volume="$(data_volume "$(cid)")"
 [ "$running_volume" = "$volume" ] || die "Backup volume does not match active ForgeCore volume."
 docker compose stop forgecore || true
 docker run --rm --user 0 -v "$volume:/data" -v "$target:/backup:ro" "$old_image" sh -c 'cd /data && rm -rf -- ./* ./.[!.]* ./..?* && tar -xzf /backup/data.tar.gz'
 docker tag "$old_image" "forgecore:$VERSION"
 docker compose up -d --no-build --force-recreate forgecore
 local id; id="$(cid)"
 [ -n "$id" ] && healthy "$id" || die "Rolled back data but old service healthcheck failed."
 log "Previous image and data volume restored."
}
case "${1:-help}" in
 doctor)
  preflight;log "Docker, Compose and host path OK; check container UID/GID on ZimaOS."
  ;;
 status)
  docker compose ps
  ;;
 install)
  preflight
  [ -z "$(cid)" ] || die "Existing installation: use update."
  docker compose up -d --build forgecore
  id="$(cid)";[ -n "$id" ] && healthy "$id" || die "Install healthcheck failed."
  log "ForgeCore $VERSION running on local port 8787."
  ;;
 backup)
  preflight;id="$(cid)";[ -n "$id" ] || die "No running installation."
  image="$(image_id "$id")";volume="$(data_volume "$id")"
  docker compose stop forgecore
  target="$BACKUP_ROOT/backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  if ! (snapshot "$image" "$volume" "$target"); then
   docker compose start forgecore || true
   die "Backup failed; previous service was restarted."
  fi
  docker compose start forgecore
  ;;
 update)
  preflight;id="$(cid)";[ -n "$id" ] || die "Install first."
  image="$(image_id "$id")";volume="$(data_volume "$id")"
  docker compose build forgecore
  docker compose stop forgecore
  target="$BACKUP_ROOT/backup-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  if ! (snapshot "$image" "$volume" "$target"); then
   docker compose start forgecore || true
   die "Pre-upgrade backup failed; old service was restarted."
  fi
  if docker compose up -d --no-build --force-recreate forgecore && [ -n "$(cid)" ] && healthy "$(cid)"; then
   log "Update succeeded. Rollback snapshot: $target"
  else
   log "Healthcheck failed, rolling back."
   restore "$target"
   die "Update rolled back to prior image and data."
  fi
  ;;
 rollback)
  preflight
  [ "$#" -eq 2 ] || die "Usage: ./manage.sh rollback backups/backup-..."
  target="$(realpath -e -- "$2")"
  case "$target" in "$BACKUP_ROOT"/backup-*) ;; *) die "Backup outside ForgeCore/backups not allowed.";; esac
  restore "$target"
  ;;
 *)
  echo "Usage: ./manage.sh {doctor|status|install|backup|update|rollback BACKUP}"
  ;;
esac
