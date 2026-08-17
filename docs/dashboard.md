# Dashboard

After `previa setup`, open the web UI (port shown in `previa status`, often **3001**).

| Area                    | What you can do                                                                                                                                                                         |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**           | Host CPU / memory / disk **per connected machine**, aggregated instance counts, active slot usage chart, recent activity with node labels                                               |
| **Projects**            | List projects (local + remote nodes), **Add project**, open **Settings** per project; **Node** column shows which machine hosts each project                                            |
| **Projects → Settings** | **Public URL**, per-project **instance lifetime** limits (auto-pause / auto-remove), **Teardown all instances**, **Restart all instances**, **Delete project**                          |
| **Instances**           | List all previews across nodes; filter by project/branch/status; **Node** column; open a row for logs, pause, activate/redeploy, or remove (remote actions when the cluster key allows) |
| **Settings**            | Global **max active instances**, **node label** (shown in cluster UI), **cluster credentials** (generate keys) and **connected nodes** (aggregate remote Previa hosts)                   |
| **Setup**               | Guides for GitHub Actions, secrets, and nginx                                                                                                                                           |
| **Users → API Keys**    | Create keys used by GitHub Actions (`PREVIA_API_KEY`)                                                                                                                                 |

Instance status cards on the home dashboard link to `/instances?status=…` with the filter applied.

## Related docs

- [Instances & lifetime](instances.md)
- [Cluster (multi-machine)](cluster.md)
- [Configure nginx](nginx.md)

[← Back to README](../README.md)
