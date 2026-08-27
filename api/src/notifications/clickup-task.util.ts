/** ClickUp custom task id like CICM-4491 (prefix-number). */
export function isClickupCustomTaskId(taskId: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(taskId.trim());
}

/** Normalize custom ids to PREFIX-number (ClickUp stores them uppercase). */
export function normalizeClickupTaskId(taskId: string): string {
  const trimmed = taskId.trim();
  if (!isClickupCustomTaskId(trimmed)) return trimmed;
  const dash = trimmed.lastIndexOf('-');
  return `${trimmed.slice(0, dash).toUpperCase()}-${trimmed.slice(dash + 1)}`;
}

export function extractClickupTaskId(branch: string): string | null {
  const trimmed = branch.trim();
  if (!trimmed) return null;

  const customIds = trimmed.match(/[A-Za-z][A-Za-z0-9]*-\d+/g);
  if (customIds?.length) {
    return normalizeClickupTaskId(customIds[customIds.length - 1]);
  }

  const leaf = trimmed.split('/').pop() ?? trimmed;
  if (/^[a-z0-9]{6,12}$/i.test(leaf)) {
    return leaf;
  }

  return null;
}

/**
 * Accepts a ClickUp task URL or a bare task / custom ID.
 * Examples:
 * - https://app.clickup.com/t/86abc123
 * - https://app.clickup.com/t/CICM-4491
 * - https://app.clickup.com/123/v/li/456/t/86abc123
 * - CICM-4491
 */
export function parseClickupTaskRef(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const path = url.pathname;
    const tMatch = path.match(/\/t\/([^/?#]+)/i);
    if (tMatch?.[1]) {
      return normalizeClickupTaskId(decodeURIComponent(tMatch[1]));
    }
  } catch {
    // not a URL — treat as id
  }

  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(trimmed)) {
    return normalizeClickupTaskId(trimmed);
  }
  if (/^[a-z0-9]{6,12}$/i.test(trimmed)) {
    return trimmed;
  }

  return extractClickupTaskId(trimmed);
}

export const DEFAULT_CLICKUP_COMMENT_TEMPLATE =
  'Preview is ready for branch {{branch_name}} ({{project_name}}).\n{{preview_link}}';

export type ClickupCommentVars = {
  branch_name: string;
  project_name: string;
  preview_link: string;
  task_id: string;
};

export function renderClickupCommentTemplate(
  template: string,
  vars: ClickupCommentVars,
): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, key: string) => {
    const value = vars[key as keyof ClickupCommentVars];
    return value ?? '';
  });
}

export function maskClickupToken(token: string | null | undefined): {
  clickupApiTokenConfigured: boolean;
  clickupApiTokenLast4: string;
} {
  const trimmed = token?.trim() ?? '';
  if (!trimmed) {
    return { clickupApiTokenConfigured: false, clickupApiTokenLast4: '' };
  }
  return {
    clickupApiTokenConfigured: true,
    clickupApiTokenLast4: trimmed.slice(-4),
  };
}
