import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AmplifyService } from './amplify.service';
import { DeleteAmplifyBranchDto } from './dto/delete-amplify-branch.dto';
import { HostAmplifyBranchDto } from './dto/host-amplify-branch.dto';

@ApiTags('amplify')
@Controller('amplify')
export class AmplifyController {
  constructor(private readonly amplify: AmplifyService) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({
    description: 'Lista branches ativas do app Amplify (exceto as ocultas) com status ClickUp',
  })
  @UseGuards(JwtAuthGuard)
  @Get('branches')
  listBranches() {
    return this.amplify.listBranches();
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({
    description:
      'Hospeda uma branch Git no Amplify (create-branch) ou dispara um RELEASE no HEAD atual (start-job), sem push',
  })
  @UseGuards(JwtAuthGuard)
  @Post('branches/host')
  hostBranch(@Body() body: HostAmplifyBranchDto) {
    return this.amplify.hostBranch(body.branchName);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Remove uma branch do Amplify (delete-branch, admin only)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('branches/delete')
  deleteBranch(@Body() body: DeleteAmplifyBranchDto) {
    return this.amplify.deleteBranch(body.branchName);
  }
}
