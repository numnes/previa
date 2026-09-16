'use client';

import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { AUTO_RELOAD_INTERVAL_MS, ReloadButton } from '@/components/ReloadButton';
import { RequireAuth } from '@/components/RequireAuth';
import { ClientTable } from '@/components/ClientTable';
import { Modal } from '@/components/Modal';
import { getUserClient, isAdmin } from '@/lib/client-auth';
import {
  amplifyJobStatusBadgeClass,
  amplifyJobStatusLabel,
  amplifyStageBadgeClass,
  clickupStatusBadgeClass,
} from '@/lib/status-badge';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteAmplifyBranch,
  hostAmplifyBranch,
  listAmplifyBranches,
  nestErrorMessage,
  type AmplifyBranchesPayload,
} from './::handlers/amplify';

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function slotBarClass(pct: number): string {
  if (pct >= 85) return 'bg-rose-400';
  if (pct >= 65) return 'bg-amber-400';
  return 'bg-emerald-400';
}

function slotTextClass(pct: number): string {
  if (pct >= 85) return 'text-rose-300';
  if (pct >= 65) return 'text-amber-300';
  return 'text-emerald-300';
}

export default function AmplifyPage() {
  const [admin] = useState(() => isAdmin(getUserClient()));
  const [payload, setPayload] = useState<AmplifyBranchesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [hostName, setHostName] = useState('');
  const [hostOpen, setHostOpen] = useState(false);
  const [hosting, setHosting] = useState<string | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listAmplifyBranches();
      setPayload(data);
    } catch (e) {
      setError(nestErrorMessage(e, 'Could not load Amplify branches.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!payload) return null;
    const q = search.trim().toLowerCase();
    if (!q) return payload.branches;
    return payload.branches.filter((b) => {
      const hay = `${b.branchName} ${b.displayName ?? ''} ${b.stage ?? ''} ${b.lastJobStatus ?? ''} ${b.clickupTaskId ?? ''} ${b.clickupTaskStatus ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [payload, search]);

  const showClickupCol = useMemo(
    () =>
      !!payload?.clickupConfigured ||
      !!payload?.branches.some((b) => b.clickupTaskStatus || b.clickupTaskId),
    [payload],
  );

  const colCount = showClickupCol ? 8 : 7;
  const hasSearch = search.trim().length > 0;
  const slotPct = useMemo(() => {
    if (!payload?.slotLimit) return 0;
    return Math.min(100, Math.round((payload.slotUsed / payload.slotLimit) * 100));
  }, [payload]);

  async function onDelete(branchName: string, stage: string | null) {
    const prodWarn =
      (stage ?? '').toUpperCase() === 'PRODUCTION'
        ? '\n\nThis branch is marked PRODUCTION in Amplify.'
        : '';
    if (
      !confirm(
        `Delete Amplify branch "${branchName}"?${prodWarn}\n\nThis runs the equivalent of:\naws amplify delete-branch --app-id ${payload?.appId ?? '…'} --branch-name ${branchName}\n\nThe hosted preview will be removed.`,
      )
    ) {
      return;
    }
    setDeleting(branchName);
    setError(null);
    try {
      await deleteAmplifyBranch(branchName);
      await load();
    } catch (e) {
      setError(nestErrorMessage(e, `Could not delete branch "${branchName}".`));
    } finally {
      setDeleting(null);
    }
  }

  async function onHost(branchName: string, mode: 'form' | 'row') {
    const name = branchName.trim();
    if (!name) {
      if (mode === 'form') setHostError('Enter a git branch name.');
      else setError('Enter a git branch name.');
      return;
    }
    const alreadyHosted = payload?.branches.some(
      (b) => b.branchName.toLowerCase() === name.toLowerCase(),
    );
    const existing = payload?.branches.find(
      (b) => b.branchName.toLowerCase() === name.toLowerCase(),
    );
    const prodWarn =
      (existing?.stage ?? '').toUpperCase() === 'PRODUCTION'
        ? '\n\nThis branch is marked PRODUCTION in Amplify.'
        : '';
    const confirmText = alreadyHosted
      ? `Redeploy Amplify branch "${name}" from the current git HEAD?${prodWarn}\n\nThis runs:\naws amplify start-job --job-type RELEASE\n\nNo git push is required.`
      : `Host git branch "${name}" on Amplify from the current HEAD?${prodWarn}\n\nThis runs:\naws amplify create-branch --branch-name ${name}\naws amplify start-job --job-type RELEASE\n\nThe branch must already exist on the connected Git repo. No new push is required.`;
    if (!confirm(confirmText)) return;

    setHosting(name);
    setError(null);
    setHostError(null);
    setActionMsg(null);
    try {
      const r = await hostAmplifyBranch(name);
      setActionMsg(
        r.action === 'created'
          ? `Hosted "${r.branchName}" and started a RELEASE job from the current git HEAD.`
          : `Started a RELEASE job for "${r.branchName}" from the current git HEAD.`,
      );
      if (mode === 'form') {
        setHostName('');
        setHostOpen(false);
      }
      await load();
    } catch (e) {
      const msg = nestErrorMessage(e, `Could not host branch "${name}".`);
      if (mode === 'form') setHostError(msg);
      else setError(msg);
    } finally {
      setHosting(null);
    }
  }

  function openHostModal() {
    setHostError(null);
    setHostOpen(true);
  }

  const closeHostModal = useCallback(() => {
    if (hosting) return;
    setHostOpen(false);
    setHostError(null);
  }, [hosting]);

  const busy = deleting != null || hosting != null;
  const slotsFull = (payload?.slotAvailable ?? 0) <= 0;

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Amplify"
          subtitle="Hosted branches from AWS Amplify. Hidden names are configured in Settings. ClickUp status uses the same branch matching as Previa instances."
          action={
            <div className="flex items-center gap-2">
              <ReloadButton
                onReload={load}
                title="Reload Amplify branches"
                intervalMs={AUTO_RELOAD_INTERVAL_MS}
              />
              {payload?.configured ? (
                <button
                  type="button"
                  className="btn btn-success"
                  disabled={busy}
                  onClick={openHostModal}
                >
                  Host branch
                </button>
              ) : null}
            </div>
          }
        />
        <div className="card p-5">
          {error ? <div className="alert-error mb-4">{error}</div> : null}
          {actionMsg ? <div className="alert-success mb-4">{actionMsg}</div> : null}

          {payload && !payload.configured ? (
            <p className="text-sm text-white/70">
              Amplify is not configured yet.
              {admin ? (
                <>
                  {' '}
                  Add the App ID and AWS credentials in{' '}
                  <Link className="text-sky-200/90 underline-offset-2 hover:underline" href="/settings">
                    Settings
                  </Link>
                  .
                </>
              ) : (
                ' Ask an admin to set the App ID and AWS credentials.'
              )}
            </p>
          ) : null}

          {payload?.configured ? (
            <>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-[#b8bcc4]">
                <span>
                  App{' '}
                  <span className="font-medium text-white/85">
                    {payload.appName || payload.appId}
                  </span>
                  {payload.appName && payload.appId ? (
                    <span className="ml-1.5 font-mono text-xs text-white/50">
                      {payload.appId}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-xs text-white/50">{payload.region}</span>
                {payload.hiddenCount > 0 ? (
                  <span className="text-xs text-white/50">
                    {payload.hiddenCount} hidden
                    {admin ? (
                      <>
                        {' '}
                        ·{' '}
                        <Link className="text-sky-200/80 underline-offset-2 hover:underline" href="/settings">
                          edit list
                        </Link>
                      </>
                    ) : null}
                  </span>
                ) : null}
              </div>

              <div className="mb-4 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-[#e8eaed]">
                    <span className={`font-semibold tabular-nums ${slotTextClass(slotPct)}`}>
                      {payload.slotUsed}
                    </span>
                    {' of '}
                    <span className="font-semibold tabular-nums text-white/90">
                      {payload.slotLimit}
                    </span>
                    {' slots in use'}
                  </p>
                  <p className="text-sm text-[#b8bcc4]">
                    <span className="font-semibold tabular-nums text-white/85">
                      {payload.slotAvailable}
                    </span>{' '}
                    available
                  </p>
                </div>
                <div
                  className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={payload.slotLimit}
                  aria-valuenow={payload.slotUsed}
                  aria-label="Amplify branch slots"
                >
                  <div
                    className={`h-full rounded-full ${slotBarClass(slotPct)}`}
                    style={{ width: `${slotPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-white/45">
                  AWS Amplify allows {payload.slotLimit} branches per app
                  {payload.hiddenCount > 0
                    ? ` · ${payload.hiddenCount} hidden still count toward the quota`
                    : ''}
                  {admin ? (
                    <>
                      {' · '}
                      <Link className="text-sky-200/80 underline-offset-2 hover:underline" href="/settings">
                        change limit
                      </Link>
                    </>
                  ) : null}
                  .
                </p>
              </div>

              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-[#b8bcc4]" htmlFor="amplify-search">
                    Branch or ClickUp
                  </label>
                  <input
                    id="amplify-search"
                    className="input w-full"
                    type="search"
                    placeholder="Search by branch, stage, or task…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {hasSearch ? (
                  <button
                    type="button"
                    className="btn sm:mb-0.5"
                    onClick={() => setSearch('')}
                  >
                    Clear
                  </button>
                ) : null}
              </div>

              {hasSearch ? (
                <p className="mb-3 text-sm text-[#8b919a]">
                  Showing {filtered?.length ?? 0} of {payload.branches.length} branches
                </p>
              ) : null}

              <ClientTable
                head={
                  <tr>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Branch
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Stage
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Deploy
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Auto-build
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Updated
                    </th>
                    {showClickupCol ? (
                      <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                        ClickUp
                      </th>
                    ) : null}
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Preview
                    </th>
                    <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                      Actions
                    </th>
                  </tr>
                }
              >
                {(filtered ?? []).map((b) => (
                  <tr key={b.branchName} className="hover:bg-white/[0.04]">
                    <td className="border-b border-white/10 px-3 py-2 font-semibold">
                      <span className="font-mono text-sm">{b.branchName}</span>
                      {b.displayName && b.displayName !== b.branchName ? (
                        <p className="mt-0.5 text-xs font-normal text-white/50">
                          {b.displayName}
                        </p>
                      ) : null}
                    </td>
                    <td className="border-b border-white/10 px-3 py-2 text-white/70">
                      {b.stage ? (
                        <span className={amplifyStageBadgeClass(b.stage)}>
                            {b.stage.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-white/45">—</span>
                      )}
                    </td>
                    <td className="border-b border-white/10 px-3 py-2 text-white/70">
                      {b.lastJobStatus ? (
                        b.lastJobUrl ? (
                          <Link
                            className={`${amplifyJobStatusBadgeClass(b.lastJobStatus)} hover:underline`}
                            href={b.lastJobUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={
                              b.lastJobStartedAt
                                ? `Job ${b.lastJobId ?? ''} · ${formatUpdatedAt(b.lastJobStartedAt)}`
                                : `Job ${b.lastJobId ?? ''}`
                            }
                          >
                            {amplifyJobStatusLabel(b.lastJobStatus)}
                          </Link>
                        ) : (
                          <span
                            className={amplifyJobStatusBadgeClass(b.lastJobStatus)}
                            title={b.lastJobId ?? undefined}
                          >
                            {amplifyJobStatusLabel(b.lastJobStatus)}
                          </span>
                        )
                      ) : (
                        <span className="text-white/45">—</span>
                      )}
                    </td>
                    <td className="border-b border-white/10 px-3 py-2 text-white/70">
                      {b.enableAutoBuild ? (
                        <span className="text-emerald-200/90">on</span>
                      ) : (
                        <span className="text-white/45">off</span>
                      )}
                    </td>
                    <td className="border-b border-white/10 px-3 py-2 text-white/70">
                      {formatUpdatedAt(b.lastUpdatedAt)}
                    </td>
                    {showClickupCol ? (
                      <td className="border-b border-white/10 px-3 py-2 text-white/70">
                        {b.clickupTaskStatus ? (
                          b.clickupTaskUrl ? (
                            <Link
                              className={`${clickupStatusBadgeClass(b.clickupTaskStatus)} hover:underline`}
                              href={b.clickupTaskUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={
                                b.clickupTaskId
                                  ? `ClickUp ${b.clickupTaskId}${b.clickupTaskName ? ` · ${b.clickupTaskName}` : ''}`
                                  : 'Open ClickUp task'
                              }
                            >
                              {b.clickupTaskStatus}
                            </Link>
                          ) : (
                            <span
                              className={clickupStatusBadgeClass(b.clickupTaskStatus)}
                              title={b.clickupTaskId ?? undefined}
                            >
                              {b.clickupTaskStatus}
                            </span>
                          )
                        ) : b.clickupTaskId ? (
                          <span className="font-mono text-xs text-white/45" title="No ClickUp status yet">
                            {b.clickupTaskId}
                          </span>
                        ) : (
                          <span className="text-white/45">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="border-b border-white/10 px-3 py-2 text-white/70">
                      {b.previewUrl ? (
                        <Link
                          className="text-sky-200/90 underline-offset-2 hover:underline"
                          href={b.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </Link>
                      ) : (
                        <span className="text-white/45">—</span>
                      )}
                    </td>
                    <td className="border-b border-white/10 px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn text-xs"
                          disabled={busy}
                          onClick={() => void onHost(b.branchName, 'row')}
                        >
                          {hosting === b.branchName ? 'Redeploying…' : 'Redeploy'}
                        </button>
                        {admin ? (
                          <button
                            type="button"
                            className="btn border-rose-200/30 bg-rose-200/10 text-xs text-rose-100 hover:bg-rose-200/15 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={busy}
                            onClick={() => void onDelete(b.branchName, b.stage)}
                          >
                            {deleting === b.branchName ? 'Deleting…' : 'Delete branch'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {payload && filtered && filtered.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-3 text-white/70">
                      {hasSearch
                        ? 'No branches match the current search.'
                        : 'No visible Amplify branches. Hidden names are listed in Settings.'}
                    </td>
                  </tr>
                ) : null}
              </ClientTable>
            </>
          ) : null}

          {!payload && !error ? (
            <p className="text-sm text-white/70">Loading…</p>
          ) : null}
        </div>

        <Modal open={hostOpen} title="Host branch" onClose={closeHostModal}>
          <p className="text-xs text-[#8b919a]">
            Starts an Amplify build from the current git HEAD — no push. If the branch is not
            hosted yet, this creates it (<span className="font-mono">create-branch</span>); if it
            already exists, this runs <span className="font-mono">start-job --job-type RELEASE</span>.
          </p>
          {hostError ? <div className="alert-error mt-3">{hostError}</div> : null}
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onHost(hostName, 'form');
            }}
          >
            <div>
              <label className="mb-1.5 block text-sm text-[#b8bcc4]" htmlFor="amplify-host-branch">
                Git branch name
              </label>
              <input
                id="amplify-host-branch"
                className="input w-full font-mono"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="proj-1024"
                disabled={!!hosting}
                autoComplete="off"
                autoFocus
              />
            </div>
            {slotsFull ? (
              <p className="text-xs text-amber-200/80">
                No free Amplify slots — you can still redeploy an existing hosted branch.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn"
                disabled={!!hosting}
                onClick={closeHostModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-success"
                disabled={!!hosting || !hostName.trim()}
              >
                {hosting && hosting === hostName.trim() ? 'Hosting…' : 'Host branch'}
              </button>
            </div>
          </form>
        </Modal>
      </PageContainer>
    </RequireAuth>
  );
}
