import { execFile } from 'child_process';
import os from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type HostResourceSnapshot = {
  cpuCores: number;
  loadavg1: number;
  loadavg5: number;
  loadavg15: number;
  cpuLoadPct: number;
  memTotalBytes: number;
  memFreeBytes: number;
  memUsedBytes: number;
  memUsedPct: number;
  diskPath: string;
  diskTotalBytes: number;
  diskFreeBytes: number;
  diskUsedBytes: number;
  diskUsedPct: number;
};

function diskRootPath(): string {
  const workRoot =
    process.env.PREVIA_WORK_ROOT || process.env.DEPLOYER_WORK_ROOT;
  if (workRoot?.trim()) return workRoot.trim();
  return '/';
}

async function getDiskUsage(path: string): Promise<{
  path: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPct: number;
}> {
  try {
    const { stdout } = await execFileAsync('df', ['-Pk', path], {
      env: { ...process.env },
      maxBuffer: 1024 * 1024,
    });
    const lines = stdout.trim().split('\n').filter(Boolean);
    const last = lines[lines.length - 1] || '';
    const parts = last.trim().split(/\s+/);
    const totalKb = Number(parts[1] ?? 0);
    const usedKb = Number(parts[2] ?? 0);
    const availKb = Number(parts[3] ?? 0);
    const totalBytes = Math.max(0, totalKb * 1024);
    const usedBytes = Math.max(0, usedKb * 1024);
    const freeBytes = Math.max(0, availKb * 1024);
    const usedPct =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    return { path, totalBytes, usedBytes, freeBytes, usedPct };
  } catch {
    return { path, totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPct: 0 };
  }
}

export async function collectHostResourceSnapshot(): Promise<HostResourceSnapshot> {
  const cpus = os.cpus() ?? [];
  const cores = cpus.length || 1;
  const [load1, load5, load15] = os.loadavg();
  const total = os.totalmem();
  const free = os.freemem();
  const used = Math.max(0, total - free);
  const memUsedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  const cpuLoadPct = Math.min(100, Math.round((load1 / cores) * 1000) / 10);
  const diskPath = diskRootPath();
  const disk = await getDiskUsage(diskPath);

  return {
    cpuCores: cores,
    loadavg1: load1,
    loadavg5: load5,
    loadavg15: load15,
    cpuLoadPct,
    memTotalBytes: total,
    memFreeBytes: free,
    memUsedBytes: used,
    memUsedPct,
    diskPath: disk.path,
    diskTotalBytes: disk.totalBytes,
    diskFreeBytes: disk.freeBytes,
    diskUsedBytes: disk.usedBytes,
    diskUsedPct: disk.usedPct,
  };
}
