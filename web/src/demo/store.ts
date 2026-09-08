import type { AuthUser } from '@/lib/client-auth';
import type { AmplifyBranchRow } from '@/app/amplify/::handlers/amplify';
import {
  buildDashboardSummary,
  createDemoAmplifyBranches,
  createDemoApiKeys,
  createDemoClusterKeys,
  createDemoClusterNodes,
  createDemoInstances,
  createDemoProjects,
  createDemoUsers,
  DEMO_AMPLIFY_APP_ID,
  type DemoInstance,
  type DemoProject,
} from './fixtures';
import type { ApiKeyRow } from '@/app/settings/::handlers/api-keys';
import type {
  ClusterKeyRow,
  ClusterNodeRow,
} from '@/app/settings/::handlers/cluster';
import type { UserRow } from '@/app/users/::handlers/users';
import type { DashboardSummary } from '@/app/::handlers/dashboard';

export type DemoStore = {
  users: UserRow[];
  projects: DemoProject[];
  instances: DemoInstance[];
  clusterKeys: ClusterKeyRow[];
  clusterNodes: ClusterNodeRow[];
  apiKeys: ApiKeyRow[];
  settings: {
    maxActiveInstances: number;
    nodeLabel: string;
    amplifyAppId: string;
    amplifyRegion: string;
    amplifyAccessKeyConfigured: boolean;
    amplifyAccessKeyLast4: string;
    amplifySecretConfigured: boolean;
    amplifyHiddenBranches: string[];
    amplifyMaxBranches: number;
  };
  amplifyBranches: AmplifyBranchRow[];
  sessionUser: AuthUser | null;
  logs: Record<string, string>;
};

function freshStore(): DemoStore {
  const projects = createDemoProjects();
  const instances = createDemoInstances(projects);
  return {
    users: createDemoUsers(),
    projects,
    instances,
    clusterKeys: createDemoClusterKeys(),
    clusterNodes: createDemoClusterNodes(),
    apiKeys: createDemoApiKeys(),
    settings: {
      maxActiveInstances: 8,
      nodeLabel: 'hub-demo',
      amplifyAppId: DEMO_AMPLIFY_APP_ID,
      amplifyRegion: 'us-east-1',
      amplifyAccessKeyConfigured: true,
      amplifyAccessKeyLast4: 'DEMO',
      amplifySecretConfigured: true,
      amplifyHiddenBranches: ['main', 'develop'],
      amplifyMaxBranches: 50,
    },
    amplifyBranches: createDemoAmplifyBranches(),
    sessionUser: null,
    logs: Object.fromEntries(
      instances.map((i) => [
        i.id,
        [
          `[demo] ${i.runner} logs for ${i.pm2Name}`,
          `status=${i.status} port=${i.port ?? '—'}`,
          `ready on node ${i.nodeLabel}`,
          ...(i.lastDeployError ? ['', '--- last error ---', i.lastDeployError] : []),
        ].join('\n'),
      ]),
    ),
  };
}

let store: DemoStore | null = null;

export function getDemoStore(): DemoStore {
  if (!store) store = freshStore();
  return store;
}

export function resetDemoStore(): DemoStore {
  store = freshStore();
  return store;
}

export function demoDashboard(): DashboardSummary {
  const s = getDemoStore();
  return buildDashboardSummary(s.instances, s.projects);
}

export function touchInstance(id: string, patch: Partial<DemoInstance>) {
  const s = getDemoStore();
  const idx = s.instances.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const prev = s.instances[idx];
  const next: DemoInstance = {
    ...prev,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const online = next.status === 'active';
  next.runtimeOnline = online;
  next.pm2Online = online;
  next.active = online;
  next.runtimeStatus =
    next.status === 'active'
      ? 'online'
      : next.status === 'paused'
        ? 'stopped'
        : next.runtimeStatus;
  next.pm2Status = next.runtimeStatus;
  s.instances[idx] = next;
  return next;
}

/** Agenda transição de deploying → active (demo async). */
export function scheduleDemoDeploy(id: string, ms = 2500) {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    const row = touchInstance(id, {
      status: 'active',
      port: 4100 + Math.floor(Math.random() * 80),
      lastDeployError: null,
      runtimeStatus: 'online',
    });
    if (row) {
      const s = getDemoStore();
      s.logs[id] = `${s.logs[id] ?? ''}\n[demo] deploy finished → active`;
    }
  }, ms);
}
