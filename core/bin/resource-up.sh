#!/usr/bin/env bash
# Levanta um recurso Docker (imagem, Dockerfile ou compose).
# Uso: resource-up.sh <slug>
# Env:
#   PREVIA_RESOURCE_KIND=image|dockerfile|compose
#   PREVIA_RESOURCE_IMAGE=<image:tag>
#   PREVIA_RESOURCE_DIR=<dir com Dockerfile ou compose>
#   PREVIA_APP_ENV_FILE=<dotenv>
#   PREVIA_RESOURCE_PORTS=6379,5432
#   PREVIA_RESOURCE_RESULT=<path json>
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

log() {
  echo "$1" >&2
}

[[ $# -ge 1 ]] || { echo "Uso: $0 <slug>" >&2; exit 1; }

SLUG="$1"
KIND="${PREVIA_RESOURCE_KIND:-image}"
IMAGE="${PREVIA_RESOURCE_IMAGE:-}"
RES_DIR="${PREVIA_RESOURCE_DIR:-}"
PORTS_CSV="${PREVIA_RESOURCE_PORTS:-}"
RESULT_PATH="${PREVIA_RESOURCE_RESULT:-}"
RUNTIME_NAME="prv-res-${SLUG}"
COMPOSE_PROJECT="prvres${SLUG//-/}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não encontrado no PATH." >&2
  exit 1
fi

compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "docker compose não encontrado." >&2
    return 1
  fi
}

published_json_from_assoc() {
  python3 -c 'import json,sys; print(json.dumps({k:int(v) for k,v in (p.split("=",1) for p in sys.argv[1:])}))' "$@"
}

IFS=',' read -r -a RAW_PORTS <<<"${PORTS_CSV}"
declare -a CLEAN_PORTS=()
for p in "${RAW_PORTS[@]+"${RAW_PORTS[@]}"}"; do
  p="$(echo "$p" | tr -d '[:space:]')"
  if [[ "$p" =~ ^[0-9]+$ ]]; then
    CLEAN_PORTS+=("$p")
  fi
done

declare -A PUBLISHED=()
allocate_ports() {
  local cport host_port
  for cport in "$@"; do
    host_port="$(reserve_free_port "${RUNTIME_NAME}-${cport}")"
    if is_port_listening "$host_port"; then
      rm -f "${PREVIA_STATE_DIR}/${RUNTIME_NAME}-${cport}.port"
      host_port="$(reserve_free_port "${RUNTIME_NAME}-${cport}")"
    fi
    PUBLISHED["$cport"]="$host_port"
  done
}

mapping_args() {
  local k
  for k in "${!PUBLISHED[@]}"; do
    printf '%s=%s\n' "$k" "${PUBLISHED[$k]}"
  done
}

write_result() {
  export PREVIA_PUBLISHED_JSON
  python3 - "$RESULT_PATH" "$RUNTIME_NAME" "$KIND" <<'PY'
import json, os, sys
path, name, kind = sys.argv[1], sys.argv[2], sys.argv[3]
mapping = json.loads(os.environ.get("PREVIA_PUBLISHED_JSON") or "{}")
out = {
    "runtimeName": name,
    "kind": kind,
    "publishedPorts": {str(k): int(v) for k, v in mapping.items()},
}
if path:
    with open(path, "w") as f:
        json.dump(out, f)
print(json.dumps(out))
PY
}

stop_resource_runtime() {
  docker stop "$RUNTIME_NAME" 2>/dev/null || true
  docker rm "$RUNTIME_NAME" 2>/dev/null || true
  if [[ -n "$RES_DIR" && -f "${RES_DIR}/docker-compose.yml" ]]; then
    compose_cmd -p "$COMPOSE_PROJECT" -f "${RES_DIR}/docker-compose.yml" down --remove-orphans >/dev/null 2>&1 || true
  fi
}

declare -a ENV_ARGS=()
if [[ -n "${PREVIA_APP_ENV_FILE:-}" && -s "${PREVIA_APP_ENV_FILE}" ]]; then
  ENV_ARGS+=(--env-file "${PREVIA_APP_ENV_FILE}")
fi

stop_resource_runtime

if [[ "$KIND" == "compose" ]]; then
  COMPOSE_FILE="${RES_DIR}/docker-compose.yml"
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "docker-compose.yml não encontrado em ${RES_DIR}" >&2
    exit 1
  fi
  DETECTED="$(
    python3 - "$COMPOSE_FILE" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    d = yaml.safe_load(f) or {}
ports = []
for svc in (d.get("services") or {}).values():
    for p in svc.get("ports") or []:
        s = str(p).split("/")[0]
        cport = s.split(":")[-1]
        if cport.isdigit():
            ports.append(cport)
print(",".join(dict.fromkeys(ports)))
PY
  )"
  if [[ ${#CLEAN_PORTS[@]} -eq 0 && -n "$DETECTED" ]]; then
    IFS=',' read -r -a CLEAN_PORTS <<<"$DETECTED"
  fi
  if [[ ${#CLEAN_PORTS[@]} -eq 0 ]]; then
    echo "Informe as portas do container (ex.: 6379) para publicar o compose." >&2
    exit 1
  fi
  allocate_ports "${CLEAN_PORTS[@]}"
  mapfile -t MAP_PAIRS < <(mapping_args)
  PREVIA_PUBLISHED_JSON="$(published_json_from_assoc "${MAP_PAIRS[@]}")"
  export PREVIA_PUBLISHED_JSON
  python3 - "$COMPOSE_FILE" <<'PY'
import json, os, sys, yaml
path = sys.argv[1]
mapping = {str(k): int(v) for k, v in json.loads(os.environ["PREVIA_PUBLISHED_JSON"]).items()}
with open(path) as f:
    d = yaml.safe_load(f) or {}
services = d.get("services") or {}
if not services:
    raise SystemExit("compose sem services")
rewritten = False
for svc in services.values():
    ports = svc.get("ports") or []
    new_ports = []
    for p in ports:
        raw = str(p)
        proto = ""
        s = raw
        if "/" in raw:
            s, rest = raw.split("/", 1)
            proto = "/" + rest
        cport = s.split(":")[-1]
        if cport in mapping:
            new_ports.append(f"{mapping[cport]}:{cport}{proto}")
            rewritten = True
        else:
            new_ports.append(p)
    if new_ports:
        svc["ports"] = new_ports
if not rewritten:
    first = next(iter(services.values()))
    first["ports"] = [f"{host}:{cport}" for cport, host in mapping.items()]
with open(path, "w") as f:
    yaml.safe_dump(d, f, sort_keys=False)
PY
  log "[resource] docker compose up ${COMPOSE_PROJECT}"
  compose_cmd -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --build
  RUNTIME_NAME="$COMPOSE_PROJECT"
elif [[ "$KIND" == "dockerfile" ]]; then
  DF="${RES_DIR}/Dockerfile"
  if [[ ! -f "$DF" ]]; then
    echo "Dockerfile não encontrado em ${RES_DIR}" >&2
    exit 1
  fi
  if [[ ${#CLEAN_PORTS[@]} -eq 0 ]]; then
    echo "Informe as portas do container para o Dockerfile." >&2
    exit 1
  fi
  allocate_ports "${CLEAN_PORTS[@]}"
  IMAGE_TAG="previa-res-${SLUG}:local"
  log "[resource] docker build ${IMAGE_TAG}"
  docker build -t "$IMAGE_TAG" -f "$DF" "$RES_DIR"
  declare -a PORT_ARGS=()
  for cport in "${CLEAN_PORTS[@]}"; do
    PORT_ARGS+=(-p "${PUBLISHED[$cport]}:${cport}")
  done
  docker run -d --name "$RUNTIME_NAME" --restart unless-stopped "${PORT_ARGS[@]}" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} "$IMAGE_TAG" >/dev/null
else
  if [[ -z "$IMAGE" ]]; then
    echo "PREVIA_RESOURCE_IMAGE é obrigatório no modo image." >&2
    exit 1
  fi
  if [[ ${#CLEAN_PORTS[@]} -eq 0 ]]; then
    echo "Informe as portas do container (ex.: 6379 para Redis)." >&2
    exit 1
  fi
  allocate_ports "${CLEAN_PORTS[@]}"
  log "[resource] docker pull ${IMAGE}"
  docker pull "$IMAGE"
  declare -a PORT_ARGS=()
  for cport in "${CLEAN_PORTS[@]}"; do
    PORT_ARGS+=(-p "${PUBLISHED[$cport]}:${cport}")
  done
  docker run -d --name "$RUNTIME_NAME" --restart unless-stopped "${PORT_ARGS[@]}" ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} "$IMAGE" >/dev/null
fi

if [[ -z "${PREVIA_PUBLISHED_JSON:-}" ]]; then
  mapfile -t MAP_PAIRS < <(mapping_args)
  PREVIA_PUBLISHED_JSON="$(published_json_from_assoc "${MAP_PAIRS[@]}")"
  export PREVIA_PUBLISHED_JSON
fi

write_result
log "OK resource ${SLUG} kind=${KIND} name=${RUNTIME_NAME}"
