import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreviewInstance } from '../entities/preview-instance.entity';
import {
  SettingsService,
  DISCORD_MESSAGE_TEMPLATE_KEY,
  DISCORD_NOTIFY_STATUSES_KEY,
  DISCORD_WEBHOOK_URL_KEY,
} from '../settings/settings.service';
import {
  DEFAULT_DISCORD_MESSAGE_TEMPLATE,
  discordTemplateVarsFromInstance,
  parseDiscordNotifyStatuses,
  renderDiscordMessageTemplate,
} from './discord-message.util';

export type StatusChangeNotifyPayload = {
  instanceId: string;
  oldStatus: string | null;
  newStatus: string;
};

@Injectable()
export class DiscordNotificationsService {
  private readonly log = new Logger(DiscordNotificationsService.name);

  constructor(
    @InjectRepository(PreviewInstance)
    private readonly instances: Repository<PreviewInstance>,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  private dashboardBase(): string {
    const cors = this.config.get<string>('CORS_ORIGIN')?.trim();
    if (cors) return cors.replace(/\/+$/, '');
    return 'http://localhost:3001';
  }

  async notifyStatusChange(payload: StatusChangeNotifyPayload): Promise<void> {
    const webhookUrl = (await this.settings.getValue(DISCORD_WEBHOOK_URL_KEY))?.trim();
    if (!webhookUrl) return;

    const enabledStatuses = parseDiscordNotifyStatuses(
      await this.settings.getValue(DISCORD_NOTIFY_STATUSES_KEY),
    );
    if (!enabledStatuses.includes(payload.newStatus as (typeof enabledStatuses)[number])) {
      return;
    }

    const row = await this.instances.findOne({
      where: { id: payload.instanceId },
      relations: ['project'],
    });
    if (!row?.project) return;
    if (!row.project.notificationsEnabled) return;

    const template =
      (await this.settings.getValue(DISCORD_MESSAGE_TEMPLATE_KEY))?.trim() ||
      DEFAULT_DISCORD_MESSAGE_TEMPLATE;

    const content = renderDiscordMessageTemplate(
      template,
      discordTemplateVarsFromInstance(
        row,
        payload.oldStatus,
        payload.newStatus,
        this.dashboardBase(),
      ),
    );

    if (!content.trim()) return;

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content.slice(0, 2000) }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Discord webhook HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
  }

  notifyStatusChangeSafe(payload: StatusChangeNotifyPayload): void {
    void this.notifyStatusChange(payload).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(
        `Discord notify failed (${payload.instanceId} ${payload.oldStatus}→${payload.newStatus}): ${msg}`,
      );
    });
  }
}
