import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import os from 'os';
import { In, Repository } from 'typeorm';
import { promisify } from 'util';
import { PreviewInstanceStatusEvent } from '../entities/preview-instance-status-event.entity';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { SettingsService } from '../settings/settings.service';

const execFileAsync = promisify(execFile);

export type DashboardSummary = {
  maxActiveInstances: number;
  instancesByStatus: Record<string, number>;
  recentProjects: { slug: string; lastActivityAt: string }[];
  host: {
    cpu: { cores: number; loadavg1: number; loadavg5: number; loadavg15: number };
    memory: { totalBytes: number; freeBytes: number; usedBytes: number; usedPct: number };
    disk: { path: string; totalBytes: number; freeBytes: number; usedBytes: number; usedPct: number };
  };
  recentStatusChanges: {
    at: string;
    instanceId: string;
    projectSlug: string;
    branch: string;
    from: string | null;
    to: string;
  }[];
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(PreviewInstance)
    private readonly instances: Repository<PreviewInstance>,
    @InjectRepository(PreviewInstanceStatusEvent)
    private readonly events: Repository<PreviewInstanceStatusEvent>,
    private readonly settings: SettingsService,
  ) {}

  async summary(): Promise<DashboardSummary> {
    const maxActiveInstances = await this.settings.getMaxActiveInstances();

    const host = await this.getHostStats();

    const rawCounts = await this.instances
      .createQueryBuilder('i')
      .select('i.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('i.status')
      .getRawMany<{ status: string; cnt: string }>();
    const instancesByStatus: Record<string, number> = {};
    for (const r of rawCounts) {
      instancesByStatus[r.status] = parseInt(r.cnt, 10);
    }

    const recentProjectsRaw = await this.instances
      .createQueryBuilder('i')
      .innerJoin('i.project', 'p')
      .select('p.slug', 'slug')
      .addSelect('MAX(i.updated_at)', 'lastAt')
      .groupBy('p.id')
      .addGroupBy('p.slug')
      // Postgres lowercases identifiers in ORDER BY; quote alias to match "lastAt"
      .orderBy('"lastAt"', 'DESC')
      .limit(8)
      .getRawMany<{ slug: string; lastAt: Date }>();

    const recentProjects = recentProjectsRaw.map((r) => ({
      slug: r.slug,
      lastActivityAt: new Date(r.lastAt).toISOString(),
    }));

    const ev = await this.events
      .createQueryBuilder('e')
      .orderBy('e.created_at', 'DESC')
      .limit(15)
      .getMany();

    const instanceIds = [...new Set(ev.map((x) => x.instanceId))];
    const instRows =
      instanceIds.length > 0
        ? await this.instances.find({
            where: { id: In(instanceIds) },
            relations: ['project'],
          })
        : [];
    const byId = new Map(instRows.map((i) => [i.id, i]));

    const recentStatusChanges = ev.map((e) => {
      const i = byId.get(e.instanceId);
      return {
        at: e.createdAt.toISOString(),
        instanceId: e.instanceId,
        projectSlug: i?.project?.slug ?? '(removido)',
        branch: i?.branch ?? '—',
        from: e.oldStatus,
        to: e.newStatus,
      };
    });

    return {
      maxActiveInstances,
      instancesByStatus,
      recentProjects,
      host,
      recentStatusChanges,
    };
  }

  private async getHostStats(): Promise<DashboardSummary['host']> {
    const cpus = os.cpus() ?? [];
    const [load1, load5, load15] = os.loadavg();

    const total = os.totalmem();
    const free = os.freemem();
    const used = Math.max(0, total - free);
    const usedPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

    const diskPath = this.diskRootPath();
    const disk = await this.getDiskUsage(diskPath);

    return {
      cpu: {
        cores: cpus.length || 1,
        loadavg1: load1,
        loadavg5: load5,
        loadavg15: load15,
      },
      memory: { totalBytes: total, freeBytes: free, usedBytes: used, usedPct },
      disk,
    };
  }

  private diskRootPath(): string {
    // Prefer medir o disco que contém o PREVIA_WORK_ROOT (é onde ficam os checkouts/builds).
    // Para df funcionar de forma consistente, usamos o diretório como alvo.
    try {
      const workRoot = process.env.PREVIA_WORK_ROOT || process.env.DEPLOYER_WORK_ROOT;
      if (workRoot && workRoot.trim()) return workRoot.trim();
    } catch {
      /* ignore */
    }
    return '/';
  }

  private async getDiskUsage(path: string): Promise<DashboardSummary['host']['disk']> {
    try {
      // df -P: POSIX; -k: 1K blocks. Parse da última linha.
      const { stdout } = await execFileAsync('df', ['-Pk', path], {
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      });
      const lines = stdout.trim().split('\n').filter(Boolean);
      const last = lines[lines.length - 1] || '';
      const parts = last.trim().split(/\s+/);
      // Filesystem 1024-blocks Used Available Capacity Mounted on
      // 0          1           2    3         4       5..(mount with spaces)
      const totalKb = Number(parts[1] ?? 0);
      const usedKb = Number(parts[2] ?? 0);
      const availKb = Number(parts[3] ?? 0);
      const totalBytes = Math.max(0, totalKb * 1024);
      const usedBytes = Math.max(0, usedKb * 1024);
      const freeBytes = Math.max(0, availKb * 1024);
      const usedPct = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
      return { path, totalBytes, usedBytes, freeBytes, usedPct };
    } catch {
      return { path, totalBytes: 0, usedBytes: 0, freeBytes: 0, usedPct: 0 };
    }
  }
}
