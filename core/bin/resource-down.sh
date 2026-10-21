#!/usr/bin/env bash
# Derruba um recurso Docker (container ou compose).
# Uso: resource-down.sh <slug>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

[[ $# -ge 1 ]] || { echo "Uso: $0 <slug>" >&2; exit 1; }

SLUG="$1"
RUNTIME_NAME="prv-res-${SLUG}"
COMPOSE_PROJECT="prvres${SLUG//-/}"
RES_DIR="${PREVIA_RESOURCE_DIR:-${PREVIA_STATE_DIR}/resources/${SLUG}}"

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    return 1
  fi
}

if command -v docker >/dev/null 2>&1; then
  docker stop "$RUNTIME_NAME" 2>/dev/null || true
  docker rm "$RUNTIME_NAME" 2>/dev/null || true
  if [[ -f "${RES_DIR}/docker-compose.yml" ]]; then
    compose_cmd -p "$COMPOSE_PROJECT" -f "${RES_DIR}/docker-compose.yml" down --remove-orphans >/dev/null 2>&1 || true
  fi
  # Containers órfãos do compose project
  docker ps -aq --filter "label=com.docker.compose.project=${COMPOSE_PROJECT}" | xargs -r docker rm -f >/dev/null 2>&1 || true
fi

shopt -s nullglob
for f in "${PREVIA_STATE_DIR}/${RUNTIME_NAME}"-*.port; do
  rm -f "$f"
done
rm -f "${PREVIA_STATE_DIR}/${RUNTIME_NAME}.port"
echo "OK resource down ${SLUG}" >&2
