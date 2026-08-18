import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, ValidateIf } from 'class-validator';
import {
  DEFAULT_DISCORD_MESSAGE_TEMPLATE,
  DISCORD_NOTIFY_STATUSES,
  serializeDiscordNotifyStatuses,
} from '../../notifications/discord-message.util';

export class PatchSettingsDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  maxActiveInstances?: number;

  @ApiPropertyOptional({ example: 'Machine A' })
  @IsOptional()
  @IsString()
  nodeLabel?: string;

  @ApiPropertyOptional({
    example: 'https://discord.com/api/webhooks/…',
    description: 'Discord incoming webhook URL. Empty string clears it.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsString()
  discordWebhookUrl?: string | null;

  @ApiPropertyOptional({
    example: ['active', 'error', 'paused', 'deleted'],
    description: 'Instance statuses that trigger Discord notifications.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  discordNotifyStatuses?: string[];

  @ApiPropertyOptional({
    example: DEFAULT_DISCORD_MESSAGE_TEMPLATE,
    description:
      'Message template with placeholders: {{branch_name}}, {{project_name}}, {{old_status}}, {{new_status}}, {{preview_link}}, {{branch_page}}.',
  })
  @IsOptional()
  @IsString()
  discordMessageTemplate?: string;
}

export { DISCORD_NOTIFY_STATUSES, serializeDiscordNotifyStatuses };
