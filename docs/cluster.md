# Cluster (multi-machine)

Run previa on **machine A** (hub) and **machine B** (spoke) and manage both from A's dashboard.

## Setup flow

**On machine B** (the node to monitor):

1. **Settings** → set a **Node label** (e.g. `prod-b`)
2. **Settings → Cluster credentials** → generate a cluster key (`clu_…`, shown once)
3. Choose permissions:
   - **Read-only (incl. logs)** — dashboard, projects, instances, and log viewing
   - **Read & write** — also pause, activate/redeploy, and remove instances from the hub panel
4. Ensure B's API is reachable from A (LAN or public URL, not only `127.0.0.1`)

**On machine A** (central panel):

1. **Settings → Connected nodes** → add B's **API URL** and paste the `clu_…` key
2. Click **Test** to verify connectivity and detect the key's permission level
3. Dashboard, **Projects**, and **Instances** now include data from B, with a **Node** badge per row

## How it works

- Hub-and-spoke over HTTP: A calls B's `/cluster/*` endpoints with header `X-Previa-Cluster-Key`
- B enforces the key scope — write actions return `403` on read-only keys even if A tries them
- Remote instance IDs use the form `r:{nodeId}:{remoteId}` in the hub API
- Remote node credentials are **encrypted at rest** in A's Postgres with `PREVIA_CLUSTER_SECRET` (see [Configuration](configuration.md)); decrypted only when making outbound cluster calls
- Project settings in the hub apply only to **local** projects; remote projects are read-only for configuration

## Limitations

- Cluster keys on B are stored hashed (like API keys); the plaintext `clu_…` is shown once at creation
- No automatic health polling — use **Test** on a connected node to refresh status and scope
- Re-adding a node after rotating `PREVIA_CLUSTER_SECRET` requires pasting the cluster key again

[← Back to README](../README.md)
