#!/usr/bin/env bash
# Pausa preview: para processo/container e remove location nginx, mantém checkout em disco.
# Uso: pause.sh <slug-projeto> <branch>
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
LOC_FILE="${LOCATIONS_DIR}/$(location_file_basename "$PROJECT_SLUG" "$BRANCH_SLUG")"
# Formato antigo (apenas branchSlug), removido para compatibilidade.
LEGACY_LOC_FILE="${LOCATIONS_DIR}/${BRANCH_SLUG}.location"

stop_both_instance_colors "$BASE_NAME"

# Mantém *.port: instância pausada ainda reserva a porta até destroy/reatribuição.
rm -f "${PREVIA_STATE_DIR}/${BASE_NAME}.deploy-result.json"
rm -f "${PREVIA_STATE_DIR}/$(zd_runtime_name "$BASE_NAME" primary).deploy-result.json"
rm -f "${PREVIA_STATE_DIR}/$(zd_runtime_name "$BASE_NAME" next).deploy-result.json"
rm -f "$LOC_FILE"
rm -f "$LEGACY_LOC_FILE"
nginx_reload

echo "OK pause ${PROJECT_SLUG} branch ${BRANCH}" >&2
