# Provisioned resources

The **Resources** page (`/resources`) runs shared Docker services on the Previa host — Redis, Postgres, or anything you can express as an image, a Dockerfile, or a compose file. Preview instances connect through `127.0.0.1` and the published host port.

## Register

Admins create a resource with:

- **Image** — e.g. `redis:7-alpine`, plus container ports (Redis defaults to `6379`)
- **Dockerfile** — pasted into the form; Previa builds and runs it
- **Compose** — pasted `docker-compose.yml`; Previa rewrites published ports so they do not collide with other previews

Optional **container env** is passed to the process (`REDIS_PASSWORD`, `POSTGRES_PASSWORD`, …). Check **Start after creating** to pull/build immediately.

## Status, logs, env

The list and detail pages follow the Instances layout:

| Status | Meaning |
| ------ | ------- |
| `starting` | Pull/build/run in progress |
| `running` | Container (or compose project) is up |
| `paused` | Stopped; the record stays |
| `error` | Last start failed; see the error on the detail page |

Operators can **Start** / **Stop**. Admins can edit env and **Remove**. Logs are `docker logs` (or `docker compose logs`).

## Connection env

After a successful start, Previa allocates a free host port per container port and builds a `.env` block to copy into a project or instance:

```
REDIS_SHARED_HOST=127.0.0.1
REDIS_SHARED_PORT=16379
REDIS_PASSWORD=…
```

The prefix is the resource slug in `SCREAMING_SNAKE_CASE`. Runtime env vars are included so passwords travel with the host/port.

Apply env changes with **Save env** and then **Stop** / **Start**.

## Cluster

The hub lists resources from connected nodes. Start/stop/remove on a remote node require a write-scoped cluster key. Creating and editing env is local to the node that owns the resource.

[← Back to README](../README.md)
