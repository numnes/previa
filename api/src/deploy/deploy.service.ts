import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProjectsService } from '../projects/projects.service';
import { sanitizeBranchSlug } from './pm2-name.util';
import { DeployJobPayload } from './deploy.processor';
import { DeployBodyDto } from './dto/deploy-body.dto';

@Injectable()
export class DeployService {
  constructor(
    @InjectQueue('deploy')
    private readonly deployQueue: Queue<DeployJobPayload>,
    private readonly projects: ProjectsService,
  ) {}

  async enqueueDeploy(data: DeployBodyDto) {
    const { project, branch, image } = data;
    const projectDocument = await this.projects.getBySlug(project);
    const branchSlug = sanitizeBranchSlug(branch);
    const jobId = `deploy:${project}:${branchSlug}`;
    try {
      const job = await this.deployQueue.add(
        'create',
        {
          projectSlug: project,
          branch,
          gitUrl: projectDocument.gitUrl,
          image,
          forceFullDeploy: true,
        },
        { jobId, removeOnComplete: true, removeOnFail: true },
      );
      return { status: 'queued', jobId: String(job.id) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists|Job.*exist/i.test(msg)) {
        return { status: 'queued', jobId };
      }
      throw e;
    }
  }

  async enqueueDestroy(projectSlug: string, branch: string) {
    const branchSlug = sanitizeBranchSlug(branch);
    const job = await this.deployQueue.add(
      'destroy',
      { projectSlug, branch },
      {
        jobId: `destroy:${projectSlug}:${branchSlug}:${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return { status: 'queued', jobId: String(job.id) };
  }
}
