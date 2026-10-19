# Metrics

The dashboard links to **Metrics** (`/metrics`) for a rolling **7-day** history of host resources and a table of recent HTTP traffic seen on preview instances.

## Host resources

Every minute the API records CPU (loadavg), memory, and disk usage into Postgres (`host_metric_samples`). Samples older than 7 days are deleted. The chart page downsamples the series so the UI stays readable.

Cluster hubs merge series from each connected node (`GET /metrics/host`).

## Network requests

Preview nginx locations write an `access_log` under the activity directory (`PREVIA_STATE_DIR/activity/{project}-{branch}.log`). The collector tails those files and stores parsed lines in `network_request_events` (also pruned after 7 days). The Metrics table lists that window with pagination (`page` / `pageSize`, default 50).

| Column   | Source |
| -------- | ------ |
| IP       | `$remote_addr` |
| Endpoint | request path |
| Payload  | query string (access logs do not include bodies) |
| Region   | `Local` for private IPs; public GeoIP if `geoip-lite` is installed in the API |

Optional: set `PREVIA_NGINX_ACCESS_LOG` to a comma-separated list of extra nginx access log paths (host-wide) to ingest alongside preview activity logs.

```bash
# api/.env or previa.env
PREVIA_NGINX_ACCESS_LOG=/var/log/nginx/access.log
```

Install GeoIP data on the API host if you want country/city for public IPs:

```bash
cd api && npm install geoip-lite
previa restart
```

[← Back to README](../README.md)
