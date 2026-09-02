#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/ports.sh
source "${ROOT_DIR}/scripts/lib/ports.sh"
# shellcheck source=lib/public-env.sh
source "${ROOT_DIR}/scripts/lib/public-env.sh"
# shellcheck source=lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"
load_previa_public_env "$ROOT_DIR"

compose() {
  previa_compose "$@"
}

SPINNER_PID=""

stop_spinner() {
  if [[ -n "${SPINNER_PID:-}" ]]; then
    kill "$SPINNER_PID" 2>/dev/null || true
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    # Limpa a linha do spinner (\r + erase).
    printf '\r\033[K' >&2
  fi
}

trap stop_spinner EXIT

# Spinner no stderr quando há TTY; caso contrário só imprime o label.
start_spinner() {
  local label="$1"
  stop_spinner
  if [[ ! -t 2 ]]; then
    echo "[dev-up] ${label}" >&2
    return
  fi
  (
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while true; do
      printf '\r[dev-up] %s %s' "${frames[i]}" "$label" >&2
      i=$(( (i + 1) % ${#frames[@]} ))
      sleep 0.1
    done
  ) &
  SPINNER_PID=$!
}

# Roda comando em silêncio com spinner; em falha imprime o log completo.
run_quiet() {
  local label="$1"
  shift
  local log ec
  log="$(mktemp "${TMPDIR:-/tmp}/previa-build.XXXXXX")"
  start_spinner "$label"
  set +e
  "$@" >"$log" 2>&1
  ec=$?
  set -e
  stop_spinner
  if [[ "$ec" -eq 0 ]]; then
    if [[ -t 2 ]]; then
      echo "[dev-up] ✓ ${label}" >&2
    else
      echo "[dev-up] ${label} done" >&2
    fi
    rm -f "$log"
    return 0
  fi
  echo "[dev-up] ✗ ${label}" >&2
  echo "[dev-up] Build log:" >&2
  cat "$log" >&2 || true
  rm -f "$log"
  return "$ec"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  for _ in $(seq 1 30); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo 000)"
    if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
      echo "$code"
      return 0
    fi
    sleep 1
  done
  echo "000"
  echo "[dev-up] Warning: ${label} did not respond in time (${url})." >&2
  return 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[dev-up] ERROR: Required command not found: $1" >&2
    exit 1
  }
}

echo "[dev-up] Checking dependencies..."
need_cmd docker
need_cmd node
docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 || {
  echo "[dev-up] ERROR: docker compose is not available" >&2
  exit 1
}

stop_api_for_port_scan() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 delete previa-api >/dev/null 2>&1 || true
  else
    npx --yes pm2 delete previa-api >/dev/null 2>&1 || true
  fi
}

echo "[dev-up] Resolving ports..."
stop_api_for_port_scan

# Fixed ports from previa.env win over auto-pick (stable nginx → localhost mappings).
POSTGRES_PUBLISH_PORT="$(pick_or_fixed "${PREVIA_POSTGRES_PORT:-}" 5432 previa-postgres 5432 5433 5434 5435 5436 5440 5450)"
REDIS_PUBLISH_PORT="$(pick_or_fixed "${PREVIA_REDIS_PORT:-}" 6480 previa-redis 6379 6380 6381 6382 6481 6482 6483)"
API_PORT="$(pick_or_fixed "${PREVIA_API_PORT:-}" 3000 "" "" 3002 3003 3004 3005 3010 3020 3030)"
WEB_PUBLISH_PORT="$(pick_or_fixed "${PREVIA_WEB_PORT:-}" 3001 previa-web 3000 3002 3003 3004 3005 3011 3021 3031)"

for pair in \
  "Postgres:${POSTGRES_PUBLISH_PORT}:5432:${PREVIA_POSTGRES_PORT:-}" \
  "Redis:${REDIS_PUBLISH_PORT}:6480:${PREVIA_REDIS_PORT:-}" \
  "API:${API_PORT}:3000:${PREVIA_API_PORT:-}" \
  "Web:${WEB_PUBLISH_PORT}:3001:${PREVIA_WEB_PORT:-}"; do
  IFS=: read -r label port default fixed <<< "$pair"
  if [[ -n "$fixed" ]]; then
    echo "[dev-up] ${label} port fixed at ${port} (previa.env)"
  elif [[ "$port" != "$default" ]]; then
    echo "[dev-up] Port ${default} in use; ${label} on ${port}"
  fi
done

bash "${ROOT_DIR}/scripts/ensure-api-env.sh" \
  --api-port "$API_PORT" \
  --postgres-port "$POSTGRES_PUBLISH_PORT" \
  --redis-port "$REDIS_PUBLISH_PORT" \
  --web-port "$WEB_PUBLISH_PORT"

export POSTGRES_PUBLISH_PORT REDIS_PUBLISH_PORT WEB_PUBLISH_PORT

if [[ -n "${PREVIA_PUBLIC_API_URL:-}" ]]; then
  export NEXT_PUBLIC_API_URL="${PREVIA_PUBLIC_API_URL%/}"
else
  export NEXT_PUBLIC_API_URL="http://localhost:${API_PORT}"
