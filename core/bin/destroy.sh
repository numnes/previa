#!/usr/bin/env bash
# Uso: destroy.sh <slug-projeto> <branch>
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
PRIMARY_DIR="$(zd_checkout_dir "$PROJECT_SLUG" "$BRANCH_SLUG" primary)"
NEXT_DIR="$(zd_checkout_dir "$PROJECT_SLUG" "$BRANCH_SLUG" next)"

stop_both_instance_colors "$BASE_NAME"
rm_instance_color_state "$BASE_NAME" 0
rm -f "$(activity_log_path "$PROJECT_SLUG" "$BRANCH_SLUG")"
rm -f "$LOC_FILE"
rm -f "$LEGACY_LOC_FILE"
rm -rf "$PRIMARY_DIR"
rm -rf "$NEXT_DIR"
nginx_reload

echo "OK destroy ${PROJECT_SLUG} branch ${BRANCH}" >&2
