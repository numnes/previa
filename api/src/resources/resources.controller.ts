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
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ResourcesApiService } from './resources-api.service';

type AuthedUser = { userId: string; email: string; role: UserRole };

const RESOURCE_ENV_KEYS = ['envVars', 'connectionEnv'] as const;

function redactResource<T extends Record<string, unknown>>(
  item: T,
  role: UserRole | undefined,
): T {
  if (role === 'admin') return item;
  const next = { ...item };
  for (const key of RESOURCE_ENV_KEYS) {
    if (key in next) (next as Record<string, unknown>)[key] = {};
  }
  if ('connectionDotenv' in next) {
    (next as Record<string, unknown>).connectionDotenv = '';
  }
  return next;
}

@ApiTags('resources')
@Controller('resources')
export class ResourcesController {
  constructor(private readonly resources: ResourcesApiService) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Lista recursos provisionados (local + cluster)' })
  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: { user: AuthedUser }) {
    const rows = await this.resources.listForApi();
    return (rows as Record<string, unknown>[]).map((row) =>
      redactResource(row, req.user?.role),
    );
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  create(@Body() dto: CreateResourceDto, @Req() req: { user: AuthedUser }) {
    return this.resources.create(dto).then((row) =>
      redactResource(row as Record<string, unknown>, req.user?.role),
    );
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  @Get(':id/logs')
  logs(
    @Param('id') id: string,
    @Query('lines', new DefaultValuePipe(200), ParseIntPipe) lines: number,
  ) {
    return this.resources.logs(id, lines);
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  patch(@Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.resources.update(id, dto);
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  start(@Param('id') id: string) {
    return this.resources.start(id);
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  @Post(':id/stop')
  stop(@Param('id') id: string) {
    return this.resources.stop(id);
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/remove')
  remove(@Param('id') id: string) {
    return this.resources.remove(id);
  }

  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: { user: AuthedUser }) {
    const row = await this.resources.getOneForApi(id);
    return redactResource(row as Record<string, unknown>, req.user?.role);
  }
}
