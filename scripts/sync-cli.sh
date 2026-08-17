#!/usr/bin/env bash
# Refresh previa CLI symlink and script permissions after git pull or install.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${PREVIA_BIN_DIR:-${DEPLOYER_BIN_DIR:-${HOME}/.local/bin}}"
CONFIG_DIR="${HOME}/.config/previa"

log() { echo "[sync-cli] $*"; }

mkdir -p "$BIN_DIR" "$CONFIG_DIR"

chmod +x "${ROOT_DIR}/bin/previa"
chmod +x "${ROOT_DIR}/scripts/"*.sh 2>/dev/null || true
chmod +x "${ROOT_DIR}/scripts/lib/"*.sh 2>/dev/null || true

LINK="${BIN_DIR}/previa"
ln -sf "${ROOT_DIR}/bin/previa" "$LINK"
# Compat: comando antigo `deployer` continua apontando para o mesmo CLI.
ln -sf "${ROOT_DIR}/bin/previa" "${BIN_DIR}/deployer"

echo "$ROOT_DIR" > "${CONFIG_DIR}/root"
mkdir -p "${HOME}/.config/deployer"
echo "$ROOT_DIR" > "${HOME}/.config/deployer/root"

log "CLI: ${LINK} → ${ROOT_DIR}/bin/previa"
log "Root: ${CONFIG_DIR}/root"
