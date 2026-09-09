#!/usr/bin/env bash
# Idle sleep: para o runtime e aponta o nginx para o wake da API (mantém checkout).
# Uso: sleep.sh <slug-projeto> <branch>
# Env: PREVIA_WAKE_UPSTREAM=http://127.0.0.1:<api-port>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

usage() {
  echo "Uso: $0 <slug-projeto> <branch>" >&2
  exit 1
}

[[ $# -ge 2 ]] || usage

PROJECT_SLUG="$1"
BRANCH="$2"
BRANCH_SLUG="$(sanitize_branch_slug "$BRANCH")"
BASE_NAME="$(instance_name "$PROJECT_SLUG" "$BRANCH")"
LOCATIONS_DIR="${PREVIA_LOCATIONS_DIR}"
LEGACY_LOC_FILE="${LOCATIONS_DIR}/${BRANCH_SLUG}.location"

stop_both_instance_colors "$BASE_NAME"

# Mantém *.port: a porta continua reservada enquanto a instância existir
# (evita que outro deploy pegue a porta durante o idle sleep).
rm -f "${PREVIA_STATE_DIR}/${BASE_NAME}.deploy-result.json"
rm -f "${PREVIA_STATE_DIR}/$(zd_runtime_name "$BASE_NAME" primary).deploy-result.json"
rm -f "${PREVIA_STATE_DIR}/$(zd_runtime_name "$BASE_NAME" next).deploy-result.json"
rm -f "$LEGACY_LOC_FILE"

write_wake_location_file "$LOCATIONS_DIR" "$PROJECT_SLUG" "$BRANCH_SLUG" "${PREVIA_WAKE_UPSTREAM}"
nginx_reload

echo "OK sleep ${PROJECT_SLUG} branch ${BRANCH} (wake via ${PREVIA_WAKE_UPSTREAM})" >&2
