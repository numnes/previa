import type { DeployMeta } from '../deploy/deploy-meta';
import { previewUriPath } from '../deploy/pm2-name.util';

export const DEFAULT_HEALTH_CHECK_STATUS = 200;
export const DEFAULT_HEALTH_CHECK_TIMEOUT_MINUTES = 5;
export const HEALTH_CHECK_POLL_INTERVAL_MS = 3000;
export const HEALTH_CHECK_REQUEST_TIMEOUT_MS = 10_000;

export function normalizeHealthCheckPath(
  path: string | null | undefined,
): string | null {
  if (path == null) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveExpectedHealthStatus(
  configured: number | null | undefined,
): number {
  if (configured == null || !Number.isFinite(configured)) {
    return DEFAULT_HEALTH_CHECK_STATUS;
  }
  return configured;
}

export function resolveHealthCheckTimeoutMinutes(
  configured: number | null | undefined,
): number {
  if (configured == null || configured <= 0) {
    return DEFAULT_HEALTH_CHECK_TIMEOUT_MINUTES;
  }
  return configured;
}

export function buildHealthCheckUrl(
  project: { serverUrl: string | null },
  meta: DeployMeta,
  healthPath: string,
): string {
  const path = normalizeHealthCheckPath(healthPath);
  if (!path) {
    throw new Error('health check path inválido');
  }

  if (meta.port != null && meta.port > 0) {
    return `http://127.0.0.1:${meta.port}${path}`;
  }

  const base = project.serverUrl?.replace(/\/$/, '');
  if (base) {
    const previewPath = previewUriPath(meta.projectSlug, meta.branch);
    return `${base}/${previewPath}${path}`;
  }

  throw new Error('health check requer porta alocada ou serverUrl do projeto');
}

export type HealthProbeResult = {
  ok: boolean;
  statusCode?: number;
  error?: string;
};

export async function probeHealthCheckUrl(
  url: string,
  expectedStatus: number,
  requestTimeoutMs = HEALTH_CHECK_REQUEST_TIMEOUT_MS,
): Promise<HealthProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    });
    if (res.status === expectedStatus) {
      return { ok: true, statusCode: res.status };
    }
    return {
      ok: false,
      statusCode: res.status,
      error: `HTTP ${res.status} (esperado ${expectedStatus})`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
