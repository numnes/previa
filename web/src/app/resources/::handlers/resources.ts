import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';
import type { NodeRef } from '@/lib/node-ref';
import type { EnvVarsMap } from '@/lib/env-vars';

export type ResourceKind = 'image' | 'dockerfile' | 'compose';

export type ResourceRow = {
  id: string;
  slug: string;
  label: string;
  kind: ResourceKind;
  image: string | null;
  dockerfile: string | null;
  composeYaml: string | null;
  containerPorts: number[];
  publishedPorts: Record<string, number>;
  envVars?: EnvVarsMap;
  connectionEnv?: EnvVarsMap;
  connectionDotenv?: string;
  status: string;
  runtimeOnline: boolean;
  runtimeStatus: string | null;
  runtimeName: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
} & Partial<NodeRef>;

export type CreateResourceInput = {
  slug: string;
  label?: string;
  kind: ResourceKind;
  image?: string;
  dockerfile?: string;
  composeYaml?: string;
  containerPorts?: number[];
  envVars?: EnvVarsMap;
  start?: boolean;
};

export type ResourceLogsResponse = {
  runtimeName: string;
  lines: number;
  output: string;
};

function authHeaders() {
  return { Authorization: `Bearer ${getTokenClient()}` };
}

export function resourceKindLabel(kind: ResourceKind): string {
  if (kind === 'dockerfile') return 'Dockerfile';
  if (kind === 'compose') return 'Compose';
  return 'Image';
}

export async function listResources(): Promise<ResourceRow[]> {
  return httpJson<ResourceRow[]>(`${apiBaseClient()}/resources`, {
    headers: authHeaders(),
  });
}

export async function getResource(id: string): Promise<ResourceRow> {
  return httpJson<ResourceRow>(`${apiBaseClient()}/resources/${id}`, {
    headers: authHeaders(),
  });
}

export async function createResource(body: CreateResourceInput): Promise<ResourceRow> {
  return httpJson<ResourceRow>(`${apiBaseClient()}/resources`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function patchResource(
  id: string,
  body: Partial<CreateResourceInput>,
): Promise<ResourceRow> {
  return httpJson<ResourceRow>(`${apiBaseClient()}/resources/${id}`, {
    method: 'PATCH',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function startResource(id: string): Promise<ResourceRow> {
  return httpJson<ResourceRow>(`${apiBaseClient()}/resources/${id}/start`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function stopResource(id: string): Promise<ResourceRow> {
  return httpJson<ResourceRow>(`${apiBaseClient()}/resources/${id}/stop`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function removeResource(id: string): Promise<{ ok: true }> {
  return httpJson<{ ok: true }>(`${apiBaseClient()}/resources/${id}/remove`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function getResourceLogs(
  id: string,
  lines = 200,
): Promise<ResourceLogsResponse> {
  const q = new URLSearchParams({ lines: String(lines) });
  return httpJson<ResourceLogsResponse>(
    `${apiBaseClient()}/resources/${id}/logs?${q}`,
    { headers: authHeaders() },
  );
}

export function formatPublishedPorts(
  published: Record<string, number> | undefined,
  containerPorts: number[],
): string {
  const entries = Object.entries(published ?? {});
  if (entries.length) {
    return entries
      .map(([c, h]) => `${h}→${c}`)
      .join(', ');
  }
  if (containerPorts.length) return containerPorts.join(', ');
  return '—';
}
