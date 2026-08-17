#!/usr/bin/env bash
# Docker Compose helpers for previa setup.
# Volume names are pinned so moving ~/deployer → ~/previa does not create an empty Postgres.

PREVIA_COMPOSE_PROJECT="${PREVIA_COMPOSE_PROJECT:-deployer}"
PREVIA_COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"
PREVIA_PG_VOLUME="${PREVIA_PG_VOLUME:-deployer_deployer_pg}"
PREVIA_REDIS_VOLUME="${PREVIA_REDIS_VOLUME:-deployer_deployer_redis}"

previa_compose() {
  docker compose -p "${PREVIA_COMPOSE_PROJECT}" \
    --project-directory "${ROOT_DIR}" \
    -f "${PREVIA_COMPOSE_FILE}" \
    "$@"
}

previa_volume_exists() {
  docker volume inspect "$1" >/dev/null 2>&1
}

# Copy an alternate Compose-prefixed volume into the canonical name when the
# canonical volume does not exist yet (fresh Previa dir with data already in
# previa_deployer_pg). Never overwrites deployer_deployer_pg.
previa_adopt_volume() {
  local canonical="$1"
  local alt="$2"
  local image="$3"

  if previa_volume_exists "$canonical"; then
    return 0
  fi
  if ! previa_volume_exists "$alt"; then
    return 0
  fi

  echo "[compose] Adopting Docker volume ${alt} → ${canonical}"
  docker volume create "$canonical" >/dev/null
  docker run --rm \
    -v "${alt}:/from:ro" \
    -v "${canonical}:/to" \
    "$image" \
    sh -c 'cp -a /from/. /to/'
}

previa_migrate_compose_volumes() {
  previa_adopt_volume "$PREVIA_PG_VOLUME" previa_deployer_pg postgres:16-alpine
  previa_adopt_volume "$PREVIA_REDIS_VOLUME" previa_deployer_redis redis:7-alpine
}

# Stop leftover containers from either Compose project name (directory rename).
previa_stop_infra_containers() {
  docker compose -p deployer --project-directory "${ROOT_DIR}" -f "${PREVIA_COMPOSE_FILE}" down >/dev/null 2>&1 || true
  docker compose -p previa --project-directory "${ROOT_DIR}" -f "${PREVIA_COMPOSE_FILE}" down >/dev/null 2>&1 || true
  docker rm -f \
    previa-postgres previa-redis previa-web \
    deployer-postgres deployer-redis deployer-web \
    >/dev/null 2>&1 || true
}
