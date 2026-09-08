import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';
import { AmplifyController } from './amplify.controller';
import { AmplifyService } from './amplify.service';

@Module({
  imports: [ConfigModule, AuthModule, SettingsModule, NotificationsModule],
  controllers: [AmplifyController],
  providers: [AmplifyService],
  exports: [AmplifyService],
})
export class AmplifyModule {}
