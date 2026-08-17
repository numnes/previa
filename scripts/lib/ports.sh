#!/usr/bin/env bash
# Shared port helpers for dev-up / previa setup.

port_in_use() {
  local port="$1"
  ss -tuln 2>/dev/null | grep -q ":${port} "
}

docker_host_port() {
  local container="$1"
  local internal_port="$2"
  docker port "$container" "${internal_port}/tcp" 2>/dev/null | head -1 | sed 's/.*://'
}

# Ports already assigned in this run (avoid API/web/redis/postgres colliding).
PREVIA_PICKED_PORTS=()

previa_port_is_picked() {
  local port="$1"
  local p
  for p in "${PREVIA_PICKED_PORTS[@]}"; do
    [[ "$p" == "$port" ]] && return 0
  done
  return 1
}

previa_remember_port() {
  PREVIA_PICKED_PORTS+=("$1")
}

# pick_port PREFERRED CONTAINER INTERNAL_PORT FALLBACK...
# Reuses the host port when the container is already running; otherwise picks a free port.
pick_port() {
  local preferred="$1"
  local container="${2:-}"
  local internal_port="${3:-}"
  shift 3 || true
  local fallbacks=("$@")

  if [[ -n "$container" && -n "$internal_port" ]]; then
    local mapped
    mapped="$(docker_host_port "$container" "$internal_port")"
    if [[ -n "$mapped" ]]; then
      previa_remember_port "$mapped"
      echo "$mapped"
      return 0
    fi
  fi

  local candidate
  for candidate in "$preferred" "${fallbacks[@]}"; do
    if previa_port_is_picked "$candidate"; then
      continue
    fi
    if ! port_in_use "$candidate"; then
      previa_remember_port "$candidate"
      echo "$candidate"
      return 0
    fi
  done

  echo "[ports] No free port (preferred ${preferred})." >&2
  exit 1
}

# pick_or_fixed FIXED preferred container internal_port fallbacks...
# When FIXED is set (from previa.env), use that port and fail if it is busy
# (unless our Docker container already publishes it). Otherwise delegates to pick_port.
pick_or_fixed() {
  local fixed="${1:-}"
  shift || true

  if [[ -z "$fixed" ]]; then
    pick_port "$@"
    return
  fi

  if ! [[ "$fixed" =~ ^[0-9]+$ ]] || (( fixed < 1 || fixed > 65535 )); then
    echo "[ports] Invalid fixed port: ${fixed}" >&2
    exit 1
  fi

  local preferred="$1"
  local container="${2:-}"
  local internal_port="${3:-}"

  if [[ -n "$container" && -n "$internal_port" ]]; then
    local mapped
    mapped="$(docker_host_port "$container" "$internal_port")"
    if [[ "$mapped" == "$fixed" ]]; then
      previa_remember_port "$fixed"
      echo "$fixed"
      return 0
    fi
  fi

  if previa_port_is_picked "$fixed"; then
    echo "[ports] Fixed port ${fixed} collides with another previa service in this run." >&2
    exit 1
  fi

  if port_in_use "$fixed"; then
    echo "[ports] Fixed port ${fixed} is already in use. Free it or change previa.env." >&2
    exit 1
  fi

  previa_remember_port "$fixed"
  echo "$fixed"
}
