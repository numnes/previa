#!/usr/bin/env bash
# Create or update api/.env with runtime connection settings.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/api/.env"
EXAMPLE_FILE="${ROOT_DIR}/api/.env.example"
# shellcheck source=lib/public-env.sh
source "${ROOT_DIR}/scripts/lib/public-env.sh"
load_previa_public_env "$ROOT_DIR"

usage() {
  echo "Usage: ensure-api-env.sh --api-port PORT --postgres-port PORT --redis-port PORT --web-port PORT" >&2
  exit 1
}

API_PORT=""
POSTGRES_PORT=""
REDIS_PORT=""
WEB_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-port) API_PORT="$2"; shift 2 ;;
    --postgres-port) POSTGRES_PORT="$2"; shift 2 ;;
    --redis-port) REDIS_PORT="$2"; shift 2 ;;
    --web-port) WEB_PORT="$2"; shift 2 ;;
    --front-port) WEB_PORT="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done

[[ -n "$API_PORT" && -n "$POSTGRES_PORT" && -n "$REDIS_PORT" && -n "$WEB_PORT" ]] || usage

set_env_var() {
  local key="$1"
  local value="$2"
  local tmp="${ENV_FILE}.tmp.$$"
  touch "$ENV_FILE"
  grep -v "^${key}=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}

get_env_var() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' | tr -d '[:space:]'
}

generate_jwt_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$EXAMPLE_FILE" ]]; then
    cp "$EXAMPLE_FILE" "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
fi

jwt="$(get_env_var JWT_SECRET || true)"
if [[ -z "$jwt" ]]; then
  jwt="$(generate_jwt_secret)"
fi

# Chave usada pelo processo de setup (na máquina root) para autenticar em
# endpoints privilegiados (register / listar usuários) sem expô-los publicamente.
setup_key="$(get_env_var PREVIA_SETUP_KEY || true)"
if [[ -z "$setup_key" ]]; then
  setup_key="$(get_env_var DEPLOYER_SETUP_KEY || true)"
fi
if [[ -z "$setup_key" ]]; then
  setup_key="$(generate_jwt_secret)"
fi

# Chave local usada para criptografar credenciais de nós remotos no Postgres.
# Deve permanecer estável entre restarts; se trocar, nós conectados antigos
# precisam ser recadastrados.
cluster_secret="$(get_env_var PREVIA_CLUSTER_SECRET || true)"
if [[ -z "$cluster_secret" ]]; then
  cluster_secret="$(get_env_var DEPLOYER_CLUSTER_SECRET || true)"
fi
if [[ -z "$cluster_secret" ]]; then
  cluster_secret="$(generate_jwt_secret)"
fi

# True if we can write to dir, or create it under a writable ancestor.
work_root_is_usable() {
  local dir="$1"
  [[ -n "$dir" ]] || return 1
  if [[ -d "$dir" && -w "$dir" ]]; then
    return 0
  fi
  local parent="$dir"
  while [[ "$parent" != "/" ]]; do
    parent="$(dirname "$parent")"
    if [[ -d "$parent" ]]; then
      [[ -w "$parent" ]] && return 0
      return 1
    fi
  done
  return 1
}

# Checkouts follow the current user, not a hardcoded /home/previa from .env.example.
home_work_root() {
  if [[ -d "${HOME}/.local/share/deployer" ]]; then
    printf '%s' "${HOME}/.local/share/deployer"
  else
    printf '%s' "${HOME}/.local/share/previa"
  fi
}

# previa.env (already sourced) wins when writable; else api/.env if writable;
# else $HOME/.local/share/deployer (legacy checkouts) or .../previa.
work_root="${PREVIA_WORK_ROOT:-}"
if [[ -z "$work_root" ]]; then
  work_root="$(get_env_var PREVIA_WORK_ROOT || true)"
fi
if [[ -z "$work_root" ]]; then
  work_root="$(get_env_var DEPLOYER_WORK_ROOT || true)"
fi
if ! work_root_is_usable "$work_root"; then
  local_home_root="$(home_work_root)"
  if [[ -n "$work_root" && "$work_root" != "$local_home_root" ]]; then
    echo "[ensure-env] PREVIA_WORK_ROOT=${work_root} is not writable for $(id -un); using ${local_home_root}" >&2
  fi
  work_root="$local_home_root"
fi
core_dir="${ROOT_DIR}/core"

set_env_var PORT "$API_PORT"
# Nome interno do banco permanece `deployer` para volumes Postgres já existentes.
set_env_var DATABASE_URL "postgresql://postgres:deployer@localhost:${POSTGRES_PORT}/deployer"
set_env_var TYPEORM_SYNC "true"
set_env_var JWT_SECRET "$jwt"
set_env_var REDIS_HOST "127.0.0.1"
set_env_var REDIS_PORT "$REDIS_PORT"
set_env_var PREVIA_WORK_ROOT "$work_root"
set_env_var PREVIA_CORE_DIR "$core_dir"
set_env_var PREVIA_SETUP_KEY "$setup_key"
set_env_var PREVIA_CLUSTER_SECRET "$cluster_secret"

# CORS: prefer previa.env; else keep a non-local value already in api/.env; else localhost.
existing_cors="$(get_env_var CORS_ORIGIN || true)"
if [[ -n "${PREVIA_PUBLIC_WEB_URL:-}" ]]; then
  cors_origin="${PREVIA_PUBLIC_WEB_URL%/}"
elif [[ -n "$existing_cors" ]] && ! is_local_dev_url "$existing_cors"; then
  cors_origin="$existing_cors"
else
  cors_origin="http://localhost:${WEB_PORT}"
fi
set_env_var CORS_ORIGIN "$cors_origin"

# Parallel deploy jobs (BullMQ worker concurrency). Default 3 if unset/invalid.
concurrency_raw="${PREVIA_DEPLOY_CONCURRENCY:-}"
if [[ -n "$concurrency_raw" ]]; then
  set_env_var PREVIA_DEPLOY_CONCURRENCY "$concurrency_raw"
elif [[ -z "$(get_env_var PREVIA_DEPLOY_CONCURRENCY || true)" ]]; then
  set_env_var PREVIA_DEPLOY_CONCURRENCY "3"
fi

echo "[ensure-env] api/.env updated (API :${API_PORT}, Postgres :${POSTGRES_PORT}, Redis :${REDIS_PORT}, Web :${WEB_PORT}, CORS :${cors_origin}, WORK_ROOT :${work_root})"
