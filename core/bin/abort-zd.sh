#!/usr/bin/env bash
# Abort zero-downtime staging: stop staging runtime, leave live nginx untouched.
# Uso: abort-zd.sh <slug-projeto> <branch> <staging-runtime-name>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

usage() {
  echo "Uso: $0 <slug-projeto> <branch> <staging-runtime-name>" >&2
  exit 1
}

[[ $# -ge 3 ]] || usage

PROJECT_SLUG="$1"
BRANCH="$2"
STAGING_NAME="$3"
BASE_NAME="$(instance_name "$PROJECT_SLUG" "$BRANCH")"
BRANCH_SLUG="$(sanitize_branch_slug "$BRANCH")"
LIVE_COLOR="$(read_live_color "$BASE_NAME")"
LIVE_NAME="$(zd_runtime_name "$BASE_NAME" "$LIVE_COLOR")"

if [[ "$STAGING_NAME" == "$LIVE_NAME" ]]; then
  echo "abort-zd: staging name equals live (${STAGING_NAME}); refusing to stop live" >&2
  exit 1
fi

stop_instance "$STAGING_NAME"
rm -f "${PREVIA_STATE_DIR}/${STAGING_NAME}.deploy-result.json"
# Keep staging .port reserved to reduce thrash on retries; destroy clears both.

# Optionally remove leftover staging checkout on next color only if empty? Keep for faster rebuild.
echo "OK abort-zd ${PROJECT_SLUG}/${BRANCH} staging=${STAGING_NAME} (live ${LIVE_NAME} untouched)" >&2
