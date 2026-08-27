import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';
import type { InstanceRow } from '../../::handlers/instances';

export type InstanceLogsResponse = {
  pm2Name: string;
  lines: number;
  output: string;
};

export async function getInstance(id: string): Promise<InstanceRow> {
  const token = getTokenClient();
  return await httpJson<InstanceRow>(`${apiBaseClient()}/instances/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getInstanceLogs(
  id: string,
  lines = 200,
): Promise<InstanceLogsResponse> {
  const token = getTokenClient();
  const q = new URLSearchParams({ lines: String(lines) });
  return await httpJson<InstanceLogsResponse>(
    `${apiBaseClient()}/instances/${id}/logs?${q}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
}

export async function pauseInstance(id: string): Promise<InstanceRow> {
  const token = getTokenClient();
  return await httpJson<InstanceRow>(`${apiBaseClient()}/instances/${id}/pause`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function activateInstance(id: string): Promise<InstanceRow> {
  const token = getTokenClient();
  return await httpJson<InstanceRow>(`${apiBaseClient()}/instances/${id}/activate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function awakeInstance(id: string): Promise<InstanceRow> {
  const token = getTokenClient();
  return await httpJson<InstanceRow>(`${apiBaseClient()}/instances/${id}/awake`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function removeInstance(id: string): Promise<{ ok: true }> {
  const token = getTokenClient();
  return await httpJson<{ ok: true }>(`${apiBaseClient()}/instances/${id}/remove`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function patchInstance(
  id: string,
  body: {
    envVars?: Record<string, string>;
    clickupTaskUrl?: string | null;
    clickupLinkFromBranch?: boolean;
  },
): Promise<InstanceRow> {
  const token = getTokenClient();
  return await httpJson<InstanceRow>(`${apiBaseClient()}/instances/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
