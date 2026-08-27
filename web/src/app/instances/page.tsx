'use client';

import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { NodeBadge } from '@/components/NodeBadge';
import { RequireAuth } from '@/components/RequireAuth';
import { ClientTable } from '@/components/ClientTable';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { listInstances, runnerLabel, type InstanceRow } from './::handlers/instances';
import { InstanceLifetimeCell } from './InstanceLifetimeCell';
import { formatInstanceCpu, instanceCpuTitle } from '@/lib/instance-monit';
import {
  clickupStatusBadgeClass,
  instanceStatusBadgeClass,
} from '@/lib/status-badge';

const INSTANCE_STATUSES = ['waiting', 'deploying', 'active', 'paused', 'error'] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'deploying', label: 'Deploying' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'error', label: 'Error' },
] as const;

function normalizeStatus(value: string | null): string {
  if (!value || !(INSTANCE_STATUSES as readonly string[]).includes(value)) return '';
  return value;
}

export default function InstancesPage() {
  return (
    <Suspense
      fallback={
        <RequireAuth>
          <PageContainer>
            <PageHeader
              title="Instances"
              subtitle="Persisted in the database; active status comes from PM2 on the host. Click a row for details and logs."
            />
            <div className="card p-5">
              <p className="text-sm text-white/70">Loading…</p>
            </div>
          </PageContainer>
        </RequireAuth>
      }
    >
      <InstancesPageContent />
    </Suspense>
  );
}

function InstancesPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [instances, setInstances] = useState<InstanceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState(() =>
    normalizeStatus(searchParams.get('status')),
  );

  useEffect(() => {
    setSearch(searchParams.get('q') ?? '');
    setStatusFilter(normalizeStatus(searchParams.get('status')));
  }, [searchParams]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await listInstances();
      setInstances(data);
    } catch {
      setError('Could not load instances.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function syncUrl(nextSearch: string, nextStatus: string) {
    const params = new URLSearchParams();
    const q = nextSearch.trim();
    if (q) params.set('q', q);
    if (nextStatus) params.set('status', nextStatus);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    if (!instances) return null;
    const q = search.trim().toLowerCase();
    return instances.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${i.projectSlug} ${i.branch}`.toLowerCase();
      return hay.includes(q);
    });
  }, [instances, search, statusFilter]);

  const showClickupCol = useMemo(
    () =>
      !!instances?.some(
        (i) => i.clickupConfigured || !!i.clickupTaskStatus || !!i.clickupTaskId,
      ),
    [instances],
  );

  const colCount = showClickupCol ? 14 : 13;

  const hasFilters = search.trim().length > 0 || statusFilter.length > 0;

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Instances"
          subtitle="Persisted in the database; active status comes from PM2 on the host. Click a row for details and logs."
          action={<ReloadButton onReload={load} title="Reload instances" />}
        />
        <div className="card p-5">
          {error ? <div className="alert-error mb-4">{error}</div> : null}

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm text-[#b8bcc4]" htmlFor="instance-search">
                Project or branch
              </label>
              <input
                id="instance-search"
                className="input w-full"
                type="search"
                placeholder="Search by project or branch…"
                value={search}
                onChange={(e) => {
                  const next = e.target.value;
                  setSearch(next);
                  syncUrl(next, statusFilter);
                }}
              />
            </div>
            <div className="sm:w-48">
              <label className="mb-1.5 block text-sm text-[#b8bcc4]" htmlFor="instance-status">
                Status
              </label>
              <select
                id="instance-status"
                className="input w-full"
                value={statusFilter}
                onChange={(e) => {
                  const next = e.target.value;
                  setStatusFilter(next);
                  syncUrl(search, next);
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters ? (
              <button
                type="button"
                className="btn sm:mb-0.5"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  router.replace(pathname, { scroll: false });
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>

          {instances && hasFilters ? (
            <p className="mb-3 text-sm text-[#8b919a]">
              Showing {filtered?.length ?? 0} of {instances.length} instances
            </p>
          ) : null}

          <ClientTable
            head={
              <tr>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Project
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Node
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Branch
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Runner
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Runtime
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Port
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Status
                </th>
                {showClickupCol ? (
                  <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                    ClickUp
                  </th>
                ) : null}
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Lifetime
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Online
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Preview
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Runtime status
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  CPU %
                </th>
                <th className="border-b border-white/10 px-3 py-2 text-left font-semibold text-white/85">
                  Memory
                </th>
              </tr>
            }
          >
            {(filtered ?? []).map((i) => (
              <tr
                key={i.id}
                className="cursor-pointer hover:bg-white/[0.04]"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/instances/${i.id}`);
                  }
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  router.push(`/instances/${i.id}`);
                }}
              >
                <td className="border-b border-white/10 px-3 py-2 font-semibold">
                  {i.projectSlug}
                </td>
                <td className="border-b border-white/10 px-3 py-2">
                  <NodeBadge node={i} />
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {i.branch}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs">
                    {runnerLabel(i.runner)}
                  </span>
                </td>
                <td className="border-b border-white/10 px-3 py-2 font-mono text-xs text-white/70">
                  {i.runtimeName ?? i.pm2Name}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {i.port ?? '—'}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  <span
                    className={instanceStatusBadgeClass(i.status, {
                      idleSleep: !!i.idleSleep,
                    })}
                  >
                    {i.status}
                    {i.status === 'paused' && i.idleSleep ? ' · idle' : ''}
                  </span>
                  {i.status === 'error' && i.lastDeployError ? (
                    <p
                      className="mt-1 max-w-xs truncate font-mono text-xs text-rose-200/80"
                      title={i.lastDeployError}
                    >
                      {i.lastDeployError.split('\n')[0]}
                    </p>
                  ) : null}
                </td>
                {showClickupCol ? (
                  <td className="border-b border-white/10 px-3 py-2 text-white/70">
                    {i.clickupTaskStatus ? (
                      i.clickupTaskUrl ? (
                        <Link
                          className={`${clickupStatusBadgeClass(i.clickupTaskStatus)} hover:underline`}
                          href={i.clickupTaskUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={
                            i.clickupTaskId
                              ? `ClickUp ${i.clickupTaskId}`
                              : 'Open ClickUp task'
                          }
                          onClick={(e) => e.stopPropagation()}
                        >
                          {i.clickupTaskStatus}
                        </Link>
                      ) : (
                        <span
                          className={clickupStatusBadgeClass(i.clickupTaskStatus)}
                          title={i.clickupTaskId ?? undefined}
                        >
                          {i.clickupTaskStatus}
                        </span>
                      )
                    ) : (
                      <span className="text-white/45">—</span>
                    )}
                  </td>
                ) : null}
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  <InstanceLifetimeCell row={i} />
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {(i.runtimeOnline ?? i.pm2Online) ? (
                    <span className="text-emerald-200/90">yes</span>
                  ) : (
                    <span className="text-amber-200/90">no</span>
                  )}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {i.previewUrl ? (
                    <Link
                      className="text-sky-200/90 underline-offset-2 hover:underline"
                      href={i.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </Link>
                  ) : (
                    <span className="text-white/45">—</span>
                  )}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {i.runtimeStatus ?? i.pm2Status ?? '—'}
                </td>
                <td
                  className="border-b border-white/10 px-3 py-2 text-white/70"
                  title={
                    i.runner === 'docker' ? undefined : instanceCpuTitle(i.monit)
                  }
                >
                  {i.runner === 'docker' ? '—' : formatInstanceCpu(i.monit)}
                </td>
                <td className="border-b border-white/10 px-3 py-2 text-white/70">
                  {i.runner === 'docker'
                    ? '—'
                    : typeof i.monit?.memory === 'number'
                      ? `${Math.round(i.monit.memory / (1024 * 1024))} MB`
                      : '—'}
                </td>
              </tr>
            ))}
            {instances && filtered && filtered.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-3 text-white/70">
                  {hasFilters
                    ? 'No instances match the current filters.'
                    : 'No instances yet (they appear here after a successful deploy).'}
                </td>
              </tr>
            ) : null}
            {!instances && !error ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-3 text-white/70">
                  Loading…
                </td>
              </tr>
            ) : null}
          </ClientTable>
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