fi
if [[ -n "${PREVIA_PUBLIC_WEB_BASE_PATH:-}" ]]; then
  export NEXT_PUBLIC_BASE_PATH="${PREVIA_PUBLIC_WEB_BASE_PATH}"
else
  export NEXT_PUBLIC_BASE_PATH=""
fi
if [[ -n "${PREVIA_VERSION:-}" ]]; then
  export NEXT_PUBLIC_PREVIA_VERSION="${PREVIA_VERSION}"
else
  export NEXT_PUBLIC_PREVIA_VERSION="$(
    git -C "${ROOT_DIR}" describe --tags --always 2>/dev/null || echo "dev"
  )"
fi

echo "[dev-up] Starting Postgres/Redis in Docker..."
previa_stop_infra_containers
previa_migrate_compose_volumes
compose up -d postgres redis >/dev/null

run_quiet "Rebuilding Previa web interface..." compose build web
compose up -d web >/dev/null

echo "[dev-up] Waiting for Postgres to become healthy..."
postgres_ok=false
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' previa-postgres 2>/dev/null || true)"
  if [[ "$status" == "healthy" ]]; then
    postgres_ok=true
    break
  fi
  sleep 1
done
if [[ "$postgres_ok" != "true" ]]; then
  echo "[dev-up] Postgres did not become healthy in time." >&2
  compose ps
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  PKG_MGR=(pnpm)
else
  PKG_MGR=(npx --yes pnpm@10)
fi

if command -v pm2 >/dev/null 2>&1; then
  PM2=(pm2)
else
  PM2=(npx --yes pm2)
fi

run_quiet "Rebuilding Previa API..." bash -c '
  set -euo pipefail
  cd "$1"
  shift
  "$@" install
  "$@" run build
' _ "${ROOT_DIR}/api" "${PKG_MGR[@]}"

pushd "${ROOT_DIR}/api" >/dev/null
set -a
# shellcheck disable=SC1091
source ".env"
set +a

"${PM2[@]}" delete previa-api >/dev/null 2>&1 || true
"${PM2[@]}" start "${ROOT_DIR}/api/dist/main.js" --name previa-api --time --update-env --cwd "${ROOT_DIR}/api" >/dev/null
popd >/dev/null

echo "[dev-up] Waiting for API (schema sync)..."
for _ in $(seq 1 30); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/docs" 2>/dev/null || echo 000)"
  if [[ "$code" =~ ^(200|301|302|307|308)$ ]]; then
    break
  fi
  sleep 1
done

echo "[dev-up] Setting up default admin user..."
bash "${ROOT_DIR}/scripts/seed-default-user.sh"

echo ""
echo "[dev-up] OK"
echo "  - API:   http://localhost:${API_PORT} (PM2: previa-api)"
echo "  - Web:   http://localhost:${WEB_PUBLISH_PORT} (Docker: previa-web)"
echo "  - Postgres: localhost:${POSTGRES_PUBLISH_PORT}"
echo "  - Redis: localhost:${REDIS_PUBLISH_PORT}"
if [[ -n "${PREVIA_PUBLIC_API_URL:-}" || -n "${PREVIA_PUBLIC_WEB_URL:-}" ]]; then
  echo "  - Public API URL: ${PREVIA_PUBLIC_API_URL:-"(unset)"}"
  echo "  - Public Web / CORS: ${PREVIA_PUBLIC_WEB_URL:-"(from api/.env CORS_ORIGIN)"}"
fi
echo ""

api_code="$(wait_for_http "http://localhost:${API_PORT}/docs" "API" || true)"
web_code="$(wait_for_http "http://localhost:${WEB_PUBLISH_PORT}/" "Web" || true)"
echo "[dev-up] Health check: API /docs=${api_code}, Web=${web_code}"

SETUP_KEY="$(grep -E '^PREVIA_SETUP_KEY=' "${ROOT_DIR}/api/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
if [[ -n "$SETUP_KEY" ]]; then
  masked="${SETUP_KEY:0:6}…${SETUP_KEY: -4}"
  echo ""
  echo "[dev-up] Setup key (root-only) configured in api/.env: ${masked}"
  echo "  Privileged endpoints (register / list users) require this key when the"
  echo "  API is exposed. Send it in the header X-Previa-Setup-Key. Examples:"
  echo ""
  echo "    KEY=\$(grep '^PREVIA_SETUP_KEY=' ${ROOT_DIR}/api/.env | cut -d= -f2-)"
  echo "    # register a user"
  echo "    curl -fsS -X POST http://localhost:${API_PORT}/auth/register \\"
  echo "      -H \"Content-Type: application/json\" \\"
  echo "      -H \"X-Previa-Setup-Key: \$KEY\" \\"
  echo "      -d '{\"email\":\"admin@example.com\",\"password\":\"change-me-123\"}'"
  echo "    # list users"
  echo "    curl -fsS http://localhost:${API_PORT}/users -H \"X-Previa-Setup-Key: \$KEY\""
  echo ""
fi

# shellcheck source=lib/github-credentials-hint.sh
source "${ROOT_DIR}/scripts/lib/github-credentials-hint.sh"
print_github_credentials_hint
