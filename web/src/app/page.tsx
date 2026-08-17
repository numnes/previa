'use client';

import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { ReloadButton } from '@/components/ReloadButton';
import { NodeBadge } from '@/components/NodeBadge';
import { RequireAuth } from '@/components/RequireAuth';
import {
  IconCpu,
  IconDisk,
  IconMemory,
  IconStatusActive,
  IconStatusDeploying,
  IconStatusError,
  IconStatusPaused,
  IconStatusWaiting,
} from '@/components/icons';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { fetchDashboardSummary, type DashboardSummary, type HostStats } from './::handlers/dashboard';

const STATUS_ORDER = ['waiting', 'deploying', 'active', 'paused', 'error'] as const;

const STATUS_CONFIG: Record<
  (typeof STATUS_ORDER)[number],
  {
    label: string;
    icon: typeof IconStatusWaiting;
    card: string;
    border: string;
    iconColor: string;
    valueColor: string;
    labelColor: string;
  }
> = {
  waiting: {
    label: 'Waiting',
    icon: IconStatusWaiting,
    card: 'bg-sky-500/10',
    border: 'border-sky-500/25',
    iconColor: 'text-sky-400',
    valueColor: 'text-sky-300',
    labelColor: 'text-sky-400/80',
  },
  deploying: {
    label: 'Deploying',
    icon: IconStatusDeploying,
    card: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    iconColor: 'text-amber-400',
    valueColor: 'text-amber-300',
    labelColor: 'text-amber-400/80',
  },
  active: {
    label: 'Active',
    icon: IconStatusActive,
    card: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    iconColor: 'text-emerald-400',
    valueColor: 'text-emerald-300',
    labelColor: 'text-emerald-400/80',
  },
  paused: {
    label: 'Paused',
    icon: IconStatusPaused,
    card: 'bg-violet-500/10',
    border: 'border-violet-500/25',
    iconColor: 'text-violet-400',
    valueColor: 'text-violet-300',
    labelColor: 'text-violet-400/80',
  },
  error: {
    label: 'Error',
    icon: IconStatusError,
    card: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    iconColor: 'text-rose-400',
    valueColor: 'text-rose-300',
    labelColor: 'text-rose-400/80',
  },
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i === 0 ? 0 : i <= 2 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function usageTextColor(pct: number): string {
  if (pct >= 85) return 'text-rose-400';
  if (pct >= 65) return 'text-amber-400';
  return 'text-emerald-400';
}

function cpuLoadPct(loadavg1: number, cores: number): number {
  if (!cores || cores <= 0) return 0;
  return Math.min(100, Math.round((loadavg1 / cores) * 100));
}

function HostResourcesBlock({
  nodeLabel,
  isLocal,
  online,
  host,
}: {
  nodeLabel: string;
  isLocal: boolean;
  online?: boolean;
  host: HostStats;
}) {
  const cpuPct = cpuLoadPct(host.cpu.loadavg1, host.cpu.cores);
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-4">
      <div className="mb-3">
        <NodeBadge node={{ nodeLabel, isLocal, online }} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-white/55">
            <IconCpu className="h-4 w-4 text-sky-400/80" />
            CPU (loadavg)
          </div>
          <div className={`mt-2 text-lg font-semibold ${usageTextColor(cpuPct)}`}>
            {`${host.cpu.loadavg1.toFixed(2)} / ${host.cpu.loadavg5.toFixed(2)} / ${host.cpu.loadavg15.toFixed(2)}`}
          </div>
          <div className="mt-1 text-xs text-white/55">
            {`${host.cpu.cores} cores · ~${cpuPct}% load (1m)`}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-white/55">
            <IconMemory className="h-4 w-4 text-violet-400/80" />
            Memory
          </div>
          <div className={`mt-2 text-lg font-semibold ${usageTextColor(host.memory.usedPct)}`}>
            {`${host.memory.usedPct}%`}
          </div>
          <div className="mt-1 text-xs text-white/55">
            {`${formatBytes(host.memory.usedBytes)} / ${formatBytes(host.memory.totalBytes)}`}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-xs text-white/55">
            <IconDisk className="h-4 w-4 text-amber-400/80" />
            Disk ({host.disk.path})
          </div>
          <div className={`mt-2 text-lg font-semibold ${usageTextColor(host.disk.usedPct)}`}>
            {`${host.disk.usedPct}%`}
          </div>
          <div className="mt-1 text-xs text-white/55">
            {`${formatBytes(host.disk.usedBytes)} / ${formatBytes(host.disk.totalBytes)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await fetchDashboardSummary();
      setData(d);
    } catch {
      setErr('Could not load dashboard.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hosts = data?.hosts ?? [];

  const activeCount = data?.instancesByStatus.active ?? 0;
  const maxSlots = data?.maxActiveInstances ?? 0;
  const availableSlots = Math.max(0, maxSlots - activeCount);
  const slotUsagePct = maxSlots > 0 ? Math.round((activeCount / maxSlots) * 100) : 0;

  const slotPieData =
    data != null
      ? [
          { name: 'Active', value: activeCount, fill: '#34d399' },
          { name: 'Available', value: availableSlots, fill: '#4b5563' },
        ].filter((slice) => slice.value > 0)
      : [];

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Dashboard"
          subtitle="Host resources and preview activity across connected machines."
          action={<ReloadButton onReload={load} title="Reload dashboard" />}
        />
        {err ? <div className="alert-error mb-4">{err}</div> : null}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#e8eaed]">Server resources</h2>
            <p className="mt-1 text-sm text-[#8b919a]">
              CPU, memory, and disk per connected previa node.
            </p>
            <div className="mt-4 space-y-4">
              {hosts.length > 0 ? (
                hosts.map((h) => (
                  <HostResourcesBlock
                    key={h.nodeId}
                    nodeLabel={h.nodeLabel}
                    isLocal={h.isLocal}
                    online={h.online}
                    host={h.host}
                  />
                ))
              ) : (
                <p className="text-sm text-white/55">Loading…</p>
              )}
            </div>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#e8eaed]">Instances by status</h2>
            <p className="mt-1 text-sm text-[#8b919a]">
              Number of preview instances in each status across all projects.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {STATUS_ORDER.map((status) => {
                const cfg = STATUS_CONFIG[status];
                const Icon = cfg.icon;
                const count = data?.instancesByStatus[status] ?? 0;
                return (
                  <Link
                    key={status}
                    href={`/instances?status=${status}`}
                    className={`flex aspect-square flex-col items-center justify-center rounded-xl border p-3 transition hover:brightness-110 ${cfg.card} ${cfg.border}`}
                  >
                    <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                    <div className={`mt-2 text-2xl font-bold tabular-nums ${cfg.valueColor}`}>
                      {data != null ? count : '—'}
                    </div>
                    <div className={`mt-0.5 text-center text-[11px] font-medium ${cfg.labelColor}`}>
                      {cfg.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-[#e8eaed]">Active slot usage</h2>
            <p className="mt-1 text-sm text-[#8b919a]">
              {data != null ? (
                <>
                  <span className={`font-semibold ${usageTextColor(slotUsagePct)}`}>
                    {activeCount}
                  </span>{' '}
                  of{' '}
                  <span className="font-semibold text-white/90">{maxSlots}</span> slots in use (
                  {slotUsagePct}%).
                </>
              ) : (
                'Active instances vs configured capacity.'
              )}
            </p>
            <div className="mt-4 h-64">
              {data == null ? (
                <p className="text-sm text-white/55">Loading…</p>
              ) : maxSlots <= 0 ? (
                <p className="text-sm text-white/55">No active slot limit configured.</p>
              ) : slotPieData.length === 0 ? (
                <p className="text-sm text-white/55">No slot data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slotPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={80}
                      paddingAngle={slotPieData.length > 1 ? 2 : 0}
                      stroke="rgba(255,255,255,0.08)"
                    >
                      {slotPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: 'rgba(255,255,255,0.85)' }}
                      formatter={(value: number, name: string) => {
                        const pct = maxSlots > 0 ? Math.round((value / maxSlots) * 100) : 0;
                        return [`${value} (${pct}%)`, name];
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      formatter={(value) => (
                        <span className="text-sm text-white/70">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-base font-semibold text-[#e8eaed]">Recent project activity</h2>
            <p className="mt-1 text-sm text-[#8b919a]">
              Sorted by last instance update per project.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {(data?.recentProjects ?? []).map((p) => (
                <li
                  key={`${p.nodeId}:${p.slug}`}
                  className="flex justify-between gap-3 border-b border-white/10 pb-2 last:border-0"
                >
                  <span className="font-medium text-white/90">
                    {p.slug}{' '}
                    <span className="text-xs font-normal text-white/45">({p.nodeLabel})</span>
                  </span>
                  <span className="text-white/55">
                    {new Date(p.lastActivityAt).toLocaleString('en-US')}
                  </span>
                </li>
              ))}
              {data && data.recentProjects.length === 0 ? (
                <li className="text-white/50">No records.</li>
              ) : null}
            </ul>
          </div>

          <div className="card p-5 lg:col-span-2">
            <h2 className="text-base font-semibold text-[#e8eaed]">Recent status changes</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-white/10 px-2 py-2 text-left text-white/75">
                      When
                    </th>
                    <th className="border-b border-white/10 px-2 py-2 text-left text-white/75">
                      Node
                    </th>
                    <th className="border-b border-white/10 px-2 py-2 text-left text-white/75">
                      Project
                    </th>
                    <th className="border-b border-white/10 px-2 py-2 text-left text-white/75">
                      Branch
                    </th>
                    <th className="border-b border-white/10 px-2 py-2 text-left text-white/75">
                      From → To
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentStatusChanges ?? []).map((e, i) => (
                    <tr key={`${e.at}-${i}`}>
                      <td className="border-b border-white/10 px-2 py-2 text-white/65">
                        {new Date(e.at).toLocaleString('en-US')}
                      </td>
                      <td className="border-b border-white/10 px-2 py-2 text-white/70">
                        {e.nodeLabel}
                      </td>
                      <td className="border-b border-white/10 px-2 py-2 font-medium text-white/90">
                        {e.projectSlug}
                      </td>
                      <td className="border-b border-white/10 px-2 py-2 font-mono text-xs text-white/70">
                        {e.branch}
                      </td>
                      <td className="border-b border-white/10 px-2 py-2 text-white/75">
                        {e.from ?? '—'} → <span className="font-semibold">{e.to}</span>
                      </td>
                    </tr>
                  ))}
                  {data && data.recentStatusChanges.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-white/50">
                        No events yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </PageContainer>
    </RequireAuth>
  );
}
