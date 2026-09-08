import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AmplifyService } from './amplify.service';
import { DeleteAmplifyBranchDto } from './dto/delete-amplify-branch.dto';

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
  @ApiOkResponse({ description: 'Remove uma branch do Amplify (delete-branch)' })
  @UseGuards(JwtAuthGuard)
  @Post('branches/delete')
  deleteBranch(@Body() body: DeleteAmplifyBranchDto) {
    return this.amplify.deleteBranch(body.branchName);
  }
}
