#!/usr/bin/env bash
# Biblioteca compartilhada do core Previa.
set -euo pipefail

# Compat: instalações antigas ainda exportam DEPLOYER_*.
if [[ -z "${PREVIA_WORK_ROOT:-}" && -n "${DEPLOYER_WORK_ROOT:-}" ]]; then
  PREVIA_WORK_ROOT="$DEPLOYER_WORK_ROOT"
fi
if [[ -z "${PREVIA_LOCATIONS_DIR:-}" && -n "${DEPLOYER_LOCATIONS_DIR:-}" ]]; then
  PREVIA_LOCATIONS_DIR="$DEPLOYER_LOCATIONS_DIR"
fi
if [[ -z "${PREVIA_WAKE_UPSTREAM:-}" && -n "${DEPLOYER_WAKE_UPSTREAM:-}" ]]; then
  PREVIA_WAKE_UPSTREAM="$DEPLOYER_WAKE_UPSTREAM"
fi
if [[ -z "${PREVIA_STATE_DIR:-}" && -n "${DEPLOYER_STATE_DIR:-}" ]]; then
  PREVIA_STATE_DIR="$DEPLOYER_STATE_DIR"
fi

: "${PREVIA_WORK_ROOT:?Defina PREVIA_WORK_ROOT (ex: /home/previa)}"

if [[ -z "${PREVIA_STATE_DIR:-}" ]]; then
  if [[ -d "${PREVIA_WORK_ROOT}/.previa-state" ]]; then
    PREVIA_STATE_DIR="${PREVIA_WORK_ROOT}/.previa-state"
  elif [[ -d "${PREVIA_WORK_ROOT}/.deployer-state" ]]; then
    PREVIA_STATE_DIR="${PREVIA_WORK_ROOT}/.deployer-state"
  else
    PREVIA_STATE_DIR="${PREVIA_WORK_ROOT}/.previa-state"
  fi
fi

if [[ -z "${PREVIA_LOCATIONS_DIR:-}" ]]; then
  if [[ -d "${HOME}/previa/locations" ]]; then
    PREVIA_LOCATIONS_DIR="${HOME}/previa/locations"
  elif [[ -d "${HOME}/deployer/locations" ]]; then
    PREVIA_LOCATIONS_DIR="${HOME}/deployer/locations"
  else
    PREVIA_LOCATIONS_DIR="${HOME}/previa/locations"
  fi
fi

: "${PREVIA_ACTIVITY_DIR:="${PREVIA_STATE_DIR}/activity"}"
# Upstream HTTP da API para wake sob demanda (idle sleep).
: "${PREVIA_WAKE_UPSTREAM:=http://127.0.0.1:3000}"

mkdir -p "$PREVIA_STATE_DIR"
mkdir -p "$PREVIA_LOCATIONS_DIR"
mkdir -p "$PREVIA_ACTIVITY_DIR"

sanitize_branch_slug() {
  local b="$1"
  echo "$b" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9._-]/-/g' | sed 's/^-*//;s/-*$//'
}

instance_name() {
  local project="$1"
  local branch="$2"
  echo "${project}-$(sanitize_branch_slug "$branch")"
}

pm2_app_name() {
  instance_name "$@"
}

read_instance_runner() {
  local name="$1"
  local runner_file="${PREVIA_STATE_DIR}/${name}.runner"
  if [[ -f "$runner_file" ]]; then
    cat "$runner_file"
    return 0
  fi
  echo "pm2"
}

write_instance_runner() {
  local name="$1"
  local runner="$2"
  echo "$runner" >"${PREVIA_STATE_DIR}/${name}.runner"
}

stop_instance() {
  local name="$1"
  local runner
  runner="$(read_instance_runner "$name")"
  if [[ "$runner" == "docker" ]]; then
    docker stop "$name" 2>/dev/null || true
    docker rm "$name" 2>/dev/null || true
  else
    pm2_delete_by_instance_name "$name"
  fi
}

