'use client';

import { EnvEditor } from '@/components/EnvEditor';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { NodeBadge } from '@/components/NodeBadge';
import { RequireAuth } from '@/components/RequireAuth';
import { TabBar } from '@/components/TabBar';
import { useToast } from '@/components/Toast';
import { IconEnv, IconInfo, IconScrollText } from '@/components/icons';
import { getUserClient, isAdmin } from '@/lib/client-auth';
import { mergeEnvVars, normalizeEnvVars, type EnvVarsMap } from '@/lib/env-vars';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  activateInstance,
  awakeInstance,
  getInstance,
  getInstanceLogs,
  patchInstance,
  pauseInstance,
  removeInstance,
} from './::handlers/detail';
import { runnerLabel, type InstanceRow } from '../::handlers/instances';
import {
  activeLifetimePausedHint,
  lifetimeExpiryDisplay,
} from '@/lib/instance-lifetime';
import { formatInstanceCpu, instanceCpuTitle } from '@/lib/instance-monit';
import {
  clickupStatusBadgeClass,
  instanceStatusBadgeClass,
} from '@/lib/status-badge';

type InstanceTab = 'overview' | 'environment' | 'logs';
type StatusAction = 'pause' | 'activate' | 'awake' | 'remove' | null;

const TERMINAL_STATUSES = new Set(['active', 'paused', 'waiting', 'error']);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function InstanceDetailClient() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const toast = useToast();
  const admin = isAdmin(getUserClient());

  const [tab, setTab] = useState<InstanceTab>('overview');
  const [row, setRow] = useState<InstanceRow | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [logLines, setLogLines] = useState(200);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [statusAction, setStatusAction] = useState<StatusAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<EnvVarsMap>({});
  const [envSaving, setEnvSaving] = useState(false);
  const [envSaved, setEnvSaved] = useState(false);
  const [clickupInput, setClickupInput] = useState('');
  const [clickupBusy, setClickupBusy] = useState<
    null | 'match' | 'save' | 'clear'
  >(null);
  const clickupSaving = clickupBusy != null;
  const actionLock = useRef(false);

  const statusBusy = statusAction !== null;

  const loadDetail = useCallback(async () => {
    setError(null);
    const data = await getInstance(id);
    setRow(data);
    setEnvVars(normalizeEnvVars(data.envVars));
    setClickupInput(data.clickupManualLink ? data.clickupTaskUrl ?? '' : '');
    return data;
  }, [id]);

  const effectiveEnv = useMemo(
    () => mergeEnvVars(normalizeEnvVars(row?.projectEnvVars), envVars),
    [row?.projectEnvVars, envVars],
  );

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await getInstanceLogs(id, logLines);
      setLogs(res.output);
    } catch {
      setLogs('Could not load logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [id, logLines]);

  /** Espera o status sair de `deploying` antes de liberar os botões. */
  const waitUntilStatusSettled = useCallback(
    async (toastId: string, pendingTitle: string) => {
      const maxAttempts = 90;
      for (let i = 0; i < maxAttempts; i++) {
        await sleep(1500);
        try {
          const fresh = await getInstance(id);
          setRow(fresh);
          setEnvVars(normalizeEnvVars(fresh.envVars));
          if (TERMINAL_STATUSES.has(fresh.status)) {
            return fresh;
          }
          toast.update(toastId, {
            title: pendingTitle,
            description: `Current status: ${fresh.status}…`,
            variant: 'loading',
          });
        } catch {
          // keep waiting
        }
      }
      const last = await getInstance(id).catch(() => null);
      if (last) {
        setRow(last);
        setEnvVars(normalizeEnvVars(last.envVars));
      }
      return last;
    },
    [id, toast],
  );

  useEffect(() => {
    if (!admin && tab === 'environment') {
      setTab('overview');
    }
  }, [admin, tab]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await loadDetail();
      } catch {
        if (alive) setError('Instance not found.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadDetail]);

  useEffect(() => {
    if (!row || tab !== 'logs') return;
    void loadLogs();
  }, [row, tab, loadLogs]);

  const reloadAll = useCallback(async () => {
    await loadDetail();
    if (tab === 'logs') await loadLogs();
  }, [loadDetail, loadLogs, tab]);

  const runPause = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setStatusAction('pause');
    const toastId = toast.push({
      title: 'Pausing instance…',
      description: 'Stopping runtime and updating status.',
      variant: 'loading',
    });
    try {
      let r = await pauseInstance(id);
      setRow(r);
      if (r.status === 'deploying') {
        const settled = await waitUntilStatusSettled(toastId, 'Pausing instance…');
        if (settled) r = settled;
      }
      toast.update(toastId, {
        title: 'Instance paused',
        description:
          r?.status === 'paused'
            ? 'Runtime stopped. Waiting queue may advance.'
            : `Status is now ${r?.status ?? 'unknown'}.`,
        variant: 'success',
      });
    } catch {
      toast.update(toastId, {
        title: 'Could not pause',
        description: 'The pause request failed. Try again.',
        variant: 'error',
      });
    } finally {
      setStatusAction(null);
      actionLock.current = false;
    }
  }, [id, toast, waitUntilStatusSettled]);

  const runActivate = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setStatusAction('activate');
    const toastId = toast.push({
      title: 'Activating / redeploying…',
      description: 'Status change in progress. Please wait.',
      variant: 'loading',
    });

    const finishFromStatus = (r: InstanceRow | null) => {
      if (r?.status === 'waiting') {
        toast.update(toastId, {
          title: 'Still waiting',
          description: 'No free slot; instance remains in the queue.',
          variant: 'info',
        });
      } else if (r?.status === 'error') {
        toast.update(toastId, {
          title: 'Deploy failed',
          description: 'Check the error banner for details.',
          variant: 'error',
        });
      } else {
        toast.update(toastId, {
          title: 'Status updated',
          description: `Instance is now ${r?.status ?? 'updated'}.`,
          variant: 'success',
        });
      }
    };

    try {
      let r = await activateInstance(id);
      setRow(r);
      if (r.status === 'deploying') {
        toast.update(toastId, {
          title: 'Deploy in progress…',
          description: 'Waiting until the instance leaves deploying.',
          variant: 'loading',
        });
        const settled = await waitUntilStatusSettled(toastId, 'Deploy in progress…');
        if (settled) r = settled;
      }
      finishFromStatus(r);
    } catch {
      // Request pode falhar por timeout enquanto o worker já iniciou o deploy.
      try {
        let fresh = await getInstance(id);
        setRow(fresh);
        if (fresh.status === 'deploying') {
          toast.update(toastId, {
            title: 'Deploy in progress…',
            description: 'Request timed out, but deploy is still running. Waiting…',
            variant: 'loading',
          });
          const settled = await waitUntilStatusSettled(toastId, 'Deploy in progress…');
          finishFromStatus(settled);
        } else if (TERMINAL_STATUSES.has(fresh.status)) {
          finishFromStatus(fresh);
        } else {
          toast.update(toastId, {
            title: 'Could not activate / redeploy',
            description: 'The request failed. Try again.',
            variant: 'error',
          });
        }
      } catch {
        toast.update(toastId, {
          title: 'Could not activate / redeploy',
          description: 'The request failed. Try again.',
          variant: 'error',
        });
      }
    } finally {
      setStatusAction(null);
      actionLock.current = false;
    }
  }, [id, toast, waitUntilStatusSettled]);

  const runAwake = useCallback(async () => {
    if (actionLock.current) return;
    actionLock.current = true;
    setStatusAction('awake');
    const toastId = toast.push({
      title: 'Waking instance…',
      description: 'Resuming without pulling the branch.',
      variant: 'loading',
    });

    try {
      const r = await awakeInstance(id);
      setRow(r);
      if (r.status === 'waiting') {
        toast.update(toastId, {
          title: 'Still waiting',
          description: 'No free slot; instance remains in the queue.',
          variant: 'info',
        });
      } else if (r.status === 'error') {
        toast.update(toastId, {
          title: 'Wake failed',
          description: 'Check the error banner for details.',
          variant: 'error',
        });
      } else {
        toast.update(toastId, {
          title: 'Instance awake',
          description: `Instance is now ${r.status}.`,
          variant: 'success',
        });
      }
    } catch {
      try {
        const fresh = await getInstance(id);
        setRow(fresh);
        if (fresh.status === 'active') {
          toast.update(toastId, {
            title: 'Instance awake',
            description: 'Instance is now active.',
            variant: 'success',
          });
        } else {
          toast.update(toastId, {
            title: 'Could not wake',
            description: 'The wake request failed. Try again.',
            variant: 'error',
          });
        }
      } catch {
        toast.update(toastId, {
          title: 'Could not wake',
          description: 'The wake request failed. Try again.',
          variant: 'error',
        });
      }
    } finally {
      setStatusAction(null);
      actionLock.current = false;
    }
  }, [id, toast]);

  const runRemove = useCallback(async () => {
    if (!row || actionLock.current) return;
    if (
      !confirm(
        `Remove this instance?\n\nProject: ${row.projectSlug}\nBranch: ${row.branch}\n\nThis stops the runtime (${runnerLabel(row.runner)}/nginx) and deletes the database record.`,
      )
    ) {
      return;
    }
    actionLock.current = true;
    setStatusAction('remove');
    const toastId = toast.push({
      title: 'Removing instance…',
      description: 'Destroying runtime and database record.',
      variant: 'loading',
    });
    try {
      await removeInstance(id);
      toast.update(toastId, {
        title: 'Instance removed',
        description: 'Redirecting to the instances list.',
        variant: 'success',
        durationMs: 2500,
      });
      router.push('/instances');
      router.refresh();
    } catch {
      toast.update(toastId, {
        title: 'Could not remove',
        description: 'The remove request failed. Try again.',
        variant: 'error',
      });
      setStatusAction(null);
      actionLock.current = false;
    }
  }, [row, id, toast, router]);

  return (
    <RequireAuth>
      <PageContainer>
        <div className="mb-3 text-sm text-[#b8bcc4]">
          <Link className="link-muted" href="/instances">
            ← Back to instances
          </Link>
        </div>

        {error ? <div className="alert-error mb-4">{error}</div> : null}

        {loading ? (
          <div className="text-sm text-white/70">Loading…</div>
        ) : row ? (
          <div className="space-y-5">
            <PageHeader
              title="Instance"
              subtitle={
                <>
                  <NodeBadge node={row} />
                  <span className="ml-2">
                    Project <span className="font-semibold text-[#e8eaed]">{row.projectSlug}</span>
                    {' · '}
                    branch <span className="font-mono text-[#e8eaed]">{row.branch}</span>
                    {statusBusy ? (
                      <span className="ml-2 inline-flex items-center gap-1.5 text-[#8b919a]">
                        <span className="h-3 w-3 animate-spin rounded-full border border-white/25 border-t-sky-300" />
                        updating…
                      </span>
                    ) : null}
                  </span>
                </>
              }
              action={
                <ReloadButton
                  onReload={reloadAll}
                  title="Reload instance"
                  disabled={statusBusy}
                />
              }
            />

            {!row.isLocal ? (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  row.canWrite
                    ? 'border-emerald-400/25 bg-emerald-950/30 text-emerald-100/85'
                    : 'border-violet-400/25 bg-violet-950/30 text-violet-100/85'
                }`}
              >
                {row.canWrite ? (
                  <>
                    Managing instance on remote node <strong>{row.nodeLabel}</strong>. This key has
                    read &amp; write access — actions run on that machine.
                  </>
                ) : (
                  <>
                    Read-only view from remote node <strong>{row.nodeLabel}</strong>. The cluster
                    key for this node does not allow write actions.
                  </>
                )}
              </div>
            ) : null}

            {row.status === 'error' && row.lastDeployError ? (
              <div className="rounded-xl border border-rose-400/30 bg-rose-950/40 p-4">
                <h2 className="text-sm font-semibold text-rose-100">Deploy failed</h2>
                <p className="mt-1 text-xs text-rose-200/70">
                  Last error recorded during deploy (branch{' '}
                  <span className="font-mono">{row.branch}</span>).
                </p>
                <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-rose-400/20 bg-black/40 p-3 font-mono text-xs leading-relaxed text-rose-50/90 whitespace-pre-wrap">
                  {row.lastDeployError}
                </pre>
              </div>
            ) : null}

            <div className="card">
              <div className="px-5 pt-2">
                <TabBar
                  value={tab}
                  onChange={(next) => {
                    setEnvSaved(false);
                    setTab(next);
                  }}
                  tabs={[
                    {
                      id: 'overview' as const,
                      label: 'Overview',
                      icon: <IconInfo className="h-4 w-4" />,
                    },
                    ...(row.isLocal && admin
                      ? [
                          {
                            id: 'environment' as const,
                            label: 'Environment',
                            icon: <IconEnv className="h-4 w-4" />,
                          },
                        ]
                      : []),
                    {
                      id: 'logs' as const,
                      label: 'Logs',
                      icon: <IconScrollText className="h-4 w-4" />,
                    },
                  ]}
                />
              </div>

              <div className="p-5">
                {tab === 'overview' ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={statusBusy || row.status !== 'active' || !row.canWrite}
                        title={
                          statusBusy
                            ? 'Status change in progress'
                            : row.status !== 'active'
                              ? 'Only active instances can be paused'
                              : undefined
                        }
                        onClick={() => void runPause()}
                      >
                        {statusAction === 'pause' ? 'Pausing…' : 'Pause'}
                      </button>
                      {row.status === 'paused' && row.idleSleep ? (
                        <button
                          type="button"
                          className="btn text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={statusBusy || !row.canWrite}
                          title={
                            statusBusy
                              ? 'Status change in progress'
                              : 'Resume without git pull or rebuild'
                          }
                          onClick={() => void runAwake()}
                        >
                          {statusAction === 'awake' ? 'Waking…' : 'Awake'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            statusBusy ||
                            !row.canWrite ||
                            !['waiting', 'paused', 'error', 'active'].includes(row.status)
                          }
                          title={statusBusy ? 'Status change in progress' : undefined}
                          onClick={() => void runActivate()}
                        >
                          {statusAction === 'activate' ? 'Working…' : 'Activate / redeploy'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn text-sm border-rose-200/30 bg-rose-200/10 text-rose-100 hover:bg-rose-200/15 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={statusBusy || !row.canWrite}
                        title={statusBusy ? 'Status change in progress' : undefined}
                        onClick={() => void runRemove()}
                      >
                        {statusAction === 'remove' ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                    {statusBusy ? (
                      <p className="mt-2 text-sm text-sky-200/80">
                        Status change in progress — pause, awake, and activate stay locked until it
                        finishes.
                      </p>
                    ) : null}
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-white/55">Status (database)</dt>
                        <dd className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`${instanceStatusBadgeClass(row.status, {
                              idleSleep: !!row.idleSleep,
                            })} font-mono`}
                          >
                            {row.status}
                            {row.status === 'paused' && row.idleSleep ? ' · idle' : ''}
                          </span>
                          {statusBusy ? (
                            <span className="text-xs text-sky-300/80">(updating)</span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Runner</dt>
                        <dd className="font-mono text-white/90">{runnerLabel(row.runner)}</dd>
                      </div>
                      <div>
                        <dt className="text-white/55">{runnerLabel(row.runner)} name</dt>
                        <dd className="font-mono text-white/90">
                          {row.runtimeName ?? row.pm2Name}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Port</dt>
                        <dd className="text-white/90">{row.port ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Branch slug (path)</dt>
                        <dd className="font-mono text-white/90">{row.branchSlug}</dd>
                      </div>
                      <div>
                        <dt className="text-white/55">{runnerLabel(row.runner)} online</dt>
                        <dd className="text-white/90">
                          {(row.runtimeOnline ?? row.pm2Online) ? (
                            <span className="text-emerald-200/90">yes</span>
                          ) : (
                            <span className="text-amber-200/90">no</span>
                          )}{' '}
                          <span className="text-white/55">
                            ({row.runtimeStatus ?? row.pm2Status ?? '—'})
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Project public URL</dt>
                        <dd className="break-all text-white/80">{row.projectServerUrl ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Preview</dt>
                        <dd>
                          {row.previewUrl ? (
                            <Link
                              className="text-sky-200/90 underline-offset-2 hover:underline"
                              href={row.previewUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {row.previewUrl}
                            </Link>
                          ) : (
                            <span className="text-white/45">—</span>
                          )}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-white/55">ClickUp task</dt>
                        <dd className="mt-1 space-y-2">
                          {row.clickupTaskUrl || row.clickupTaskStatus || row.clickupTaskId ? (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                              {row.clickupTaskUrl ? (
                                <Link
                                  className="break-all text-sky-200/90 underline-offset-2 hover:underline"
                                  href={row.clickupTaskUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {row.clickupTaskId ?? row.clickupTaskUrl}
                                </Link>
                              ) : row.clickupTaskId ? (
                                <span className="font-mono text-white/80">{row.clickupTaskId}</span>
                              ) : null}
                              {row.clickupTaskStatus ? (
                                <span className={clickupStatusBadgeClass(row.clickupTaskStatus)}>
                                  {row.clickupTaskStatus}
                                </span>
                              ) : null}
                              {row.clickupManualLink ? (
                                <span className="text-xs text-white/45">manual link</span>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-white/45">
                              No task linked. Branch names like{' '}
                              <span className="font-mono">cicm-4491</span> are matched
                              automatically when ClickUp is configured.
                            </p>
                          )}
                          {row.isLocal && admin ? (
                            <div className="mt-2 max-w-xl space-y-2">
                              <label className="block text-xs text-white/55">
                                Force link (paste ClickUp URL or task ID)
                              </label>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <input
                                  className="input min-w-0 flex-1 font-mono text-sm"
                                  value={clickupInput}
                                  onChange={(e) => setClickupInput(e.target.value)}
                                  placeholder="https://app.clickup.com/t/CICM-4491"
                                  disabled={clickupSaving || statusBusy}
                                />
                                <button
                                  type="button"
                                  className="btn shrink-0 text-sm"
                                  disabled={clickupSaving || statusBusy}
                                  title={`Match ClickUp task from branch "${row.branch}"`}
                                  onClick={async () => {
                                    setClickupBusy('match');
                                    setError(null);
                                    try {
                                      const updated = await patchInstance(id, {
                                        clickupLinkFromBranch: true,
                                      });
                                      setRow(updated);
                                      setClickupInput('');
                                      toast.push({
                                        title: updated.clickupTaskUrl
                                          ? 'ClickUp task matched from branch'
                                          : 'No ClickUp task found for branch',
                                        description: updated.clickupTaskId
                                          ? `Task ${updated.clickupTaskId}`
                                          : undefined,
                                        variant: updated.clickupTaskUrl
                                          ? 'success'
                                          : 'info',
                                      });
                                    } catch (e) {
                                      setError(
                                        e instanceof Error
                                          ? e.message
                                          : 'Could not match ClickUp task from branch. Check the branch name and API token in Settings.',
                                      );
                                    } finally {
                                      setClickupBusy(null);
                                    }
                                  }}
                                >
                                  {clickupBusy === 'match'
                                    ? 'Working…'
                                    : 'Match from branch'}
                                </button>
                              </div>
                              <p className="text-xs text-white/45">
                                Manual links only show the task URL and status — Previa will not
                                post a preview comment on that task. Use{' '}
                                <span className="text-white/70">Match from branch</span> to resolve
                                from the branch name (e.g.{' '}
                                <span className="font-mono">{row.branch}</span>).
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="btn btn-primary text-sm"
                                  disabled={clickupSaving || statusBusy}
                                  onClick={async () => {
                                    setClickupBusy('save');
                                    setError(null);
                                    try {
                                      const updated = await patchInstance(id, {
                                        clickupTaskUrl: clickupInput.trim() || null,
                                      });
                                      setRow(updated);
                                      setClickupInput(
                                        updated.clickupManualLink
                                          ? updated.clickupTaskUrl ?? ''
                                          : '',
                                      );
                                      toast.push({
                                        title: updated.clickupManualLink
                                          ? 'ClickUp task linked'
                                          : 'ClickUp link cleared',
                                        variant: 'success',
                                      });
                                    } catch {
                                      setError(
                                        'Could not link ClickUp task. Check the URL and API token in Settings.',
                                      );
                                    } finally {
                                      setClickupBusy(null);
                                    }
                                  }}
                                >
                                  {clickupBusy === 'save'
                                    ? 'Saving…'
                                    : 'Save ClickUp link'}
                                </button>
                                {row.clickupManualLink || row.clickupTaskId ? (
                                  <button
                                    type="button"
                                    className="btn text-sm"
                                    disabled={clickupSaving || statusBusy}
                                    onClick={async () => {
                                      setClickupBusy('clear');
                                      setError(null);
                                      try {
                                        const updated = await patchInstance(id, {
                                          clickupTaskUrl: null,
                                        });
                                        setRow(updated);
                                        setClickupInput('');
                                        toast.push({
                                          title: 'ClickUp link cleared',
                                          variant: 'success',
                                        });
                                      } catch {
                                        setError('Could not clear ClickUp link.');
                                      } finally {
                                        setClickupBusy(null);
                                      }
                                    }}
                                  >
                                    {clickupBusy === 'clear' ? 'Clearing…' : 'Clear'}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">
                          CPU % / memory ({runnerLabel(row.runner)})
                        </dt>
                        <dd
                          className="text-white/80"
                          title={
                            row.runner === 'docker'
                              ? undefined
                              : instanceCpuTitle(row.monit)
                          }
                        >
                          {row.runner === 'docker' ? (
                            <span className="text-white/55">n/d (docker)</span>
                          ) : (
                            <>
                              {formatInstanceCpu(row.monit)} ·{' '}
                              {typeof row.monit?.memory === 'number'
                                ? `${Math.round(row.monit.memory / (1024 * 1024))} MB`
                                : '—'}
                            </>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Updated</dt>
                        <dd className="text-white/80">
                          {new Date(row.updatedAt).toLocaleString('en-US')}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Auto-pause at</dt>
                        <dd className="text-white/80">
                          {(() => {
                            const hint = activeLifetimePausedHint(
                              row.status,
                              row.hasActiveLifetimeLimit,
                              row.activeExpiresAt,
                            );
                            if (hint) {
                              return <span className="text-white/55">{hint}</span>;
                            }
                            const d = lifetimeExpiryDisplay(row.activeExpiresAt);
                            return (
                              <span className={d.expired ? 'text-rose-300/90' : undefined}>
                                {row.activeExpiresAt ? (
                                  <>
                                    {d.title}
                                    {!d.expired ? (
                                      <span className="ml-1 text-xs text-white/50">({d.text})</span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-white/45">No limit</span>
                                )}
                              </span>
                            );
                          })()}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-white/55">Auto-remove at</dt>
                        <dd className="text-white/80">
                          {(() => {
                            const d = lifetimeExpiryDisplay(row.existenceExpiresAt);
                            return (
                              <span className={d.expired ? 'text-rose-300/90' : undefined}>
                                {row.existenceExpiresAt ? (
                                  <>
                                    {d.title}
                                    {!d.expired ? (
                                      <span className="ml-1 text-xs text-white/50">({d.text})</span>
                                    ) : null}
                                  </>
                                ) : (
                                  <span className="text-white/45">No limit</span>
                                )}
                              </span>
                            );
                          })()}
                        </dd>
                      </div>
                    </dl>
                  </>
                ) : null}

                {tab === 'environment' && row.isLocal && admin ? (
                  <>
                    <h2 className="text-sm font-medium text-[#e8eaed]">Environment overrides</h2>
                    <p className="mt-1 text-xs text-white/55">
                      Keys set here override project defaults on the next deploy. Project defaults:{' '}
                      <span className="font-mono text-white/70">
                        {Object.keys(normalizeEnvVars(row.projectEnvVars)).length} var
                        {Object.keys(normalizeEnvVars(row.projectEnvVars)).length === 1
                          ? ''
                          : 's'}
                      </span>
                      {' · '}
                      Effective after merge:{' '}
                      <span className="font-mono text-white/70">
                        {Object.keys(effectiveEnv).length} var
                        {Object.keys(effectiveEnv).length === 1 ? '' : 's'}
                      </span>
                      . Use Activate / redeploy to apply (Awake does not rebuild).
                    </p>
                    <div className="mt-4">
                      <EnvEditor
                        value={envVars}
                        onChange={(next) => {
                          setEnvSaved(false);
                          setEnvVars(next);
                        }}
                        disabled={envSaving || !row.canWrite || statusBusy}
                        hint="Only overrides for this instance. Leave empty to use project defaults only."
                      />
                    </div>
                    {envSaved ? (
                      <div className="alert-success mt-3">
                        Overrides saved. Redeploy to apply.
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <button
                        type="button"
                        className="btn btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={envSaving || !row.canWrite || statusBusy}
                        onClick={async () => {
                          setEnvSaved(false);
                          setEnvSaving(true);
                          const toastId = toast.push({
                            title: 'Saving environment…',
                            variant: 'loading',
                          });
                          try {
                            const r = await patchInstance(id, { envVars });
                            setRow(r);
                            setEnvVars(normalizeEnvVars(r.envVars));
                            setEnvSaved(true);
                            toast.update(toastId, {
                              title: 'Environment saved',
                              description: 'Redeploy to apply overrides.',
                              variant: 'success',
                            });
                          } catch {
                            toast.update(toastId, {
                              title: 'Could not save environment',
                              variant: 'error',
                            });
                          } finally {
                            setEnvSaving(false);
                          }
                        }}
                      >
                        {envSaving ? 'Saving…' : 'Save overrides'}
                      </button>
                    </div>
                  </>
                ) : null}

                {tab === 'logs' ? (
                  <>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-medium text-[#e8eaed]">
                          Logs ({runnerLabel(row.runner)})
                        </h2>
                        <p className="mt-0.5 text-xs text-white/55">
                          Last lines from {row.runner === 'docker' ? 'container' : 'process'}{' '}
                          <span className="font-mono">{row.runtimeName ?? row.pm2Name}</span>
                          {!row.isLocal ? (
                            <span className="ml-1 text-white/40">
                              (proxied from {row.nodeLabel})
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-white/60">
                          Lines
                          <select
                            className="ml-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white"
                            value={logLines}
                            onChange={(e) => setLogLines(Number(e.target.value))}
                          >
                            {[100, 200, 400, 800].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn btn-primary text-sm"
                          disabled={logsLoading}
                          onClick={() => void loadLogs()}
                        >
                          {logsLoading ? 'Loading…' : 'Refresh logs'}
                        </button>
                      </div>
                    </div>
                    <pre className="mt-4 max-h-[min(480px,55vh)] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/85">
                      {logs || (logsLoading ? 'Loading…' : '(empty)')}
                    </pre>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </PageContainer>
    </RequireAuth>
  );
}
