import type { AuthUser, UserRole } from '@/lib/client-auth';
import type { DashboardSummary, HostStats } from '@/app/::handlers/dashboard';
import type { InstanceRow } from '@/app/instances/::handlers/instances';
import type { Project } from '@/app/projects/::handlers/projects';
import type { UserRow } from '@/app/users/::handlers/users';
import type { ApiKeyRow } from '@/app/settings/::handlers/api-keys';
import type {
  ClusterKeyRow,
  ClusterNodeRow,
} from '@/app/settings/::handlers/cluster';
import type { NodeRef } from '@/lib/node-ref';

export const DEMO_CREDENTIALS = {
  admin: { email: 'admin@demo.local', password: 'demo' },
  operator: { email: 'operator@demo.local', password: 'demo' },
} as const;

export const LOCAL_NODE: NodeRef = {
  nodeId: 'local',
  nodeLabel: 'hub-demo',
  nodeBaseUrl: 'https://hub.demo.local',
  isLocal: true,
  online: true,
  canWrite: true,
};

export const REMOTE_NODE_A: NodeRef = {
  nodeId: 'node-edge-1',
  nodeLabel: 'edge-west',
  nodeBaseUrl: 'https://edge-west.demo.local',
  isLocal: false,
  online: true,
  canWrite: true,
};

export const REMOTE_NODE_B: NodeRef = {
  nodeId: 'node-edge-2',
  nodeLabel: 'edge-east',
  nodeBaseUrl: 'https://edge-east.demo.local',
  isLocal: false,
  online: true,
  canWrite: false,
};

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 86400_000).toISOString();
}

function hostStats(scale = 1): HostStats {
  return {
    cpu: {
      cores: 8,
      loadavg1: 1.2 * scale,
      loadavg5: 1.4 * scale,
      loadavg15: 1.1 * scale,
    },
    memory: {
      totalBytes: 32 * 1024 ** 3,
      freeBytes: Math.round(12 * 1024 ** 3 * (2 - scale)),
      usedBytes: Math.round(20 * 1024 ** 3 * scale),
      usedPct: Math.min(92, Math.round(55 * scale)),
    },
    disk: {
      path: '/',
      totalBytes: 500 * 1024 ** 3,
      freeBytes: Math.round(220 * 1024 ** 3 * (2 - scale)),
      usedBytes: Math.round(280 * 1024 ** 3 * scale),
      usedPct: Math.min(90, Math.round(48 * scale)),
    },
  };
}

export type DemoProject = Project;
export type DemoInstance = InstanceRow;

export function createDemoUsers(): UserRow[] {
  return [
    {
      id: 'user-admin',
      email: DEMO_CREDENTIALS.admin.email,
      role: 'admin',
      createdAt: hoursAgo(24 * 40),
    },
    {
      id: 'user-operator',
      email: DEMO_CREDENTIALS.operator.email,
      role: 'operator',
      createdAt: hoursAgo(24 * 10),
    },
    {
      id: 'user-operator-2',
      email: 'viewer-ops@demo.local',
      role: 'operator',
      createdAt: hoursAgo(24 * 3),
    },
  ];
}

export function authUserFromRow(row: UserRow): AuthUser {
  return { id: row.id, email: row.email, role: row.role };
}

export function findDemoUser(
  email: string,
  password: string,
  users: UserRow[],
): AuthUser | null {
  const cred =
    email === DEMO_CREDENTIALS.admin.email &&
    password === DEMO_CREDENTIALS.admin.password
      ? DEMO_CREDENTIALS.admin
      : email === DEMO_CREDENTIALS.operator.email &&
          password === DEMO_CREDENTIALS.operator.password
        ? DEMO_CREDENTIALS.operator
        : null;
  if (!cred) return null;
  const row = users.find((u) => u.email === cred.email);
  return row ? authUserFromRow(row) : null;
}

