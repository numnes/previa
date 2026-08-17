# shellcheck shell=bash
# Load durable settings from previa.env (never overwritten by setup/restart).
#
# Optional keys:
#   PREVIA_PUBLIC_WEB_URL   → CORS_ORIGIN (browser Origin of the dashboard)
#   PREVIA_PUBLIC_API_URL   → NEXT_PUBLIC_API_URL baked into the web image
#   PREVIA_PUBLIC_WEB_BASE_PATH → NEXT_PUBLIC_BASE_PATH (e.g. /previa)
#   PREVIA_API_PORT / PREVIA_WEB_PORT / PREVIA_POSTGRES_PORT / PREVIA_REDIS_PORT
#     → pin host ports (skip auto-pick); fails if the port is already in use
#   PREVIA_VERSION → shown in the dashboard sidebar (defaults to git describe)
#   PREVIA_DEPLOY_CONCURRENCY → parallel BullMQ deploy jobs (default 3)
#   PREVIA_WORK_ROOT → checkout root (default: ~/.local/share/deployer or ~/.local/share/previa)

load_previa_public_env() {
  local root="${1:-}"
  if [[ -z "$root" ]]; then
    echo "load_previa_public_env: root directory required" >&2
    return 1
  fi
  local file=""
  if [[ -f "${root}/previa.env" ]]; then
    file="${root}/previa.env"
  elif [[ -f "${root}/deployer.env" ]]; then
    file="${root}/deployer.env"
  fi
  if [[ -n "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
  # Compat: chaves DEPLOYER_* de instalações anteriores.
  : "${PREVIA_PUBLIC_WEB_URL:=${DEPLOYER_PUBLIC_WEB_URL:-}}"
  : "${PREVIA_PUBLIC_API_URL:=${DEPLOYER_PUBLIC_API_URL:-}}"
  : "${PREVIA_PUBLIC_WEB_BASE_PATH:=${DEPLOYER_PUBLIC_WEB_BASE_PATH:-}}"
  : "${PREVIA_API_PORT:=${DEPLOYER_API_PORT:-}}"
  : "${PREVIA_WEB_PORT:=${DEPLOYER_WEB_PORT:-}}"
  : "${PREVIA_POSTGRES_PORT:=${DEPLOYER_POSTGRES_PORT:-}}"
  : "${PREVIA_REDIS_PORT:=${DEPLOYER_REDIS_PORT:-}}"
  : "${PREVIA_VERSION:=${DEPLOYER_VERSION:-}}"
  : "${PREVIA_DEPLOY_CONCURRENCY:=${DEPLOYER_DEPLOY_CONCURRENCY:-}}"
  : "${PREVIA_WORK_ROOT:=${DEPLOYER_WORK_ROOT:-}}"
}

# True if value looks like a local-dev Origin (safe to rewrite on port changes).
is_local_dev_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 0
  [[ "$url" =~ ^https?://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/?$ ]]
}
