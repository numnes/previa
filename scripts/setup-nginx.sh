#!/usr/bin/env bash
# Print an nginx config with the previa locations include line added.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SITES_ENABLED="${NGINX_SITES_ENABLED:-/etc/nginx/sites-enabled}"
FORCE_FILE=""

usage() {
  cat <<EOF
Usage: previa setup nginx [options]

List nginx sites-enabled configs, pick one, and print an updated
version with the previa locations include line (if not already present).

Replace the file contents manually with the printed output.

Options:
  -f, --file PATH       Use this nginx config (skip interactive list)
  -s, --sites-dir DIR   sites-enabled directory (default: ${SITES_ENABLED})
  -h, --help            Show this help

Environment:
  PREVIA_LOCATIONS_DIR   Locations directory (default: ~/previa/locations)
  NGINX_SITES_ENABLED      Same as --sites-dir

The added line looks like:
    include /path/to/locations/*.location;    # previa
EOF
}

log() { echo "[setup-nginx] $*"; }
die() { echo "[setup-nginx] ERROR: $*" >&2; exit 1; }

resolve_locations_dir() {
  if [[ -n "${PREVIA_LOCATIONS_DIR:-${DEPLOYER_LOCATIONS_DIR:-}}" ]]; then
    printf '%s' "${PREVIA_LOCATIONS_DIR:-$DEPLOYER_LOCATIONS_DIR}"
    return
  fi
  local env_file="${ROOT_DIR}/api/.env"
  if [[ -f "$env_file" ]]; then
    local from_env
    from_env="$(grep -E '^(PREVIA_LOCATIONS_DIR|DEPLOYER_LOCATIONS_DIR)=' "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '[:space:]"'"'" || true)"
    if [[ -n "$from_env" ]]; then
      printf '%s' "$from_env"
      return
    fi
  fi
  if [[ -d "${HOME}/previa/locations" ]]; then
    printf '%s' "${HOME}/previa/locations"
  elif [[ -d "${HOME}/deployer/locations" ]]; then
    printf '%s' "${HOME}/deployer/locations"
  else
    printf '%s' "${HOME}/previa/locations"
  fi
}

include_line() {
  local locations_dir="$1"
  printf '    include %s/*.location;    # previa' "$locations_dir"
}

file_has_include() {
  local file="$1"
  local locations_dir="$2"
  if grep -qE '# (previa|deployer)' "$file" 2>/dev/null; then
    return 0
  fi
  if grep -qF "${locations_dir}" "$file" 2>/dev/null && grep -qE '\.location' "$file" 2>/dev/null; then
    return 0
  fi
  return 1
}

render_with_include() {
  local file="$1"
  local line="$2"

  if grep -qE '^[[:space:]]*server[[:space:]]*\{' "$file"; then
    awk -v insert="$line" '
      BEGIN { done = 0 }
      {
        print $0
        if (!done && $0 ~ /^[[:space:]]*server[[:space:]]*\{/) {
          print insert
          done = 1
        }
      }
      END {
        if (!done) exit 1
      }
    ' "$file"
  else
    cat "$file"
    echo ""
    echo "# Added by previa setup nginx"
    echo "$line"
  fi
}

pick_site_file() {
  local sites_dir="$1"
  local -a files=()
  local entry name

  [[ -d "$sites_dir" ]] || die "sites-enabled directory not found: ${sites_dir}"

  while IFS= read -r -d '' entry; do
    name="$(basename "$entry")"
    [[ "$name" == "default" ]] && continue
    files+=("$entry")
  done < <(find "$sites_dir" -maxdepth 1 \( -type f -o -type l \) ! -name '.*' -print0 2>/dev/null | sort -z)

  if [[ ${#files[@]} -eq 0 ]]; then
    die "No config files found in ${sites_dir}"
  fi

  if [[ ${#files[@]} -eq 1 ]]; then
    printf '%s' "${files[0]}"
    return
  fi

  echo ""
  log "Select a nginx config in ${sites_dir}:"
  local i=1
  for entry in "${files[@]}"; do
    printf '  %2d) %s\n' "$i" "$(basename "$entry")"
    i=$((i + 1))
  done
  echo ""

  local choice
  while true; do
    read -r -p "Choice [1-${#files[@]}]: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#files[@]} )); then
      printf '%s' "${files[$((choice - 1))]}"
      return
    fi
    echo "Invalid choice." >&2
  done
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file) FORCE_FILE="$2"; shift 2 ;;
    -s|--sites-dir) SITES_ENABLED="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Unknown option: $1 (run with --help)" ;;
    *) die "Unexpected argument: $1" ;;
  esac
done

LOCATIONS_DIR="$(resolve_locations_dir)"
mkdir -p "$LOCATIONS_DIR"
LINE="$(include_line "$LOCATIONS_DIR")"

log "Locations directory: ${LOCATIONS_DIR}"

if [[ -n "$FORCE_FILE" ]]; then
  TARGET_FILE="$FORCE_FILE"
else
  TARGET_FILE="$(pick_site_file "$SITES_ENABLED")"
fi

[[ -r "$TARGET_FILE" ]] || die "Cannot read file: ${TARGET_FILE}"

log "Selected config: ${TARGET_FILE}"

if file_has_include "$TARGET_FILE" "$LOCATIONS_DIR"; then
  log "Include line already present — no changes needed."
  exit 0
fi

echo ""
log "Add this line inside the server { } block:"
echo "${LINE}"
echo ""
log "Replace the contents of ${TARGET_FILE} with the block below."
echo ""
echo "=== Updated nginx config (copy everything between the markers) ==="
if ! render_with_include "$TARGET_FILE" "$LINE"; then
  die "Could not find a server { } block in ${TARGET_FILE}"
fi
echo "=== End updated nginx config ==="
echo ""
log "Next steps:"
echo "  1. Open the file as root, e.g.:"
echo "       sudo nano ${TARGET_FILE}"
echo "  2. Replace the entire file contents with the block printed above."
echo "  3. Test and reload nginx:"
echo "       sudo nginx -t && sudo nginx -s reload"
