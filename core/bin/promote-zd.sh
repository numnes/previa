#!/usr/bin/env bash
# Promote zero-downtime staging to live: swap nginx location, stop old live, flip color.
# Uso: promote-zd.sh <slug-projeto> <branch> <staging-port> <staging-color> <staging-runtime-name>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

usage() {
  echo "Uso: $0 <slug-projeto> <branch> <staging-port> <staging-color> <staging-runtime-name>" >&2
  exit 1
}

[[ $# -ge 5 ]] || usage

PROJECT_SLUG="$1"
BRANCH="$2"
STAGING_PORT="$3"
STAGING_COLOR="$4"
STAGING_NAME="$5"
BRANCH_SLUG="$(sanitize_branch_slug "$BRANCH")"
BASE_NAME="$(instance_name "$PROJECT_SLUG" "$BRANCH")"
LOCATIONS_DIR="${PREVIA_LOCATIONS_DIR}"

LIVE_COLOR="$(read_live_color "$BASE_NAME")"
LIVE_NAME="$(zd_runtime_name "$BASE_NAME" "$LIVE_COLOR")"

if [[ "$STAGING_COLOR" != "primary" && "$STAGING_COLOR" != "next" ]]; then
  echo "staging-color inválida: ${STAGING_COLOR}" >&2
  exit 1
fi

write_location_file "$LOCATIONS_DIR" "$PROJECT_SLUG" "$BRANCH_SLUG" "$STAGING_PORT"
nginx_reload

if [[ "$LIVE_NAME" != "$STAGING_NAME" ]]; then
  stop_instance "$LIVE_NAME"
fi

write_live_color "$BASE_NAME" "$STAGING_COLOR"
# Keep base .port in sync with the live publish port for tooling.
echo "$STAGING_PORT" >"${PREVIA_STATE_DIR}/${BASE_NAME}.port"
# Staging name already has its .port from reserve_free_port.

echo "OK promote-zd ${PROJECT_SLUG}/${BRANCH} → ${STAGING_NAME}:${STAGING_PORT} (live=${STAGING_COLOR})" >&2
