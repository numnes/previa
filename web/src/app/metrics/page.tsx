'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NodeBadge } from '@/components/NodeBadge';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { AUTO_RELOAD_INTERVAL_MS, ReloadButton } from '@/components/ReloadButton';
import { RequireAuth } from '@/components/RequireAuth';
import {
  fetchHostMetrics,
  fetchNetworkMetrics,
  type AggregatedHostMetrics,
  type AggregatedNetworkRequests,
  type HostMetricPoint,
} from './::handlers/metrics';

const NODE_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'];

function formatTick(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mergeChartRows(
  series: AggregatedHostMetrics['series'],
  metric: keyof Pick<HostMetricPoint, 'cpuLoadPct' | 'memUsedPct' | 'diskUsedPct'>,
): Array<Record<string, string | number>> {
  const byAt = new Map<string, Record<string, string | number>>();
  for (const s of series) {
    const key = s.nodeLabel || s.nodeId;
    for (const p of s.points) {
      const row = byAt.get(p.at) ?? { at: p.at };
      row[key] = p[metric];
      byAt.set(p.at, row);
    }
  }
  return [...byAt.values()].sort((a, b) =>
    String(a.at).localeCompare(String(b.at)),
  );
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

const NETWORK_PAGE_SIZE = 50;

export default function MetricsPage() {
  const [host, setHost] = useState<AggregatedHostMetrics | null>(null);
  const [network, setNetwork] = useState<AggregatedNetworkRequests | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeNode, setActiveNode] = useState<string | 'all'>('all');
  const [networkPage, setNetworkPage] = useState(1);
  const [networkLoading, setNetworkLoading] = useState(false);

  const loadHost = useCallback(async () => {
    const h = await fetchHostMetrics(7);
    setHost(h);
  }, []);

  const loadNetwork = useCallback(async (page: number) => {
    setNetworkLoading(true);
    try {
      const n = await fetchNetworkMetrics({
        page,
        pageSize: NETWORK_PAGE_SIZE,
      });
      setNetwork(n);
      setNetworkPage(n.page);
    } finally {
      setNetworkLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      await Promise.all([loadHost(), loadNetwork(networkPage)]);
    } catch {
      setErr('Could not load metrics.');
    }
  }, [loadHost, loadNetwork, networkPage]);

  useEffect(() => {
    setErr(null);
    void loadHost().catch(() => setErr('Could not load metrics.'));
  }, [loadHost]);

  useEffect(() => {
    setErr(null);
    void loadNetwork(networkPage).catch(() =>
      setErr('Could not load network page.'),
    );
  }, [loadNetwork, networkPage]);

  const visibleSeries = useMemo(() => {
    if (!host) return [];
    if (activeNode === 'all') return host.series;
    return host.series.filter((s) => s.nodeId === activeNode);
  }, [host, activeNode]);

  const cpuRows = useMemo(
    () => mergeChartRows(visibleSeries, 'cpuLoadPct'),
    [visibleSeries],
  );
  const memRows = useMemo(
    () => mergeChartRows(visibleSeries, 'memUsedPct'),
    [visibleSeries],
  );
  const diskRows = useMemo(
    () => mergeChartRows(visibleSeries, 'diskUsedPct'),
    [visibleSeries],
  );

  const nodeKeys = visibleSeries.map((s) => s.nodeLabel || s.nodeId);

  return (
    <RequireAuth>
      <PageContainer>
        <PageHeader
          title="Metrics"
          subtitle="Host CPU, memory, and disk for the last 7 days, plus recent preview traffic."
          action={
            <ReloadButton
              onReload={load}
              title="Reload metrics"
              intervalMs={AUTO_RELOAD_INTERVAL_MS}
            />
          }
        />
        {err ? <div className="alert-error mb-4">{err}</div> : null}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Link href="/" className="btn text-sm">
            ← Dashboard
          </Link>
          {host?.series.map((s) => (
            <button
              key={s.nodeId}
              type="button"
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                activeNode === s.nodeId
                  ? 'border-sky-400/50 bg-sky-950/40 text-sky-100'
                  : 'border-white/10 bg-black/20 text-white/70 hover:border-white/20'
              }`}
              onClick={() =>
                setActiveNode((prev) => (prev === s.nodeId ? 'all' : s.nodeId))
              }
            >
              <NodeBadge node={s} />
            </button>
          ))}
          {activeNode !== 'all' ? (
            <button
              type="button"
              className="text-xs text-white/55 underline"
              onClick={() => setActiveNode('all')}
            >
              Show all nodes
            </button>
          ) : null}
        </div>

        <div className="grid gap-5">
          <MetricChartCard
            title="CPU load %"
            subtitle="loadavg1 / cores × 100 (capped at 100)"
            data={cpuRows}
            keys={nodeKeys}
          />
          <MetricChartCard
            title="Memory %"
            subtitle="Used RAM over the last 7 days"
            data={memRows}
            keys={nodeKeys}
          />
          <MetricChartCard
            title="Disk %"
            subtitle="Used disk on PREVIA_WORK_ROOT (or /)"
            data={diskRows}
            keys={nodeKeys}
          />

          <div className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#e8eaed]">
                  Network requests
                </h2>
                <p className="mt-1 text-sm text-[#8b919a]">
                  From preview nginx access logs (last 7 days). Payload is the
                  query string when present — request bodies are not in access
                  logs. Region is Local for private IPs; install{' '}
                  <code className="text-xs">geoip-lite</code> on the API for
                  public GeoIP.
                </p>
              </div>
              {network ? (
                <p className="text-xs tabular-nums text-white/55">
                  {network.total.toLocaleString()} requests · page{' '}
                  {network.page} / {network.totalPages}
                </p>
              ) : null}
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-white/55">
                    <th className="px-2 py-2 font-medium">When</th>
                    <th className="px-2 py-2 font-medium">Node</th>
                    <th className="px-2 py-2 font-medium">IP</th>
                    <th className="px-2 py-2 font-medium">Region</th>
                    <th className="px-2 py-2 font-medium">Endpoint</th>
                    <th className="px-2 py-2 font-medium">Payload</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Preview</th>
                  </tr>
                </thead>
                <tbody>
                  {(network?.items ?? []).length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-2 py-6 text-center text-white/45"
                      >
                        {networkLoading
                          ? 'Loading…'
                          : network
                            ? 'No requests in the last 7 days. Traffic appears after the next collect cycle reads activity logs.'
                            : 'Loading…'}
                      </td>
                    </tr>
                  ) : (
                    network!.items.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-white/5 text-[#c8ccd4]"
                      >
                        <td className="whitespace-nowrap px-2 py-2 text-xs tabular-nums text-white/60">
                          {formatTick(row.at)}
                        </td>
                        <td className="px-2 py-2 text-xs">{row.nodeLabel}</td>
                        <td className="px-2 py-2 font-mono text-xs">{row.ip}</td>
                        <td className="px-2 py-2 text-xs">
                          {row.region ?? '—'}
                        </td>
                        <td className="max-w-[240px] px-2 py-2 font-mono text-xs">
                          <span className="text-white/45">{row.method}</span>{' '}
                          {truncate(row.endpoint, 80)}
                        </td>
                        <td className="max-w-[200px] px-2 py-2 font-mono text-xs text-white/55">
                          {truncate(row.payload, 60)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-xs">
                          {row.statusCode}
                        </td>
                        <td className="px-2 py-2 text-xs text-white/55">
                          {row.projectSlug && row.branchSlug
                            ? `${row.projectSlug}/${row.branchSlug}`
                            : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {network && network.totalPages > 1 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="btn text-sm disabled:opacity-40"
                  disabled={networkLoading || network.page <= 1}
                  onClick={() => setNetworkPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <span className="text-xs tabular-nums text-white/55">
                  Showing{' '}
                  {(network.page - 1) * network.pageSize + 1}–
                  {Math.min(
                    network.page * network.pageSize,
                    network.total,
                  )}{' '}
                  of {network.total.toLocaleString()}
                </span>
                <button
                  type="button"
                  className="btn text-sm disabled:opacity-40"
                  disabled={
                    networkLoading || network.page >= network.totalPages
                  }
                  onClick={() =>
                    setNetworkPage((p) =>
                      Math.min(network.totalPages, p + 1),
                    )
                  }
                >
                  Next →
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </PageContainer>
    </RequireAuth>
  );
}

function MetricChartCard({
  title,
  subtitle,
  data,
  keys,
}: {
  title: string;
  subtitle: string;
  data: Array<Record<string, string | number>>;
  keys: string[];
}) {
  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-[#e8eaed]">{title}</h2>
      <p className="mt-1 text-sm text-[#8b919a]">{subtitle}</p>
      <div className="mt-4 h-64 w-full">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-white/45">
            No samples yet — collection runs every minute.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="at"
                tickFormatter={formatTick}
                minTickGap={40}
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#6b7280"
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: '#1f2124',
                  border: '1px solid #3d4048',
                  borderRadius: 8,
                }}
                labelFormatter={(v) => formatTick(String(v))}
              />
              <Legend />
              {keys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={NODE_COLORS[i % NODE_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
