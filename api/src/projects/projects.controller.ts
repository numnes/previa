import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClusterAggregatorService } from '../cluster/cluster-aggregator.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly cluster: ClusterAggregatorService,
  ) {}

  @ApiBearerAuth('jwt')
  @ApiBody({ type: CreateProjectDto })
  @ApiOkResponse({ description: 'Projeto criado' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.projects.create(dto);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Lista de projetos (local + nós cluster)' })
  @UseGuards(JwtAuthGuard)
  @Get()
  list() {
    return this.cluster.aggregateProjects();
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Projeto por id' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id);
  }

  @ApiBearerAuth('jwt')
  @ApiBody({ type: UpdateProjectDto })
  @ApiOkResponse({ description: 'Projeto atualizado' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(id, dto);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Pausa todas as instâncias ativas do projeto' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/instances/teardown')
  teardownInstances(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.teardownAllInstances(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Idle sleep em todas as instâncias active do projeto' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/instances/sleep')
  sleepInstances(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.sleepAllInstances(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Acorda instâncias em idle sleep do projeto (fila serial)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/instances/awake')
  awakeInstances(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.awakeAllInstances(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Reinicia / redeploy de todas as instâncias do projeto' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/instances/restart')
  restartInstances(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.restartAllInstances(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Remove projeto e todas as instâncias' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Delete(':id')
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.deleteProject(id);
  }
}
