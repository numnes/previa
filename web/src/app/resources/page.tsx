'use client';

import { ClientTable } from '@/components/ClientTable';
import { EnvEditor } from '@/components/EnvEditor';
import { NodeBadge } from '@/components/NodeBadge';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { RequireAuth } from '@/components/RequireAuth';
import { getUserClient, isAdmin } from '@/lib/client-auth';
import { normalizeEnvVars, type EnvVarsMap } from '@/lib/env-vars';
import { resourceStatusBadgeClass } from '@/lib/status-badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  createResource,
  formatPublishedPorts,
  listResources,
  resourceKindLabel,
  type ResourceKind,
  type ResourceRow,
} from './::handlers/resources';

const KINDS: Array<{ value: ResourceKind; label: string }> = [
  { value: 'image', label: 'Image' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'compose', label: 'Compose' },
];

export default function ResourcesPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(() => isAdmin(getUserClient()));
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState('');
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<ResourceKind>('image');
  const [image, setImage] = useState('redis:7-alpine');
  const [dockerfile, setDockerfile] = useState(
    'FROM redis:7-alpine\nEXPOSE 6379\n',
  );
  const [composeYaml, setComposeYaml] = useState(
    'services:\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379"\n',
  );
  const [ports, setPorts] = useState('6379');
  const [envVars, setEnvVars] = useState<EnvVarsMap>({});
  const [startNow, setStartNow] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listResources());
    } catch {
      setError('Could not load resources.');
    }
  }, []);

  useEffect(() => {
    void load();
    setAdmin(isAdmin(getUserClient()));
  }, [load]);

  async function onCreate() {
    setFormError(null);
    setCreating(true);
    try {
      const containerPorts = ports
        .split(/[,\s]+/)
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const created = await createResource({
        slug: slug.trim(),
        label: label.trim() || undefined,
        kind,
        image: kind === 'image' ? image.trim() : undefined,
        dockerfile: kind === 'dockerfile' ? dockerfile : undefined,
        composeYaml: kind === 'compose' ? composeYaml : undefined,
        containerPorts,
        envVars: normalizeEnvVars(envVars),
        start: startNow,
      });
      setRows((prev) =>
        [...(prev ?? []).filter((r) => r.id !== created.id), created].sort(
          (a, b) => a.slug.localeCompare(b.slug),
        ),
      );
      setShowForm(false);
      setSlug('');
      setLabel('');
      router.push(`/resources/${created.id}`);
    } catch {
      setFormError(
        'Could not create the resource. Check the slug, image/Dockerfile/compose, and ports.',
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Resources"
          subtitle="Shared Docker services (Redis, Postgres, …) that preview apps can connect to."
          action={
            <div className="flex items-center gap-2">
              {admin ? (
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={() => setShowForm((v) => !v)}
                >
                  {showForm ? 'Cancel' : 'New resource'}
                </button>
              ) : null}
              <ReloadButton onReload={load} title="Reload resources" />
            </div>
          }
        />
        {error ? <div className="alert-error mb-4">{error}</div> : null}
        {showForm ? (
          <div className="card mb-5 p-5">
            <h2 className="text-base font-semibold text-[#e8eaed]">
              Register resource
            </h2>
            <p className="mt-1 text-sm text-[#8b919a]">
              Provide an image, a Dockerfile, or a compose file. Previa publishes
              container ports on the host and gives you env vars to copy into
              apps.
            </p>
            {formError ? (
              <div className="alert-error mt-3">{formError}</div>
            ) : null}
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-[#b8bcc4]">
                Slug
                <input
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-[#e8eaed]"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="redis-shared"
                />
              </label>
              <label className="text-sm text-[#b8bcc4]">
                Label
                <input
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-[#e8eaed]"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Shared Redis"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    kind === k.value
                      ? 'border-sky-400/50 bg-sky-950/40 text-sky-100'
                      : 'border-white/10 text-white/70'
                  }`}
                  onClick={() => setKind(k.value)}
                >
                  {k.label}
                </button>
              ))}
            </div>
            {kind === 'image' ? (
              <label className="mt-3 block text-sm text-[#b8bcc4]">
                Image
                <input
                  className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-[#e8eaed]"
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  placeholder="redis:7-alpine"
                />
              </label>
            ) : null}
            {kind === 'dockerfile' ? (
              <label className="mt-3 block text-sm text-[#b8bcc4]">
                Dockerfile
                <textarea
                  className="mt-1 h-40 w-full rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs text-[#e8eaed]"
                  value={dockerfile}
                  onChange={(e) => setDockerfile(e.target.value)}
                />
              </label>
            ) : null}
            {kind === 'compose' ? (
              <label className="mt-3 block text-sm text-[#b8bcc4]">
                docker-compose.yml
                <textarea
                  className="mt-1 h-48 w-full rounded-md border border-white/10 bg-black/20 p-3 font-mono text-xs text-[#e8eaed]"
                  value={composeYaml}
                  onChange={(e) => setComposeYaml(e.target.value)}
                />
              </label>
            ) : null}
            <label className="mt-3 block text-sm text-[#b8bcc4]">
              Container ports
              <input
                className="mt-1 w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm text-[#e8eaed]"
                value={ports}
                onChange={(e) => setPorts(e.target.value)}
                placeholder="6379"
              />
              <span className="mt-1 block text-xs text-white/45">
                Comma-separated. Redis defaults to 6379 if you leave this empty
                on an image.
              </span>
            </label>
            <div className="mt-4">
              <p className="text-sm text-[#b8bcc4]">Container env</p>
              <EnvEditor
                value={envVars}
                onChange={setEnvVars}
                hint="Passed to the container (REDIS_PASSWORD, POSTGRES_PASSWORD, …)."
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-[#b8bcc4]">
              <input
                type="checkbox"
                checked={startNow}
                onChange={(e) => setStartNow(e.target.checked)}
              />
              Start after creating
            </label>
            <div className="mt-4">
              <button
                type="button"
                className="btn text-sm"
                disabled={creating || !slug.trim()}
                onClick={() => void onCreate()}
              >
                {creating ? 'Creating…' : 'Create resource'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="card p-5">
          {!rows ? (
            <p className="text-sm text-white/70">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-white/55">
              No resources yet. Admins can register a Redis image or a compose
              file.
            </p>
          ) : (
            <ClientTable
              head={
                <tr className="border-b border-white/10 text-left text-xs text-white/55">
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Kind</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Ports</th>
                  <th className="px-2 py-2 font-medium">Node</th>
                </tr>
              }
            >
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-white/5 text-[#c8ccd4] hover:bg-white/5"
                  onClick={() => router.push(`/resources/${row.id}`)}
                >
                  <td className="px-2 py-2">
                    <Link
                      href={`/resources/${row.id}`}
                      className="font-medium text-[#e8eaed] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.label}
                    </Link>
                    <div className="font-mono text-xs text-white/45">{row.slug}</div>
                  </td>
                  <td className="px-2 py-2 text-xs">{resourceKindLabel(row.kind)}</td>
                  <td className="px-2 py-2">
                    <span className={resourceStatusBadgeClass(row.status)}>
                      {row.status}
                      {row.runtimeOnline ? '' : row.status === 'running' ? ' (offline)' : ''}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">
                    {formatPublishedPorts(row.publishedPorts, row.containerPorts)}
                  </td>
                  <td className="px-2 py-2">
                    {row.nodeLabel ? (
                      <NodeBadge
                        node={{
                          nodeLabel: row.nodeLabel,
                          isLocal: row.isLocal ?? true,
                          online: row.online,
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </ClientTable>
          )}
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
