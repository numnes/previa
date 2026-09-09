# Instances & lifetime

## What you get

Ephemeral **preview URLs** for code review and QA before merge:

- **One URL per branch / PR** — e.g. `https://preview.example.com/my-app-feature-xyz/`
- **Environment queue** — when the active slot limit is reached, new deploys stay `waiting` until a preview is paused or destroyed. Up to **3** deploys run in parallel by default (`PREVIA_DEPLOY_CONCURRENCY`); slots are reserved atomically (`active` + `deploying`) so the limit is not exceeded. Zero-downtime redeploys of an already-active branch do not take an extra slot or enter the waiting queue.
- **Zero-downtime redeploy** — optional per project (all branches) or per instance when the project toggle is off; requires a health check path. Builds in parallel, switches nginx only after health check OK; failure keeps the previous version live.
- **Project / instance env vars** — optional defaults per project (Settings), overridable per instance; applied on create/redeploy (merge: checkout `.env` if present → `previa.yaml` `env:` → project → instance). PM2 starts with `cwd` = checkout root (so Nest/`dotenv` find `.env`) and injects the merged map into the process env; Docker via `--env-file`.
- **Port env names** — on deploy, the allocated host port is written to `PORT`, `SERVER_PORT`, and `APP_PORT` by default. Add extras in **Project settings** or `previa.yaml` (`portEnvNames` / `portEnv`) when the app uses another variable name.
- **Pause / awake / redeploy** — idle-slept instances get **Awake** (resume without git pull); manual pause uses **Activate / redeploy**. **Restart all instances** on a project still full-redeploys.
- **Teardown on PR close / branch delete** — optional workflow removes the instance automatically
- **Bulk teardown** — **Projects → Settings → Teardown all instances** pauses every active instance for a project
- **Bulk idle sleep / awake** — **Sleep all instances** puts every active instance into idle sleep (nginx wake); **Awake all instances** resumes idle-slept instances through the wake queue (concurrency **`PREVIA_DEPLOY_CONCURRENCY`**; health check gates each wake when configured)
- **Delete project** — removes the project and destroys all its instances (PM2, nginx, database); checkout directory is removed from disk
- **Instance lifetime** — optional per-project limits to auto-pause (active time) or auto-remove (total existence); see below
- **Multi-machine dashboard** — connect other previa hosts and manage them from one panel; see [Cluster](cluster.md)

## Instance lifetime

In **Projects → Settings**, you can set optional limits per project:

| Limit                                     | Effect                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Max active lifetime** (days / hours)    | While `active`, counts down; when it expires the instance is **paused** (runtime stopped, record kept)          |
| **Max existence lifetime** (days / hours) | From creation; when it expires the instance is **destroyed** (PM2/Docker + nginx + DB record; checkout removed) |
| **Idle pause** (minutes)                  | After N minutes without HTTP hits on the preview path, the instance is **slept** (nginx → wake endpoint). The next request, **Awake** in the dashboard, or a new `/deploy` (git fetch + rebuild) brings it back. Wakes from idle sleep run with concurrency **`PREVIA_DEPLOY_CONCURRENCY`** (default 3); each wake finishes when the instance is **active** (health check must pass when configured). Empty / 0 = off (default). |
| **Health check** (optional)               | After deploy, poll an HTTP path until it returns the expected status (default **200**). Timeout (default **5** min) → runtime paused, status **error**, last logs kept. Empty path = legacy behavior (active when PM2/Docker is online). **Required** to enable zero-downtime deploys. |
| **Zero-downtime deploys**                 | Optional. Project-level toggle applies to every branch; with project off, you can enable per instance. Redeploys of an **active** instance build/start on a parallel port, health-check the new version, then switch nginx — the previous version keeps serving until cutover. Staging does **not** consume an extra slot and the instance stays `active` (not `deploying`). First deploy (no live version) uses the classic flow. Failure leaves status `active` with `lastDeployError` (“previous version still serving”). |
| **ClickUp comments**                      | Optional. When a preview first becomes **active**, comment on the ClickUp task whose custom ID matches the branch name. Token + workspace ID in global Settings; enable per project. Instance detail shows task URL + status; you can paste a ClickUp URL to force-link without posting a comment. |

The scheduler runs every minute. The **Instances** list and instance detail page show `activeExpiresAt` and `existenceExpiresAt` when limits apply.

## Instance states

Preview / ephemeral environment lifecycle:

| Status      | Meaning                                              |
| ----------- | ---------------------------------------------------- |
| `active`    | Running on the host (PM2 + nginx) — live review app. During a zero-downtime redeploy the status stays `active` while a staging build runs; UI may show a ZD-in-progress indicator. |
| `waiting`   | Registered, waiting for a free slot (queued preview). Zero-downtime redeploys of an already-active branch do **not** enter the waiting queue or require a free slot. |
| `deploying` | Classic deploy job in progress (includes optional health check polling). Not used for zero-downtime redeploys of an already-active instance. |
| `paused`    | Stopped on the host, still in the database           |
| `error`     | Last deploy or activate failed (classic path). Zero-downtime failures keep `active` and set `lastDeployError` instead. |

[← Back to README](../README.md)
