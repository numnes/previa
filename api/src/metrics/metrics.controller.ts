import {
  Controller,
  DefaultValuePipe,
  Get,
  Inject,
  ParseIntPipe,
  Query,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClusterAggregatorService } from '../cluster/cluster-aggregator.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(
    @Inject(forwardRef(() => ClusterAggregatorService))
    private readonly cluster: ClusterAggregatorService,
  ) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Histórico de CPU/memória/disco (últimos 7 dias)' })
  @UseGuards(JwtAuthGuard)
  @Get('host')
  hostHistory(
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.cluster.aggregateHostMetrics(days);
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({
    description: 'Requests dos últimos 7 dias (paginado) vistas nos access logs',
  })
  @UseGuards(JwtAuthGuard)
  @Get('network')
  network(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) {
    return this.cluster.aggregateNetworkRequests({ page, pageSize });
  }
}
