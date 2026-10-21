import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import type { DashboardSummary } from '../dashboard/dashboard.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { Project } from '../entities/project.entity';
import { ClusterNode } from '../entities/cluster-node.entity';
import type {
  HostMetricsHistory,
  NetworkRequestRow,
  NetworkRequestsPage,
} from '../metrics/metrics.service';
import { MetricsService } from '../metrics/metrics.service';
import type { InstanceListItem } from '../preview-instances/preview-instances.service';
import { PreviewInstancesService } from '../preview-instances/preview-instances.service';
import { ProjectsService } from '../projects/projects.service';
import type { ResourceListItem } from '../resources/resources.service';
import { ResourcesService } from '../resources/resources.service';
import { ClusterNodesService } from '../cluster-nodes/cluster-nodes.service';
import { ClusterNodeInfoService } from './cluster-node-info.service';
import {
  AggregatedDashboardSummary,
  encodeRemoteId,
  LOCAL_NODE_ID,
  parseRemoteId,
  type NodeRef,
  type WithNode,
} from './cluster.types';

const CLUSTER_HEADER = 'x-previa-cluster-key';
const FETCH_TIMEOUT_MS = 12_000;

export type AggregatedHostMetrics = {
  retentionDays: number;
  from: string;
  to: string;
  series: Array<
    NodeRef & {
      points: HostMetricsHistory['points'];
    }
  >;
};

export type AggregatedNetworkRequests = {
  retentionDays: number;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: Array<NetworkRequestRow & { nodeId: string; nodeLabel: string }>;
};

@Injectable()
export class ClusterAggregatorService {
  private readonly log = new Logger(ClusterAggregatorService.name);

  constructor(
    private readonly nodeInfo: ClusterNodeInfoService,
    private readonly nodes: ClusterNodesService,
    private readonly dashboard: DashboardService,
    private readonly projects: ProjectsService,
    private readonly previewInstances: PreviewInstancesService,
    @Inject(forwardRef(() => MetricsService))
    private readonly metrics: MetricsService,
    @Inject(forwardRef(() => ResourcesService))
    private readonly resources: ResourcesService,
  ) {}

