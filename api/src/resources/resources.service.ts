import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import {
  isEnvVarsMap,
  normalizeEnvVars,
  type EnvVarsMap,
} from '../common/env-vars.util';
import { fetchDockerByName } from '../instances/docker-list.helper';
import {
  ProvisionedResource,
  type ResourceKind,
} from '../entities/provisioned-resource.entity';
import {
  buildConnectionEnv,
  connectionEnvToDotenv,
  defaultContainerPortsForImage,
  normalizeContainerPorts,
} from './resource-connection.util';
import { runResourceDown, runResourceUp } from './resource-exec.helper';

const execFileAsync = promisify(execFile);

export type ResourceListItem = {
  id: string;
  slug: string;
  label: string;
  kind: ResourceKind;
  image: string | null;
  dockerfile: string | null;
  composeYaml: string | null;
  containerPorts: number[];
  publishedPorts: Record<string, number>;
  envVars: EnvVarsMap;
  connectionEnv: EnvVarsMap;
  connectionDotenv: string;
  status: string;
  runtimeOnline: boolean;
  runtimeStatus: string | null;
  runtimeName: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ResourcesService {
  private readonly log = new Logger(ResourcesService.name);

  constructor(
    @InjectRepository(ProvisionedResource)
    private readonly repo: Repository<ProvisionedResource>,
    private readonly config: ConfigService,
  ) {}

  private runtimeNameFor(slug: string, kind: ResourceKind): string {
    if (kind === 'compose') return `prvres${slug.replace(/-/g, '')}`;
    return `prv-res-${slug}`;
  }

  private toItem(
    row: ProvisionedResource,
    runtime?: { running: boolean; status: string | null },
  ): ResourceListItem {
    const connectionEnv = normalizeEnvVars(row.connectionEnv);
    return {
      id: row.id,
      slug: row.slug,
      label: row.label,
      kind: row.kind,
      image: row.image,
      dockerfile: row.dockerfile,
      composeYaml: row.composeYaml,
      containerPorts: Array.isArray(row.containerPorts) ? row.containerPorts : [],
      publishedPorts: row.publishedPorts ?? {},
      envVars: normalizeEnvVars(row.envVars),
      connectionEnv,
      connectionDotenv: connectionEnvToDotenv(connectionEnv),
      status: row.status,
      runtimeOnline: runtime?.running ?? false,
      runtimeStatus: runtime?.status ?? null,
      runtimeName: row.runtimeName,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async runtimeFor(
    row: ProvisionedResource,
    dockerMap?: Map<string, { running: boolean; status: string | null }>,
  ) {
    const map = dockerMap ?? (await fetchDockerByName(this.config));
    const direct = map.get(row.runtimeName);
    if (direct) return direct;
    if (row.kind === 'compose') {
      for (const [name, info] of map) {
        if (name.startsWith(`${row.runtimeName}-`)) return info;
      }
    }
    return undefined;
  }

  async listLocalForApi(): Promise<ResourceListItem[]> {
    const rows = await this.repo.find({ order: { slug: 'ASC' } });
    const dockerMap = await fetchDockerByName(this.config);
    return Promise.all(
      rows.map(async (row) => this.toItem(row, await this.runtimeFor(row, dockerMap))),
    );
  }

  async getLocalOneForApi(id: string): Promise<ResourceListItem> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    return this.toItem(row, await this.runtimeFor(row));
  }

  async create(input: {
    slug: string;
    label?: string;
    kind: ResourceKind;
    image?: string;
    dockerfile?: string;
    composeYaml?: string;
    containerPorts?: number[];
    envVars?: unknown;
    start?: boolean;
  }): Promise<ResourceListItem> {
    const slug = input.slug.trim();
    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Já existe um recurso com slug "${slug}"`);
    }
    this.assertKindPayload(input.kind, input);
    let ports = normalizeContainerPorts(input.containerPorts);
    if (ports.length === 0 && input.kind === 'image' && input.image) {
      ports = defaultContainerPortsForImage(input.image);
    }
    const envVars = this.parseEnv(input.envVars);
    const row = this.repo.create({
      slug,
      label: (input.label?.trim() || slug),
      kind: input.kind,
      image: input.kind === 'image' ? input.image!.trim() : null,
      dockerfile: input.kind === 'dockerfile' ? input.dockerfile! : null,
      composeYaml: input.kind === 'compose' ? input.composeYaml! : null,
      containerPorts: ports,
      envVars,
      publishedPorts: {},
      connectionEnv: {},
      status: 'paused',
      runtimeName: this.runtimeNameFor(slug, input.kind),
      lastError: null,
    });
    const saved = await this.repo.save(row);
    if (input.start) {
      return this.startLocal(saved.id);
    }
    return this.toItem(saved);
  }

  async update(
    id: string,
    patch: {
      label?: string;
      image?: string | null;
      dockerfile?: string | null;
      composeYaml?: string | null;
      containerPorts?: number[];
      envVars?: unknown;
    },
  ): Promise<ResourceListItem> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    if (patch.label !== undefined) row.label = patch.label.trim() || row.slug;
    if (patch.image !== undefined && row.kind === 'image') {
      row.image = patch.image?.trim() || row.image;
    }
    if (patch.dockerfile !== undefined && row.kind === 'dockerfile') {
      row.dockerfile = patch.dockerfile;
    }
    if (patch.composeYaml !== undefined && row.kind === 'compose') {
      row.composeYaml = patch.composeYaml;
    }
    if (patch.containerPorts !== undefined) {
      row.containerPorts = normalizeContainerPorts(patch.containerPorts);
    }
    if (patch.envVars !== undefined) {
      row.envVars = this.parseEnv(patch.envVars);
    }
    await this.repo.save(row);
    return this.getLocalOneForApi(id);
  }

  async startLocal(id: string): Promise<ResourceListItem> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    row.status = 'starting';
    row.lastError = null;
    await this.repo.save(row);
    try {
      const result = await runResourceUp({
        config: this.config,
        slug: row.slug,
        kind: row.kind,
        image: row.image,
        dockerfile: row.dockerfile,
        composeYaml: row.composeYaml,
        containerPorts: row.containerPorts,
        envVars: normalizeEnvVars(row.envVars),
      });
      row.runtimeName = result.runtimeName || row.runtimeName;
      row.publishedPorts = result.publishedPorts ?? {};
      row.connectionEnv = buildConnectionEnv({
        slug: row.slug,
        publishedPorts: row.publishedPorts,
        runtimeEnv: normalizeEnvVars(row.envVars),
      });
      row.status = 'running';
      row.lastError = null;
      await this.repo.save(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const stderr = (e as { stderr?: string }).stderr;
      row.status = 'error';
      row.lastError = stderr ? `${msg}\n${stderr}` : msg;
      await this.repo.save(row);
      this.log.warn(`resource start ${row.slug}: ${row.lastError}`);
    }
    return this.getLocalOneForApi(id);
  }

  async stopLocal(id: string): Promise<ResourceListItem> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    try {
      await runResourceDown(this.config, row.slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`resource stop ${row.slug}: ${msg}`);
    }
    row.status = 'paused';
    await this.repo.save(row);
    return this.getLocalOneForApi(id);
  }

  async removeLocal(id: string): Promise<{ ok: true }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    try {
      await runResourceDown(this.config, row.slug);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`resource remove ${row.slug}: ${msg}`);
    }
    await this.repo.remove(row);
    return { ok: true };
  }

  async logsLocal(
    id: string,
    lines: number,
  ): Promise<{ runtimeName: string; lines: number; output: string }> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Recurso não encontrado');
    const safeLines = Math.min(Math.max(lines, 10), 2000);
    try {
      if (row.kind === 'compose') {
        const { stdout, stderr } = await execFileAsync(
          'docker',
          [
            'compose',
            '-p',
            row.runtimeName,
            'logs',
            '--no-color',
            '--tail',
            String(safeLines),
          ],
          { env: { ...process.env }, maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
        );
        return {
          runtimeName: row.runtimeName,
          lines: safeLines,
          output: (stdout || stderr || '').trim() || '(sem logs)',
        };
      }
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['logs', '--tail', String(safeLines), row.runtimeName],
        { env: { ...process.env }, maxBuffer: 4 * 1024 * 1024, timeout: 15_000 },
      );
      return {
        runtimeName: row.runtimeName,
        lines: safeLines,
        output: (stdout || stderr || '').trim() || '(sem logs)',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        runtimeName: row.runtimeName,
        lines: safeLines,
        output: row.lastError
          ? `${row.lastError}\n\n--- docker logs ---\n${msg}`
          : msg,
      };
    }
  }

  private parseEnv(value: unknown): EnvVarsMap {
    if (value == null) return {};
    if (!isEnvVarsMap(value)) {
      throw new BadRequestException('envVars deve ser um mapa KEY → string');
    }
    return normalizeEnvVars(value);
  }

  private assertKindPayload(
    kind: ResourceKind,
    input: { image?: string; dockerfile?: string; composeYaml?: string },
  ) {
    if (kind === 'image' && !input.image?.trim()) {
      throw new BadRequestException('image é obrigatório para kind=image');
    }
    if (kind === 'dockerfile' && !input.dockerfile?.trim()) {
      throw new BadRequestException('dockerfile é obrigatório para kind=dockerfile');
    }
    if (kind === 'compose' && !input.composeYaml?.trim()) {
      throw new BadRequestException('composeYaml é obrigatório para kind=compose');
    }
  }
}
