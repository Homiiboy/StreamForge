#!/usr/bin/env bash
# ForgeCore secure ZIP upgrade – preserves host-only secrets, including the TMDB token.
# Run from an existing ForgeCore directory: sudo bash upgrade.sh /path/to/ForgeCore-vX-ZimaOS.zip
set -Eeuo pipefail
umask 077
ROOT="$(pwd -P)"
BACKUP_ROOT="$ROOT/backups"
say(){ printf '[ForgeCore] %s\n' "$*"; }
die(){ printf '[ForgeCore] %s\n' "$*" >&2; exit 1; }
[ "$#" -eq 1 ] || die "Usage: sudo bash upgrade.sh /absolute/path/ForgeCore-vX-ZimaOS.zip"
command -v unzip >/dev/null || die "unzip is required"
command -v cp >/dev/null || die "cp is required"
[ -f "$ROOT/manage.sh" ] && [ -d "$ROOT/server" ] || die "Run from the installed ForgeCore directory"
[ -f "$ROOT/.env" ] && [ ! -L "$ROOT/.env" ] || die "Existing .env must be a regular file; refusing to overwrite secrets"
[ ! -L "$ROOT/server" ] && [ ! -L "$ROOT/backups" ] || die "Unexpected symlink in installation paths"
ARCHIVE="$(realpath -e -- "$1")" || die "Archive not found"
[ -f "$ARCHIVE" ] && [ ! -L "$ARCHIVE" ] || die "Archive must be a regular ZIP"
unzip -tq "$ARCHIVE" >/dev/null || die "ZIP checksum test failed"
# Only accept files distributed as ForgeCore code. Reject zip-slip, hidden secret files,
# backups, unsupported content and symlinks, before touching the installation.
n=0
while IFS= read -r path; do
 [ -n "$path" ] || die "ZIP contains an empty entry"
 case "$path" in
  /*|*\\*|*'/../'*|*'/./'*|*'/..'|*'/.'|*'//'*) die "Unsafe ZIP entry" ;;
 esac
 case "$path" in
  */.env|*/.env/*|*/backups/*|*/.git/*|*/.ssh/*|*/.env.local|*/.env.production) die "ZIP contains protected configuration" ;;
 esac
 case "$path" in
  ForgeCore/|ForgeCore/server|ForgeCore/server/*|ForgeCore/compose.yaml|ForgeCore/.env.example|ForgeCore/install.sh|ForgeCore/manage.sh|ForgeCore/upgrade.sh|ForgeCore/README.md|ForgeCore/ROADMAP.md|ForgeCore/CHANGELOG.md|ForgeCore/ACCEPTANCE-v1.0.0.md) ;;
  *) die "ZIP contains an unexpected file path" ;;
 esac
 n=$((n+1))
done < <(unzip -Z -1 "$ARCHIVE")
[ "$n" -ge 5 ] || die "ZIP has too few entries"
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
stage="$(mktemp -d "$BACKUP_ROOT/upgrade-stage-XXXXXXXX")"
trap 'rm -rf -- "$stage"' EXIT
unzip -q "$ARCHIVE" -d "$stage"
[ -z "$(find "$stage" -type l -print -quit)" ] || die "Archive contains symlinks"
[ -d "$stage/ForgeCore/server" ] && [ -f "$stage/ForgeCore/compose.yaml" ] && [ -f "$stage/ForgeCore/manage.sh" ] || die "ZIP is missing expected ForgeCore files"
# Keep a private immutable-by-the-updater copy outside the extracted code.
snapshot="$(mktemp -d "$BACKUP_ROOT/env-before-upgrade-XXXXXXXX")"
cp -p -- "$ROOT/.env" "$snapshot/.env"
chmod 600 "$snapshot/.env"
say "Private configuration backup: $snapshot/.env (do not share it)"
# Refuse an installation with symlinked server targets that could redirect extraction.
[ -z "$(find "$ROOT/server" -type l -print -quit)" ] || die "Local server directory contains unexpected symlinks"
cp -a -- "$stage/ForgeCore/." "$ROOT/"
if ! cmp -s -- "$ROOT/.env" "$snapshot/.env"; then
 cp -p -- "$snapshot/.env" "$ROOT/.env"
 die "The upgrade attempted to change .env; original secrets restored. Service not updated."
fi
chmod 600 "$ROOT/.env"
say ".env unchanged; updating ForgeCore with Docker backups and health checks"
bash "$ROOT/manage.sh" update
cmp -s -- "$ROOT/.env" "$snapshot/.env" || { cp -p -- "$snapshot/.env" "$ROOT/.env"; die "Configuration changed during update; restored original .env"; }
say "Upgrade complete. Your TMDB token remains in .env."
