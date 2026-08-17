# Interactive frontend demo

The web UI can run entirely **mocked in the browser** — no Nest API, Postgres, or Redis.

Useful for walkthroughs and for hosting a static copy on **GitHub Pages**.

## Live demo

**https://numnes.github.io/previa/login/?demo=1**

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | `admin@demo.local` | `demo` | full access |
| Operator | `operator@demo.local` | `demo` | instances (no env view/edit) |

## Local (dev)

```bash
cd web
npm run dev:demo
```

Open [http://localhost:3000/demo](http://localhost:3000/demo) → **Open demo login**.

Or go to `/login?demo=1` (credentials pre-filled).

Mutations (pause, activate, env edits, users, settings) update an **in-memory** store until you refresh / re-open the demo.

## Static build (GitHub Pages)

```bash
cd web
# For project site https://USER.github.io/REPO/
NEXT_PUBLIC_BASE_PATH=/REPO npm run build:demo
# Output: web/out/
```

Serve `web/out` with any static host. To publish from CI, copy [`docs/examples/demo-pages.workflow.yml`](examples/demo-pages.workflow.yml) to `.github/workflows/demo-pages.yml` (requires a GitHub token with the `workflow` scope the first time), then enable **Settings → Pages → GitHub Actions**.

**Requirements for Pages:**

- `NEXT_PUBLIC_DEMO=1` → Next `output: 'export'`
- Optional `NEXT_PUBLIC_BASE_PATH=/<repo>` when not using a custom domain at the site root
- No server runtime; `/demo` + mocked `httpJson` is enough

## How it works

1. `enableDemoMode()` sets `localStorage.previa_demo=1` (or the build is forever-demo via env).
2. `httpJson` routes to `web/src/demo/router.ts` instead of `fetch`.
3. Fixtures live in `web/src/demo/fixtures.ts` (projects on local + remote nodes, roles, metrics).

[← Back to README](../README.md)
