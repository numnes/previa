# Architecture

Self-hosted **preview environment controller** — single host by default, optional multi-machine aggregation:

- **`core/`** — Bash scripts: clone, build, PM2/Docker, nginx locations, pause, destroy
- **`api/`** — NestJS API, Postgres, BullMQ/Redis job queue (deploy / teardown webhooks), cluster fan-out
- **`web/`** — Next.js dashboard (instances, projects, cluster settings, setup guides)

Deploy is triggered with `POST /deploy` (API key), typically from GitHub Actions on pull request open/update. The API queues or runs the core script; closing the PR can call `POST /deploy/destroy` for automatic cleanup.

**Runtimes:** PM2 (default) and Docker per project (`previa project init`). Kubernetes support is planned.

## Related docs

- [Configuration](configuration.md)
- [Cluster (multi-machine)](cluster.md)
- API reference: `http://localhost:3000/docs` after `previa setup`

[← Back to README](../README.md)
