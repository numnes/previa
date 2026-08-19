import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  isEnvVarsMap,
  normalizeEnvVars,
  type EnvVarsMap,
} from '../common/env-vars.util';
import type { DeployMeta } from '../deploy/deploy-meta';
import type { DeployJobPayload } from '../deploy/deploy.processor';
import { formatDeployError } from '../deploy/format-deploy-error';
import {
  runCoreDeployScript,
  runCorePauseScript,
  runCoreResumeScript,
  runCoreSleepScript,
  type DeployAppEnvInput,
} from '../deploy/deploy-exec.helper';
import { pm2AppName, sanitizeBranchSlug, previewUriPath } from '../deploy/pm2-name.util';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { PreviewInstanceStatusEvent } from '../entities/preview-instance-status-event.entity';
import { ProjectsService } from '../projects/projects.service';
import { fetchPm2ByName, type Pm2Monit } from '../instances/pm2-list.helper';
import { fetchDockerByName } from '../instances/docker-list.helper';
import { SettingsService } from '../settings/settings.service';
import {
  DiscordNotificationsService,
  type StatusChangeNotifyPayload,
} from '../notifications/discord-notifications.service';
import type { PreviewStatus } from './preview-status';
import {
  computeActiveExpiresAt,
  computeExistenceExpiresAt,
  lifetimeDurationMs,
} from './instance-lifetime.util';
import {
  buildHealthCheckUrl,
  HEALTH_CHECK_POLL_INTERVAL_MS,
  normalizeHealthCheckPath,
  probeHealthCheckUrl,
  resolveExpectedHealthStatus,
  resolveHealthCheckTimeoutMinutes,
  sleep,
} from './health-check.util';
import {
  appendRuntimeLogsToError,
  captureRuntimeLogs,
} from './runtime-logs.helper';
import { WakeQueue } from './wake-queue';
import { stat } from 'fs/promises';
import { existsSync } from 'fs';

export type { DeployMeta } from '../deploy/deploy-meta';

const execFileAsync = promisify(execFile);

export type RuntimeInfo = {
  online: boolean;
  status: string | null;
  monit?: Pm2Monit | null;
};

export type RuntimeMaps = {
  pm2: Map<string, { status: string | null; monit?: Pm2Monit }>;
  docker: Map<string, { running: boolean; status: string | null }>;
};

