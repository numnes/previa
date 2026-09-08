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

  @ApiPropertyOptional({
    description: 'ClickUp personal API token. Empty string clears it. Omit to keep current.',
  })
  @IsOptional()
  @IsString()
  clickupApiToken?: string | null;

  @ApiPropertyOptional({
    example: '123456',
    description: 'ClickUp workspace (team) ID, required to resolve custom task IDs like PROJ-123.',
  })
  @IsOptional()
  @IsString()
  clickupTeamId?: string | null;

  @ApiPropertyOptional({
    description:
      'Comment posted on the matching ClickUp task. Placeholders: {{branch_name}}, {{project_name}}, {{preview_link}}, {{task_id}}.',
  })
  @IsOptional()
  @IsString()
  clickupCommentTemplate?: string;

  @ApiPropertyOptional({
    example: 'd0exampleappid',
    description: 'AWS Amplify App ID. Empty string clears it.',
  })
  @IsOptional()
  @IsString()
  amplifyAppId?: string | null;

  @ApiPropertyOptional({
    example: 'us-east-1',
    description: 'AWS region of the Amplify app. Empty uses us-east-1.',
  })
  @IsOptional()
  @IsString()
  amplifyRegion?: string | null;

  @ApiPropertyOptional({
    description:
      'IAM access key id used to call Amplify. Empty string clears it. Omit to keep current.',
  })
  @IsOptional()
  @IsString()
  amplifyAccessKeyId?: string | null;

  @ApiPropertyOptional({
    description:
      'IAM secret access key used to call Amplify. Empty string clears it. Omit to keep current.',
  })
  @IsOptional()
  @IsString()
  amplifySecretAccessKey?: string | null;

  @ApiPropertyOptional({
    example: 'main\ndevelop',
    description:
      'Amplify branch names hidden from the listing (one per line or comma-separated). Empty clears the list.',
  })
  @IsOptional()
  @IsString()
  amplifyHiddenBranches?: string | null;

  @ApiPropertyOptional({
    example: 50,
    description:
      'Amplify branch slot limit (AWS default is 50 per app). Used for the used/available display.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  amplifyMaxBranches?: number;
}

export { DISCORD_NOTIFY_STATUSES, serializeDiscordNotifyStatuses };
