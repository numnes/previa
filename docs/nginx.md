# Configure nginx

Preview URLs are served by **nginx on the previa host**. The core writes one `*.location` file per instance under the locations directory (default `~/previa/locations`). Each file is named `{project-slug}-{branch-slug}.location` and proxies `/{project-slug}/{branch-slug}/` to the instance's local port. Including the project slug in the path avoids collisions between different projects that share a branch name.

When **Idle pause** is enabled on a project, each active location also writes an nginx `access_log` under the previa activity directory. After the configured idle minutes, the instance is slept and the location temporarily proxies to the previa API (`/internal/wake`), which resumes the process and returns **302** to the original URL.

**You need a separate nginx `server` block (or equivalent site config) for every domain or subdomain used as a project's public URL.** If two projects use different hosts — e.g. `preview.app-a.example.com` and `preview.app-b.example.com` — configure nginx for **each** host and point the matching **Public URL** in the dashboard to that host.

## Per domain / subdomain

1. **Pick the hostname** for the project (e.g. `preview.myapp.example.com`).
2. **Add or update a site** in nginx (`sites-available` / `sites-enabled`, or your distro's layout).
3. **Include previa locations** inside the `server { }` block for that hostname:

   ```nginx
   include /home/you/previa/locations/*.location;
   ```

   Or use the helper (read-only — prints the full file for you to paste):

   ```bash
   previa setup nginx
   previa setup nginx -f /etc/nginx/sites-enabled/mysite.conf   # skip picker
   previa setup nginx -s /etc/nginx/sites-available             # custom directory
   ```

   It lists configs in `sites-enabled` (or the directory you pass), shows the file with the `include` line added, and tells you to replace the file contents manually (e.g. `sudo nano …`), then run `sudo nginx -t && sudo nginx -s reload`.

4. In the dashboard, set the project **Public URL** to that host (e.g. `https://preview.myapp.example.com`). Branch previews are at `{Public URL}/{project-slug}/{branch-slug}/`.

5. After deploys, the core reloads nginx when location files change. After **editing site configs by hand**, test and reload:

   ```bash
   sudo nginx -t && sudo nginx -s reload
   ```

Verify from the dashboard: **Setup → Nginx** (directory, `nginx -t`, process check).

## Dashboard + API on the same host (paths)

If you cannot use separate subdomains for the previa UI and API, proxy both on one `server_name` and set durable public URLs in `previa.env` (see [configuration.md](configuration.md#public-urls-previaenv)):

```nginx
include /home/you/previa/locations/*.location;

location /api/ {
    proxy_pass http://127.0.0.1:3002/;   # API port from previa status
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location / {
    proxy_pass http://127.0.0.1:3001;    # web publish port
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

```bash
# previa.env (install root)
PREVIA_PUBLIC_WEB_URL=https://your-host.example.com
PREVIA_PUBLIC_API_URL=https://your-host.example.com/api
PREVIA_API_PORT=3002
PREVIA_WEB_PORT=3001
previa restart
```

Put `/api/` (and the `locations` include) **before** `location /`.

[← Back to README](../README.md)