export function createDemoProjects(): DemoProject[] {
  return [
    {
      id: 'proj-storefront',
      slug: 'storefront',
      gitUrl: 'https://github.com/demo/storefront.git',
      serverUrl: 'https://preview.demo.local',
      maxActiveLifetimeDays: 2,
      maxActiveLifetimeHours: 0,
      maxExistenceLifetimeDays: 14,
      maxExistenceLifetimeHours: 0,
      envVars: {
        NODE_ENV: 'production',
        API_URL: 'https://api.demo.local',
      },
      createdAt: hoursAgo(24 * 60),
      ...LOCAL_NODE,
    },
    {
      id: 'proj-docs',
      slug: 'docs-portal',
      gitUrl: 'https://github.com/demo/docs-portal.git',
      serverUrl: 'https://docs-preview.demo.local',
      maxActiveLifetimeDays: null,
      maxActiveLifetimeHours: 12,
      maxExistenceLifetimeDays: 7,
      maxExistenceLifetimeHours: 0,
      envVars: { SITE_THEME: 'dark' },
      createdAt: hoursAgo(24 * 20),
      ...LOCAL_NODE,
    },
    {
      id: 'proj-billing',
      slug: 'billing-api',
      gitUrl: 'https://github.com/demo/billing-api.git',
      serverUrl: 'https://billing.preview.demo.local',
      maxActiveLifetimeDays: 1,
      maxActiveLifetimeHours: 0,
      maxExistenceLifetimeDays: 5,
      maxExistenceLifetimeHours: 0,
      envVars: { STRIPE_MODE: 'test' },
      createdAt: hoursAgo(24 * 15),
      ...REMOTE_NODE_A,
    },
    {
      id: 'proj-analytics',
      slug: 'analytics',
      gitUrl: 'https://github.com/demo/analytics.git',
      serverUrl: 'https://analytics.preview.demo.local',
      maxActiveLifetimeDays: null,
      maxActiveLifetimeHours: null,
      maxExistenceLifetimeDays: null,
      maxExistenceLifetimeHours: null,
      envVars: {},
      createdAt: hoursAgo(24 * 8),
      ...REMOTE_NODE_B,
    },
  ];
}

function instanceBase(
  partial: Omit<
    DemoInstance,
    | 'runtimeOnline'
    | 'runtimeStatus'
    | 'pm2Online'
    | 'active'
    | 'pm2Status'
    | 'runtimeName'
    | 'previewUrl'
  > &
    Partial<
      Pick<
        DemoInstance,
        | 'runtimeOnline'
        | 'runtimeStatus'
        | 'pm2Online'
        | 'active'
        | 'pm2Status'
        | 'runtimeName'
        | 'previewUrl'
      >
    >,
): DemoInstance {
  const online = partial.runtimeOnline ?? partial.status === 'active';
  const statusLabel =
    partial.runtimeStatus ??
    (online ? 'online' : partial.status === 'paused' ? 'stopped' : null);
  const previewUrl =
    partial.previewUrl ??
    (partial.projectServerUrl && partial.projectSlug && partial.branchSlug
      ? `${partial.projectServerUrl.replace(/\/+$/, '')}/${partial.projectSlug}/${partial.branchSlug}/`
      : null);
  return {
    ...partial,
    runtimeName: partial.runtimeName ?? partial.pm2Name,
    runtimeOnline: online,
    runtimeStatus: statusLabel,
    pm2Online: online,
    active: online,
    pm2Status: statusLabel,
    previewUrl,
  };
}

