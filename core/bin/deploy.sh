#!/usr/bin/env bash
# Uso:
#   deploy.sh <slug-projeto> <url-git> <branch>
#   deploy.sh --resume <slug-projeto> <branch>   # sobe PM2 sem clone/build (wake)
# Env opcional:
#   PREVIA_IMAGE=<registry/image:tag> (modo docker remoto)
#   PREVIA_APP_ENV_FILE=<path> (.env do dashboard: projeto + override da instância)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/common.sh
source "${SCRIPT_DIR}/../lib/common.sh"

usage() {
  echo "Uso: $0 <slug-projeto> <url-git> <branch>" >&2
  echo "     $0 --resume <slug-projeto> <branch>" >&2
  exit 1
}

log() {
  echo "$1" >&2
}

RESUME_ONLY=0
GIT_URL=""
if [[ "${1:-}" == "--resume" ]]; then
  RESUME_ONLY=1
  shift
  [[ $# -ge 2 ]] || usage
  PROJECT_SLUG="$1"
  BRANCH="$2"
else
  [[ $# -ge 3 ]] || usage
  PROJECT_SLUG="$1"
  GIT_URL="$2"
  BRANCH="$3"
fi
BRANCH_SLUG="$(sanitize_branch_slug "$BRANCH")"
LOCATION_BASENAME="$(location_file_basename "$PROJECT_SLUG" "$BRANCH_SLUG")"

TARGET_DIR="${PREVIA_WORK_ROOT}/${PROJECT_SLUG}/${BRANCH_SLUG}"
LOCATIONS_DIR="${PREVIA_LOCATIONS_DIR}"
NAME="$(instance_name "$PROJECT_SLUG" "$BRANCH")"
MERGED_ENV_FILE=""

cleanup_merged_env() {
  if [[ -n "${MERGED_ENV_FILE:-}" && -f "$MERGED_ENV_FILE" ]]; then
    rm -f "$MERGED_ENV_FILE"
  fi
}
trap cleanup_merged_env EXIT

clone_or_update_repo() {
  if [[ -d "${TARGET_DIR}/.git" ]]; then
    git -C "$TARGET_DIR" fetch origin
    git -C "$TARGET_DIR" checkout "$BRANCH" || git -C "$TARGET_DIR" checkout -b "$BRANCH" "origin/${BRANCH}"
    git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH" || git -C "$TARGET_DIR" pull --ff-only || true
  else
    mkdir -p "$(dirname "$TARGET_DIR")"
    if git clone --depth 1 --branch "$BRANCH" "$GIT_URL" "$TARGET_DIR" 2>/dev/null; then
      :
    else
      rm -rf "$TARGET_DIR"
      git clone "$GIT_URL" "$TARGET_DIR"
      git -C "$TARGET_DIR" checkout "$BRANCH"
    fi
  fi
}

write_deploy_meta() {
  local runner="$1"
  local port="$2"
  local result_json="${PREVIA_STATE_DIR}/${NAME}.deploy-result.json"
  export _D_META_PROJECT="$PROJECT_SLUG"
  export _D_META_BRANCH="$BRANCH"
  export _D_META_BRANCH_SLUG="$BRANCH_SLUG"
  export _D_META_PM2="$NAME"
  export _D_META_PORT="$port"
  export _D_META_RUNNER="$runner"
  export _D_META_OUT="$result_json"
  python3 <<'PY'
import json, os, sys

out = {
    "projectSlug": os.environ["_D_META_PROJECT"],
    "branch": os.environ["_D_META_BRANCH"],
    "branchSlug": os.environ["_D_META_BRANCH_SLUG"],
    "pm2Name": os.environ["_D_META_PM2"],
    "port": int(os.environ["_D_META_PORT"]),
    "runner": os.environ["_D_META_RUNNER"],
}
path = os.environ["_D_META_OUT"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"[deploy] metadados gravados em {path}", file=sys.stderr)
PY
}

# Gera ecosystem temporário PM2 com env (PORT + merged dotenv).
# O arquivo DEVE chamar-se ecosystem.config.js — se o path for
# `name.eco.XXXX.js`, algumas versões do PM2 usam o filename como nome do app.
# cwd = checkout do app para que Nest/dotenv encontrem `.env` na raiz do repo.
pm2_start_with_env() {
  local abs_target="$1"
  local port="$2"
  local env_file="$3"
  local app_cwd="${4:-}"
  local eco_dir eco
  eco_dir="$(mktemp -d "${PREVIA_STATE_DIR}/eco.XXXXXX")"
  eco="${eco_dir}/ecosystem.config.js"
  export _D_ECO_OUT="$eco"
  export _D_ECO_NAME="$NAME"
  export _D_ECO_SCRIPT="$abs_target"
  export _D_ECO_PORT="$port"
  export _D_ECO_ENV="$env_file"
  export _D_ECO_CWD="$app_cwd"
  export _D_ECO_PORT_ENV_NAMES="${PREVIA_PORT_ENV_NAMES:-PORT,SERVER_PORT,APP_PORT}"
  python3 <<'PY'
import json, os, re

KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def load_dotenv(path, into):
    if not path:
        return
    try:
        text = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        return
    for line in text.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        eq = s.find("=")
        if eq <= 0:
            continue
        key = s[:eq].strip()
        if not KEY_RE.match(key):
            continue
        val = s[eq + 1 :].strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in "\"'":
            val = val[1:-1]
            val = (
                val.replace("\\n", "\n")
                .replace("\\r", "\r")
                .replace('\\"', '"')
                .replace("\\\\", "\\")
            )
        into[key] = val

env = {"PORT": os.environ["_D_ECO_PORT"]}
cwd = (os.environ.get("_D_ECO_CWD") or "").strip()
# .env no checkout (ex.: cp .env.dev .env no build) — base para o processo
if cwd:
    load_dotenv(os.path.join(cwd, ".env"), env)
# Merge do dashboard / previa.yaml env: (vence o .env do disco)
load_dotenv(os.environ.get("_D_ECO_ENV") or "", env)
# PORT do previa sempre vence (nginx location aponta para ela).
# Nomes: PREVIA_PORT_ENV_NAMES (defaults PORT,SERVER_PORT,APP_PORT + extras do projeto/yaml).
port = os.environ["_D_ECO_PORT"]
names_raw = (os.environ.get("_D_ECO_PORT_ENV_NAMES") or "").strip()
names = [n.strip() for n in names_raw.split(",") if n.strip()]
if not names:
    names = ["PORT", "SERVER_PORT", "APP_PORT"]
for key in names:
    if re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
        env[key] = port
env["PORT"] = port  # sempre
app = {
    "name": os.environ["_D_ECO_NAME"],
    "script": os.environ["_D_ECO_SCRIPT"],
    "env": env,
}
if cwd:
    app["cwd"] = cwd
out = os.environ["_D_ECO_OUT"]
with open(out, "w", encoding="utf-8") as f:
    f.write("module.exports = " + json.dumps({"apps": [app]}, ensure_ascii=False) + ";\n")
print(out)
PY
  pm2 start "$eco" --only "$NAME" --update-env
  rm -rf "$eco_dir"

  # Confirma que o processo ficou online com o nome canônico.
  local status
  status="$(NAME="$NAME" python3 -c '
import json, os, subprocess
name = os.environ["NAME"]
try:
    raw = subprocess.check_output(["pm2", "jlist"], text=True, stderr=subprocess.DEVNULL)
    apps = json.loads(raw) if raw.strip() else []
except Exception:
    apps = []
for a in apps:
    env = a.get("pm2_env") or {}
    n = env.get("name") or a.get("name") or ""
    if n == name:
        print(env.get("status") or "")
        raise SystemExit(0)
print("")
')"
  if [[ "$status" != "online" ]]; then
    log "[deploy] PM2 status for ${NAME}: ${status:-not-found} (expected online)"
    pm2 logs "$NAME" --lines 80 --nostream >&2 || true
    echo "Deploy PM2 falhou: processo '${NAME}' não ficou online (status=${status:-missing})." >&2
    exit 1
  fi
}

deploy_pm2() {
  local target="$1"
  shift
  local -a build_cmds=("$@")

  PORT="$(reserve_free_port "$NAME")"
  export PORT

  # Para o processo ANTES do build: `npm run build` / `rimraf dist` apaga o
  # target enquanto o PM2 antigo ainda aponta para ele → crash loop MODULE_NOT_FOUND
  # se o build falhar depois (e stop_instance nunca rodar).
  stop_instance "$NAME"
  # Se a porta reservada ainda estiver ocupada (órfão / roubo legado), realoca.
  if is_port_listening "$PORT"; then
    log "[deploy] porta ${PORT} ainda em uso após stop — realocando"
    rm -f "${PREVIA_STATE_DIR}/${NAME}.port"
    PORT="$(reserve_free_port "$NAME")"
    export PORT
  fi
  write_instance_runner "$NAME" "pm2"

  if [[ "$RESUME_ONLY" -eq 0 ]]; then
    (
      cd "$TARGET_DIR"
      # Envs do dashboard / previa.yaml disponíveis também no build.
      if [[ -n "$MERGED_ENV_FILE" && -s "$MERGED_ENV_FILE" ]]; then
        # shellcheck disable=SC1090
        eval "$(exports_from_dotenv_file "$MERGED_ENV_FILE")"
      fi
      export PORT
      for cmd in "${build_cmds[@]}"; do
        log "[deploy] build: $cmd"
        bash -lc "$cmd" >&2
      done
    )
  else
    log "[resume] skipping build (wake)"
  fi

  local abs_target="${TARGET_DIR}/${target}"
  if [[ ! -e "$abs_target" ]]; then
    echo "Target não encontrado: $abs_target" >&2
    if [[ -d "${TARGET_DIR}/dist" ]]; then
      echo "Arquivos main.js sob dist/:" >&2
      find "${TARGET_DIR}/dist" -name 'main.js' 2>/dev/null | sed 's/^/  /' >&2 || true
    else
      echo "Pasta dist/ ausente — o build provavelmente falhou ou não gerou output." >&2
    fi
    exit 1
  fi

  # Após a seção de comandos (build) do previa.yaml: aplica envs no start PM2.
  pm2_start_with_env "$abs_target" "$PORT" "$MERGED_ENV_FILE" "$TARGET_DIR"

  write_location_file "$LOCATIONS_DIR" "$PROJECT_SLUG" "$BRANCH_SLUG" "$PORT"
  nginx_reload
  write_deploy_meta "pm2" "$PORT"
  if [[ "$RESUME_ONLY" -eq 1 ]]; then
    log "OK resume ${PROJECT_SLUG} branch ${BRANCH} -> porta ${PORT} pm2:${NAME}"
  else
    log "OK deploy ${PROJECT_SLUG} branch ${BRANCH} -> porta ${PORT} pm2:${NAME}"
  fi
}

deploy_docker() {
  local docker_build_mode="$1"
  local dockerfile_rel="$2"
  local context_rel="$3"
  local container_port="$4"
  local image_name_base="$5"

  if [[ "$docker_build_mode" == "remote" && -z "${PREVIA_IMAGE:-}" ]]; then
    echo "Runner docker com build remote exige o campo 'image' no trigger de deploy." >&2
    exit 1
  fi

  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker não encontrado no PATH." >&2
    exit 1
  fi

  local image_to_run=""
  if [[ -n "${PREVIA_IMAGE:-}" ]]; then
    log "[deploy] pulling image ${PREVIA_IMAGE}"
    docker pull "$PREVIA_IMAGE"
    image_to_run="$PREVIA_IMAGE"
  else
    clone_or_update_repo
    local dockerfile_path="${TARGET_DIR}/${dockerfile_rel}"
    local build_context="${TARGET_DIR}/${context_rel}"
    if [[ ! -f "$dockerfile_path" ]]; then
      echo "Dockerfile não encontrado: $dockerfile_path" >&2
      exit 1
    fi
    image_to_run="${image_name_base}:${BRANCH_SLUG}"
    log "[deploy] building image ${image_to_run}"
    docker build -t "$image_to_run" -f "$dockerfile_path" "$build_context"
  fi

  local host_port
  host_port="$(reserve_free_port "$NAME")"

  stop_instance "$NAME"
  if is_port_listening "$host_port"; then
    log "[deploy] porta ${host_port} ainda em uso após stop — realocando"
    rm -f "${PREVIA_STATE_DIR}/${NAME}.port"
    host_port="$(reserve_free_port "$NAME")"
  fi
  write_instance_runner "$NAME" "docker"

  local -a docker_env_args=()
  if [[ -n "$MERGED_ENV_FILE" && -s "$MERGED_ENV_FILE" ]]; then
    docker_env_args+=(--env-file "$MERGED_ENV_FILE")
  fi

  docker run -d \
    --name "$NAME" \
    -p "${host_port}:${container_port}" \
    --restart unless-stopped \
    "${docker_env_args[@]}" \
    "$image_to_run" >/dev/null

  write_location_file "$LOCATIONS_DIR" "$PROJECT_SLUG" "$BRANCH_SLUG" "$host_port"
  nginx_reload
  write_deploy_meta "docker" "$host_port"
  log "OK deploy ${PROJECT_SLUG} branch ${BRANCH} -> porta ${host_port} docker:${NAME}"
}

# Sempre clona/atualiza para ler previa.yaml (e para build local), exceto no wake.
if [[ "$RESUME_ONLY" -eq 1 ]]; then
  if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Resume falhou: checkout ausente em ${TARGET_DIR}" >&2
    exit 1
  fi
else
  clone_or_update_repo
fi

mapfile -t _parsed < <(parse_previa_yaml "$TARGET_DIR")
RUNNER="${_parsed[0]}"

if [[ "$RESUME_ONLY" -eq 1 && "$RUNNER" != "pm2" ]]; then
  echo "Resume rápido só é suportado para runner pm2 (atual: ${RUNNER})." >&2
  exit 1
fi

YAML_ENV_LINES=()
YAML_PORT_ENV_NAMES=()
for line in "${_parsed[@]}"; do
  if [[ "$line" == ENV:* ]]; then
    YAML_ENV_LINES+=("$line")
  elif [[ "$line" == PORT_ENV:* ]]; then
    YAML_PORT_ENV_NAMES+=("${line#PORT_ENV:}")
  fi
done

# Une defaults + API (projeto) + previa.yaml
DEFAULTS='PORT,SERVER_PORT,APP_PORT' \
FROM_API="${PREVIA_PORT_ENV_NAMES:-}" \
FROM_YAML="$(printf '%s\n' "${YAML_PORT_ENV_NAMES[@]}")" \
PREVIA_PORT_ENV_NAMES="$(
  python3 -c '
import os, re
KEY = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
seen = set()
out = []
def add(s):
    for part in (s or "").replace(";", ",").split(","):
        k = part.strip()
        if k and KEY.match(k) and k not in seen:
            seen.add(k)
            out.append(k)
add(os.environ.get("DEFAULTS", ""))
add(os.environ.get("FROM_API", ""))
for a in (os.environ.get("FROM_YAML") or "").splitlines():
    add(a)
print(",".join(out))
'
)"
export PREVIA_PORT_ENV_NAMES

MERGED_ENV_FILE="$(mktemp "${PREVIA_STATE_DIR}/${NAME}.env.XXXXXX")"
merge_app_env_file "$MERGED_ENV_FILE" "${YAML_ENV_LINES[@]}"

if [[ "$RUNNER" == "pm2" ]]; then
  TARGET="${_parsed[1]}"
  BUILD_CMDS=()
  for line in "${_parsed[@]}"; do
    if [[ "$line" == BUILD:* ]]; then
      BUILD_CMDS+=("${line#BUILD:}")
    fi
  done
  deploy_pm2 "$TARGET" "${BUILD_CMDS[@]}"
elif [[ "$RUNNER" == "docker" ]]; then
  DOCKER_BUILD_MODE="local"
  DOCKERFILE="Dockerfile"
  DOCKER_CONTEXT="."
  CONTAINER_PORT="3000"
  IMAGE_NAME_BASE="app"
  for line in "${_parsed[@]}"; do
    case "$line" in
      DOCKER_BUILD:*) DOCKER_BUILD_MODE="${line#DOCKER_BUILD:}" ;;
      DOCKERFILE:*) DOCKERFILE="${line#DOCKERFILE:}" ;;
      CONTEXT:*) DOCKER_CONTEXT="${line#CONTEXT:}" ;;
      DOCKER_PORT:*) CONTAINER_PORT="${line#DOCKER_PORT:}" ;;
      IMAGE_NAME:*) IMAGE_NAME_BASE="${line#IMAGE_NAME:}" ;;
    esac
  done
  deploy_docker "$DOCKER_BUILD_MODE" "$DOCKERFILE" "$DOCKER_CONTEXT" "$CONTAINER_PORT" "$IMAGE_NAME_BASE"
else
  echo "Runner '${RUNNER}' não suportado (use pm2 ou docker)." >&2
  exit 1
fi
