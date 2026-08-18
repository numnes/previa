import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreviewInstanceStatusEvent } from '../entities/preview-instance-status-event.entity';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { ProjectsModule } from '../projects/projects.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InstanceLifetimeScheduler } from './instance-lifetime.scheduler';
import { PreviewInstancesService } from './preview-instances.service';
import { WakeController } from './wake.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PreviewInstance, PreviewInstanceStatusEvent]),
    forwardRef(() => ProjectsModule),
    SettingsModule,
    NotificationsModule,
    BullModule.registerQueue({ name: 'deploy' }),
  ],
  controllers: [WakeController],
  providers: [PreviewInstancesService, InstanceLifetimeScheduler],
  exports: [PreviewInstancesService],
})
export class PreviewInstancesModule {}
