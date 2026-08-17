import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { ClusterKeysModule } from './cluster-keys/cluster-keys.module';
import { ClusterNodesModule } from './cluster-nodes/cluster-nodes.module';
import { ClusterModule } from './cluster/cluster.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DeployModule } from './deploy/deploy.module';
import { ApiKey } from './entities/api-key.entity';
import { ClusterKey } from './entities/cluster-key.entity';
import { ClusterNode } from './entities/cluster-node.entity';
import { PreviewInstanceStatusEvent } from './entities/preview-instance-status-event.entity';
import { PreviewInstance } from './entities/preview-instance.entity';
import { Project } from './entities/project.entity';
import { Setting } from './entities/setting.entity';
import { User } from './entities/user.entity';
import { InstancesModule } from './instances/instances.module';
import { ProjectsModule } from './projects/projects.module';
import { SettingsModule } from './settings/settings.module';
import { SetupModule } from './setup/setup.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL')?.trim();
        if (!url) {
          throw new Error(
            'DATABASE_URL is missing or empty. Check api/.env and restart with: previa down -y && previa setup',
          );
        }
        return {
        type: 'postgres',
        url,
        entities: [
          User,
          ApiKey,
          ClusterKey,
          ClusterNode,
          Project,
          PreviewInstance,
          PreviewInstanceStatusEvent,
          Setting,
        ],
        synchronize: config.get<string>('TYPEORM_SYNC') === 'true',
        logging: false,
      };
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST'),
          port: parseInt(config.get<string>('REDIS_PORT') as string),
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    ApiKeysModule,
    ClusterKeysModule,
    ClusterNodesModule,
    ClusterModule,
    ProjectsModule,
    SettingsModule,
    DeployModule,
    InstancesModule,
    DashboardModule,
    SetupModule,
    UsersModule,
  ],
})
export class AppModule {}
