import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import * as os from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type Pm2Monit = {
  memory?: number;
  /**
   * Uso de CPU relativo ao host (0–100+%), já normalizado por número de cores.
   * PM2 reporta 100% = 1 core; aqui dividimos por `hostCores`.
   */
  cpu?: number;
  /** Valor bruto do PM2 (100% = 1 core). */
  cpuPerCore?: number;
  hostCores?: number;
};

type Pm2Row = {
  name?: string;
  status?: string | null;
  monit?: { memory?: number; cpu?: number };
};

function hostCpuCount(): number {
  return Math.max(1, os.cpus()?.length ?? 1);
}

/**
 * PM2 `monit.cpu` usa 100% = 1 core (pode passar de 100% em multi-core).
 * Normalizamos para % do host para a UI não parecer “quebrada”.
 */
export function normalizePm2Monit(
  monit?: { memory?: number; cpu?: number } | null,
  cores = hostCpuCount(),
): Pm2Monit | undefined {
  if (!monit) return undefined;

  const hostCores = Math.max(1, cores);
  const cpuPerCore =
    typeof monit.cpu === 'number' && Number.isFinite(monit.cpu)
      ? monit.cpu
      : undefined;

  return {
    memory: monit.memory,
    cpuPerCore,
    hostCores,
    cpu:
      cpuPerCore != null
        ? Math.round((cpuPerCore / hostCores) * 10) / 10
        : undefined,
  };
}

export async function fetchPm2ByName(
  config: ConfigService,
): Promise<Map<string, { status: string | null; monit?: Pm2Monit }>> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const script = join(coreDir, 'bin', 'list-instances.sh');
  let rows: Pm2Row[] = [];
  try {
    const { stdout } = await execFileAsync(script, [], {
      env: { ...process.env },
    });
    rows = JSON.parse(stdout.trim() || '[]') as Pm2Row[];
  } catch {
    rows = [];
  }
  const cores = hostCpuCount();
  const map = new Map<string, { status: string | null; monit?: Pm2Monit }>();
  for (const r of rows) {
    if (r.name) {
      map.set(r.name, {
        status: r.status ?? null,
        monit: normalizePm2Monit(r.monit, cores),
      });
    }
  }
  // Alias órfãos legados `canonical.eco.XXXX` → canonical (para status na UI).
  for (const r of rows) {
    const n = r.name;
    if (!n) continue;
    const m = /^(.*)\.eco\.[A-Za-z0-9]+$/.exec(n);
    if (!m) continue;
    const canonical = m[1];
    const existing = map.get(canonical);
    const row = {
      status: r.status ?? null,
      monit: normalizePm2Monit(r.monit, cores),
    };
    if (!existing) {
      map.set(canonical, row);
      continue;
    }
    // Prefere online sobre errored/stopped.
    if (existing.status !== 'online' && row.status === 'online') {
      map.set(canonical, row);
    }
  }
  return map;
}
