import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PreviewInstance } from '../entities/preview-instance.entity';
import {
  CLICKUP_API_TOKEN_KEY,
  CLICKUP_COMMENT_TEMPLATE_KEY,
  CLICKUP_TEAM_ID_KEY,
  SettingsService,
} from '../settings/settings.service';
import { buildPreviewUrl } from './discord-message.util';
import {
  DEFAULT_CLICKUP_COMMENT_TEMPLATE,
  extractClickupTaskId,
  isClickupCustomTaskId,
  normalizeClickupTaskId,
  parseClickupTaskRef,
  renderClickupCommentTemplate,
} from './clickup-task.util';

const CLICKUP_API = 'https://api.clickup.com/api/v2';

export type ClickupTaskSnapshot = {
  id: string;
  customId: string | null;
  name: string | null;
  status: string | null;
  url: string | null;
};

@Injectable()
export class ClickupNotificationsService {
  private readonly log = new Logger(ClickupNotificationsService.name);

  constructor(
    @InjectRepository(PreviewInstance)
    private readonly instances: Repository<PreviewInstance>,
    private readonly settings: SettingsService,
  ) {}

  notifyPreviewReadySafe(instanceId: string): void {
    void this.notifyPreviewReady(instanceId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`ClickUp comment failed (${instanceId}): ${msg}`);
    });
  }

  async notifyPreviewReady(instanceId: string): Promise<void> {
    const token = (await this.settings.getValue(CLICKUP_API_TOKEN_KEY))?.trim();
    if (!token) return;

    const teamId = (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim();
    const row = await this.instances.findOne({
      where: { id: instanceId },
      relations: ['project'],
    });
    if (!row?.project) return;
    if (!row.project.clickupCommentsEnabled) return;
    if (row.clickupManualLink) return;
    if (row.clickupCommentedAt) return;
    if (row.status !== 'active') return;

    const taskId = extractClickupTaskId(row.branch);
    if (!taskId) {
      this.log.debug(`ClickUp skip ${row.branch}: no task id in branch name`);
      return;
    }

    const previewLink = buildPreviewUrl(row.project, row.branch, row.branchSlug);
    if (!previewLink) {
      this.log.debug(`ClickUp skip ${row.branch}: no public preview URL`);
      return;
    }

    const template =
      (await this.settings.getValue(CLICKUP_COMMENT_TEMPLATE_KEY))?.trim() ||
      DEFAULT_CLICKUP_COMMENT_TEMPLATE;
    const commentText = renderClickupCommentTemplate(template, {
      branch_name: row.branch,
      project_name: row.project.slug,
      preview_link: previewLink,
      task_id: taskId,
    }).trim();
    if (!commentText) return;

    const snapshot = await this.fetchTask(token, taskId, teamId);
    await this.createComment(token, snapshot.id, undefined, commentText);

    row.clickupTaskId = snapshot.customId || snapshot.id;
    row.clickupTaskUrl = snapshot.url;
    row.clickupTaskStatus = snapshot.status;
    row.clickupCommentedAt = new Date();
    await this.instances.save(row);
    this.log.log(`ClickUp comment posted on ${taskId} for ${row.project.slug}/${row.branch}`);
  }

  /**
   * Manual link from pasted ClickUp URL/id. Stores link + status; never posts a comment.
   * Pass null/empty to clear the override (auto branch matching can comment again later).
   */
  async linkInstanceTask(
    instanceId: string,
    urlOrId: string | null,
  ): Promise<PreviewInstance> {
    const row = await this.instances.findOne({
      where: { id: instanceId },
      relations: ['project'],
    });
    if (!row) {
      throw new BadRequestException('Instância não encontrada');
    }

    const trimmed = urlOrId?.trim() ?? '';
    if (!trimmed) {
      row.clickupTaskId = null;
      row.clickupTaskUrl = null;
      row.clickupTaskStatus = null;
      row.clickupManualLink = false;
      return this.instances.save(row);
    }

    const taskRef = parseClickupTaskRef(trimmed);
    if (!taskRef) {
      throw new BadRequestException(
        'URL ou ID ClickUp inválido. Use um link app.clickup.com/t/… ou um ID (ex.: CICM-123).',
      );
    }

    const token = (await this.settings.getValue(CLICKUP_API_TOKEN_KEY))?.trim();
    if (!token) {
      throw new BadRequestException(
        'Configure o token ClickUp em Settings antes de vincular a tarefa.',
      );
    }
    const teamId = (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim();
    const snapshot = await this.fetchTask(token, taskRef, teamId);

    row.clickupTaskId = snapshot.customId || snapshot.id;
    row.clickupTaskUrl =
      snapshot.url ||
      (trimmed.startsWith('http') ? trimmed.split('?')[0] : null);
    row.clickupTaskStatus = snapshot.status;
    row.clickupManualLink = true;
    return this.instances.save(row);
  }

  /**
   * Resolve task from the branch name (custom id). Stores link + status as auto match
   * (not manual), without posting a comment.
   */
  async linkInstanceTaskFromBranch(instanceId: string): Promise<PreviewInstance> {
    const row = await this.instances.findOne({
      where: { id: instanceId },
      relations: ['project'],
    });
    if (!row) {
      throw new BadRequestException('Instância não encontrada');
    }

    const taskRef = extractClickupTaskId(row.branch);
    if (!taskRef) {
      throw new BadRequestException(
        `Branch "${row.branch}" não contém um ID de tarefa ClickUp (ex.: cicm-4491 ou feature/CICM-123).`,
      );
    }

    const token = (await this.settings.getValue(CLICKUP_API_TOKEN_KEY))?.trim();
    if (!token) {
      throw new BadRequestException(
        'Configure o token ClickUp em Settings antes de vincular a tarefa.',
      );
    }
    const teamId = (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim();
    const snapshot = await this.fetchTask(token, taskRef, teamId);

    row.clickupTaskId = snapshot.customId || snapshot.id;
    row.clickupTaskUrl = snapshot.url;
    row.clickupTaskStatus = snapshot.status;
    row.clickupManualLink = false;
    return this.instances.save(row);
  }

  /** Refresh cached status/url for display (detail view). No comment. */
  async refreshInstanceTaskInfo(instanceId: string): Promise<PreviewInstance | null> {
    const row = await this.instances.findOne({
      where: { id: instanceId },
      relations: ['project'],
    });
    if (!row) return null;

    const token = (await this.settings.getValue(CLICKUP_API_TOKEN_KEY))?.trim();
    if (!token) return row;

    const taskRef =
      row.clickupTaskId?.trim() ||
      (!row.clickupManualLink ? extractClickupTaskId(row.branch) : null);
    if (!taskRef) return row;

    try {
      const teamId = (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim();
      const snapshot = await this.fetchTask(token, taskRef, teamId);
      row.clickupTaskId = snapshot.customId || snapshot.id;
      if (snapshot.url) row.clickupTaskUrl = snapshot.url;
      row.clickupTaskStatus = snapshot.status;
      return this.instances.save(row);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.debug(`ClickUp refresh failed (${instanceId}): ${msg}`);
      return row;
    }
  }

  private clickupHeaders(token: string): Record<string, string> {
    return {
      Authorization: token,
      'Content-Type': 'application/json',
    };
  }

  private customIdQuery(teamId: string): string {
    const q = new URLSearchParams({
      custom_task_ids: 'true',
      team_id: teamId,
    });
    return `?${q.toString()}`;
  }

  private async listAuthorizedTeamIds(token: string): Promise<string[]> {
    const res = await fetch(`${CLICKUP_API}/team`, {
      headers: this.clickupHeaders(token),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(
        `Não foi possível listar workspaces ClickUp (HTTP ${res.status}). Confira o token em Settings. ${body.slice(0, 160)}`,
      );
    }
    const json = (await res.json()) as {
      teams?: Array<{ id?: string | number }>;
    };
    return (json.teams ?? [])
      .map((t) => (t.id != null ? String(t.id) : ''))
      .filter(Boolean);
  }

  private parseTaskJson(
    json: {
      id?: string;
      custom_id?: string | null;
      name?: string;
      url?: string;
      status?: { status?: string } | string | null;
    },
    fallbackId: string,
  ): ClickupTaskSnapshot {
    const statusRaw = json.status;
    const status =
      typeof statusRaw === 'string'
        ? statusRaw
        : statusRaw && typeof statusRaw === 'object'
          ? statusRaw.status ?? null
          : null;
    return {
      id: json.id || fallbackId,
      customId: json.custom_id ?? null,
      name: json.name ?? null,
      status,
      url: json.url ?? null,
    };
  }

  private async fetchTaskOnce(
    token: string,
    taskId: string,
    teamId: string | undefined,
  ): Promise<{ ok: true; snapshot: ClickupTaskSnapshot } | { ok: false; status: number; body: string }> {
    const custom = isClickupCustomTaskId(taskId);
    const query = custom && teamId ? this.customIdQuery(teamId) : '';
    const url = `${CLICKUP_API}/task/${encodeURIComponent(taskId)}${query}`;
    const res = await fetch(url, { headers: this.clickupHeaders(token) });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, status: res.status, body };
    }
    const json = (await res.json()) as {
      id?: string;
      custom_id?: string | null;
      name?: string;
      url?: string;
      status?: { status?: string } | string | null;
    };
    return { ok: true, snapshot: this.parseTaskJson(json, taskId) };
  }

  async fetchTask(
    token: string,
    taskId: string,
    teamId: string | undefined,
  ): Promise<ClickupTaskSnapshot> {
    const normalizedId = isClickupCustomTaskId(taskId)
      ? normalizeClickupTaskId(taskId)
      : taskId.trim();
    const custom = isClickupCustomTaskId(normalizedId);

    if (!custom) {
      const result = await this.fetchTaskOnce(token, normalizedId, undefined);
      if (result.ok) return result.snapshot;
      throw this.clickupFetchError(normalizedId, result.status, result.body, false);
    }

    const configured = teamId?.trim() || '';
    let teamIds: string[] = configured ? [configured] : [];

    if (!teamIds.length) {
      teamIds = await this.listAuthorizedTeamIds(token);
      if (!teamIds.length) {
        throw new BadRequestException(
          'IDs customizados do ClickUp (ex.: CICM-123) exigem o Workspace (Team) ID em Settings, e o token não retornou nenhum workspace.',
        );
      }
    }

    let lastStatus = 0;
    let lastBody = '';
    const tried = new Set<string>();

    const tryTeam = async (candidate: string) => {
      if (tried.has(candidate)) return null;
      tried.add(candidate);
      const result = await this.fetchTaskOnce(token, normalizedId, candidate);
      if (result.ok) return result.snapshot;
      lastStatus = result.status;
      lastBody = result.body;
      return null;
    };

    for (const candidate of teamIds) {
      const hit = await tryTeam(candidate);
      if (hit) return hit;
    }

    // Wrong workspace id often returns 401/OAUTH_027 or 404 — retry with teams the token can access.
    const authorized = await this.listAuthorizedTeamIds(token);
    for (const alt of authorized) {
      const hit = await tryTeam(alt);
      if (hit) {
        if (configured && alt !== configured) {
          this.log.warn(
            `ClickUp custom id ${normalizedId}: configured team ${configured} failed; succeeded with team ${alt}`,
          );
        }
        return hit;
      }
    }

    throw this.clickupFetchError(normalizedId, lastStatus || 500, lastBody, true);
  }

  private clickupFetchError(
    taskId: string,
    status: number,
    body: string,
    custom: boolean,
  ): BadRequestException {
    const snippet = body.replace(/\s+/g, ' ').slice(0, 180);
    if (status === 401 || status === 403 || /Team not authorized|OAUTH_027/i.test(body)) {
      return new BadRequestException(
        custom
          ? `ClickUp recusou o workspace para a tarefa ${taskId}. Confira o Workspace (Team) ID e se o token tem acesso a esse workspace em Settings. ${snippet}`
          : `ClickUp recusou o acesso à tarefa ${taskId}. Confira o token em Settings. ${snippet}`,
      );
    }
    if (status === 404) {
      return new BadRequestException(
        `Tarefa ClickUp "${taskId}" não encontrada${custom ? ' neste workspace' : ''}.`,
      );
    }
    return new BadRequestException(
      `Falha ao buscar tarefa ClickUp ${taskId} (HTTP ${status}). ${snippet}`,
    );
  }

  private async createComment(
    token: string,
    taskId: string,
    teamId: string | undefined,
    commentText: string,
  ): Promise<void> {
    // Comments should use the native task id from fetchTask — never send custom_task_ids
    // unless the id is still a custom id (rare fallback).
    const query =
      teamId && isClickupCustomTaskId(taskId) ? this.customIdQuery(teamId) : '';
    const url = `${CLICKUP_API}/task/${encodeURIComponent(taskId)}/comment${query}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.clickupHeaders(token),
      body: JSON.stringify({ comment_text: commentText }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new BadRequestException(
        `Falha ao comentar no ClickUp (HTTP ${res.status}): ${body.slice(0, 200)}`,
      );
    }
  }
}