export function createDemoInstances(projects: DemoProject[]): DemoInstance[] {
  const byId = Object.fromEntries(projects.map((p) => [p.id, p]));
  const storefront = byId['proj-storefront'];
  const docs = byId['proj-docs'];
  const billing = byId['proj-billing'];
  const analytics = byId['proj-analytics'];

  return [
    instanceBase({
      id: 'inst-store-feature',
      projectId: storefront.id,
      projectSlug: storefront.slug,
      projectServerUrl: storefront.serverUrl,
      branch: 'feature/checkout-v2',
      branchSlug: 'feature-checkout-v2',
      pm2Name: 'storefront-feature-checkout-v2',
      runner: 'pm2',
      port: 4101,
      status: 'active',
      monit: { cpu: 4.2, memory: 180 * 1024 * 1024 },
      lastDeployError: null,
      activeExpiresAt: daysFromNow(1.5),
      existenceExpiresAt: daysFromNow(12),
      hasActiveLifetimeLimit: true,
      hasExistenceLifetimeLimit: true,
      envVars: { FEATURE_CHECKOUT: '1' },
      projectEnvVars: storefront.envVars,
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(1),
      ...LOCAL_NODE,
    }),
    instanceBase({
      id: 'inst-store-main',
      projectId: storefront.id,
      projectSlug: storefront.slug,
      projectServerUrl: storefront.serverUrl,
      branch: 'main',
      branchSlug: 'main',
      pm2Name: 'storefront-main',
      runner: 'docker',
      port: 4102,
      status: 'paused',
      idleSleep: true,
      monit: null,
      lastDeployError: null,
      activeExpiresAt: null,
      existenceExpiresAt: daysFromNow(10),
      hasActiveLifetimeLimit: true,
      hasExistenceLifetimeLimit: true,
      envVars: {},
      projectEnvVars: storefront.envVars,
      createdAt: hoursAgo(80),
      updatedAt: hoursAgo(5),
      ...LOCAL_NODE,
    }),
    instanceBase({
      id: 'inst-docs-pr',
      projectId: docs.id,
      projectSlug: docs.slug,
      projectServerUrl: docs.serverUrl,
      branch: 'docs/api-v3',
      branchSlug: 'docs-api-v3',
      pm2Name: 'docs-portal-docs-api-v3',
      runner: 'pm2',
      port: 4103,
      status: 'deploying',
      monit: null,
      lastDeployError: null,
      activeExpiresAt: null,
      existenceExpiresAt: daysFromNow(5),
      hasActiveLifetimeLimit: true,
      hasExistenceLifetimeLimit: true,
      envVars: {},
      projectEnvVars: docs.envVars,
      createdAt: hoursAgo(2),
      updatedAt: hoursAgo(0.1),
      ...LOCAL_NODE,
    }),
    instanceBase({
      id: 'r:node-edge-1:inst-billing-fix',
      projectId: billing.id,
      projectSlug: billing.slug,
      projectServerUrl: billing.serverUrl,
      branch: 'fix/invoice-timezone',
      branchSlug: 'fix-invoice-timezone',
      pm2Name: 'billing-api-fix-invoice-timezone',
      runner: 'docker',
      port: 4201,
      status: 'active',
      monit: { cpu: 2.1, memory: 256 * 1024 * 1024 },
      lastDeployError: null,
      activeExpiresAt: daysFromNow(0.8),
      existenceExpiresAt: daysFromNow(4),
      hasActiveLifetimeLimit: true,
      hasExistenceLifetimeLimit: true,
      envVars: { REGION: 'us-west' },
      projectEnvVars: billing.envVars,
      createdAt: hoursAgo(18),
      updatedAt: hoursAgo(2),
      ...REMOTE_NODE_A,
    }),
    instanceBase({
      id: 'r:node-edge-2:inst-analytics-wait',
      projectId: analytics.id,
      projectSlug: analytics.slug,
      projectServerUrl: analytics.serverUrl,
      branch: 'feat/funnels',
      branchSlug: 'feat-funnels',
      pm2Name: 'analytics-feat-funnels',
      runner: 'pm2',
      port: null,
      status: 'waiting',
      monit: null,
      lastDeployError: null,
      activeExpiresAt: null,
      existenceExpiresAt: null,
      hasActiveLifetimeLimit: false,
      hasExistenceLifetimeLimit: false,
      envVars: {},
      projectEnvVars: analytics.envVars,
      createdAt: hoursAgo(6),
      updatedAt: hoursAgo(6),
      ...REMOTE_NODE_B,
    }),
    instanceBase({
      id: 'inst-store-error',
      projectId: storefront.id,
      projectSlug: storefront.slug,
      projectServerUrl: storefront.serverUrl,
      branch: 'experiment/broken-build',
      branchSlug: 'experiment-broken-build',
      pm2Name: 'storefront-experiment-broken-build',
      runner: 'pm2',
      port: null,
      status: 'error',
      monit: null,
      lastDeployError:
        'Error: Command failed: npm run build\nModule not found: Can\'t resolve ./CheckoutForm',
      activeExpiresAt: null,
      existenceExpiresAt: daysFromNow(9),
      hasActiveLifetimeLimit: true,
      hasExistenceLifetimeLimit: true,
      envVars: {},
      projectEnvVars: storefront.envVars,
      createdAt: hoursAgo(12),
      updatedAt: hoursAgo(11),
      ...LOCAL_NODE,
    }),
  ];
}

