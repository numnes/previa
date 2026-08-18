import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DEFAULT_DISCORD_MESSAGE_TEMPLATE,
  parseDiscordNotifyStatuses,
} from '../notifications/discord-message.util';
import { PatchSettingsDto, serializeDiscordNotifyStatuses } from './dto/patch-settings.dto';
import {
  DISCORD_MESSAGE_TEMPLATE_KEY,
  DISCORD_NOTIFY_STATUSES_KEY,
  DISCORD_WEBHOOK_URL_KEY,
  MAX_ACTIVE_INSTANCES_KEY,
  SettingsService,
} from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Configurações da ferramenta' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  async getAll() {
    const raw = await this.settings.getAll();
    const maxActiveInstances = await this.settings.getMaxActiveInstances();
    const nodeLabel = await this.settings.getNodeLabel();
    const discordWebhookUrl =
      (await this.settings.getValue(DISCORD_WEBHOOK_URL_KEY))?.trim() || '';
    const discordNotifyStatuses = parseDiscordNotifyStatuses(
      await this.settings.getValue(DISCORD_NOTIFY_STATUSES_KEY),
    );
    const discordMessageTemplate =
      (await this.settings.getValue(DISCORD_MESSAGE_TEMPLATE_KEY))?.trim() ||
      DEFAULT_DISCORD_MESSAGE_TEMPLATE;

    return {
      ...raw,
      [MAX_ACTIVE_INSTANCES_KEY]: String(maxActiveInstances),
      maxActiveInstancesParsed: maxActiveInstances,
      nodeLabel,
      discordWebhookUrl,
      discordNotifyStatuses,
      discordMessageTemplate,
    };
  }

  @ApiBearerAuth('jwt')
  @ApiOkResponse({ description: 'Atualiza configurações' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Patch()
  async patch(@Body() body: PatchSettingsDto) {
    if (body.maxActiveInstances != null) {
      await this.settings.setMaxActiveInstances(body.maxActiveInstances);
    }
    if (body.nodeLabel !== undefined) {
      await this.settings.setNodeLabel(body.nodeLabel);
    }
    if (body.discordWebhookUrl !== undefined) {
      const trimmed = body.discordWebhookUrl?.trim() ?? '';
      await this.settings.setValue(DISCORD_WEBHOOK_URL_KEY, trimmed);
    }
    if (body.discordNotifyStatuses !== undefined) {
      await this.settings.setValue(
        DISCORD_NOTIFY_STATUSES_KEY,
        serializeDiscordNotifyStatuses(body.discordNotifyStatuses),
      );
    }
    if (body.discordMessageTemplate !== undefined) {
      await this.settings.setValue(
        DISCORD_MESSAGE_TEMPLATE_KEY,
        body.discordMessageTemplate.trim(),
      );
    }
    return this.getAll();
  }
}
