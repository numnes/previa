import type { AuthUser } from '@/lib/client-auth';
import { DEMO_TOKEN_PREFIX, isDemoToken } from './mode';
import { findDemoUser } from './fixtures';
import {
  demoDashboard,
  getDemoStore,
  resetDemoStore,
  scheduleDemoDeploy,
  touchInstance,
} from './store';

class DemoHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

class DemoUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

function requireAuth(headers: HeadersInit | undefined): AuthUser {
  const h = new Headers(headers);
  const auth = h.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!isDemoToken(token)) {
    throw new DemoUnauthorizedError('Demo session required');
  }
  const email = decodeURIComponent(token.slice(DEMO_TOKEN_PREFIX.length));
  const s = getDemoStore();
  const user = s.users.find((u) => u.email === email);
  if (!user) throw new DemoUnauthorizedError('Unknown demo user');
  s.sessionUser = { id: user.id, email: user.email, role: user.role };
  return s.sessionUser;
}

function requireAdmin(user: AuthUser) {
  if (user.role !== 'admin') {
    throw new DemoHttpError(403, 'Permissão insuficiente para esta ação');
  }
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body) return undefined;
  try {
    return JSON.parse(String(init.body));
  } catch {
    return undefined;
  }
}

function pathParts(pathname: string): string[] {
  return pathname.replace(/\/+$/, '').split('/').filter(Boolean);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function demoFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const u = new URL(url, 'https://demo.local');
  const parts = pathParts(u.pathname);
  const body = parseBody(init);

  // Login não exige sessão
  if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'login') {
    await delay(200);
    const email = String((body as { email?: string })?.email ?? '');
    const password = String((body as { password?: string })?.password ?? '');
    const s = getDemoStore();
    const user = findDemoUser(email, password, s.users);
    if (!user) throw new DemoHttpError(401, 'Invalid credentials');
    s.sessionUser = user;
    return {
      access_token: `${DEMO_TOKEN_PREFIX}${encodeURIComponent(user.email)}`,
      user,
    } as T;
  }

  const user = requireAuth(init?.headers);

  if (method === 'GET' && parts[0] === 'auth' && parts[1] === 'me') {
    return user as T;
  }

  if (method === 'GET' && parts[0] === 'dashboard' && parts[1] === 'summary') {
    await delay(150);
    return demoDashboard() as T;
  }

  if (parts[0] === 'projects') {
    return handleProjects(method, parts, body, user) as T;
  }
  if (parts[0] === 'instances') {
    return handleInstances(method, parts, body, u.searchParams, user) as Promise<T>;
  }
  if (parts[0] === 'users') {
    return handleUsers(method, parts, body, user) as T;
  }
  if (parts[0] === 'settings') {
    return handleSettings(method, body, user) as T;
  }
  if (parts[0] === 'cluster-keys') {
    return handleClusterKeys(method, parts, body, user) as T;
  }
  if (parts[0] === 'cluster-nodes') {
    return handleClusterNodes(method, parts, body, user) as T;
  }
  if (parts[0] === 'api-keys') {
    return handleApiKeys(method, parts, body, user) as T;
  }

  throw new DemoHttpError(404, `Demo mock: ${method} ${u.pathname}`);
}

function handleProjects(
  method: string,
  parts: string[],
  body: unknown,
  user: AuthUser,
) {
  const s = getDemoStore();
  if (method === 'GET' && parts.length === 1) {
    return s.projects;
  }
  if (method === 'GET' && parts.length === 2) {
    const p = s.projects.find((x) => x.id === parts[1]);
    if (!p) throw new DemoHttpError(404, 'Project not found');
    return p;
  }
  if (method === 'POST' && parts.length === 1) {
    requireAdmin(user);
    const b = body as { slug: string; gitUrl: string; serverUrl?: string | null };
    const p = {
      id: `proj-${Date.now()}`,
      slug: b.slug,
      gitUrl: b.gitUrl,
      serverUrl: b.serverUrl ?? null,
      maxActiveLifetimeDays: null,
      maxActiveLifetimeHours: null,
      maxExistenceLifetimeDays: null,
      maxExistenceLifetimeHours: null,
      idlePauseMinutes: null,
      envVars: {},
      createdAt: new Date().toISOString(),
      nodeId: 'local',
      nodeLabel: s.settings.nodeLabel,
      isLocal: true,
      online: true,
      canWrite: true,
      portEnvNames: [],
    };
    s.projects.push(p);
    return p;
  }
  if (method === 'PATCH' && parts.length === 2) {
    requireAdmin(user);
    const idx = s.projects.findIndex((x) => x.id === parts[1]);
    if (idx < 0) throw new DemoHttpError(404, 'Project not found');
    const b = body as Record<string, unknown>;
    s.projects[idx] = { ...s.projects[idx], ...b } as (typeof s.projects)[0];
    for (const inst of s.instances) {
      if (inst.projectId === parts[1] && b.envVars) {
        inst.projectEnvVars = b.envVars as Record<string, string>;
      }
    }
    return s.projects[idx];
  }
  if (method === 'DELETE' && parts.length === 2) {
    requireAdmin(user);
    s.instances = s.instances.filter((i) => i.projectId !== parts[1]);
    s.projects = s.projects.filter((p) => p.id !== parts[1]);
    return { ok: true, instances: { destroyed: 1, failed: 0 } };
  }
  if (
    method === 'POST' &&
    parts.length === 4 &&
    parts[2] === 'instances' &&
    parts[3] === 'teardown'
  ) {
    requireAdmin(user);
    let paused = 0;
    for (const i of s.instances) {
      if (i.projectId === parts[1] && i.status === 'active' && i.isLocal) {
        touchInstance(i.id, { status: 'paused', port: null });
        paused++;
      }
    }
    return { paused, skipped: 0, failed: 0 };
  }
  if (
    method === 'POST' &&
    parts.length === 4 &&
    parts[2] === 'instances' &&
    parts[3] === 'restart'
  ) {
    requireAdmin(user);
    let restarted = 0;
    for (const i of s.instances) {
      if (i.projectId === parts[1] && i.isLocal) {
        touchInstance(i.id, { status: 'deploying', lastDeployError: null });
        scheduleDemoDeploy(i.id);
        restarted++;
      }
    }
    return { restarted, skipped: 0, failed: 0 };
  }
  throw new DemoHttpError(404, 'Unknown projects route');
}