  private async clusterFetch<T>(
    node: ClusterNode,
    path: string,
    init?: { method?: string; body?: unknown; timeoutMs?: number },
  ): Promise<T> {
    const url = `${node.baseUrl.replace(/\/+$/, '')}${path}`;
    const hasBody = init?.body !== undefined;
    const apiKey = await this.nodes.getPlainApiKey(node);
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      headers: {
        [CLUSTER_HEADER]: apiKey,
        'x-deployer-cluster-key': apiKey,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(init?.timeoutMs ?? FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private remoteRef(node: ClusterNode): NodeRef {
    return {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeBaseUrl: node.baseUrl,
      isLocal: false,
      online: true,
      canWrite: node.scope === 'write',
    };
  }

  private tag<T extends object>(
    item: T,
    node: NodeRef,
    idOverride?: string,
  ): WithNode<T> & { id?: string } {
    return {
      ...item,
      ...(idOverride ? { id: idOverride } : {}),
      nodeId: node.nodeId,
      nodeLabel: node.nodeLabel,
      nodeBaseUrl: node.nodeBaseUrl,
      isLocal: node.isLocal,
      online: node.online ?? true,
      canWrite: node.canWrite ?? node.isLocal,
    };
  }

  async tagLocal<T extends object>(item: T): Promise<WithNode<T>> {
    const local = await this.nodeInfo.getLocalNodeRef();
    return this.tag(item, local);
  }

  async testRemoteNode(node: ClusterNode) {
    try {
      const info = await this.clusterFetch<{
        nodeLabel: string;
        baseUrl: string | null;
        scope?: 'read' | 'write';
      }>(node, '/cluster/node-info');
      return {
        ok: true as const,
        nodeLabel: info.nodeLabel,
        baseUrl: info.baseUrl,
        scope: info.scope ?? 'read',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    }
  }

  async aggregateProjects(): Promise<WithNode<Project>[]> {
    const local = await this.nodeInfo.getLocalNodeRef();
    const localRows = (await this.projects.findAll()).map((p) =>
      this.tag(p, local),
    );

    const remotes = await this.nodes.findEnabled();
    const remoteRows: WithNode<Project>[] = [];
    for (const node of remotes) {
      const ref = this.remoteRef(node);
      try {
        const rows = await this.clusterFetch<Project[]>(node, '/cluster/projects');
        for (const p of rows) {
          remoteRows.push(this.tag(p, ref, encodeRemoteId(node.id, p.id)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster projects ${node.label}: ${msg}`);
        ref.online = false;
      }
    }
    return [...localRows, ...remoteRows].sort((a, b) =>
      `${a.nodeLabel}:${a.slug}`.localeCompare(`${b.nodeLabel}:${b.slug}`),
    );
  }

  async aggregateInstances(): Promise<WithNode<InstanceListItem>[]> {
    const local = await this.nodeInfo.getLocalNodeRef();
    const maps = await this.previewInstances.fetchRuntimeMaps();
    const localRows = (await this.previewInstances.findAllForApi(maps)).map((i) =>
      this.tag(i, local),
    );

    const remotes = await this.nodes.findEnabled();
    const remoteRows: WithNode<InstanceListItem>[] = [];
    for (const node of remotes) {
      const ref = this.remoteRef(node);
      try {
        const rows = await this.clusterFetch<InstanceListItem[]>(
          node,
          '/cluster/instances',
        );
        for (const i of rows) {
          remoteRows.push(this.tag(i, ref, encodeRemoteId(node.id, i.id)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster instances ${node.label}: ${msg}`);
        ref.online = false;
      }
    }
    return [...localRows, ...remoteRows].sort((a, b) =>
      `${a.nodeLabel}:${a.projectSlug}:${a.branch}`.localeCompare(
        `${b.nodeLabel}:${b.projectSlug}:${b.branch}`,
      ),
    );
  }

  async aggregateDashboard(): Promise<AggregatedDashboardSummary> {
    const local = await this.nodeInfo.getLocalNodeRef();
    const localSummary = await this.dashboard.summary();

    const hosts: AggregatedDashboardSummary['hosts'] = [
      { ...local, host: localSummary.host },
    ];
    const nodes: NodeRef[] = [local];
    let maxActiveInstances = localSummary.maxActiveInstances;
    const instancesByStatus: Record<string, number> = {
      ...localSummary.instancesByStatus,
    };
    let recentProjects = localSummary.recentProjects.map((p) => ({
      ...p,
      nodeId: LOCAL_NODE_ID,
      nodeLabel: local.nodeLabel,
    }));
    let recentStatusChanges = localSummary.recentStatusChanges.map((e) => ({
      ...e,
      nodeId: LOCAL_NODE_ID,
      nodeLabel: local.nodeLabel,
    }));
    let deployQueue = (localSummary.deployQueue ?? []).map((item) => ({
      ...item,
      nodeId: LOCAL_NODE_ID,
      nodeLabel: local.nodeLabel,
    }));

    const remotes = await this.nodes.findEnabled();
    for (const node of remotes) {
      const ref = this.remoteRef(node);
      try {
        const summary = await this.clusterFetch<DashboardSummary>(
          node,
          '/cluster/summary',
        );
        nodes.push(ref);
        hosts.push({ ...ref, host: summary.host });
        maxActiveInstances += summary.maxActiveInstances;
        for (const [status, count] of Object.entries(summary.instancesByStatus)) {
          instancesByStatus[status] = (instancesByStatus[status] ?? 0) + count;
        }
        recentProjects = [
          ...recentProjects,
          ...summary.recentProjects.map((p) => ({
            ...p,
            nodeId: node.id,
            nodeLabel: node.label,
          })),
        ];
        recentStatusChanges = [
          ...recentStatusChanges,
          ...summary.recentStatusChanges.map((e) => ({
            ...e,
            nodeId: node.id,
            nodeLabel: node.label,
            instanceId: encodeRemoteId(node.id, e.instanceId),
          })),
        ];
        deployQueue = [
          ...deployQueue,
          ...(summary.deployQueue ?? []).map((item) => ({
            ...item,
            id: encodeRemoteId(node.id, item.id),
            nodeId: node.id,
            nodeLabel: node.label,
          })),
        ];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster summary ${node.label}: ${msg}`);
        nodes.push({ ...ref, online: false });
        hosts.push({
          ...ref,
          online: false,
          host: {
            cpu: { cores: 0, loadavg1: 0, loadavg5: 0, loadavg15: 0 },
            memory: {
              totalBytes: 0,
              freeBytes: 0,
              usedBytes: 0,
              usedPct: 0,
            },
            disk: {
              path: '—',
              totalBytes: 0,
              freeBytes: 0,
              usedBytes: 0,
              usedPct: 0,
            },
          },
        });
      }
    }

    recentProjects.sort(
      (a, b) =>
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
    recentProjects = recentProjects.slice(0, 12);

    recentStatusChanges.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    recentStatusChanges = recentStatusChanges.slice(0, 20);

    deployQueue.sort(
      (a, b) =>
        new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime(),
    );

    return {
      maxActiveInstances,
      instancesByStatus,
      deployQueue,
      recentProjects,
      host: localSummary.host,
      hosts,
      nodes,
      recentStatusChanges,
    };
  }

  async getRemoteInstance(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const found = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}`,
    ).catch(() => null);
    if (!found) {
      throw new NotFoundException('Instância remota não encontrada');
    }
    return this.tag(found, ref, encodeRemoteId(node.id, found.id));
  }

  async pauseRemoteInstance(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/pause`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async activateRemoteInstance(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/activate`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async awakeRemoteInstance(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/awake`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async cancelRemoteDeploy(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/cancel-deploy`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async forceRestartRemoteDeploy(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<InstanceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<InstanceListItem>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/force-redeploy`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async removeRemoteInstance(
    nodeId: string,
    remoteId: string,
  ): Promise<{ ok: true }> {
    const node = await this.nodes.findById(nodeId);
    await this.clusterFetch<{ ok: true }>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/remove`,
      { method: 'POST' },
    );
    return { ok: true };
  }

  async remoteInstanceLogs(
    nodeId: string,
    remoteId: string,
    lines: number,
  ): Promise<{ pm2Name: string; lines: number; output: string }> {
    const node = await this.nodes.findById(nodeId);
    const safeLines = Math.min(Math.max(lines, 10), 2000);
    return this.clusterFetch<{ pm2Name: string; lines: number; output: string }>(
      node,
      `/cluster/instances/${encodeURIComponent(remoteId)}/logs?lines=${safeLines}`,
    );
  }

  parseRemoteInstanceId(id: string) {
    return parseRemoteId(id);
  }

  async aggregateHostMetrics(days = 7): Promise<AggregatedHostMetrics> {
    const local = await this.nodeInfo.getLocalNodeRef();
    const localHistory = await this.metrics.getHostHistory(days);
    const series: AggregatedHostMetrics['series'] = [
      {
        ...local,
        points: localHistory.points,
      },
    ];

    const remotes = await this.nodes.findEnabled();
    for (const node of remotes) {
      const ref = this.remoteRef(node);
      try {
        const history = await this.clusterFetch<HostMetricsHistory>(
          node,
          `/cluster/metrics/host?days=${encodeURIComponent(String(days))}`,
        );
        series.push({ ...ref, points: history.points ?? [] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster host metrics ${node.label}: ${msg}`);
        series.push({ ...ref, online: false, points: [] });
      }
    }

    return {
      retentionDays: 7,
      from: localHistory.from,
      to: localHistory.to,
      series,
    };
  }

  async aggregateNetworkRequests(opts?: {
    page?: number;
    pageSize?: number;
  }): Promise<AggregatedNetworkRequests> {
    const page = Math.max(1, Math.floor(opts?.page ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Math.floor(opts?.pageSize ?? 50) || 50),
    );
    const local = await this.nodeInfo.getLocalNodeRef();
    const remotes = await this.nodes.findEnabled();

    type Tagged = NetworkRequestRow & { nodeId: string; nodeLabel: string };

    if (remotes.length === 0) {
      const localPage = await this.metrics.listNetworkRequests({
        page,
        pageSize,
      });
      return {
        retentionDays: 7,
        from: localPage.from,
        to: localPage.to,
        page: localPage.page,
        pageSize: localPage.pageSize,
        total: localPage.total,
        totalPages: localPage.totalPages,
        items: localPage.items.map((item) => ({
          ...item,
          nodeId: LOCAL_NODE_ID,
          nodeLabel: local.nodeLabel,
        })),
      };
    }

    // Cada nó devolve os top (page*pageSize); o merge global mantém a página correta.
    const fetchSize = Math.min(5000, page * pageSize);
    const localPage = await this.metrics.listNetworkRequests({
      page: 1,
      pageSize: fetchSize,
      maxPageSize: 5000,
    });

    let merged: Tagged[] = localPage.items.map((item) => ({
      ...item,
      nodeId: LOCAL_NODE_ID,
      nodeLabel: local.nodeLabel,
    }));
    let total = localPage.total;

    for (const node of remotes) {
      try {
        const remotePage = await this.clusterFetch<NetworkRequestsPage>(
          node,
          `/cluster/metrics/network?page=1&pageSize=${encodeURIComponent(String(fetchSize))}`,
        );
        total += remotePage.total ?? 0;
        merged = [
          ...merged,
          ...(remotePage.items ?? []).map((item) => ({
            ...item,
            id: `${node.id}:${item.id}`,
            nodeId: node.id,
            nodeLabel: node.label,
          })),
        ];
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster network metrics ${node.label}: ${msg}`);
      }
    }

    merged.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      retentionDays: 7,
      from: localPage.from,
      to: localPage.to,
      page,
      pageSize,
      total,
      totalPages,
      items: merged.slice(start, start + pageSize),
    };
  }

  async aggregateResources(): Promise<WithNode<ResourceListItem>[]> {
    const local = await this.nodeInfo.getLocalNodeRef();
    const localRows = (await this.resources.listLocalForApi()).map((r) =>
      this.tag(r, local),
    );
    const remotes = await this.nodes.findEnabled();
    const remoteRows: WithNode<ResourceListItem>[] = [];
    for (const node of remotes) {
      const ref = this.remoteRef(node);
      try {
        const rows = await this.clusterFetch<ResourceListItem[]>(
          node,
          '/cluster/resources',
        );
        for (const r of rows) {
          remoteRows.push(this.tag(r, ref, encodeRemoteId(node.id, r.id)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`cluster resources ${node.label}: ${msg}`);
        ref.online = false;
      }
    }
    return [...localRows, ...remoteRows].sort((a, b) =>
      `${a.nodeLabel}:${a.slug}`.localeCompare(`${b.nodeLabel}:${b.slug}`),
    );
  }

  async getRemoteResource(
    nodeId: string,
    remoteId: string,
  ): Promise<WithNode<ResourceListItem>> {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const found = await this.clusterFetch<ResourceListItem>(
      node,
      `/cluster/resources/${encodeURIComponent(remoteId)}`,
    ).catch(() => null);
    if (!found) throw new NotFoundException('Recurso remoto não encontrado');
    return this.tag(found, ref, encodeRemoteId(node.id, found.id));
  }

  async startRemoteResource(nodeId: string, remoteId: string) {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<ResourceListItem>(
      node,
      `/cluster/resources/${encodeURIComponent(remoteId)}/start`,
      { method: 'POST', timeoutMs: 180_000 },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async stopRemoteResource(nodeId: string, remoteId: string) {
    const node = await this.nodes.findById(nodeId);
    const ref = this.remoteRef(node);
    const updated = await this.clusterFetch<ResourceListItem>(
      node,
      `/cluster/resources/${encodeURIComponent(remoteId)}/stop`,
      { method: 'POST' },
    );
    return this.tag(updated, ref, encodeRemoteId(node.id, updated.id));
  }

  async removeRemoteResource(nodeId: string, remoteId: string) {
    const node = await this.nodes.findById(nodeId);
    await this.clusterFetch<{ ok: true }>(
      node,
      `/cluster/resources/${encodeURIComponent(remoteId)}/remove`,
      { method: 'POST' },
    );
    return { ok: true as const };
  }

  async remoteResourceLogs(nodeId: string, remoteId: string, lines: number) {
    const node = await this.nodes.findById(nodeId);
    const safeLines = Math.min(Math.max(lines, 10), 2000);
    return this.clusterFetch<{
      runtimeName: string;
      lines: number;
      output: string;
    }>(
      node,
      `/cluster/resources/${encodeURIComponent(remoteId)}/logs?lines=${safeLines}`,
    );
  }
}
