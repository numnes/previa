import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';

import type { NodeRef } from '@/lib/node-ref';

export type InstanceRow = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectServerUrl: string | null;
  branch: string;
  branchSlug: string;
  pm2Name: string;
  runtimeName: string;
  runner: string;
  port: number | null;
  status: string;
  runtimeOnline: boolean;
  runtimeStatus: string | null;
  /** @deprecated use runtimeOnline */
  pm2Online: boolean;
  active: boolean;
  /** @deprecated use runtimeStatus */
  pm2Status: string | null;
  monit?: {
    memory?: number;
    cpu?: number;
    cpuPerCore?: number;
    hostCores?: number;
  } | null;
  previewUrl: string | null;
  lastDeployError: string | null;
  idleSleep?: boolean;
  activeExpiresAt: string | null;
  existenceExpiresAt: string | null;
  hasActiveLifetimeLimit: boolean;
  hasExistenceLifetimeLimit: boolean;
  envVars?: Record<string, string>;
  projectEnvVars?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
} & NodeRef;

export function runnerLabel(runner: string | undefined): string {
  return runner === 'docker' ? 'Docker' : 'PM2';
}

export async function listInstances(): Promise<InstanceRow[]> {
  const token = getTokenClient();
  return await httpJson<InstanceRow[]>(`${apiBaseClient()}/instances`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
