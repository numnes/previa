# Configuration

Main file: `api/.env` — **generated automatically** on `previa setup` with Postgres/Redis/API/web ports, a random `JWT_SECRET`, `PREVIA_SETUP_KEY`, and `PREVIA_CLUSTER_SECRET`. Connection ports are picked from free local ports when defaults (3000, 3001, 5432, 6480) are in use. Re-running `setup` updates connection settings but **keeps** existing `JWT_SECRET`, `PREVIA_SETUP_KEY`, and `PREVIA_CLUSTER_SECRET`.

## Public URLs (`previa.env`)

For a reverse proxy / path-based host (one domain for UI + API), create **`previa.env`** at the install root. It survives `previa restart` / `previa setup` (unlike editing `CORS_ORIGIN` alone in `api/.env`, which used to be rewritten to localhost).

```bash
cp previa.env.example previa.env
# edit PREVIA_PUBLIC_WEB_URL and PREVIA_PUBLIC_API_URL
previa restart
```

| Variable                        | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `PREVIA_PUBLIC_WEB_URL`       | Dashboard Origin → written as `CORS_ORIGIN` in `api/.env`               |
| `PREVIA_PUBLIC_API_URL`       | Baked into the web image as `NEXT_PUBLIC_API_URL` (rebuild on restart)  |
| `PREVIA_PUBLIC_WEB_BASE_PATH` | Optional Next `basePath` when the UI is not at `/` (e.g. `/previa`) |
| `PREVIA_API_PORT`             | Pin API host port (skip auto-pick; fail if busy)                        |
| `PREVIA_WEB_PORT`             | Pin dashboard publish port                                              |
| `PREVIA_POSTGRES_PORT`        | Pin Postgres publish port                                               |
| `PREVIA_REDIS_PORT`           | Pin Redis publish port                                                  |
| `PREVIA_VERSION`              | Label in the dashboard sidebar (default: `git describe --tags`)         |
| `PREVIA_DEPLOY_CONCURRENCY`   | Parallel deploy jobs in BullMQ (default `3`; slot limit still enforced) |

Example (UI at `/`, API under `/api/` on the same host, stable local ports for nginx):

```bash
PREVIA_PUBLIC_WEB_URL=https://previa.example.com
PREVIA_PUBLIC_API_URL=https://previa.example.com/api
PREVIA_API_PORT=3002
PREVIA_WEB_PORT=3001
```

If `previa.env` is absent, defaults stay on `http://localhost:<ports>` and ports are auto-picked when defaults are busy. A non-local `CORS_ORIGIN` already present in `api/.env` is also preserved when `PREVIA_PUBLIC_WEB_URL` is unset.

| Variable                    | Purpose                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `PORT`                      | API listen port (default 3000)                                                                      |
| `DATABASE_URL`              | Postgres (`postgresql://postgres:deployer@localhost:<port>/deployer`)                               |
| `REDIS_HOST` / `REDIS_PORT` | Redis for BullMQ                                                                                    |
| `CORS_ORIGIN`               | Web UI Origin allowed by the API (from `PREVIA_PUBLIC_WEB_URL` or localhost)                      |
| `PREVIA_WORK_ROOT`        | Checkout root. Rewritten on `previa setup`/`restart` to `$HOME/.local/share/deployer` if that dir exists, otherwise `$HOME/.local/share/previa`. Unwritable leftovers like `/home/previa/...` from `.env.example` are replaced. Pin a custom path in `previa.env`. |
| `PREVIA_CORE_DIR`         | Path to `core/`                                                                                     |
| `PREVIA_LOCATIONS_DIR`    | nginx `*.location` files (default `~/previa/locations`)                                           |
| `PREVIA_DEPLOY_CONCURRENCY` | Parallel BullMQ deploy workers (default 3; written from `previa.env` on setup/restart)          |
| `JWT_SECRET`                | Auth tokens (auto-generated on first setup)                                                         |
| `PREVIA_SETUP_KEY`        | Root-only key for privileged bootstrap endpoints (auto-generated)                                   |
| `PREVIA_CLUSTER_SECRET`   | Encrypts connected-node cluster keys in Postgres (auto-generated; must stay stable across restarts) |
| `TYPEORM_SYNC`              | `true` for dev schema sync                                                                          |

## Privileged endpoints (setup key)

`POST /auth/register` and `GET /users` are not public. They require either a
valid dashboard JWT or the root-only **setup key** sent in the
`X-Previa-Setup-Key` header. The key lives only on the root machine in
`api/.env` (`PREVIA_SETUP_KEY`), so these endpoints stay safe even when the
API is publicly exposed. `POST /auth/register` accepts **only** the setup key;
`GET /users` accepts the JWT (dashboard) or the setup key (setup script).

The setup script (`seed-default-user.js`) uses these endpoints with the setup key
instead of connecting to Postgres directly.

Skip or automate admin user creation:

```bash
PREVIA_SKIP_SEED_USER=1 previa setup          # never prompt
PREVIA_SEED_EMAIL=you@example.com PREVIA_SEED_PASSWORD=yourpassword previa setup
```

On restart, if users already exist you are asked whether to reset a password or add another user; press **N** to keep the current accounts.

## Docker volumes

Postgres and Redis use **fixed** volume names (`deployer_deployer_pg`, `deployer_deployer_redis`) so renaming the install directory (`~/deployer` → `~/previa`) does not start a blank database. `docker compose down` never passes `-v`; data survives restarts.

[← Back to README](../README.md)