export function createDemoClusterKeys(): ClusterKeyRow[] {
  return [
    {
      id: 'ck-1',
      label: 'edge-west write',
      scope: 'write',
      createdAt: hoursAgo(24 * 12),
    },
    {
      id: 'ck-2',
      label: 'readonly ops',
      scope: 'read',
      createdAt: hoursAgo(24 * 4),
    },
  ];
}

export function createDemoClusterNodes(): ClusterNodeRow[] {
  return [
    {
      id: 'cn-1',
      label: REMOTE_NODE_A.nodeLabel,
      baseUrl: REMOTE_NODE_A.nodeBaseUrl!,
      scope: 'write',
      enabled: true,
      createdAt: hoursAgo(24 * 12),
      updatedAt: hoursAgo(2),
    },
    {
      id: 'cn-2',
      label: REMOTE_NODE_B.nodeLabel,
      baseUrl: REMOTE_NODE_B.nodeBaseUrl!,
      scope: 'read',
      enabled: true,
      createdAt: hoursAgo(24 * 8),
      updatedAt: hoursAgo(24),
    },
  ];
}

export function createDemoApiKeys(): ApiKeyRow[] {
  return [
    {
      id: 'ak-1',
      label: 'github-actions',
      createdAt: hoursAgo(24 * 30),
    },
    {
      id: 'ak-2',
      label: 'cli-laptop',
      createdAt: hoursAgo(24 * 2),
    },
  ];
}

export function buildDashboardSummary(
  instances: DemoInstance[],
  projects: DemoProject[],
): DashboardSummary {
  const instancesByStatus: Record<string, number> = {};
  for (const i of instances) {
    instancesByStatus[i.status] = (instancesByStatus[i.status] ?? 0) + 1;
  }
  return {
    maxActiveInstances: 8,
    instancesByStatus,
    recentProjects: projects
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map((p) => ({
        slug: p.slug,
        lastActivityAt: p.createdAt,
        nodeId: p.nodeId,
        nodeLabel: p.nodeLabel,
      })),
    host: hostStats(1),
    hosts: [
      { ...LOCAL_NODE, host: hostStats(1) },
      { ...REMOTE_NODE_A, host: hostStats(1.15) },
      { ...REMOTE_NODE_B, host: hostStats(0.85) },
    ],
    nodes: [LOCAL_NODE, REMOTE_NODE_A, REMOTE_NODE_B],
    recentStatusChanges: [
      {
        at: hoursAgo(0.5),
        instanceId: 'inst-docs-pr',
        projectSlug: 'docs-portal',
        branch: 'docs/api-v3',
        from: 'waiting',
        to: 'deploying',
        nodeId: LOCAL_NODE.nodeId,
        nodeLabel: LOCAL_NODE.nodeLabel,
      },
      {
        at: hoursAgo(2),
        instanceId: 'r:node-edge-1:inst-billing-fix',
        projectSlug: 'billing-api',
        branch: 'fix/invoice-timezone',
        from: 'deploying',
        to: 'active',
        nodeId: REMOTE_NODE_A.nodeId,
        nodeLabel: REMOTE_NODE_A.nodeLabel,
      },
      {
        at: hoursAgo(5),
        instanceId: 'inst-store-main',
        projectSlug: 'storefront',
        branch: 'main',
        from: 'active',
        to: 'paused',
        nodeId: LOCAL_NODE.nodeId,
        nodeLabel: LOCAL_NODE.nodeLabel,
      },
    ],
  };
}

export function demoRoleAllowed(
  role: UserRole | undefined,
  adminOnly: boolean,
): boolean {
  if (!adminOnly) return true;
  return role === 'admin';
}

/** IDs usados no static export (GitHub Pages). */
export const DEMO_PROJECT_STATIC_PARAMS = [
  { id: 'proj-storefront' },
  { id: 'proj-docs' },
  { id: 'proj-billing' },
  { id: 'proj-analytics' },
];

export const DEMO_INSTANCE_STATIC_PARAMS = [
  { id: 'inst-store-feature' },
  { id: 'inst-store-main' },
  { id: 'inst-docs-pr' },
  { id: 'inst-store-error' },
  { id: 'r:node-edge-1:inst-billing-fix' },
  { id: 'r:node-edge-2:inst-analytics-wait' },
];
