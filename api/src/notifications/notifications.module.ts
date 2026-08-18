import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PreviewInstance } from '../entities/preview-instance.entity';
import { SettingsModule } from '../settings/settings.module';
import { DiscordNotificationsService } from './discord-notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([PreviewInstance]), SettingsModule],
  providers: [DiscordNotificationsService],
  exports: [DiscordNotificationsService],
})
export class NotificationsModule {}
