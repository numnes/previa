import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';
import type { NodeRef } from '@/lib/node-ref';

export type HostMetricPoint = {
  at: string;
  cpuLoadPct: number;
  loadavg1: number;
  loadavg5: number;
  loadavg15: number;
  memUsedPct: number;
  diskUsedPct: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  cpuCores: number;
};

export type AggregatedHostMetrics = {
  retentionDays: number;
  from: string;
  to: string;
  series: Array<NodeRef & { points: HostMetricPoint[] }>;
};

export type NetworkRequestRow = {
  id: string;
  at: string;
  ip: string;
  method: string;
  endpoint: string;
  payload: string | null;
  statusCode: number;
  region: string | null;
  userAgent: string | null;
  projectSlug: string | null;
  branchSlug: string | null;
  nodeId: string;
  nodeLabel: string;
};

export type AggregatedNetworkRequests = {
  retentionDays: number;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: NetworkRequestRow[];
};

export async function fetchHostMetrics(days = 7): Promise<AggregatedHostMetrics> {
  const token = getTokenClient();
  return httpJson<AggregatedHostMetrics>(
    `${apiBaseClient()}/metrics/host?days=${days}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function fetchNetworkMetrics(opts?: {
  page?: number;
  pageSize?: number;
}): Promise<AggregatedNetworkRequests> {
  const token = getTokenClient();
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 50;
  const qs = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return httpJson<AggregatedNetworkRequests>(
    `${apiBaseClient()}/metrics/network?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}
