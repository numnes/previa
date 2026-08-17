import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { UserRole } from '../auth/user-role';
import {
  redactInstanceEnvFields,
  redactInstanceEnvList,
} from '../common/redact-instance-env';
import { UpdateInstanceDto } from './dto/update-instance.dto';
import { InstancesService } from './instances.service';

type AuthedUser = { userId: string; email: string; role: UserRole };

@ApiTags('instances')
@Controller('instances')
export class InstancesController {
  constructor(private readonly instances: InstancesService) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Lista de instâncias (local + nós cluster)' })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: { user: AuthedUser }) {
    const rows = await this.instances.listForApi();
    return redactInstanceEnvList(
      rows as Record<string, unknown>[],
      req.user?.role,
    );
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Logs recentes do processo PM2 (nostream)' })
  @UseGuards(JwtAuthGuard)
  @Get(':id/logs')
  logs(
    @Param('id') id: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
  ) {
    return this.instances.logsForInstance(id, lines);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({
    description: 'Atualiza override de env da instância (admin only)',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: UpdateInstanceDto) {
    return this.instances.update(id, dto);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Pausa instância (derruba PM2/nginx, mantém registro)' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/pause')
  pause(@Param('id') id: string) {
    return this.instances.pause(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Ativa, despausa ou redeploy da instância' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/activate')
  activate(@Param('id') id: string) {
    return this.instances.activate(id);
  }

  @ApiOkResponse({
    description: 'Acorda instância em idle sleep (resume sem git pull/rebuild)',
  })
  @UseGuards(JwtAuthGuard)
  @Post(':id/awake')
  awake(@Param('id') id: string) {
    return this.instances.awake(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Remove instância (destroy + remove do banco)' })
  @UseGuards(JwtAuthGuard)
  @Post(':id/remove')
  remove(@Param('id') id: string) {
    return this.instances.remove(id);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Detalhe de uma instância' })
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: { user: AuthedUser }) {
    const row = await this.instances.getOneForApi(id);
    return redactInstanceEnvFields(
      row as Record<string, unknown>,
      req.user?.role,
    );
  }
}
