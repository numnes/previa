import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { readdir, open, stat } from 'fs/promises';
import { join } from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { HostMetricSample } from '../entities/host-metric-sample.entity';
import { NetworkRequestEvent } from '../entities/network-request-event.entity';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { resolveRegion } from './geo-region.util';
import { collectHostResourceSnapshot } from './host-stats.util';
import { parseNginxCombinedLine } from './nginx-access-log.parser';

export const METRICS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const NETWORK_ROW_CAP = 50_000;
const PAYLOAD_MAX = 2048;
const MAX_CHART_POINTS = 500;

export type HostMetricPoint = {
  at: string;
  cpuLoadPct: number;
  loadavg1: number;
  loadavg5: number;
  loadavg15: number;
  memUsedPct: number;
  diskUsedPct: number;
  memUsedBytes: number;
  memTotalBytes: number;
  diskUsedBytes: number;
  diskTotalBytes: number;
  cpuCores: number;
};

export type HostMetricsHistory = {
  retentionDays: number;
  from: string;
  to: string;
  points: HostMetricPoint[];
};

export type NetworkRequestRow = {
  id: string;
  at: string;
  ip: string;
  method: string;
  endpoint: string;
  payload: string | null;
  statusCode: number;
  region: string | null;
  userAgent: string | null;
  projectSlug: string | null;
  branchSlug: string | null;
};

export type NetworkRequestsPage = {
  retentionDays: number;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: NetworkRequestRow[];
};

type LogCursor = { size: number; inode: number | null };

@Injectable()
export class MetricsService {
  private readonly log = new Logger(MetricsService.name);
  private readonly logCursors = new Map<string, LogCursor>();
  private collecting = false;

  constructor(
    @InjectRepository(HostMetricSample)
    private readonly hostRepo: Repository<HostMetricSample>,
    @InjectRepository(NetworkRequestEvent)
    private readonly networkRepo: Repository<NetworkRequestEvent>,
    @InjectRepository(PreviewInstance)
    private readonly instances: Repository<PreviewInstance>,
    private readonly config: ConfigService,
  ) {}

  async collectTick(): Promise<void> {
    if (this.collecting) return;
    this.collecting = true;
    try {
      await this.recordHostSample();
      await this.ingestActivityLogs();
      await this.pruneOldData();
    } finally {
      this.collecting = false;
    }
  }

  async recordHostSample(): Promise<void> {
    const snap = await collectHostResourceSnapshot();
    const row = this.hostRepo.create({
      recordedAt: new Date(),
      cpuCores: snap.cpuCores,
      loadavg1: snap.loadavg1,
      loadavg5: snap.loadavg5,
      loadavg15: snap.loadavg15,
      cpuLoadPct: snap.cpuLoadPct,
      memTotalBytes: String(snap.memTotalBytes),
      memUsedBytes: String(snap.memUsedBytes),
      memUsedPct: snap.memUsedPct,
      diskPath: snap.diskPath,
      diskTotalBytes: String(snap.diskTotalBytes),
      diskUsedBytes: String(snap.diskUsedBytes),
      diskUsedPct: snap.diskUsedPct,
    });
    await this.hostRepo.save(row);
  }

  async getHostHistory(days = 7): Promise<HostMetricsHistory> {
    const clamped = Math.min(7, Math.max(1, Math.floor(days) || 7));
    const to = new Date();
    const from = new Date(to.getTime() - clamped * 24 * 60 * 60 * 1000);
    const rows = await this.hostRepo
      .createQueryBuilder('s')
      .where('s.recorded_at >= :from', { from })
      .andWhere('s.recorded_at <= :to', { to })
      .orderBy('s.recorded_at', 'ASC')
      .getMany();

    const mapped = rows.map((r) => this.toPoint(r));
    return {
      retentionDays: 7,
      from: from.toISOString(),
      to: to.toISOString(),
      points: this.downsample(mapped, MAX_CHART_POINTS),
    };
  }

