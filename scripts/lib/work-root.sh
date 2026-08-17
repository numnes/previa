#!/usr/bin/env bash
# Resolve PREVIA_WORK_ROOT from the installing user's HOME.
# shellcheck shell=bash

previa_effective_home() {
  if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    getent passwd "$SUDO_USER" | cut -d: -f6
    return
  fi
  printf '%s' "${HOME}"
}

previa_home_work_root() {
  local home="$1"
  if [[ -d "${home}/.local/share/deployer" ]]; then
    printf '%s' "${home}/.local/share/deployer"
  else
    printf '%s' "${home}/.local/share/previa"
  fi
}

# Keep a configured path only when it belongs to this user, or is an existing
# custom directory (e.g. /var/lib/previa). Never keep /home/previa/... for git.
previa_work_root_keep() {
  local dir="$1"
  local home="$2"
  [[ -n "$dir" && -n "$home" ]] || return 1

  if [[ "$dir" == "$home" || "$dir" == "${home}/"* ]]; then
    return 0
  fi

  if [[ "$dir" =~ ^/home/([^/]+)(/|$) ]]; then
    local other="${BASH_REMATCH[1]}"
    local me
    me="$(basename "$home")"
    if [[ "$other" != "$me" ]]; then
      return 1
    fi
  fi

  [[ -d "$dir" && -w "$dir" ]]
}

previa_resolve_work_root() {
  local configured="${1:-}"
  local home="${2:-}"
  if [[ -z "$home" ]]; then
    home="$(previa_effective_home)"
  fi
  local default
  default="$(previa_home_work_root "$home")"

  if [[ -z "$configured" ]]; then
    printf '%s' "$default"
    return
  fi

  if ! previa_work_root_keep "$configured" "$home"; then
    printf '%s' "$default"
    return
  fi

  if [[ "$configured" == "${home}/.local/share/previa" && -d "${home}/.local/share/deployer" ]]; then
    printf '%s' "${home}/.local/share/deployer"
    return
  fi

  printf '%s' "$configured"
}

previa_env_get() {
  local file="$1"
  local key="$2"
  if [[ ! -f "$file" ]]; then
    return 0
  fi
  grep -E "^${key}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' | tr -d '[:space:]'
}

previa_env_set() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp="${file}.tmp.$$"
  touch "$file"
  grep -v "^${key}=" "$file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$file"
}

# Rewrite PREVIA_WORK_ROOT / PREVIA_CORE_DIR in api/.env. Prints the resolved root.
previa_sync_work_root_env() {
  local root="$1"
  local env_file="${root}/api/.env"
  local home configured resolved
  home="$(previa_effective_home)"
  configured="${PREVIA_WORK_ROOT:-}"
  if [[ -z "$configured" ]]; then
    configured="$(previa_env_get "$env_file" PREVIA_WORK_ROOT)"
  fi
  if [[ -z "$configured" ]]; then
    configured="$(previa_env_get "$env_file" DEPLOYER_WORK_ROOT)"
  fi
  resolved="$(previa_resolve_work_root "$configured" "$home")"
  mkdir -p "$(dirname "$env_file")"
  previa_env_set "$env_file" PREVIA_WORK_ROOT "$resolved"
  previa_env_set "$env_file" PREVIA_CORE_DIR "${root}/core"
  if [[ "${configured:-}" != "$resolved" ]]; then
    echo "[ensure-env] PREVIA_WORK_ROOT=${configured:-unset} → ${resolved}" >&2
  fi
  printf '%s' "$resolved"
}