async function handleInstances(
  method: string,
  parts: string[],
  body: unknown,
  search: URLSearchParams,
  user: AuthUser,
) {
  const s = getDemoStore();
  const redactEnv = <T extends { envVars?: Record<string, string>; projectEnvVars?: Record<string, string> }>(
    row: T,
  ): T => {
    if (user.role === 'admin') return row;
    return { ...row, envVars: {}, projectEnvVars: {} };
  };
  if (method === 'GET' && parts.length === 1) {
    await delay(120);
    return s.instances.map(redactEnv);
  }
  if (method === 'GET' && parts.length === 2) {
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    return redactEnv(row);
  }
  if (method === 'GET' && parts.length === 3 && parts[2] === 'logs') {
    const id = parts[1];
    const lines = Number(search.get('lines') ?? 200);
    const output = (s.logs[id] ?? '(no logs)').split('\n').slice(-lines).join('\n');
    const row = s.instances.find((i) => i.id === id);
    return {
      pm2Name: row?.pm2Name ?? id,
      lines,
      output,
    };
  }
  if (method === 'PATCH' && parts.length === 2) {
    requireAdmin(user);
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    if (!row.isLocal) throw new DemoHttpError(404, 'Remote env override not supported');
    const b = body as { envVars?: Record<string, string> };
    return touchInstance(parts[1], { envVars: b.envVars ?? {} });
  }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'pause') {
    await delay(400);
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    if (!row.canWrite) throw new DemoHttpError(403, 'Read-only node');
    if (row.status !== 'active') throw new DemoHttpError(400, 'Only active');
    return touchInstance(parts[1], { status: 'paused', port: null, idleSleep: false });
  }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'activate') {
    await delay(300);
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    if (!row.canWrite) throw new DemoHttpError(403, 'Read-only node');
    const next = touchInstance(parts[1], {
      status: 'deploying',
      lastDeployError: null,
      idleSleep: false,
    });
    scheduleDemoDeploy(parts[1]);
    return next;
  }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'awake') {
    await delay(400);
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    if (!row.canWrite) throw new DemoHttpError(403, 'Read-only node');
    if (row.status !== 'paused' || !row.idleSleep) {
      throw new DemoHttpError(400, 'Only idle-sleep instances can be awoken');
    }
    return touchInstance(parts[1], {
      status: 'active',
      idleSleep: false,
      port: row.port ?? 4100,
      runtimeOnline: true,
      runtimeStatus: 'online',
      pm2Online: true,
      active: true,
      pm2Status: 'online',
    });
  }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'remove') {
    await delay(300);
    const row = s.instances.find((i) => i.id === parts[1]);
    if (!row) throw new DemoHttpError(404, 'Instance not found');
    if (!row.canWrite) throw new DemoHttpError(403, 'Read-only node');
    s.instances = s.instances.filter((i) => i.id !== parts[1]);
    return { ok: true };
  }
  throw new DemoHttpError(404, 'Unknown instances route');
}

