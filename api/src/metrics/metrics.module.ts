import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClusterModule } from '../cluster/cluster.module';
import { HostMetricSample } from '../entities/host-metric-sample.entity';
import { NetworkRequestEvent } from '../entities/network-request-event.entity';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { MetricsCollector } from './metrics.collector';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HostMetricSample,
      NetworkRequestEvent,
      PreviewInstance,
    ]),
    forwardRef(() => ClusterModule),
  ],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsCollector],
  exports: [MetricsService],
})
export class MetricsModule {}