# Remove o processo PM2 pelo nome canônico e órfãos do bug antigo
# (`name.eco.XXXXXX` quando o tempfile do ecosystem era usado como nome do app).
pm2_delete_by_instance_name() {
  local name="$1"
  if ! command -v pm2 >/dev/null 2>&1; then
    return 0
  fi
  pm2 delete "$name" 2>/dev/null || true
  # Órfãos: nome exato do tempfile antigo (${name}.eco.XXXXXX)
  local raw ids
  raw="$(pm2 jlist 2>/dev/null || echo '[]')"
  ids="$(NAME="$name" python3 -c '
import json, os, sys
name = os.environ["NAME"]
try:
    apps = json.loads(sys.stdin.read() or "[]")
except json.JSONDecodeError:
    apps = []
for a in apps:
    env = a.get("pm2_env") or {}
    n = env.get("name") or a.get("name") or ""
    if n == name or n.startswith(name + ".eco."):
        pid = a.get("pm_id")
        if pid is not None:
            print(pid)
' <<<"$raw")"
  local id
  for id in $ids; do
    pm2 delete "$id" 2>/dev/null || true
  done
}

is_port_listening() {
  local p="$1"
  if ss -H -ltn "sport = :${p}" 2>/dev/null | grep -q .; then
    return 0
  fi
  # Fallback (ss antigo / sem filtro sport)
  ss -tuln 2>/dev/null | grep -qE ":${p}([[:space:]]|$)"
}

