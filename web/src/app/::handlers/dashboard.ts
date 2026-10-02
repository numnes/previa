import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';
import type { NodeRef } from '@/lib/node-ref';

export type HostStats = {
  cpu: { cores: number; loadavg1: number; loadavg5: number; loadavg15: number };
  memory: { totalBytes: number; freeBytes: number; usedBytes: number; usedPct: number };
  disk: { path: string; totalBytes: number; freeBytes: number; usedBytes: number; usedPct: number };
};

export type DeployQueueEntry = {
  id: string;
  projectSlug: string;
  branch: string;
  waitingSince: string;
  nodeId?: string;
  nodeLabel?: string;
};

export type DashboardSummary = {
  maxActiveInstances: number;
  instancesByStatus: Record<string, number>;
  deployQueue?: DeployQueueEntry[];
  recentProjects: {
    slug: string;
    lastActivityAt: string;
    nodeId: string;
    nodeLabel: string;
  }[];
  host: HostStats;
  hosts: Array<NodeRef & { host: HostStats }>;
  nodes: NodeRef[];
  recentStatusChanges: {
    at: string;
    instanceId: string;
    projectSlug: string;
    branch: string;
    from: string | null;
    to: string;
    nodeId: string;
    nodeLabel: string;
  }[];
};

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const token = getTokenClient();
  return await httpJson<DashboardSummary>(
    `${apiBaseClient()}/dashboard/summary`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}
