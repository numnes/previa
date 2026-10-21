import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClusterKeysModule } from '../cluster-keys/cluster-keys.module';
import { ClusterNodesModule } from '../cluster-nodes/cluster-nodes.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { InstancesModule } from '../instances/instances.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PreviewInstancesModule } from '../preview-instances/preview-instances.module';
import { ProjectsModule } from '../projects/projects.module';
import { ResourcesModule } from '../resources/resources.module';
import { SettingsModule } from '../settings/settings.module';
import { ClusterAggregatorService } from './cluster-aggregator.service';
import { ClusterNodeInfoService } from './cluster-node-info.service';
import { ClusterRemoteController } from './cluster-remote.controller';

@Module({
  imports: [
    SettingsModule,
    ClusterKeysModule,
    forwardRef(() => ClusterNodesModule),
    forwardRef(() => DashboardModule),
    forwardRef(() => ProjectsModule),
    PreviewInstancesModule,
    forwardRef(() => InstancesModule),
    forwardRef(() => ResourcesModule),
    forwardRef(() => MetricsModule),
    AuthModule,
  ],
  controllers: [ClusterRemoteController],
  providers: [ClusterNodeInfoService, ClusterAggregatorService],
  exports: [ClusterNodeInfoService, ClusterAggregatorService],
})
export class ClusterModule {}
