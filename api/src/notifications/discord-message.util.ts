import { previewUriPath } from '../deploy/pm2-name.util';
import type { PreviewInstance } from '../entities/preview-instance.entity';
import type { Project } from '../entities/project.entity';

export function buildPreviewUrl(
  project: Pick<Project, 'slug' | 'serverUrl'>,
  branch: string,
  branchSlug?: string | null,
): string | null {
  const base = project.serverUrl?.trim();
  const slug = branchSlug ?? branch;
  if (!base || !project.slug || !slug) return null;
  return `${base.replace(/\/+$/, '')}/${previewUriPath(project.slug, branch)}/`;
}

export function buildInstanceDashboardUrl(
  dashboardBase: string,
  instanceId: string,
): string {
  const base = dashboardBase.replace(/\/+$/, '');
  return `${base}/instances/${instanceId}`;
}

export type DiscordTemplateVars = {
  branch_name: string;
  project_name: string;
  old_status: string;
  new_status: string;
  preview_link: string;
  branch_page: string;
};

export function discordTemplateVarsFromInstance(
  row: PreviewInstance & { project?: Project | null },
  oldStatus: string | null,
  newStatus: string,
  dashboardBase: string,
): DiscordTemplateVars {
  const project = row.project;
  const previewUrl =
    project != null
      ? buildPreviewUrl(project, row.branch, row.branchSlug)
      : null;

  return {
    branch_name: row.branch,
    project_name: project?.slug ?? 'unknown',
    old_status: oldStatus ?? 'none',
    new_status: newStatus,
    preview_link: previewUrl ?? 'n/a',
    branch_page: buildInstanceDashboardUrl(dashboardBase, row.id),
  };
}

export const DEFAULT_DISCORD_MESSAGE_TEMPLATE =
  'Instance branch {{branch_name}} in project {{project_name}} changed from {{old_status}} to {{new_status}}.\nPreview: {{preview_link}}\nDetails: {{branch_page}}';

export const DISCORD_NOTIFY_STATUSES = [
  'waiting',
  'deploying',
  'active',
  'paused',
  'error',
  'deleted',
] as const;

export type DiscordNotifyStatus = (typeof DISCORD_NOTIFY_STATUSES)[number];

export function renderDiscordMessageTemplate(
  template: string,
  vars: DiscordTemplateVars,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof DiscordTemplateVars];
    return value ?? '';
  });
}

export function parseDiscordNotifyStatuses(raw: string | null | undefined): DiscordNotifyStatus[] {
  if (!raw?.trim()) {
    return ['active', 'error', 'paused', 'deleted'];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return ['active', 'error', 'paused', 'deleted'];
    return parsed.filter((s): s is DiscordNotifyStatus =>
      typeof s === 'string' &&
      (DISCORD_NOTIFY_STATUSES as readonly string[]).includes(s),
    );
  } catch {
    return ['active', 'error', 'paused', 'deleted'];
  }
}

export function serializeDiscordNotifyStatuses(statuses: string[]): string {
  const filtered = statuses.filter((s) =>
    (DISCORD_NOTIFY_STATUSES as readonly string[]).includes(s),
  );
  return JSON.stringify(filtered);
}
