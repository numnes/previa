#!/usr/bin/env bash
# Prompts for email/password when needed and registers admin user via API.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${PREVIA_SKIP_SEED_USER:-}" ]]; then
  echo "[seed-user] PREVIA_SKIP_SEED_USER set; skipping default user."
  exit 0
fi

if ! docker ps --format '{{.Names}}' | grep -qxE 'previa-postgres|deployer-postgres'; then
  echo "[seed-user] Container previa-postgres is not running." >&2
  exit 1
fi

if [[ -f "${ROOT_DIR}/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT_DIR}/api/.env"
  set +a
fi

if [[ -z "${PREVIA_SETUP_KEY:-${DEPLOYER_SETUP_KEY:-}}" ]]; then
  echo "[seed-user] PREVIA_SETUP_KEY missing in api/.env. Run previa setup first." >&2
  exit 1
fi
export PREVIA_SETUP_KEY="${PREVIA_SETUP_KEY:-$DEPLOYER_SETUP_KEY}"

run_seed() {
  node "${ROOT_DIR}/scripts/seed-default-user.js"
}

prompt_credentials() {
  local email password password2

  echo ""
  echo "[seed-user] Dashboard login"
  read -r -p "Email: " email
  export PREVIA_SEED_EMAIL="$email"

  while true; do
    read -r -s -p "Password (min. 8 characters): " password
    echo ""
    read -r -s -p "Confirm password: " password2
    echo ""
    if [[ ${#password} -lt 8 ]]; then
      echo "Password too short. Use at least 8 characters." >&2
      continue
    fi
    if [[ "$password" != "$password2" ]]; then
      echo "Passwords do not match." >&2
      continue
    fi
    export PREVIA_SEED_PASSWORD="$password"
    break
  done
}

if [[ -n "${PREVIA_SEED_EMAIL:-}" && -n "${PREVIA_SEED_PASSWORD:-}" ]]; then
  echo "[seed-user] Using PREVIA_SEED_EMAIL / PREVIA_SEED_PASSWORD from environment."
  run_seed
  exit 0
fi

user_count="$(node "${ROOT_DIR}/scripts/seed-default-user.js" count 2>/dev/null || echo 0)"
if [[ ! "$user_count" =~ ^[0-9]+$ ]]; then
  user_count=0
fi

if [[ "$user_count" -gt 0 ]]; then
  echo ""
  echo "[seed-user] Found ${user_count} user(s) already registered."
  while IFS= read -r email; do
    [[ -n "$email" ]] && echo "  - ${email}"
  done < <(node "${ROOT_DIR}/scripts/seed-default-user.js" list 2>/dev/null || true)

  if [[ "${PREVIA_YES:-}" == "1" ]]; then
    echo "[seed-user] PREVIA_YES=1; skipping user setup."
    exit 0
  fi

  echo ""
  read -r -p "Reset a password or add another user? [y/N] " ans
  if [[ ! "$ans" =~ ^[yY]$ ]]; then
    echo "[seed-user] Keeping existing users; skipping setup."
    exit 0
  fi
else
  echo "[seed-user] No users in the database yet."
fi

prompt_credentials
run_seed
