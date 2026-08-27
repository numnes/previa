import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  DEFAULT_DISCORD_MESSAGE_TEMPLATE,
  parseDiscordNotifyStatuses,
} from '../notifications/discord-message.util';
import { DEFAULT_CLICKUP_COMMENT_TEMPLATE, maskClickupToken } from '../notifications/clickup-task.util';
import { PatchSettingsDto, serializeDiscordNotifyStatuses } from './dto/patch-settings.dto';
import {
  CLICKUP_API_TOKEN_KEY,
  CLICKUP_COMMENT_TEMPLATE_KEY,
  CLICKUP_TEAM_ID_KEY,
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
    const { [CLICKUP_API_TOKEN_KEY]: clickupToken, ...publicRaw } = raw;
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
    const clickupTeamId =
      (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim() || '';
    const clickupCommentTemplate =
      (await this.settings.getValue(CLICKUP_COMMENT_TEMPLATE_KEY))?.trim() ||
      DEFAULT_CLICKUP_COMMENT_TEMPLATE;

    return {
      ...publicRaw,
      [MAX_ACTIVE_INSTANCES_KEY]: String(maxActiveInstances),
      maxActiveInstancesParsed: maxActiveInstances,
      nodeLabel,
      discordWebhookUrl,
      discordNotifyStatuses,
      discordMessageTemplate,
      clickupTeamId,
      clickupCommentTemplate,
      ...maskClickupToken(clickupToken),
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
    if (body.clickupApiToken !== undefined) {
      const trimmed = body.clickupApiToken?.trim() ?? '';
      await this.settings.setValue(CLICKUP_API_TOKEN_KEY, trimmed);
    }
    if (body.clickupTeamId !== undefined) {
      await this.settings.setValue(CLICKUP_TEAM_ID_KEY, body.clickupTeamId?.trim() ?? '');
    }
    if (body.clickupCommentTemplate !== undefined) {
      await this.settings.setValue(
        CLICKUP_COMMENT_TEMPLATE_KEY,
        body.clickupCommentTemplate.trim(),
      );
    }
    return this.getAll();
  }
}