function handleUsers(
  method: string,
  parts: string[],
  body: unknown,
  user: AuthUser,
) {
  requireAdmin(user);
  const s = getDemoStore();
  if (method === 'GET' && parts.length === 1) return s.users;
  if (method === 'POST' && parts.length === 1) {
    const b = body as { email: string; password: string; role: 'admin' | 'operator' };
    const row = {
      id: `user-${Date.now()}`,
      email: b.email,
      role: b.role,
      createdAt: new Date().toISOString(),
    };
    s.users.push(row);
    return row;
  }
  if (method === 'PATCH' && parts.length === 2) {
    const idx = s.users.findIndex((u) => u.id === parts[1]);
    if (idx < 0) throw new DemoHttpError(404, 'User not found');
    const b = body as { role?: 'admin' | 'operator' };
    if (b.role) s.users[idx] = { ...s.users[idx], role: b.role };
    return s.users[idx];
  }
  if (method === 'DELETE' && parts.length === 2) {
    s.users = s.users.filter((u) => u.id !== parts[1]);
    return { ok: true };
  }
  throw new DemoHttpError(404, 'Unknown users route');
}

function handleSettings(method: string, body: unknown, user: AuthUser) {
  requireAdmin(user);
  const s = getDemoStore();
  if (method === 'GET') {
    return {
      maxActiveInstancesParsed: s.settings.maxActiveInstances,
      max_active_instances: String(s.settings.maxActiveInstances),
      nodeLabel: s.settings.nodeLabel,
    };
  }
  if (method === 'PATCH') {
    const b = body as { maxActiveInstances?: number; nodeLabel?: string };
    if (b.maxActiveInstances != null) {
      s.settings.maxActiveInstances = b.maxActiveInstances;
    }
    if (b.nodeLabel != null) s.settings.nodeLabel = b.nodeLabel;
    return {
      maxActiveInstancesParsed: s.settings.maxActiveInstances,
      max_active_instances: String(s.settings.maxActiveInstances),
      nodeLabel: s.settings.nodeLabel,
    };
  }
  throw new DemoHttpError(404, 'Unknown settings route');
}

function handleClusterKeys(
  method: string,
  parts: string[],
  body: unknown,
  user: AuthUser,
) {
  requireAdmin(user);
  const s = getDemoStore();
  if (method === 'GET' && parts.length === 1) return s.clusterKeys;
  if (method === 'POST' && parts.length === 1) {
    const b = body as { label?: string; scope?: 'read' | 'write' };
    const row = {
      id: `ck-${Date.now()}`,
      label: b.label || 'new key',
      scope: b.scope ?? 'read',
      createdAt: new Date().toISOString(),
    };
    s.clusterKeys.push(row);
    return { plainKey: `clu_demo_${Math.random().toString(36).slice(2)}`, scope: row.scope };
  }
  if (method === 'DELETE' && parts.length === 2) {
    s.clusterKeys = s.clusterKeys.filter((k) => k.id !== parts[1]);
    return { ok: true };
  }
  throw new DemoHttpError(404, 'Unknown cluster-keys route');
}

function handleClusterNodes(
  method: string,
  parts: string[],
  body: unknown,
  user: AuthUser,
) {
  requireAdmin(user);
  const s = getDemoStore();
  if (method === 'GET' && parts.length === 1) return s.clusterNodes;
  if (method === 'POST' && parts.length === 1) {
    const b = body as { label: string; baseUrl: string; apiKey: string };
    const row = {
      id: `cn-${Date.now()}`,
      label: b.label,
      baseUrl: b.baseUrl,
      scope: 'read' as const,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    s.clusterNodes.push(row);
    return row;
  }
  if (method === 'DELETE' && parts.length === 2) {
    s.clusterNodes = s.clusterNodes.filter((n) => n.id !== parts[1]);
    return { ok: true };
  }
  if (method === 'POST' && parts.length === 3 && parts[2] === 'test') {
    const node = s.clusterNodes.find((n) => n.id === parts[1]);
    if (!node) throw new DemoHttpError(404, 'Node not found');
    return {
      ok: true,
      nodeLabel: node.label,
      baseUrl: node.baseUrl,
      scope: node.scope,
    };
  }
  throw new DemoHttpError(404, 'Unknown cluster-nodes route');
}

function handleApiKeys(
  method: string,
  parts: string[],
  body: unknown,
  user: AuthUser,
) {
  requireAdmin(user);
  const s = getDemoStore();
  if (method === 'GET' && parts.length === 1) return s.apiKeys;
  if (method === 'POST' && parts.length === 1) {
    const b = body as { label?: string };
    s.apiKeys.push({
      id: `ak-${Date.now()}`,
      label: b.label || 'new key',
      createdAt: new Date().toISOString(),
    });
    return { apiKey: `dk_demo_${Math.random().toString(36).slice(2)}` };
  }
  throw new DemoHttpError(404, 'Unknown api-keys route');
}

export function bootstrapDemoSession() {
  resetDemoStore();
}

export { DemoHttpError };
export { DEMO_CREDENTIALS } from './fixtures';
