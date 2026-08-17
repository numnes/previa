/** Parallel BullMQ deploy jobs. Override via PREVIA_DEPLOY_CONCURRENCY. */
export const DEFAULT_DEPLOY_CONCURRENCY = 3;
export const MAX_DEPLOY_CONCURRENCY = 32;

export function resolveDeployConcurrency(
  raw: string | undefined | null = process.env.PREVIA_DEPLOY_CONCURRENCY,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return DEFAULT_DEPLOY_CONCURRENCY;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DEPLOY_CONCURRENCY;
  return Math.min(n, MAX_DEPLOY_CONCURRENCY);
}
