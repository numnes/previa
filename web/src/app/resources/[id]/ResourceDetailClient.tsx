'use client';

import { CodeBlock } from '@/components/CodeBlock';
import { EnvEditor } from '@/components/EnvEditor';
import { NodeBadge } from '@/components/NodeBadge';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { RequireAuth } from '@/components/RequireAuth';
import { TabBar } from '@/components/TabBar';
import { IconEnv, IconInfo, IconScrollText } from '@/components/icons';
import { getUserClient, isAdmin } from '@/lib/client-auth';
import { normalizeEnvVars, type EnvVarsMap } from '@/lib/env-vars';
import { resourceStatusBadgeClass } from '@/lib/status-badge';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  formatPublishedPorts,
  getResource,
  getResourceLogs,
  patchResource,
  removeResource,
  resourceKindLabel,
  startResource,
  stopResource,
  type ResourceRow,
} from '../::handlers/resources';

type Tab = 'overview' | 'environment' | 'logs';

export default function ResourceDetailClient() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const admin = isAdmin(getUserClient());
  const [tab, setTab] = useState<Tab>('overview');
  const [row, setRow] = useState<ResourceRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<EnvVarsMap>({});
  const [envSaving, setEnvSaving] = useState(false);
  const [logs, setLogs] = useState('');
  const [logLines, setLogLines] = useState(200);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const data = await getResource(id);
    setRow(data);
    setEnvVars(normalizeEnvVars(data.envVars));
    return data;
  }, [id]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await getResourceLogs(id, logLines);
      setLogs(res.output);
    } catch {
      setLogs('Could not load logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [id, logLines]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch {
        if (alive) setError('Could not load resource.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    if (tab === 'logs') void loadLogs();
  }, [tab, loadLogs]);

  useEffect(() => {
    if (!admin && tab === 'environment') setTab('overview');
  }, [admin, tab]);

  async function runAction(name: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(name);
    setError(null);
    try {
      await fn();
      await load();
    } catch {
      setError(`Could not ${name} this resource.`);
    } finally {
      setBusy(null);
    }
  }

  const canWrite = row?.canWrite !== false;
  const local = row?.isLocal !== false;

  return (
    <RequireAuth>
      <PageContainer>
        <div className="mb-3 text-sm text-[#b8bcc4]">
          <Link className="link-muted" href="/resources">
            ← Back to resources
          </Link>
        </div>
        {error ? <div className="alert-error mb-4">{error}</div> : null}
        {loading || !row ? (
          <p className="text-sm text-white/55">Loading…</p>
        ) : (
          <>
            <PageHeader
              title={row.label}
              subtitle={`${resourceKindLabel(row.kind)} · ${row.slug}`}
              action={
                <ReloadButton onReload={() => void load()} title="Reload resource" />
              }
            />
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className={resourceStatusBadgeClass(row.status)}>
                {row.status}
              </span>
              {row.nodeLabel ? (
                <NodeBadge
                  node={{
                    nodeLabel: row.nodeLabel,
                    isLocal: row.isLocal ?? true,
                    online: row.online,
                  }}
                />
              ) : null}
              {canWrite && row.status !== 'running' && row.status !== 'starting' ? (
                <button
                  type="button"
                  className="btn text-sm"
                  disabled={busy !== null}
                  onClick={() => void runAction('start', () => startResource(id))}
                >
                  {busy === 'start' ? 'Starting…' : 'Start'}
                </button>
              ) : null}
              {canWrite && (row.status === 'running' || row.status === 'starting') ? (
                <button
                  type="button"
                  className="btn text-sm"
                  disabled={busy !== null}
                  onClick={() => void runAction('stop', () => stopResource(id))}
                >
                  {busy === 'stop' ? 'Stopping…' : 'Stop'}
                </button>
              ) : null}
              {admin && local ? (
                <button
                  type="button"
                  className="btn text-sm text-rose-200"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!window.confirm(`Remove resource ${row.slug}?`)) return;
                    void runAction('remove', async () => {
                      await removeResource(id);
                      router.push('/resources');
                    });
                  }}
                >
                  Remove
                </button>
              ) : null}
            </div>

            <TabBar
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'overview', label: 'Overview', icon: <IconInfo /> },
                ...(admin && local
                  ? [{ id: 'environment' as const, label: 'Environment', icon: <IconEnv /> }]
                  : []),
                { id: 'logs', label: 'Logs', icon: <IconScrollText /> },
              ]}
            />

            {tab === 'overview' ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="card p-5">
                  <h2 className="text-base font-semibold text-[#e8eaed]">Runtime</h2>
                  <dl className="mt-3 space-y-2 text-sm text-[#c8ccd4]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/55">Kind</dt>
                      <dd>{resourceKindLabel(row.kind)}</dd>
                    </div>
                    {row.image ? (
                      <div className="flex justify-between gap-4">
                        <dt className="text-white/55">Image</dt>
                        <dd className="font-mono text-xs">{row.image}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/55">Container</dt>
                      <dd className="font-mono text-xs">{row.runtimeName}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/55">Ports</dt>
                      <dd className="font-mono text-xs">
                        {formatPublishedPorts(row.publishedPorts, row.containerPorts)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-white/55">Docker</dt>
                      <dd>
                        {row.runtimeOnline
                          ? row.runtimeStatus ?? 'running'
                          : 'offline'}
                      </dd>
                    </div>
                  </dl>
                  {row.lastError ? (
                    <pre className="mt-4 max-h-48 overflow-auto rounded border border-rose-400/20 bg-rose-950/20 p-3 text-xs text-rose-100/90">
                      {row.lastError}
                    </pre>
                  ) : null}
                </div>
                <div className="card p-5">
                  <h2 className="text-base font-semibold text-[#e8eaed]">
                    Connection env
                  </h2>
                  <p className="mt-1 text-sm text-[#8b919a]">
                    Copy these into a preview instance or project env. Host is
                    127.0.0.1 on this Previa machine.
                  </p>
                  <div className="mt-3">
                    <CodeBlock
                      title=".env"
                      content={
                        row.connectionDotenv?.trim()
                          ? row.connectionDotenv
                          : '# Start the resource to allocate ports and generate connection env.\n'
                      }
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'environment' && admin && local ? (
              <div className="card mt-5 p-5">
                <h2 className="text-base font-semibold text-[#e8eaed]">
                  Container env
                </h2>
                <p className="mt-1 text-sm text-[#8b919a]">
                  Saved on the resource. Restart to apply changes to a running
                  container.
                </p>
                <div className="mt-3">
                  <EnvEditor value={envVars} onChange={setEnvVars} />
                </div>
                <button
                  type="button"
                  className="btn mt-4 text-sm"
                  disabled={envSaving}
                  onClick={() => {
                    setEnvSaving(true);
                    void patchResource(id, { envVars })
                      .then(() => load())
                      .catch(() => setError('Could not save env vars.'))
                      .finally(() => setEnvSaving(false));
                  }}
                >
                  {envSaving ? 'Saving…' : 'Save env'}
                </button>
              </div>
            ) : null}

            {tab === 'logs' ? (
              <div className="card mt-5 p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-[#e8eaed]">Logs</h2>
                  <label className="text-xs text-white/55">
                    Lines{' '}
                    <input
                      type="number"
                      className="ml-1 w-20 rounded border border-white/10 bg-black/20 px-2 py-1"
                      value={logLines}
                      onChange={(e) => setLogLines(Number(e.target.value) || 200)}
                    />
                  </label>
                </div>
                <pre className="max-h-[480px] overflow-auto rounded border border-white/10 bg-black/30 p-3 text-xs text-[#d1d5db]">
                  {logsLoading ? 'Loading…' : logs || '(no logs)'}
                </pre>
              </div>
            ) : null}
          </>
        )}
      </PageContainer>
    </RequireAuth>
  );
}