# Portas gravadas em ${PREVIA_STATE_DIR}/*.port (exceto a instância informada).
list_reserved_ports_except() {
  local exclude_name="${1:-}"
  local f base port
  shopt -s nullglob
  for f in "${PREVIA_STATE_DIR}"/*.port; do
    base="$(basename "$f" .port)"
    if [[ -n "$exclude_name" && "$base" == "$exclude_name" ]]; then
      continue
    fi
    port="$(tr -d '[:space:]' <"$f" 2>/dev/null || true)"
    if [[ "$port" =~ ^[0-9]+$ ]]; then
      printf '%s\n' "$port"
    fi
  done
}

# Reserva atômica uma porta para a instância (flock + grava ${name}.port).
# Reusa a reserva própria (sleep/pause/redeploy) mesmo se ainda estiver em listen
# (stop_instance costuma rodar em seguida). Nunca pega porta de outra instância.
reserve_free_port() {
  local name="$1"
  local start="${2:-10200}"
  local end="${3:-19999}"
  local lockfile="${PREVIA_STATE_DIR}/.port-alloc.lock"
  local out

  if [[ -z "$name" ]]; then
    echo "reserve_free_port: nome da instância obrigatório" >&2
    return 1
  fi
  mkdir -p "$PREVIA_STATE_DIR"

  if ! out="$(
    {
      flock 200 || exit 1
      local existing p r skip
      local -a reserved=()

      if [[ -f "${PREVIA_STATE_DIR}/${name}.port" ]]; then
        existing="$(tr -d '[:space:]' <"${PREVIA_STATE_DIR}/${name}.port" 2>/dev/null || true)"
        if [[ "$existing" =~ ^[0-9]+$ ]]; then
          # Reserva própria: reusa (sleep/pause ou redeploy da mesma instância).
          printf '%s\n' "$existing"
          exit 0
        fi
      fi

      while IFS= read -r r; do
        [[ -n "$r" ]] && reserved+=("$r")
      done < <(list_reserved_ports_except "$name")

      for ((p = start; p <= end; p++)); do
        if is_port_listening "$p"; then
          continue
        fi
        skip=0
        for r in "${reserved[@]+"${reserved[@]}"}"; do
          if [[ "$r" == "$p" ]]; then
            skip=1
            break
          fi
        done
        if [[ "$skip" -eq 1 ]]; then
          continue
        fi
        printf '%s\n' "$p" >"${PREVIA_STATE_DIR}/${name}.port"
        printf '%s\n' "$p"
        exit 0
      done
      echo "Nenhuma porta livre entre ${start} e ${end}" >&2
      exit 1
    } 200>"$lockfile"
  )"; then
    return 1
  fi
  printf '%s\n' "$out"
}

# Legado: apenas encontra porta livre (escuta + reservas), sem gravar .port.
next_free_port() {
  local start="${1:-10200}"
  local end="${2:-19999}"
  local p r skip
  local -a reserved=()
  while IFS= read -r r; do
    [[ -n "$r" ]] && reserved+=("$r")
  done < <(list_reserved_ports_except "")
  for ((p = start; p <= end; p++)); do
    if is_port_listening "$p"; then
      continue
    fi
    skip=0
    for r in "${reserved[@]+"${reserved[@]}"}"; do
      if [[ "$r" == "$p" ]]; then
        skip=1
        break
      fi
    done
    if [[ "$skip" -eq 1 ]]; then
      continue
    fi
    echo "$p"
    return 0
  done
  echo "Nenhuma porta livre entre ${start} e ${end}" >&2
  return 1
}

location_file_basename() {
  local project_slug="$1"
  local branch_slug="$2"
  # Arquivo flat (include *.location); o path público é /<project>/<branch>/.
  echo "${project_slug}-${branch_slug}.location"
}

# Path HTTP público: /<projectSlug>/<branchSlug>/
preview_uri_path() {
  local project_slug="$1"
  local branch_slug="$2"
  echo "${project_slug}/${branch_slug}"
}

activity_log_path() {
  local project_slug="$1"
  local branch_slug="$2"
  echo "${PREVIA_ACTIVITY_DIR}/${project_slug}-${branch_slug}.log"
}

touch_activity_log() {
  local project_slug="$1"
  local branch_slug="$2"
  local path
  path="$(activity_log_path "$project_slug" "$branch_slug")"
  mkdir -p "$(dirname "$path")"
  touch "$path"
}

nginx_reload() {
  if command -v sudo >/dev/null 2>&1; then
    sudo nginx -t && sudo nginx -s reload
  else
    nginx -t && nginx -s reload
  fi
}

write_location_file() {
  local locations_dir="$1"
  local project_slug="$2"
  local branch_slug="$3"
  local port="$4"
  local location_basename uri_path path activity
  location_basename="$(location_file_basename "$project_slug" "$branch_slug")"
  uri_path="$(preview_uri_path "$project_slug" "$branch_slug")"
  activity="$(activity_log_path "$project_slug" "$branch_slug")"
  path="$locations_dir/${location_basename}"
  mkdir -p "$(dirname "$activity")"
  touch "$activity"
  cat >"$path" <<EOF
location ^~ /${uri_path}/ {
    access_log ${activity};
    proxy_pass http://127.0.0.1:${port}/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
}
EOF
  echo "$path"
}

# Location que encaminha para a API (wake). Usado no idle sleep.
write_wake_location_file() {
  local locations_dir="$1"
  local project_slug="$2"
  local branch_slug="$3"
  local wake_upstream="${4:-$PREVIA_WAKE_UPSTREAM}"
  local location_basename uri_path path
  location_basename="$(location_file_basename "$project_slug" "$branch_slug")"
  uri_path="$(preview_uri_path "$project_slug" "$branch_slug")"
  path="$locations_dir/${location_basename}"
  # rewrite → path fixo /internal/wake (headers carregam project/branch + URI original).
  cat >"$path" <<EOF
location ^~ /${uri_path}/ {
    rewrite ^ /internal/wake break;
    proxy_pass ${wake_upstream};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Original-URI \$request_uri;
    proxy_set_header X-Previa-Project ${project_slug};
    proxy_set_header X-Previa-Branch-Slug ${branch_slug};
    proxy_read_timeout 120s;
    proxy_connect_timeout 10s;
}
EOF
  echo "$path"
}

parse_previa_yaml() {
  local repo_dir="$1"
  local yaml="${repo_dir}/previa.yaml"
  if [[ ! -f "$yaml" ]]; then
    yaml="${repo_dir}/deployer.yaml"
  fi
  if [[ ! -f "$yaml" ]]; then
    echo "Arquivo previa.yaml não encontrado em ${repo_dir}" >&2
    return 1
  fi
  python3 - "$yaml" <<'PY'
import sys, yaml
path = sys.argv[1]
with open(path) as f:
    d = yaml.safe_load(f) or {}
runner = d.get("runner") or "pm2"
print(runner)
if runner == "docker":
    docker = d.get("docker") or {}
    build_mode = docker.get("build") or "local"
    dockerfile = docker.get("dockerfile") or "Dockerfile"
    context = docker.get("context") or "."
    port = docker.get("port") or 3000
    image_name = docker.get("imageName") or "app"
    print(f"DOCKER_BUILD:{build_mode}")
    print(f"DOCKERFILE:{dockerfile}")
    print(f"CONTEXT:{context}")
    print(f"DOCKER_PORT:{port}")
    print(f"IMAGE_NAME:{image_name}")
else:
    build = d.get("build") or []
    if isinstance(build, str):
        build = [build]
    target = d.get("target")
    if not target:
        raise SystemExit("previa.yaml: campo 'target' é obrigatório para runner pm2")
    print(target)
    for c in build:
        print("BUILD:" + c)
# env: opcional (após build / target), aplicado no run (e no build pm2)
env_map = d.get("env") or {}
if isinstance(env_map, dict):
    for k, v in env_map.items():
        if v is None:
            continue
        key = str(k)
        if not key or not key.replace("_", "").isalnum() or key[0].isdigit():
            continue
        # valor serializado sem quebra de linha no protocolo BUILD:/ENV:
        val = str(v).replace("\n", "\\n")
        print(f"ENV:{key}={val}")
# portEnv / portEnvNames: extras além de PORT, SERVER_PORT, APP_PORT
extras = d.get("portEnvNames")
if extras is None:
    extras = d.get("portEnv")
if isinstance(extras, str):
    extras = [extras]
if isinstance(extras, list):
    for n in extras:
        key = str(n).strip()
        if not key or not key.replace("_", "").isalnum() or key[0].isdigit():
            continue
        print(f"PORT_ENV:{key}")
PY
}

# Junta env do previa.yaml + arquivo da API (API sobrescreve) num arquivo dotenv.
# Uso: merge_app_env_file <arquivo-saida> ENV:key=value...
# Lê também PREVIA_APP_ENV_FILE se definido.
merge_app_env_file() {
  local out_file="$1"
  shift
  python3 - "$out_file" "${PREVIA_APP_ENV_FILE:-}" "$@" <<'PY'
import sys, re
out_path = sys.argv[1]
api_path = sys.argv[2] or ""
yaml_pairs = sys.argv[3:]

KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

def parse_dotenv(text: str) -> dict:
    result = {}
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
        result[key] = val
    return result

def serialize(vars_map: dict) -> str:
    lines = []
    for key in sorted(vars_map):
        raw = vars_map[key]
        needs = (not raw) or any(c in raw for c in ' \t#"\'=\\\n\r')
        if needs:
            esc = (
                raw.replace("\\", "\\\\")
                .replace('"', '\\"')
                .replace("\r", "\\r")
                .replace("\n", "\\n")
            )
            lines.append(f'{key}="{esc}"')
        else:
            lines.append(f"{key}={raw}")
    return ("\n".join(lines) + "\n") if lines else ""

merged = {}
for item in yaml_pairs:
    if not item.startswith("ENV:"):
        continue
    body = item[4:]
    eq = body.find("=")
    if eq <= 0:
        continue
    key, val = body[:eq], body[eq + 1 :].replace("\\n", "\n")
    if KEY_RE.match(key):
        merged[key] = val

if api_path:
    try:
        with open(api_path, encoding="utf-8") as f:
            merged.update(parse_dotenv(f.read()))
    except FileNotFoundError:
        pass

with open(out_path, "w", encoding="utf-8") as f:
    f.write(serialize(merged))
PY
}

# Exporta KEY=VALUE de um dotenv no ambiente atual (eval-safe via python).
# Uso: eval "$(exports_from_dotenv_file /path/to.env)"
exports_from_dotenv_file() {
  local file="$1"
  python3 - "$file" <<'PY'
import sys, re, shlex
path = sys.argv[1]
KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
try:
    text = open(path, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit(0)
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
    print(f"export {key}={shlex.quote(val)}")
PY
}