export type InstanceListItem = {
  id: string;
  projectId: string;
  projectSlug: string;
  projectServerUrl: string | null;
  branch: string;
  branchSlug: string;
  pm2Name: string;
  /** Nome do processo/container em execução (pm2 name ou docker container). */
  runtimeName: string;
  /** pm2 | docker */
  runner: string;
  port: number | null;
  status: string;
  /** Runtime (pm2 ou docker) reporta processo online (pode divergir do status do banco). */
  runtimeOnline: boolean;
  /** Status bruto do runtime (ex.: "online" no pm2, "Up 2 minutes" no docker). */
  runtimeStatus: string | null;
  /** @deprecated use runtimeOnline */
  pm2Online: boolean;
  /** @deprecated use runtimeOnline */
  active: boolean;
  /** @deprecated use runtimeStatus */
  pm2Status: string | null;
  monit?: Pm2Monit | null;
  previewUrl: string | null;
  /** Mensagem do último deploy com falha (status error). */
  lastDeployError: string | null;
  /** Pausa automática quando active (ISO). null = sem limite ou não está active. */
  activeExpiresAt: Date | null;
  /** Remoção automática desde criação (ISO). null = sem limite. */
  existenceExpiresAt: Date | null;
  hasActiveLifetimeLimit: boolean;
  hasExistenceLifetimeLimit: boolean;
  /** Override de env desta instância. */
  envVars: EnvVarsMap;
  /** Envs padrão do projeto (antes do merge com envVars). */
  projectEnvVars: EnvVarsMap;
  /** Pausa automática por inatividade (idle sleep); nginx aponta para wake. */
  idleSleep: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PreviewInstancesService {
  private readonly log = new Logger(PreviewInstancesService.name);
  /** Fila serial de wake (idle sleep): uma instância por vez por nó. */
  private readonly wakeQueue = new WakeQueue();

  constructor(
    @InjectRepository(PreviewInstance)
    private readonly repo: Repository<PreviewInstance>,
    @InjectRepository(PreviewInstanceStatusEvent)
    private readonly events: Repository<PreviewInstanceStatusEvent>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projects: ProjectsService,
    private readonly settings: SettingsService,
    private readonly discordNotifications: DiscordNotificationsService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectQueue('deploy')
    private readonly deployQueue: Queue<DeployJobPayload>,
  ) {}

  private async enqueueRedeployJob(projectSlug: string, branch: string, gitUrl: string) {
    const branchSlug = sanitizeBranchSlug(branch);
    const jobId = `deploy:${projectSlug}:${branchSlug}`;
    try {
      await this.deployQueue.add(
        'create',
        { projectSlug, branch, gitUrl },
        {
          jobId,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Job já na fila (mesmo jobId) — ok sob concorrência / processWaitingQueue.
      if (/already exists|Job.*exist/i.test(msg)) {
        this.log.debug(`Deploy job já enfileirado: ${jobId}`);
        return;
      }
      throw e;
    }
  }
  private async appendEvent(
    instanceId: string,
    oldStatus: string | null,
    newStatus: string,
  ) {
    await this.events.save(
      this.events.create({
        instanceId,
        oldStatus,
        newStatus,
      }),
    );
    this.discordNotifications.notifyStatusChangeSafe({
      instanceId,
      oldStatus,
      newStatus,
    });
  }

  private async setStatus(row: PreviewInstance, next: PreviewStatus) {
    const prev = row.status;
    if (prev === next) return row;
    row.status = next;
    if (next === 'active') {
      row.activatedAt = new Date();
      row.idleSleep = false;
    }
    const saved = await this.repo.save(row);
    await this.appendEvent(saved.id, prev, next);
    return saved;
  }

  async countActiveSlots(): Promise<number> {
    return this.repo.count({ where: { status: 'active' } });
  }

  /** Slots ocupados: active + deploying (reserva enquanto o build/start roda). */
  async countOccupiedSlots(): Promise<number> {
    return this.repo.count({
      where: { status: In(['active', 'deploying']) },
    });
  }

  /**
   * Reserva atômica de slot (advisory lock) antes do shell de deploy.
   * Conta active+deploying. Mesma branch já active/deploying reusa o slot.
   * Sem vaga → status waiting e retorna 'queued'.
   */
  async reserveDeployOrQueue(
    projectSlug: string,
    branch: string,
  ): Promise<'queued' | 'run'> {
    const max = await this.settings.getMaxActiveInstances();
    const branchSlug = sanitizeBranchSlug(branch);
    const pm2Name = pm2AppName(projectSlug, branch);
    const pendingNotifications: StatusChangeNotifyPayload[] = [];

    const result = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtext('previa-slot-reserve'))`,
      );

      const project = await this.projects.getBySlug(projectSlug);
      const repo = manager.getRepository(PreviewInstance);
      const eventsRepo = manager.getRepository(PreviewInstanceStatusEvent);
      let row = await repo.findOne({
        where: { projectId: project.id, branch },
      });

      const occupiesSlot =
        !!row && (row.status === 'active' || row.status === 'deploying');
      const occupied = await repo.count({
        where: { status: In(['active', 'deploying']) },
      });

      if (!occupiesSlot && occupied >= max) {
        if (!row) {
          row = repo.create({
            projectId: project.id,
            branch,
            branchSlug,
            pm2Name,
            port: null,
            status: 'waiting',
            idleSleep: false,
          });
          await repo.save(row);
          await eventsRepo.save(
            eventsRepo.create({
              instanceId: row.id,
              oldStatus: null,
              newStatus: 'waiting',
            }),
          );
          pendingNotifications.push({
            instanceId: row.id,
            oldStatus: null,
            newStatus: 'waiting',
          });
        } else if (row.status !== 'waiting') {
          const prev = row.status;
          row.branchSlug = branchSlug;
          row.pm2Name = pm2Name;
          row.status = 'waiting';
          await repo.save(row);
          await eventsRepo.save(
            eventsRepo.create({
              instanceId: row.id,
              oldStatus: prev,
              newStatus: 'waiting',
            }),
          );
          pendingNotifications.push({
            instanceId: row.id,
            oldStatus: prev,
            newStatus: 'waiting',
          });
        } else {
          row.branchSlug = branchSlug;
          row.pm2Name = pm2Name;
          await repo.save(row);
        }
        this.log.log(
          `Deploy enfileirado (waiting) ${projectSlug}/${branch} — ocupados ${occupied}/${max}`,
        );
        return 'queued';
      }

      if (!row) {
        row = repo.create({
          projectId: project.id,
          branch,
          branchSlug,
          pm2Name,
          port: null,
          status: 'deploying',
          lastDeployError: null,
          idleSleep: false,
        });
        await repo.save(row);
        await eventsRepo.save(
          eventsRepo.create({
            instanceId: row.id,
            oldStatus: null,
            newStatus: 'deploying',
          }),
        );
        pendingNotifications.push({
          instanceId: row.id,
          oldStatus: null,
          newStatus: 'deploying',
        });
      } else {
        const prev = row.status;
        row.branchSlug = branchSlug;
        row.pm2Name = pm2Name;
        row.lastDeployError = null;
        row.idleSleep = false;
        if (prev !== 'deploying') {
          row.status = 'deploying';
          await repo.save(row);
          await eventsRepo.save(
            eventsRepo.create({
              instanceId: row.id,
              oldStatus: prev,
              newStatus: 'deploying',
            }),
          );
          pendingNotifications.push({
            instanceId: row.id,
            oldStatus: prev,
            newStatus: 'deploying',
          });
        } else {
          await repo.save(row);
        }
      }
      return 'run';
    });

    for (const payload of pendingNotifications) {
      this.discordNotifications.notifyStatusChangeSafe(payload);
    }
    return result;
  }

  /** @deprecated use reserveDeployOrQueue */
  async classifyDeployOrQueue(
    projectSlug: string,
    branch: string,
  ): Promise<'queued' | 'run_shell'> {
    const r = await this.reserveDeployOrQueue(projectSlug, branch);
    return r === 'queued' ? 'queued' : 'run_shell';
  }

  /** @deprecated prefer reserveDeployOrQueue */
  async markDeploying(projectSlug: string, branch: string): Promise<PreviewInstance> {
    await this.reserveDeployOrQueue(projectSlug, branch);
    const project = await this.projects.getBySlug(projectSlug);
    const row = await this.repo.findOne({
      where: { projectId: project.id, branch },
    });
    if (!row) {
      throw new Error('Instância não encontrada após reserveDeployOrQueue');
    }
    return row;
  }

  /** Envs do projeto (+ override da instância se já existir) para o shell de deploy. */
  async resolveDeployAppEnv(
    projectSlug: string,
    branch: string,
  ): Promise<DeployAppEnvInput> {
    const project = await this.projects.getBySlug(projectSlug);
    const row = await this.repo.findOne({
      where: { projectId: project.id, branch },
    });
    return {
      projectEnv: normalizeEnvVars(project.envVars),
      instanceEnv: normalizeEnvVars(row?.envVars),
      portEnvNames: project.portEnvNames ?? [],
    };
  }

  async updateEnvVars(id: string, envVars: unknown): Promise<InstanceListItem> {
    if (!isEnvVarsMap(envVars)) {
      throw new BadRequestException(
        'envVars inválido: chaves devem ser nomes de env ([A-Za-z_][A-Za-z0-9_]*) e valores string',
      );
    }
    const row = await this.repo.findOne({ where: { id }, relations: ['project'] });
    if (!row?.project) {
      throw new NotFoundException(`Instância "${id}" não encontrada`);
    }
    row.envVars = normalizeEnvVars(envVars);
    await this.repo.save(row);
    const maps = await this.fetchRuntimeMaps();
    const fresh = await this.repo.findOne({ where: { id }, relations: ['project'] });
    return this.buildListItem(fresh as PreviewInstance, maps);
  }

  async persistDeployMeta(meta: DeployMeta): Promise<PreviewInstance> {
    const project = await this.projects.getBySlug(meta.projectSlug);
    const row = await this.repo.findOne({
      where: { projectId: project.id, branch: meta.branch },
    });
    if (!row) {
      throw new Error('Instância em deploying não encontrada após shell');
    }
    row.branchSlug = meta.branchSlug;
    row.pm2Name = meta.pm2Name;
    row.port = meta.port;
    row.runner = meta.runner ?? 'pm2';
    row.lastDeployError = null;
    row.idleSleep = false;
    await this.repo.save(row);
    return row;
  }

  /**
   * Após deploy/resume: persiste metadados, aguarda health check (se configurado)
   * e só então marca active. Em timeout, pausa runtime e marca error com logs.
   */
  async awaitHealthCheckAndFinalize(meta: DeployMeta): Promise<PreviewInstance> {
    const project = await this.projects.getBySlug(meta.projectSlug);
    const row = await this.persistDeployMeta(meta);
    const healthPath = normalizeHealthCheckPath(project.healthCheckPath);

    if (!healthPath) {
      await this.setStatus(row, 'active');
      return (await this.repo.findOne({ where: { id: row.id } })) as PreviewInstance;
    }

    const expectedStatus = resolveExpectedHealthStatus(project.healthCheckStatus);
    const timeoutMinutes = resolveHealthCheckTimeoutMinutes(
      project.healthCheckTimeoutMinutes,
    );
    const url = buildHealthCheckUrl(project, meta, healthPath);
    const deadline = Date.now() + timeoutMinutes * 60_000;
    let lastProbe = 'sem resposta';

    this.log.log(
      `Health check ${meta.projectSlug}/${meta.branch} → ${url} (HTTP ${expectedStatus}, ${timeoutMinutes} min)`,
    );

    while (Date.now() < deadline) {
      const probe = await probeHealthCheckUrl(url, expectedStatus);
      if (probe.ok) {
        await this.setStatus(row, 'active');
        return (await this.repo.findOne({ where: { id: row.id } })) as PreviewInstance;
      }
      lastProbe = probe.error ?? `HTTP ${probe.statusCode ?? '?'}`;
      await sleep(HEALTH_CHECK_POLL_INTERVAL_MS);
    }

    await this.finalizeHealthCheckFailure(
      project.slug,
      row.branch,
      meta,
      url,
      expectedStatus,
      timeoutMinutes,
      lastProbe,
    );
    throw new Error(
      `Health check timeout após ${timeoutMinutes} min (${lastProbe})`,
    );
  }

  async finalizeDeploySuccess(meta: DeployMeta): Promise<PreviewInstance> {
    return this.awaitHealthCheckAndFinalize(meta);
  }

  private async finalizeHealthCheckFailure(
    projectSlug: string,
    branch: string,
    meta: DeployMeta,
    url: string,
    expectedStatus: number,
    timeoutMinutes: number,
    lastProbe: string,
  ): Promise<void> {
    const project = await this.projects.getBySlug(projectSlug);
    const row = await this.repo.findOne({
      where: { projectId: project.id, branch },
    });
    if (!row) return;

    const runtimeName = meta.pm2Name || row.pm2Name;
    const runner = (meta.runner ?? row.runner ?? 'pm2') as 'pm2' | 'docker';
    const logs = runtimeName
      ? await captureRuntimeLogs(runtimeName, runner)
      : '(runtime sem nome)';

    const message =
      `Health check não respondeu HTTP ${expectedStatus} em ${timeoutMinutes} min.\n` +
      `URL: ${url}\n` +
      `Última tentativa: ${lastProbe}`;

    try {
      await runCorePauseScript(this.config, projectSlug, branch);
    } catch (e) {
      const pauseErr = e instanceof Error ? e.message : String(e);
      this.log.warn(`Pause após health check falhou (${projectSlug}/${branch}): ${pauseErr}`);
    }

    row.lastDeployError = appendRuntimeLogsToError(message, logs);
    row.idleSleep = false;
    await this.repo.save(row);
    await this.setStatus(row, 'error');
    await this.processWaitingQueue();
  }

  async finalizeDeployError(
    projectSlug: string,
    branch: string,
    deployError: string,
  ): Promise<void> {
    try {
      const project = await this.projects.getBySlug(projectSlug);
      const row = await this.repo.findOne({
        where: { projectId: project.id, branch },
      });
      if (row) {
        row.lastDeployError = deployError;
        await this.repo.save(row);
        await this.setStatus(row, 'error');
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Enfileira deploys para instâncias waiting enquanto houver vaga livre
   * (max - occupied). O worker reserva o slot atomicamente ao processar o job.
   */
  async processWaitingQueue(): Promise<void> {
    const max = await this.settings.getMaxActiveInstances();
    const occupied = await this.countOccupiedSlots();
    const free = max - occupied;
    if (free <= 0) return;

    const waiting = await this.repo.find({
      where: { status: 'waiting' },
      relations: ['project'],
      order: { createdAt: 'ASC' },
      take: free,
    });

    for (const next of waiting) {
      if (!next.project) continue;
      await this.enqueueRedeployJob(
        next.project.slug,
        next.branch,
        next.project.gitUrl,
      );
    }
    if (waiting.length > 0) {
      this.log.log(
        `Waiting queue: enfileirados ${waiting.length} deploy(s) (${free} vaga(s) livre(s))`,
      );
    }
  }

  async upsertAfterDeploy(meta: DeployMeta): Promise<PreviewInstance> {
    return this.finalizeDeploySuccess(meta);
  }

  async removeByProjectSlugAndBranch(
    projectSlug: string,
    branch: string,
  ): Promise<void> {
    try {
      const project = await this.projects.getBySlug(projectSlug);
      const row = await this.repo.findOne({
        where: { projectId: project.id, branch },
      });
      if (row) {
        await this.appendEvent(row.id, row.status, 'deleted');
        await this.repo.delete({ id: row.id });
      }
    } catch (e) {
      if (e instanceof NotFoundException) {
        return;
      }
      throw e;
    }
    await this.processWaitingQueue();
  }

  /**
   * Remove a instância (destroy do runtime + remoção do registro no banco).
   * - Se existir, executa `core/bin/destroy.sh <projectSlug> <branch>`
   * - Registra evento `deleted` e remove a linha
   * - Processa a fila waiting ao liberar vaga
   */
  async destroyInstanceById(
    id: string,
    options?: { processQueue?: boolean },
  ): Promise<void> {
    const row = await this.repo.findOne({ where: { id }, relations: ['project'] });
    if (!row || !row.project) {
      throw new NotFoundException(`Instância "${id}" não encontrada`);
    }

    const coreDir =
      this.config.get<string>('PREVIA_CORE_DIR') ||
      join(__dirname, '..', '..', '..', 'core');
    const workRoot = this.config.get<string>('PREVIA_WORK_ROOT');
    if (!workRoot) {
      throw new Error('PREVIA_WORK_ROOT não configurado');
    }
    const binDir = join(coreDir, 'bin');
    const env = { ...process.env, PREVIA_WORK_ROOT: workRoot };
    const script = join(binDir, 'destroy.sh');

    await execFileAsync(script, [row.project.slug, row.branch], { env });
    await this.appendEvent(row.id, row.status, 'deleted');
    await this.repo.delete({ id: row.id });
    if (options?.processQueue !== false) {
      await this.processWaitingQueue();
    }
  }

  /** Busca o estado de runtime (pm2 + docker) em paralelo. */
  async fetchRuntimeMaps(): Promise<RuntimeMaps> {
    const [pm2, docker] = await Promise.all([
      fetchPm2ByName(this.config),
      fetchDockerByName(this.config),
    ]);
    return { pm2, docker };
  }

  /** Resolve o runtime da instância conforme o runner gravado no banco. */
  private resolveRuntime(r: PreviewInstance, maps: RuntimeMaps): RuntimeInfo {
    if (r.runner === 'docker') {
      const d = maps.docker.get(r.pm2Name);
      return {
        online: d?.running ?? false,
        status: d?.status ?? null,
        monit: null,
      };
    }
    const p = maps.pm2.get(r.pm2Name);
    return {
      online: !!p && p.status === 'online',
      status: p?.status ?? null,
      monit: p?.monit ?? null,
    };
  }

  private buildListItem(r: PreviewInstance, maps: RuntimeMaps): InstanceListItem {
    const runtime = this.resolveRuntime(r, maps);
    const base = r.project?.serverUrl?.trim();
    const previewUrl =
      base && r.project?.slug && r.branchSlug
        ? `${base.replace(/\/+$/, '')}/${previewUriPath(r.project.slug, r.branch)}/`
        : null;
    const project = r.project;
    const activeExpiresAt =
      project != null ? computeActiveExpiresAt(r, project) : null;
    const existenceExpiresAt =
      project != null ? computeExistenceExpiresAt(r, project) : null;
    const hasActiveLifetimeLimit =
      project != null &&
      lifetimeDurationMs(
        project.maxActiveLifetimeDays,
        project.maxActiveLifetimeHours,
      ) != null;
    const hasExistenceLifetimeLimit =
      project != null &&
      lifetimeDurationMs(
        project.maxExistenceLifetimeDays,
        project.maxExistenceLifetimeHours,
      ) != null;
    return {
      id: r.id,
      projectId: r.projectId,
      projectSlug: r.project?.slug ?? '',
      projectServerUrl: r.project?.serverUrl ?? null,
      branch: r.branch,
      branchSlug: r.branchSlug,
      pm2Name: r.pm2Name,
      runtimeName: r.pm2Name,
      runner: r.runner ?? 'pm2',
      port: r.port,
      status: r.status,
      runtimeOnline: runtime.online,
      runtimeStatus: runtime.status,
      pm2Online: runtime.online,
      active: runtime.online,
      pm2Status: runtime.status,
      monit: runtime.monit ?? null,
      previewUrl,
      lastDeployError: r.lastDeployError,
      idleSleep: !!r.idleSleep && r.status === 'paused',
      activeExpiresAt,
      existenceExpiresAt,
      hasActiveLifetimeLimit,
      hasExistenceLifetimeLimit,
      envVars: normalizeEnvVars(r.envVars),
      projectEnvVars: normalizeEnvVars(r.project?.envVars),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async findAllForApi(
    maps: RuntimeMaps,
  ): Promise<InstanceListItem[]> {
    const rows = await this.repo.find({
      relations: ['project'],
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => this.buildListItem(r, maps));
  }

  async findOneForApi(id: string, maps: RuntimeMaps): Promise<InstanceListItem> {
    const r = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!r) {
      throw new NotFoundException(`Instância "${id}" não encontrada`);
    }
    return this.buildListItem(r, maps);
  }

  async findEntityById(id: string): Promise<PreviewInstance | null> {
    return this.repo.findOne({ where: { id } });
  }

  async pauseInstance(
    id: string,
    options?: { processQueue?: boolean },
  ): Promise<InstanceListItem> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!row?.project) throw new NotFoundException();
    if (row.status !== 'active') {
      throw new BadRequestException('Só é possível pausar instâncias ativas');
    }
    await runCorePauseScript(this.config, row.project.slug, row.branch);
    row.idleSleep = false;
    await this.repo.save(row);
    await this.setStatus(row, 'paused');
    if (options?.processQueue !== false) {
      await this.processWaitingQueue();
    }
    const maps = await this.fetchRuntimeMaps();
    const fresh = await this.repo.findOne({ where: { id }, relations: ['project'] });
    return this.buildListItem(fresh as PreviewInstance, maps);
  }

  /**
   * Idle sleep: para runtime e aponta nginx para /internal/wake (sem liberar checkout).
   */
  async sleepInstanceForIdle(id: string): Promise<void> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!row?.project) throw new NotFoundException();
    if (row.status !== 'active') return;
    await runCoreSleepScript(this.config, row.project.slug, row.branch);
    row.idleSleep = true;
    // Mantém row.port: a porta continua reservada no core (${name}.port) durante o sleep.
    await this.repo.save(row);
    await this.setStatus(row, 'paused');
  }

  private activityLogPath(projectSlug: string, branchSlug: string): string {
    const workRoot =
      this.config.get<string>('PREVIA_WORK_ROOT') ||
      this.config.get<string>('DEPLOYER_WORK_ROOT') ||
      join(process.env.HOME || '/tmp', '.local/share/previa');
    const previaState = join(workRoot, '.previa-state');
    const legacyState = join(workRoot, '.deployer-state');
    const stateDir = existsSync(previaState)
      ? previaState
      : existsSync(legacyState)
        ? legacyState
        : previaState;
    return join(stateDir, 'activity', `${projectSlug}-${branchSlug}.log`);
  }

  private async lastActivityMs(row: PreviewInstance): Promise<number> {
    const path = this.activityLogPath(row.project.slug, row.branchSlug);
    try {
      const st = await stat(path);
      return st.mtimeMs;
    } catch {
      return (row.activatedAt ?? row.updatedAt).getTime();
    }
  }

  async awakeInstance(id: string): Promise<InstanceListItem> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!row?.project) throw new NotFoundException();
    if (row.status !== 'paused' || !row.idleSleep) {
      throw new BadRequestException(
        'Só é possível acordar instâncias em idle sleep (use Activate / redeploy para pause manual)',
      );
    }
    await this.ensureAwake(row.project.slug, row.branchSlug);
    const maps = await this.fetchRuntimeMaps();
    const fresh = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    return this.buildListItem(fresh as PreviewInstance, maps);
  }

  /**
   * Acorda instância em idle sleep (resume PM2 sem rebuild). Pedidos
   * concorrentes para a mesma branch compartilham o mesmo job; wakes de
   * branches distintas entram numa fila serial e só avançam quando a
   * instância anterior estiver active (inclui health check, se configurado).
   */
  async ensureAwake(projectSlug: string, branchSlug: string): Promise<void> {
    const key = `${projectSlug}/${branchSlug}`;
    const queued = this.wakeQueue.pendingCount;
    if (queued > 0) {
      this.log.log(
        `Wake ${key} enfileirado (posição ~${queued + 1} na fila serial)`,
      );
    }
    await this.wakeQueue.enqueue(key, () => this.doWake(projectSlug, branchSlug));
  }

  private async doWake(projectSlug: string, branchSlug: string): Promise<void> {
    const project = await this.projects.getBySlug(projectSlug);
    const row = await this.repo.findOne({
      where: { projectId: project.id, branchSlug },
      relations: ['project'],
    });
    if (!row) {
      throw new NotFoundException(
        `Instância ${projectSlug}/${branchSlug} não encontrada`,
      );
    }
    if (row.status === 'active') {
      return;
    }
    if (row.status === 'deploying') {
      // Espera breve se já há deploy em andamento.
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const fresh = await this.repo.findOne({ where: { id: row.id } });
        if (fresh?.status === 'active') return;
        if (fresh?.status === 'error') {
          throw new BadRequestException(
            fresh.lastDeployError || 'Deploy falhou durante wake',
          );
        }
      }
      throw new BadRequestException('Timeout aguardando deploy durante wake');
    }
    if (row.status !== 'paused' || !row.idleSleep) {
      throw new BadRequestException(
        'Instância não está em idle sleep (use Activate no dashboard)',
      );
    }

    const reserved = await this.reserveDeployOrQueue(projectSlug, row.branch);
    if (reserved === 'queued') {
      throw new BadRequestException(
        `Sem slot livre para wake (max active atingido)`,
      );
    }

    try {
      const appEnv = await this.resolveDeployAppEnv(projectSlug, row.branch);
      if ((row.runner || 'pm2') === 'pm2') {
        const meta = await runCoreResumeScript(
          this.config,
          projectSlug,
          row.branch,
          appEnv,
        );
        await this.awaitHealthCheckAndFinalize(meta);
      } else {
        // Docker: sem resume rápido — redeploy completo.
        const meta = await runCoreDeployScript(
          this.config,
          projectSlug,
          project.gitUrl,
          row.branch,
          undefined,
          appEnv,
        );
        await this.awaitHealthCheckAndFinalize(meta);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('Health check timeout')) {
        await this.finalizeDeployError(projectSlug, row.branch, msg);
      }
      throw e;
    }
  }

  async activateOrRedeployInstance(id: string): Promise<InstanceListItem> {
    const row = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    if (!row?.project) throw new NotFoundException();

    if (
      !['active', 'waiting', 'paused', 'error'].includes(row.status)
    ) {
      throw new BadRequestException(
        `Estado "${row.status}" não suporta ativação forçada agora`,
      );
    }

    row.lastDeployError = null;
    await this.repo.save(row);

    const reserved = await this.reserveDeployOrQueue(
      row.project.slug,
      row.branch,
    );
    if (reserved === 'run') {
      await this.enqueueRedeployJob(
        row.project.slug,
        row.branch,
        row.project.gitUrl,
      );
    }

    const maps = await this.fetchRuntimeMaps();
    const fresh = await this.repo.findOne({
      where: { id },
      relations: ['project'],
    });
    return this.buildListItem(fresh as PreviewInstance, maps);
  }
  async findAllByProjectId(projectId: string): Promise<PreviewInstance[]> {
    return this.repo.find({
      where: { projectId },
      relations: ['project'],
      order: { updatedAt: 'DESC' },
    });
  }

  async destroyAllForProject(projectId: string): Promise<{
    destroyed: number;
    failed: number;
  }> {
    const rows = await this.findAllByProjectId(projectId);
    let destroyed = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        await this.destroyInstanceById(row.id);
        destroyed++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`destroy ${row.id}: ${msg}`);
      }
    }
    return { destroyed, failed };
  }

  async pauseAllActiveForProject(projectId: string): Promise<{
    paused: number;
    skipped: number;
    failed: number;
  }> {
    const rows = await this.findAllByProjectId(projectId);
    let paused = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'active') {
        skipped++;
        continue;
      }
      try {
        await this.pauseInstance(row.id, { processQueue: false });
        paused++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`pause ${row.id}: ${msg}`);
      }
    }
    if (paused > 0) {
      await this.processWaitingQueue();
    }
    return { paused, skipped, failed };
  }

  /** Idle sleep em todas as instâncias active do projeto (nginx → wake). */
  async sleepAllActiveForProject(projectId: string): Promise<{
    slept: number;
    skipped: number;
    failed: number;
  }> {
    const rows = await this.findAllByProjectId(projectId);
    let slept = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'active') {
        skipped++;
        continue;
      }
      try {
        await this.sleepInstanceForIdle(row.id);
        slept++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`idle sleep ${row.id}: ${msg}`);
      }
    }
    if (slept > 0) {
      await this.processWaitingQueue();
    }
    return { slept, skipped, failed };
  }

  /** Resume idle-slept instances one at a time (serial wake queue). */
  async awakeAllIdleForProject(projectId: string): Promise<{
    awoken: number;
    skipped: number;
    failed: number;
  }> {
    const rows = await this.findAllByProjectId(projectId);
    let awoken = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'paused' || !row.idleSleep || !row.project) {
        skipped++;
        continue;
      }
      try {
        await this.ensureAwake(row.project.slug, row.branchSlug);
        awoken++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `awake ${row.project.slug}/${row.branchSlug}: ${msg}`,
        );
      }
    }
    return { awoken, skipped, failed };
  }

  async restartAllForProject(projectId: string): Promise<{
    restarted: number;
    skipped: number;
    failed: number;
  }> {
    const rows = await this.findAllByProjectId(projectId);
    let restarted = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of rows) {
      if (!['active', 'paused', 'waiting', 'error'].includes(row.status)) {
        skipped++;
        continue;
      }
      try {
        await this.activateOrRedeployInstance(row.id);
        restarted++;
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(`restart ${row.id}: ${msg}`);
      }
    }
    return { restarted, skipped, failed };
  }

  /**
   * Pausa instâncias ativas além do limite de tempo ativo do projeto e remove
   * instâncias além do limite de existência (destroy + checkout em disco).
   * Também aplica idle sleep (idlePauseMinutes) quando configurado.
   * Chamado pelo scheduler a cada minuto.
   */
  async enforceLifetimeLimits(): Promise<{
    paused: number;
    destroyed: number;
    idleSlept: number;
  }> {
    const rows = await this.repo.find({ relations: ['project'] });
    const now = Date.now();
    let paused = 0;
    let destroyed = 0;
    let idleSlept = 0;

    for (const row of rows) {
      if (!row.project) continue;
      const project = row.project;

      const existenceMs = lifetimeDurationMs(
        project.maxExistenceLifetimeDays,
        project.maxExistenceLifetimeHours,
      );
      if (existenceMs != null) {
        const age = now - row.createdAt.getTime();
        if (age >= existenceMs) {
          try {
            await this.destroyInstanceById(row.id, { processQueue: false });
            destroyed++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log.warn(
              `Lifetime destroy ${row.project.slug}/${row.branch}: ${msg}`,
            );
          }
          continue;
        }
      }

      if (row.status !== 'active') continue;

      const activeMs = lifetimeDurationMs(
        project.maxActiveLifetimeDays,
        project.maxActiveLifetimeHours,
      );
      if (activeMs != null) {
        const activeSince = (row.activatedAt ?? row.updatedAt).getTime();
        if (now - activeSince >= activeMs) {
          try {
            await this.pauseInstance(row.id, { processQueue: false });
            paused++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.log.warn(
              `Lifetime pause ${row.project.slug}/${row.branch}: ${msg}`,
            );
          }
          continue;
        }
      }

      const idleMin = project.idlePauseMinutes;
      if (idleMin != null && idleMin > 0) {
        try {
          const last = await this.lastActivityMs(row);
          if (now - last >= idleMin * 60_000) {
            await this.sleepInstanceForIdle(row.id);
            idleSlept++;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.log.warn(
            `Idle sleep ${row.project.slug}/${row.branch}: ${msg}`,
          );
        }
      }
    }

    if (idleSlept > 0 || paused > 0 || destroyed > 0) {
      await this.processWaitingQueue();
    }

    return { paused, destroyed, idleSlept };
  }
}
