import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ClusterAggregatorService } from '../cluster/cluster-aggregator.service';
import { parseRemoteId } from '../cluster/cluster.types';
import {
  extractStoredRuntimeLogs,
} from '../preview-instances/runtime-logs.helper';
import {
  PreviewInstancesService,
  type InstanceListItem,
} from '../preview-instances/preview-instances.service';
import type { UpdateInstanceDto } from './dto/update-instance.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class InstancesService {
  private readonly log = new Logger(InstancesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly previewInstances: PreviewInstancesService,
    private readonly cluster: ClusterAggregatorService,
  ) {}

  async listLocalForApi(): Promise<InstanceListItem[]> {
    const maps = await this.previewInstances.fetchRuntimeMaps();
    return this.previewInstances.findAllForApi(maps);
  }

  async getLocalOneForApi(id: string): Promise<InstanceListItem> {
    const maps = await this.previewInstances.fetchRuntimeMaps();
    return this.previewInstances.findOneForApi(id, maps);
  }

  async listForApi() {
    return this.cluster.aggregateInstances();
  }

  async getOneForApi(id: string) {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.getRemoteInstance(remote.nodeId, remote.remoteId);
    }
    const maps = await this.previewInstances.fetchRuntimeMaps();
    const row = await this.previewInstances.findOneForApi(id, maps);
    return this.cluster.tagLocal(row);
  }

  async update(id: string, dto: UpdateInstanceDto): Promise<InstanceListItem> {
    const remote = parseRemoteId(id);
    if (remote) {
      throw new NotFoundException(
        'Edição de instâncias remotas ainda não é suportada; edite no nó de origem',
      );
    }
    if (
      dto.envVars === undefined &&
      dto.clickupTaskUrl === undefined &&
      dto.clickupLinkFromBranch === undefined
    ) {
      return this.getOneForApi(id);
    }
    if (dto.envVars !== undefined) {
      await this.previewInstances.updateEnvVars(id, dto.envVars);
    }
    if (dto.clickupLinkFromBranch === true) {
      const row = await this.previewInstances.linkClickupTaskFromBranch(id);
      return this.cluster.tagLocal(row);
    }
    if (dto.clickupTaskUrl !== undefined) {
      const row = await this.previewInstances.updateClickupTaskLink(
        id,
        dto.clickupTaskUrl,
      );
      return this.cluster.tagLocal(row);
    }
    const maps = await this.previewInstances.fetchRuntimeMaps();
    const row = await this.previewInstances.findOneForApi(id, maps);
    return this.cluster.tagLocal(row);
  }

  async pause(id: string): Promise<InstanceListItem> {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.pauseRemoteInstance(remote.nodeId, remote.remoteId);
    }
    const row = await this.previewInstances.pauseInstance(id);
    return this.cluster.tagLocal(row);
  }

  async activate(id: string): Promise<InstanceListItem> {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.activateRemoteInstance(remote.nodeId, remote.remoteId);
    }
    const row = await this.previewInstances.activateOrRedeployInstance(id);
    return this.cluster.tagLocal(row);
  }

  async awake(id: string): Promise<InstanceListItem> {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.awakeRemoteInstance(remote.nodeId, remote.remoteId);
    }
    const row = await this.previewInstances.awakeInstance(id);
    return this.cluster.tagLocal(row);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.removeRemoteInstance(remote.nodeId, remote.remoteId);
    }
    await this.previewInstances.destroyInstanceById(id);
    return { ok: true };
  }

  async logsForInstance(id: string, lines: number): Promise<{
    pm2Name: string;
    lines: number;
    output: string;
  }> {
    const remote = parseRemoteId(id);
    if (remote) {
      return this.cluster.remoteInstanceLogs(
        remote.nodeId,
        remote.remoteId,
        lines,
      );
    }
    const row = await this.previewInstances.findEntityById(id);
    if (!row) {
      throw new NotFoundException(`Instância "${id}" não encontrada`);
    }
    const safeLines = Math.min(Math.max(lines, 10), 2000);
    const name = row.pm2Name.replace(/[^\w.-]/g, '');
    if (name !== row.pm2Name) {
      throw new NotFoundException('Nome PM2 inválido');
    }
    if (row.status === 'error') {
      const storedLogs = extractStoredRuntimeLogs(row.lastDeployError);
      if (storedLogs) {
        return {
          pm2Name: name,
          lines: safeLines,
          output: storedLogs,
        };
      }
    }
    if (!['active', 'error', 'paused', 'deploying'].includes(row.status)) {
      return {
        pm2Name: name,
        lines: safeLines,
        output: `Sem processo ativo para esta instância (status: ${row.status}). Use “Awake” (idle sleep) ou “Activate / redeploy” na página da instância quando houver vaga.`,
      };
    }
    try {
      if (row.runner === 'docker') {
        const { stdout, stderr } = await execFileAsync(
          'docker',
          ['logs', '--tail', String(safeLines), name],
          {
            maxBuffer: 10 * 1024 * 1024,
            env: { ...process.env },
          },
        );
        const out = [stdout, stderr].filter(Boolean).join('\n');
        return { pm2Name: name, lines: safeLines, output: out || '(sem saída)' };
      }

      const pm2Name = await this.resolvePm2ProcessName(name);
      const { stdout, stderr } = await execFileAsync(
        'pm2',
        ['logs', pm2Name, '--lines', String(safeLines), '--nostream'],
        {
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env },
        },
      );
      const out = [stdout, stderr].filter(Boolean).join('\n');
      const note =
        pm2Name !== name
          ? `(PM2 process name: ${pm2Name} — legacy eco.* orphan; redeploy to fix)\n\n`
          : '';
      return {
        pm2Name: name,
        lines: safeLines,
        output: note + (out || '(sem saída)'),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const backend = row.runner === 'docker' ? 'Docker' : 'PM2';
      this.log.warn(`${backend} logs ${name}: ${msg}`);
      return {
        pm2Name: name,
        lines: safeLines,
        output: `Não foi possível obter logs do ${backend}.\n${msg}`,
      };
    }
  }

  /**
   * Resolve o nome real no PM2: canônico ou órfão legado `name.eco.XXXX`
   * (bug do tempfile do ecosystem).
   */
  private async resolvePm2ProcessName(canonical: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('pm2', ['jlist'], {
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
      });
      const apps = JSON.parse(stdout || '[]') as Array<{
        name?: string;
        pm2_env?: { name?: string; status?: string };
      }>;
      const names = apps.map(
        (a) => a.pm2_env?.name || a.name || '',
      ).filter(Boolean);
      if (names.includes(canonical)) return canonical;
      const orphans = names.filter((n) => n.startsWith(`${canonical}.eco.`));
      if (orphans.length === 0) return canonical;
      // Prefer online, else most recently listed orphan
      const online = apps.find((a) => {
        const n = a.pm2_env?.name || a.name;
        return n && orphans.includes(n) && a.pm2_env?.status === 'online';
      });
      if (online) return online.pm2_env?.name || online.name || orphans[0];
      return orphans[orphans.length - 1];
    } catch {
      return canonical;
    }
  }
}
