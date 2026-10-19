import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { DashboardService } from '../dashboard/dashboard.service';
import { InstancesService } from '../instances/instances.service';
import { MetricsService } from '../metrics/metrics.service';
import { ProjectsService } from '../projects/projects.service';
import { ClusterKeyGuard } from './guards/cluster-key.guard';
import { RequireClusterWrite } from './guards/cluster-write.decorator';
import { ClusterNodeInfoService } from './cluster-node-info.service';

/** Endpoints expostos para outros nós do cluster (leitura + escrita conforme escopo da chave). */
@ApiTags('cluster')
@ApiSecurity('cluster-key')
@UseGuards(ClusterKeyGuard)
@Controller('cluster')
export class ClusterRemoteController {
  constructor(
    private readonly nodeInfo: ClusterNodeInfoService,
    private readonly dashboard: DashboardService,
    private readonly projects: ProjectsService,
    private readonly instances: InstancesService,
    private readonly metrics: MetricsService,
  ) {}

  @Get('node-info')
  async nodeInfoEndpoint(
    @Req() req: { clusterScope?: 'read' | 'write' },
  ) {
    const local = await this.nodeInfo.getLocalNodeRef();
    return {
      nodeId: local.nodeId,
      nodeLabel: local.nodeLabel,
      baseUrl: local.nodeBaseUrl,
      scope: req.clusterScope ?? 'read',
    };
  }

  @Get('summary')
  async summary() {
    return this.dashboard.summary();
  }

  @Get('metrics/host')
  hostMetrics(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.metrics.getHostHistory(days);
  }

  @Get('metrics/network')
  networkMetrics(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.metrics.listNetworkRequests({
      page,
      pageSize,
      maxPageSize: 5000,
    });
  }

  @Get('projects')
  async projectsList() {
    return this.projects.findAll();
  }

  @Get('instances')
  async instancesList() {
    return this.instances.listLocalForApi();
  }

  @Get('instances/:id')
  async instanceOne(@Param('id') id: string) {
    return this.instances.getLocalOneForApi(id);
  }

  @Get('instances/:id/logs')
  logs(
    @Param('id') id: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
  ) {
    return this.instances.logsForInstance(id, lines);
  }

  @RequireClusterWrite()
  @Post('instances/:id/pause')
  pause(@Param('id') id: string) {
    return this.instances.pause(id);
  }

  @RequireClusterWrite()
  @Post('instances/:id/activate')
  activate(@Param('id') id: string) {
    return this.instances.activate(id);
  }

  @RequireClusterWrite()
  @Post('instances/:id/awake')
  awake(@Param('id') id: string) {
    return this.instances.awake(id);
  }

  @RequireClusterWrite()
  @Post('instances/:id/cancel-deploy')
  cancelDeploy(@Param('id') id: string) {
    return this.instances.cancelDeploy(id);
  }

  @RequireClusterWrite()
  @Post('instances/:id/force-redeploy')
  forceRedeploy(@Param('id') id: string) {
    return this.instances.forceRestartDeploy(id);
  }

  @RequireClusterWrite()
  @Post('instances/:id/remove')
  remove(@Param('id') id: string) {
    return this.instances.remove(id);
  }
}
