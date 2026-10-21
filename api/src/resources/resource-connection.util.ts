import {
  envVarsToDotenv,
  mergeEnvVars,
  type EnvVarsMap,
} from '../common/env-vars.util';

const IMAGE_DEFAULT_PORTS: Array<{ test: RegExp; ports: number[] }> = [
  { test: /redis/i, ports: [6379] },
  { test: /postgres/i, ports: [5432] },
  { test: /mysql|mariadb/i, ports: [3306] },
  { test: /mongo/i, ports: [27017] },
  { test: /rabbit|amqp/i, ports: [5672] },
  { test: /memcached/i, ports: [11211] },
  { test: /minio/i, ports: [9000] },
  { test: /elastic/i, ports: [9200] },
];

export function defaultContainerPortsForImage(image: string): number[] {
  const name = image.trim();
  if (!name) return [];
  for (const rule of IMAGE_DEFAULT_PORTS) {
    if (rule.test.test(name)) return [...rule.ports];
  }
  return [];
}

export function envPrefixFromSlug(slug: string): string {
  const cleaned = slug.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (cleaned || 'RESOURCE').toUpperCase();
}

export function normalizeContainerPorts(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    const n = typeof item === 'string' ? Number(item.trim()) : Number(item);
    if (Number.isInteger(n) && n > 0 && n <= 65535 && !out.includes(n)) {
      out.push(n);
    }
  }
  return out;
}

export function buildConnectionEnv(opts: {
  slug: string;
  publishedPorts: Record<string, number>;
  runtimeEnv: EnvVarsMap;
  host?: string;
}): EnvVarsMap {
  const host = opts.host?.trim() || '127.0.0.1';
  const prefix = envPrefixFromSlug(opts.slug);
  const generated: EnvVarsMap = {
    [`${prefix}_HOST`]: host,
  };
  const entries = Object.entries(opts.publishedPorts)
    .map(([c, h]) => [Number(c), Number(h)] as const)
    .filter(([, h]) => Number.isInteger(h) && h > 0)
    .sort((a, b) => a[0] - b[0]);
  if (entries.length === 1) {
    generated[`${prefix}_PORT`] = String(entries[0][1]);
  } else {
    for (const [cport, hostPort] of entries) {
      generated[`${prefix}_PORT_${cport}`] = String(hostPort);
    }
    if (entries[0]) {
      generated[`${prefix}_PORT`] = String(entries[0][1]);
    }
  }
  return mergeEnvVars(opts.runtimeEnv, generated);
}

export function connectionEnvToDotenv(vars: EnvVarsMap): string {
  return envVarsToDotenv(vars);
}
