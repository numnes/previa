import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';

export type DiscordNotifyStatus =
  | 'waiting'
  | 'deploying'
  | 'active'
  | 'paused'
  | 'error'
  | 'deleted';

export type SettingsPayload = {
  maxActiveInstancesParsed?: number;
  max_active_instances?: string;
  nodeLabel?: string;
  discordWebhookUrl?: string;
  discordNotifyStatuses?: DiscordNotifyStatus[];
  discordMessageTemplate?: string;
  clickupApiTokenConfigured?: boolean;
  clickupApiTokenLast4?: string;
  clickupTeamId?: string;
  clickupCommentTemplate?: string;
  [key: string]: unknown;
};

export async function fetchSettings(): Promise<SettingsPayload> {
  const token = getTokenClient();
  return await httpJson<SettingsPayload>(`${apiBaseClient()}/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function patchSettings(body: {
  maxActiveInstances?: number;
  nodeLabel?: string;
  discordWebhookUrl?: string;
  discordNotifyStatuses?: DiscordNotifyStatus[];
  discordMessageTemplate?: string;
  clickupApiToken?: string;
  clickupTeamId?: string;
  clickupCommentTemplate?: string;
}): Promise<SettingsPayload> {
  const token = getTokenClient();
  return await httpJson<SettingsPayload>(`${apiBaseClient()}/settings`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
