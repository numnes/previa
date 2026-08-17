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
  @Post('instances/:id/remove')
  remove(@Param('id') id: string) {
    return this.instances.remove(id);
  }
}
