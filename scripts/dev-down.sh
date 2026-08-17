#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/compose.sh
source "${ROOT_DIR}/scripts/lib/compose.sh"

echo "[dev-down] Stopping API in PM2..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete previa-api >/dev/null 2>&1 || true
  pm2 delete deployer-api >/dev/null 2>&1 || true
else
  npx --yes pm2 delete previa-api >/dev/null 2>&1 || true
  npx --yes pm2 delete deployer-api >/dev/null 2>&1 || true
fi

echo "[dev-down] Stopping containers..."
# Sempre no ROOT_DIR: se o cwd da shell ficou inacessível (SSH drop mid-restart),
# `docker compose` falha com `stat .: permission denied`.
cd "$ROOT_DIR"
previa_stop_infra_containers

echo "[dev-down] OK"
