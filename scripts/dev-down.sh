#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/docker-compose.dev.yml" down
docker rm -f deployer-postgres deployer-redis deployer-web >/dev/null 2>&1 || true

echo "[dev-down] OK"
