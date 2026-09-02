#!/usr/bin/env bash
# Installs previa to ~/previa and registers the "previa" CLI in ~/.local/bin.
# Does not build or start services — run `previa up` after configuring api/.env.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/numnes/previa/main/scripts/install.sh | bash
#
# Environment:
#   PREVIA_INSTALL_DIR  clone destination (default: ~/previa)
#   PREVIA_REPO_URL     git repository (default: https://github.com/numnes/previa.git)
#   PREVIA_BIN_DIR      where to link the executable (default: ~/.local/bin)
set -euo pipefail

INSTALL_DIR="${PREVIA_INSTALL_DIR:-${DEPLOYER_INSTALL_DIR:-}}"
if [[ -z "$INSTALL_DIR" ]]; then
  if [[ -d "${HOME}/deployer/.git" && ! -d "${HOME}/previa/.git" ]]; then
    INSTALL_DIR="${HOME}/deployer"
  else
    INSTALL_DIR="${HOME}/previa"
  fi
fi
REPO_URL="${PREVIA_REPO_URL:-${DEPLOYER_REPO_URL:-https://github.com/numnes/previa.git}}"
BIN_DIR="${PREVIA_BIN_DIR:-${DEPLOYER_BIN_DIR:-${HOME}/.local/bin}}"
CONFIG_DIR="${HOME}/.config/previa"

log() { echo "[install] $*"; }
die() { echo "[install] ERROR: $*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

log "Checking dependencies..."
need_cmd git

mkdir -p "$BIN_DIR" "$CONFIG_DIR"

if [[ -d "${INSTALL_DIR}/.git" ]]; then
  log "Repository already exists at ${INSTALL_DIR}; updating..."
  git -C "$INSTALL_DIR" pull --ff-only || die "git pull failed"
else
  log "Cloning ${REPO_URL} → ${INSTALL_DIR}"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

PREVIA_BIN_DIR="$BIN_DIR" bash "${INSTALL_DIR}/scripts/sync-cli.sh"

if [[ ! -f "${INSTALL_DIR}/api/.env" ]]; then
  if [[ -f "${INSTALL_DIR}/api/.env.example" ]]; then
    cp "${INSTALL_DIR}/api/.env.example" "${INSTALL_DIR}/api/.env"
    log "Created api/.env from .env.example — edit before starting the stack"
  fi
fi

echo ""
log "Installation complete."
echo ""
echo "  Directory:  ${INSTALL_DIR}"
echo "  CLI:        previa"
echo ""

case ":${PATH}:" in
  *:"${BIN_DIR}":*) ;;
  *)
    echo "Add to PATH (if not already):"
    echo ""
    echo "  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    echo ""
    echo "For a persistent shell config, add the line above to ~/.bashrc or ~/.zshrc"
    echo ""
    ;;
esac

echo "Configure before the first start (optional but recommended):"
echo ""
echo "  ${INSTALL_DIR}/api/.env       # API secrets, DB/Redis, work root"
echo "  ${INSTALL_DIR}/previa.env     # public URLs / fixed ports (copy from previa.env.example)"
echo ""
echo "Then build and start the stack:"
echo ""
echo "  previa up             # build web + API, start Postgres/Redis/web (Docker) and API (PM2)"
echo "  previa status         # check services"
echo ""
echo "Other commands:"
echo ""
echo "  previa project init   # wire an app repo (after stack is up)"
echo "  previa setup nginx    # print nginx config with locations include"
echo "  previa help           # list commands"
echo ""
echo "Requires Docker, Compose, and Node.js — checked when you run previa up."
echo "Before the first app deploy, configure Git access on this machine"
echo "(SSH deploy key or HTTPS token) — shown at the end of previa up."
echo ""