  async listNetworkRequests(opts?: {
    page?: number;
    pageSize?: number;
    /** Teto de pageSize (UI=100; cluster merge pode pedir mais). */
    maxPageSize?: number;
  }): Promise<NetworkRequestsPage> {
    const page = Math.max(1, Math.floor(opts?.page ?? 1) || 1);
    const maxPageSize = Math.min(
      5000,
      Math.max(1, Math.floor(opts?.maxPageSize ?? 100) || 100),
    );
    const pageSize = Math.min(
      maxPageSize,
      Math.max(1, Math.floor(opts?.pageSize ?? 50) || 50),
    );
    const to = new Date();
    const from = new Date(to.getTime() - METRICS_RETENTION_MS);
    const [rows, total] = await this.networkRepo.findAndCount({
      where: { occurredAt: MoreThanOrEqual(from) },
      order: { occurredAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      retentionDays: 7,
      from: from.toISOString(),
      to: to.toISOString(),
      page,
      pageSize,
      total,
      totalPages,
      items: rows.map((r) => ({
        id: r.id,
        at: r.occurredAt.toISOString(),
        ip: r.remoteAddr,
        method: r.method,
        endpoint: r.path,
        payload: r.payload,
        statusCode: r.statusCode,
        region: r.region,
        userAgent: r.userAgent,
        projectSlug: r.projectSlug,
        branchSlug: r.branchSlug,
      })),
    };
  }

  private toPoint(r: HostMetricSample): HostMetricPoint {
    return {
      at: r.recordedAt.toISOString(),
      cpuLoadPct: r.cpuLoadPct,
      loadavg1: r.loadavg1,
      loadavg5: r.loadavg5,
      loadavg15: r.loadavg15,
      memUsedPct: r.memUsedPct,
      diskUsedPct: r.diskUsedPct,
      memUsedBytes: Number(r.memUsedBytes),
      memTotalBytes: Number(r.memTotalBytes),
      diskUsedBytes: Number(r.diskUsedBytes),
      diskTotalBytes: Number(r.diskTotalBytes),
      cpuCores: r.cpuCores,
    };
  }

  private downsample(points: HostMetricPoint[], max: number): HostMetricPoint[] {
    if (points.length <= max) return points;
    const out: HostMetricPoint[] = [];
    const step = (points.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) {
      out.push(points[Math.round(i * step)]!);
    }
    return out;
  }

  private activityDir(): string {
    const workRoot =
      this.config.get<string>('PREVIA_WORK_ROOT') ||
      this.config.get<string>('DEPLOYER_WORK_ROOT') ||
      join(process.env.HOME || '/tmp', '.local/share/previa');
    const previaState = join(workRoot, '.previa-state');
    const legacyState = join(workRoot, '.deployer-state');
    // Prefer .previa-state; fall back to legacy dir name if only that exists.
    const stateDir = existsSync(previaState)
      ? previaState
      : existsSync(legacyState)
        ? legacyState
        : previaState;
    return join(stateDir, 'activity');
  }

  private extraAccessLogPaths(): string[] {
    const raw =
      this.config.get<string>('PREVIA_NGINX_ACCESS_LOG') ||
      process.env.PREVIA_NGINX_ACCESS_LOG ||
      '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private async instanceLogIndex(): Promise<
    Map<string, { projectSlug: string; branchSlug: string }>
  > {
    const rows = await this.instances.find({ relations: ['project'] });
    const map = new Map<string, { projectSlug: string; branchSlug: string }>();
    for (const row of rows) {
      if (!row.project) continue;
      const name = `${row.project.slug}-${row.branchSlug}.log`;
      map.set(name, {
        projectSlug: row.project.slug,
        branchSlug: row.branchSlug,
      });
    }
    return map;
  }

  private async ingestActivityLogs(): Promise<void> {
    const index = await this.instanceLogIndex();
    const cutoff = Date.now() - METRICS_RETENTION_MS;
    const files: { path: string; projectSlug: string | null; branchSlug: string | null }[] =
      [];

    try {
      const dir = this.activityDir();
      const names = await readdir(dir);
      for (const name of names) {
        if (!name.endsWith('.log')) continue;
        const meta = index.get(name) ?? null;
        files.push({
          path: join(dir, name),
          projectSlug: meta?.projectSlug ?? null,
          branchSlug: meta?.branchSlug ?? null,
        });
      }
    } catch {
      /* activity dir may not exist yet */
    }

    for (const extra of this.extraAccessLogPaths()) {
      files.push({ path: extra, projectSlug: null, branchSlug: null });
    }

    for (const file of files) {
      try {
        await this.ingestLogFile(file.path, file.projectSlug, file.branchSlug, cutoff);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`metrics log ingest ${file.path}: ${msg}`);
      }
    }
  }

  private async ingestLogFile(
    filePath: string,
    projectSlug: string | null,
    branchSlug: string | null,
    cutoffMs: number,
  ): Promise<void> {
    let st;
    try {
      st = await stat(filePath);
    } catch {
      return;
    }
    if (!st.isFile()) return;

    const inode = typeof st.ino === 'number' ? st.ino : null;
    const prev = this.logCursors.get(filePath);
    let start = 0;
    if (prev && prev.inode === inode && prev.size <= st.size) {
      start = prev.size;
    } else if (prev && prev.inode === inode && prev.size > st.size) {
      start = 0; // truncated
    } else if (!prev) {
      // Restart: só cauda recente (evita reprocessar logs enormes).
      start = Math.max(0, st.size - 2 * 1024 * 1024);
    }

    if (start >= st.size) {
      this.logCursors.set(filePath, { size: st.size, inode });
      return;
    }

    const fh = await open(filePath, 'r');
    try {
      const length = st.size - start;
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, start);
      let text = buf.toString('utf8');
      if (start > 0 && text.length > 0 && text[0] !== '\n') {
        const nl = text.indexOf('\n');
        if (nl !== -1) text = text.slice(nl + 1);
      }
      const lines = text.split('\n');
      const batch: NetworkRequestEvent[] = [];
      for (const line of lines) {
        const parsed = parseNginxCombinedLine(line);
        if (!parsed) continue;
        if (parsed.occurredAt.getTime() < cutoffMs) continue;
        const lineHash = createHash('sha256')
          .update(`${filePath}\n${line}`)
          .digest('hex');
        batch.push(
          this.networkRepo.create({
            occurredAt: parsed.occurredAt,
            remoteAddr: parsed.remoteAddr.slice(0, 64),
            method: parsed.method.slice(0, 16),
            path: parsed.path.slice(0, 2048),
            payload: parsed.payload ? parsed.payload.slice(0, PAYLOAD_MAX) : null,
            statusCode: parsed.statusCode,
            region: resolveRegion(parsed.remoteAddr),
            userAgent: parsed.userAgent,
            projectSlug,
            branchSlug,
            lineHash,
          }),
        );
        if (batch.length >= 200) {
          await this.insertNetworkBatch(batch);
          batch.length = 0;
        }
      }
      if (batch.length) await this.insertNetworkBatch(batch);
      this.logCursors.set(filePath, { size: st.size, inode });
    } finally {
      await fh.close();
    }
  }

  private async insertNetworkBatch(batch: NetworkRequestEvent[]): Promise<void> {
    if (!batch.length) return;
    await this.networkRepo
      .createQueryBuilder()
      .insert()
      .into(NetworkRequestEvent)
      .values(batch)
      .orIgnore()
      .execute();
  }

  private async pruneOldData(): Promise<void> {
    const cutoff = new Date(Date.now() - METRICS_RETENTION_MS);
    await this.hostRepo.delete({ recordedAt: LessThan(cutoff) });
    await this.networkRepo.delete({ occurredAt: LessThan(cutoff) });

    const count = await this.networkRepo.count();
    if (count > NETWORK_ROW_CAP) {
      const overflow = count - NETWORK_ROW_CAP;
      const old = await this.networkRepo.find({
        order: { occurredAt: 'ASC' },
        take: overflow,
        select: ['id'],
      });
      if (old.length) {
        await this.networkRepo.delete(old.map((r) => r.id));
      }
    }
  }
}
