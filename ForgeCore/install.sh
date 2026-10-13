#!/usr/bin/env bash
# Compatibility entry point. Existing installations must use the safe upgrade workflow.
set -euo pipefail
cd "$(dirname "$0")"
exec bash ./manage.sh install
