import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetupService } from './setup.service';

@ApiTags('setup')
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Verifica configuração do nginx no host' })
  @UseGuards(JwtAuthGuard)
  @Get('nginx-check')
  checkNginx() {
    return this.setup.checkNginx();
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Workflows e previa.yaml para integração com repositórios' })
  @UseGuards(JwtAuthGuard)
  @Get('project-templates')
  projectTemplates() {
    return this.setup.getProjectTemplates();
  }
}
