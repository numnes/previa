import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';

import type { NodeRef } from '@/lib/node-ref';

export type Project = {
  id: string;
  slug: string;
  gitUrl: string;
  serverUrl: string | null;
  maxActiveLifetimeDays: number | null;
  maxActiveLifetimeHours: number | null;
  maxExistenceLifetimeDays: number | null;
  maxExistenceLifetimeHours: number | null;
  /** null/omit = disabled. Minutes without HTTP before idle sleep. */
  idlePauseMinutes?: number | null;
  /** Relative HTTP path (e.g. /health). null = health check disabled. */
  healthCheckPath?: string | null;
  healthCheckStatus?: number | null;
  healthCheckTimeoutMinutes?: number | null;
  /** Discord instance status notifications for this project. */
  notificationsEnabled?: boolean;
  clickupCommentsEnabled?: boolean;
  envVars?: Record<string, string>;
  /** Extras além de PORT, SERVER_PORT, APP_PORT */
  portEnvNames?: string[];
  createdAt: string;
} & NodeRef;

export async function listProjects(): Promise<Project[]> {
  const token = getTokenClient();
  return await httpJson<Project[]>(`${apiBaseClient()}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getProject(id: string): Promise<Project> {
  const token = getTokenClient();
  return await httpJson<Project>(`${apiBaseClient()}/projects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createProject(body: {
  slug: string;
  gitUrl: string;
  serverUrl?: string | null;
}): Promise<Project> {
  const token = getTokenClient();
  return await httpJson<Project>(`${apiBaseClient()}/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export async function patchProject(
  id: string,
  body: {
    gitUrl?: string;
    serverUrl?: string | null;
    maxActiveLifetimeDays?: number | null;
    maxActiveLifetimeHours?: number | null;
    maxExistenceLifetimeDays?: number | null;
    maxExistenceLifetimeHours?: number | null;
    idlePauseMinutes?: number | null;
    healthCheckPath?: string | null;
    healthCheckStatus?: number | null;
    healthCheckTimeoutMinutes?: number | null;
    notificationsEnabled?: boolean;
    clickupCommentsEnabled?: boolean;
    envVars?: Record<string, string>;
    portEnvNames?: string[];
  },
): Promise<Project> {
  const token = getTokenClient();
  return await httpJson<Project>(`${apiBaseClient()}/projects/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

export type ProjectBulkResult = {
  ok?: boolean;
  destroyed?: number;
  failed?: number;
  paused?: number;
  skipped?: number;
  restarted?: number;
  slept?: number;
  awoken?: number;
  instances?: { destroyed: number; failed: number };
};

export async function deleteProject(id: string): Promise<ProjectBulkResult> {
  const token = getTokenClient();
  return await httpJson<ProjectBulkResult>(`${apiBaseClient()}/projects/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function teardownProjectInstances(id: string): Promise<ProjectBulkResult> {
  const token = getTokenClient();
  return await httpJson<ProjectBulkResult>(
    `${apiBaseClient()}/projects/${id}/instances/teardown`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function restartProjectInstances(id: string): Promise<ProjectBulkResult> {
  const token = getTokenClient();
  return await httpJson<ProjectBulkResult>(
    `${apiBaseClient()}/projects/${id}/instances/restart`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function sleepProjectInstances(id: string): Promise<ProjectBulkResult> {
  const token = getTokenClient();
  return await httpJson<ProjectBulkResult>(
    `${apiBaseClient()}/projects/${id}/instances/sleep`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function awakeProjectInstances(id: string): Promise<ProjectBulkResult> {
  const token = getTokenClient();
  return await httpJson<ProjectBulkResult>(
    `${apiBaseClient()}/projects/${id}/instances/awake`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

