import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { execFile } from 'child_process';
import { join } from 'path';
import { promisify } from 'util';
import { PreviewInstancesService } from '../preview-instances/preview-instances.service';
import { resolveDeployConcurrency } from './deploy-concurrency.util';
import { runCoreDeployScript } from './deploy-exec.helper';
import { formatDeployError } from './format-deploy-error';

const execFileAsync = promisify(execFile);

export type DeployJobPayload = {
  projectSlug: string;
  branch: string;
  gitUrl?: string;
  image?: string;
};

@Processor('deploy', { concurrency: resolveDeployConcurrency() })
export class DeployProcessor extends WorkerHost {
  private readonly logger = new Logger(DeployProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly previewInstances: PreviewInstancesService,
  ) {
    super();
    this.logger.log(
      `Deploy worker concurrency=${resolveDeployConcurrency(this.config.get<string>('PREVIA_DEPLOY_CONCURRENCY'))}`,
    );
  }

  async process(job: Job<DeployJobPayload>) {
    try {
      switch (job.name) {
        case 'create':
          return await this.createAction(job);
        case 'destroy':
          return await this.destroyAction(job);
        default:
          this.logger.warn(`Job desconhecido: ${job.name} (id=${job.id})`);
          return { ok: false, reason: 'unknown_job', name: job.name };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Erro ao processar job ${job.id}: ${message}`);
      throw e;
    }
  }

  async createAction(job: Job<DeployJobPayload>) {
    const reserved = await this.previewInstances.reserveDeployOrQueue(
      job.data.projectSlug,
      job.data.branch,
    );
    if (reserved === 'queued') {
      return { ok: true, action: 'queued' };
    }

    this.logger.log(
      `Deploy ${job.data.projectSlug}/${job.data.branch} — clone/fetch + build (inclui instância em idle sleep)`,
    );

    try {
      const appEnv = await this.previewInstances.resolveDeployAppEnv(
        job.data.projectSlug,
        job.data.branch,
      );
      const meta = await runCoreDeployScript(
        this.config,
        job.data.projectSlug,
        job.data.gitUrl as string,
        job.data.branch,
        job.data.image,
        appEnv,
      );
      await this.previewInstances.awaitHealthCheckAndFinalize(meta);
    } catch (e) {
      const msg = formatDeployError(e);
      if (!msg.includes('Health check timeout')) {
        await this.previewInstances.finalizeDeployError(
          job.data.projectSlug,
          job.data.branch,
          msg,
        );
      }
      throw e;
    }
    await this.previewInstances.processWaitingQueue();
    return { ok: true, action: 'deploy' };
  }

  async destroyAction(job: Job<DeployJobPayload>) {
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
    await execFileAsync(script, [job.data.projectSlug, job.data.branch], {
      env,
    });
    await this.previewInstances.removeByProjectSlugAndBranch(
      job.data.projectSlug,
      job.data.branch,
    );
    return { ok: true, action: 'destroy' };
  }
}
