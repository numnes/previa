# CLI reference

## Stack commands

| Command                            | Description                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `previa setup`                   | Start Postgres, Redis, web (Docker) and API (PM2); creates/updates `api/.env` |
| `previa up`, `previa start`    | Same as `previa setup`                                                      |
| `previa down`, `previa stop`   | Stop API and containers (asks for confirmation)                               |
| `previa restart`                 | `down` then `setup` (asks for confirmation)                                   |
| `previa status`                  | Show ports, Docker containers, and PM2 API process                            |
| `previa logs api`                | Follow API logs (PM2)                                                         |
| `previa logs web`                | Follow web container logs                                                     |
| `previa update`, `previa pull` | `git pull` in the install dir + refresh CLI symlink                           |
| `previa root`, `previa path`   | Print install directory                                                       |
| `previa help`                    | Show command summary                                                          |

Options for `down` / `restart`: `-y`, `--yes`, or `PREVIA_YES=1` to skip confirmation.

## Project commands

| Command                        | Description                                                                |
| ------------------------------ | -------------------------------------------------------------------------- |
| `previa project init`        | Copy workflows + `previa.yaml` into an app repo; print registration JSON |
| `previa project init --help` | Options: `PATH`, `-f`/`--force`, `--branches`                              |

## nginx helper

| Command                       | Description                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `previa setup nginx`        | List `sites-enabled`, print config with `include …/*.location;` (manual paste) |
| `previa setup nginx --help` | Options: `-f`/`--file`, `-s`/`--sites-dir`                                     |

## Examples

```bash
previa setup
previa status
previa logs api
previa project init
previa project init ../my-app --branches main,develop --force
previa setup nginx
previa setup nginx -f /etc/nginx/sites-enabled/preview.example.com
previa update
```

## Install & runtime env vars

| Variable                      | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `PREVIA_INSTALL_DIR`        | Clone destination for `install.sh` (default `~/previa`)                |
| `PREVIA_REPO_URL`           | Git URL for `install.sh`                                                 |
| `PREVIA_BIN_DIR`            | Where to link the `previa` executable (default `~/.local/bin`)         |

`install.sh` only clones the repo and installs the CLI. Configure `api/.env` (and optional `previa.env`), then run `previa up` to build and start the stack. `previa up` requires **Docker**, **Compose**, and **Node.js**.

| Variable                      | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `PREVIA_ROOT`               | Override install directory for the CLI                                   |
| `PREVIA_YES`                | Skip confirmation on `down` / `restart`                                  |
| `PREVIA_PROJECT_SLUG`       | Non-interactive slug for `project init`                                  |
| `PREVIA_PROJECT_GIT_URL`    | Non-interactive git URL for `project init`                               |
| `PREVIA_PROJECT_SERVER_URL` | Optional Public URL for `project init`                                   |
| `NGINX_SITES_ENABLED`         | Default directory for `setup nginx` (default `/etc/nginx/sites-enabled`) |

[← Back to README](../README.md)
