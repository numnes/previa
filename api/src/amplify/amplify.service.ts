import {
  AmplifyClient,
  CreateBranchCommand,
  DeleteBranchCommand,
  GetAppCommand,
  GetBranchCommand,
  ListBranchesCommand,
  StartJobCommand,
  type Branch,
} from '@aws-sdk/client-amplify';
import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClickupNotificationsService } from '../notifications/clickup-notifications.service';
import { extractClickupTaskId } from '../notifications/clickup-task.util';
import {
  AMPLIFY_ACCESS_KEY_ID_KEY,
  AMPLIFY_APP_ID_KEY,
  AMPLIFY_HIDDEN_BRANCHES_KEY,
  AMPLIFY_MAX_BRANCHES_KEY,
  AMPLIFY_REGION_KEY,
  AMPLIFY_SECRET_ACCESS_KEY_KEY,
  CLICKUP_API_TOKEN_KEY,
  CLICKUP_TEAM_ID_KEY,
  SettingsService,
} from '../settings/settings.service';
import {
  amplifyBranchPreviewUrl,
  amplifySlotUsage,
  isAmplifyBranchHidden,
  parseAmplifyHiddenBranches,
  parseAmplifySlotLimit,
} from './amplify.util';

type ClickupBranchFields = {
  clickupTaskId: string | null;
  clickupTaskUrl: string | null;
  clickupTaskStatus: string | null;
  clickupTaskName: string | null;
};

const CLICKUP_CONCURRENCY = 6;

export type AmplifyBranchRow = {
  branchName: string;
  displayName: string | null;
  stage: string | null;
  enableAutoBuild: boolean;
  lastUpdatedAt: string | null;
  previewUrl: string | null;
  clickupTaskId: string | null;
  clickupTaskUrl: string | null;
  clickupTaskStatus: string | null;
  clickupTaskName: string | null;
};

export type AmplifyBranchesPayload = {
  configured: boolean;
  appId: string | null;
  appName: string | null;
  defaultDomain: string | null;
  region: string;
  hiddenBranches: string[];
  hiddenCount: number;
  slotUsed: number;
  slotLimit: number;
  slotAvailable: number;
  clickupConfigured: boolean;
  branches: AmplifyBranchRow[];
};

export type AmplifyHostBranchResult = {
  ok: true;
  branchName: string;
  action: 'created' | 'redeployed';
  jobId: string | null;
};

@Injectable()
export class AmplifyService {
  private readonly log = new Logger(AmplifyService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
    private readonly clickup: ClickupNotificationsService,
  ) {}

  async listBranches(): Promise<AmplifyBranchesPayload> {
    const region = await this.getRegion();
    const appId = await this.getAppId();
    const hiddenBranches = parseAmplifyHiddenBranches(
      await this.settings.getValue(AMPLIFY_HIDDEN_BRANCHES_KEY),
    );
    const clickupToken = (await this.settings.getValue(CLICKUP_API_TOKEN_KEY))?.trim() || '';
    const clickupConfigured = !!clickupToken;
    const slotLimit = parseAmplifySlotLimit(
      await this.settings.getValue(AMPLIFY_MAX_BRANCHES_KEY),
    );

    if (!appId) {
      return {
        configured: false,
        appId: null,
        appName: null,
        defaultDomain: null,
        region,
        hiddenBranches,
        hiddenCount: 0,
        ...amplifySlotUsage(0, slotLimit),
        clickupConfigured,
        branches: [],
      };
    }

    const client = await this.getClient(region);
    let appName: string | null = null;
    let defaultDomain: string | null = null;

    try {
      const app = await client.send(new GetAppCommand({ appId }));
      appName = app.app?.name ?? null;
      defaultDomain = app.app?.defaultDomain ?? null;
    } catch (e) {
      this.log.warn(`Amplify GetApp failed: ${awsErrorMessage(e)}`);
      // ListBranches can still succeed without GetApp (missing amplify:GetApp).
    }
    if (!defaultDomain) {
      defaultDomain = `${appId}.amplifyapp.com`;
    }

    let rawBranches: Branch[] = [];
    try {
      rawBranches = await this.listAllBranches(client, appId);
    } catch (e) {
      this.log.warn(`Amplify ListBranches failed: ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(e, 'Não foi possível listar as branches do Amplify.');
    }

    const visible = rawBranches.filter(
      (b) => b.branchName && !isAmplifyBranchHidden(b.branchName, hiddenBranches),
    );
    const hiddenCount = rawBranches.length - visible.length;

    const clickupTeamId =
      (await this.settings.getValue(CLICKUP_TEAM_ID_KEY))?.trim() || undefined;
    const clickupByBranch = clickupConfigured
      ? await this.enrichClickup(visible, clickupToken, clickupTeamId)
      : new Map<string, ClickupBranchFields>();

    const branches: AmplifyBranchRow[] = visible.map((b) => {
      const branchName = b.branchName as string;
      const clickup = clickupByBranch.get(branchName);
      return {
        branchName,
        displayName: b.displayName ?? null,
        stage: b.stage ?? null,
        enableAutoBuild: !!b.enableAutoBuild,
        lastUpdatedAt: b.updateTime ? b.updateTime.toISOString() : null,
        previewUrl: amplifyBranchPreviewUrl(defaultDomain, branchName),
        clickupTaskId: clickup?.clickupTaskId ?? extractClickupTaskId(branchName),
        clickupTaskUrl: clickup?.clickupTaskUrl ?? null,
        clickupTaskStatus: clickup?.clickupTaskStatus ?? null,
        clickupTaskName: clickup?.clickupTaskName ?? null,
      };
    });

    branches.sort((a, b) => a.branchName.localeCompare(b.branchName));

    return {
      configured: true,
      appId,
      appName,
      defaultDomain,
      region,
      hiddenBranches,
      hiddenCount,
      ...amplifySlotUsage(rawBranches.length, slotLimit),
      clickupConfigured,
      branches,
    };
  }

  async deleteBranch(branchName: string): Promise<{ ok: true; branchName: string }> {
    const name = branchName.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da branch.');
    }

    const hiddenBranches = parseAmplifyHiddenBranches(
      await this.settings.getValue(AMPLIFY_HIDDEN_BRANCHES_KEY),
    );
    if (isAmplifyBranchHidden(name, hiddenBranches)) {
      throw new BadRequestException(
        `A branch "${name}" está oculta nas configurações e não pode ser removida por aqui.`,
      );
    }

    const appId = await this.getAppId();
    if (!appId) {
      throw new BadRequestException(
        'Configure o App ID do Amplify em Settings antes de remover uma branch.',
      );
    }

    const client = await this.getClient(await this.getRegion());
    try {
      await client.send(new DeleteBranchCommand({ appId, branchName: name }));
    } catch (e) {
      this.log.warn(`Amplify DeleteBranch failed (${name}): ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(e, `Não foi possível remover a branch "${name}".`);
    }

    this.log.log(`Amplify branch deleted: ${appId}/${name}`);
    return { ok: true, branchName: name };
  }

  async hostBranch(branchName: string): Promise<AmplifyHostBranchResult> {
    const name = branchName.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da branch.');
    }

    const hiddenBranches = parseAmplifyHiddenBranches(
      await this.settings.getValue(AMPLIFY_HIDDEN_BRANCHES_KEY),
    );
    if (isAmplifyBranchHidden(name, hiddenBranches)) {
      throw new BadRequestException(
        `A branch "${name}" está oculta nas configurações e não pode ser hospedada por aqui.`,
      );
    }

    const appId = await this.getAppId();
    if (!appId) {
      throw new BadRequestException(
        'Configure o App ID do Amplify em Settings antes de hospedar uma branch.',
      );
    }

    const client = await this.getClient(await this.getRegion());
    const existing = await this.findBranch(client, appId, name);
    if (existing) {
      const jobId = await this.startReleaseJob(client, appId, name);
      this.log.log(`Amplify RELEASE job started: ${appId}/${name} job=${jobId ?? 'n/a'}`);
      return { ok: true, branchName: name, action: 'redeployed', jobId };
    }

    const slotLimit = parseAmplifySlotLimit(
      await this.settings.getValue(AMPLIFY_MAX_BRANCHES_KEY),
    );
    let used = 0;
    try {
      used = (await this.listAllBranches(client, appId)).length;
    } catch (e) {
      this.log.warn(`Amplify ListBranches (slot check) failed: ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(e, 'Não foi possível conferir os slots do Amplify.');
    }
    if (amplifySlotUsage(used, slotLimit).slotAvailable <= 0) {
      throw new BadRequestException(
        `Não há slots Amplify disponíveis (${used}/${slotLimit}). Remova uma branch ou aumente o limite.`,
      );
    }

    try {
      await client.send(
        new CreateBranchCommand({
          appId,
          branchName: name,
          enableAutoBuild: true,
          stage: 'DEVELOPMENT',
        }),
      );
    } catch (e) {
      this.log.warn(`Amplify CreateBranch failed (${name}): ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(
        e,
        `Não foi possível criar a branch "${name}" no Amplify. Ela precisa existir no repositório Git conectado ao app.`,
      );
    }

    this.log.log(`Amplify branch created: ${appId}/${name}`);
    const jobId = await this.startReleaseJob(client, appId, name, { ignoreBusy: true });
    return { ok: true, branchName: name, action: 'created', jobId };
  }

  private async findBranch(
    client: AmplifyClient,
    appId: string,
    branchName: string,
  ): Promise<Branch | null> {
    try {
      const res = await client.send(new GetBranchCommand({ appId, branchName }));
      return res.branch ?? null;
    } catch (e) {
      if (isAmplifyNotFound(e)) return null;
      this.log.warn(`Amplify GetBranch failed (${branchName}): ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(e, `Não foi possível consultar a branch "${branchName}".`);
    }
  }

  private async startReleaseJob(
    client: AmplifyClient,
    appId: string,
    branchName: string,
    opts?: { ignoreBusy?: boolean },
  ): Promise<string | null> {
    try {
      const res = await client.send(
        new StartJobCommand({
          appId,
          branchName,
          jobType: 'RELEASE',
          jobReason: 'Forced from Previa (no git push)',
        }),
      );
      return res.jobSummary?.jobId ?? null;
    } catch (e) {
      if (opts?.ignoreBusy && isAmplifyJobBusy(e)) {
        this.log.log(
          `Amplify RELEASE skipped (job already running): ${appId}/${branchName}`,
        );
        return null;
      }
      this.log.warn(`Amplify StartJob failed (${branchName}): ${awsErrorMessage(e)}`);
      throw this.wrapAwsError(
        e,
        `Não foi possível iniciar o deploy da branch "${branchName}" (start-job RELEASE).`,
      );
    }
  }

  private async listAllBranches(
    client: AmplifyClient,
    appId: string,
  ): Promise<Branch[]> {
    const out: Branch[] = [];
    let nextToken: string | undefined;
    do {
      const page = await client.send(
        new ListBranchesCommand({
          appId,
          maxResults: 50,
          nextToken,
        }),
      );
      out.push(...(page.branches ?? []));
      nextToken = page.nextToken;
    } while (nextToken);
    return out;
  }

  private async enrichClickup(
    branches: Branch[],
    token: string,
    teamId: string | undefined,
  ): Promise<Map<string, ClickupBranchFields>> {
    const targets = branches
      .map((b) => ({
        branchName: b.branchName as string,
        taskId: extractClickupTaskId(b.branchName ?? ''),
      }))
      .filter((t): t is { branchName: string; taskId: string } => !!t.taskId);

    const results = await mapPool(targets, CLICKUP_CONCURRENCY, async (t) => {
      try {
        const snapshot = await this.clickup.fetchTask(token, t.taskId, teamId, {
          includeRelated: false,
        });
        return {
          branchName: t.branchName,
          clickupTaskId: snapshot.customId || snapshot.id,
          clickupTaskUrl: snapshot.url,
          clickupTaskStatus: snapshot.status,
          clickupTaskName: snapshot.name,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.debug(`ClickUp lookup failed for Amplify branch ${t.branchName}: ${msg}`);
        return {
          branchName: t.branchName,
          clickupTaskId: t.taskId,
          clickupTaskUrl: null,
          clickupTaskStatus: null,
          clickupTaskName: null,
        };
      }
    });

    return new Map(
      results.map((r) => [
        r.branchName,
        {
          clickupTaskId: r.clickupTaskId,
          clickupTaskUrl: r.clickupTaskUrl,
          clickupTaskStatus: r.clickupTaskStatus,
          clickupTaskName: r.clickupTaskName,
        },
      ]),
    );
  }

  private async getAppId(): Promise<string | null> {
    const fromSettings = (await this.settings.getValue(AMPLIFY_APP_ID_KEY))?.trim();
    if (fromSettings) return fromSettings;
    const fromEnv = (
      this.config.get<string>('PREVIA_AMPLIFY_APP_ID') ||
      this.config.get<string>('AMPLIFY_APP_ID') ||
      ''
    ).trim();
    return fromEnv || null;
  }

  private async getRegion(): Promise<string> {
    const fromSettings = (await this.settings.getValue(AMPLIFY_REGION_KEY))?.trim();
    if (fromSettings) return fromSettings;
    const fromEnv = (
      this.config.get<string>('AWS_REGION') ||
      this.config.get<string>('AWS_DEFAULT_REGION') ||
      ''
    ).trim();
    return fromEnv || 'us-east-1';
  }

  private async getClient(region: string): Promise<AmplifyClient> {
    const accessKeyId = (await this.settings.getValue(AMPLIFY_ACCESS_KEY_ID_KEY))?.trim();
    const secretAccessKey = (
      await this.settings.getValue(AMPLIFY_SECRET_ACCESS_KEY_KEY)
    )?.trim();
    if (accessKeyId && secretAccessKey) {
      return new AmplifyClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
    }
    return new AmplifyClient({ region });
  }

  private wrapAwsError(e: unknown, fallback: string): BadRequestException {
    const msg = awsErrorMessage(e);
    const name = awsErrorName(e);
    const status = awsHttpStatus(e);

    if (
      status === 401 ||
      status === 403 ||
      /UnrecognizedClient|InvalidClientTokenId|AccessDenied|ExpiredToken|CredentialsProvider/i.test(
        `${name} ${msg}`,
      )
    ) {
      return new BadRequestException(
        'Credenciais AWS recusadas. Confira Access Key, Secret, região e as permissões amplify:ListBranches / amplify:GetApp / amplify:GetBranch / amplify:CreateBranch / amplify:StartJob / amplify:DeleteBranch.',
      );
    }
    if (status === 404 || /NotFound|ResourceNotFound/i.test(`${name} ${msg}`)) {
      return new BadRequestException(
        'App ou branch Amplify não encontrado. Confira o App ID, a região e o nome da branch no repositório Git conectado.',
      );
    }
    if (status === 409 || /LimitExceeded|BranchAlreadyExists|Conflict/i.test(`${name} ${msg}`)) {
      return new BadRequestException(
        `${fallback} ${msg || 'Limite de branches do Amplify atingido ou a branch já existe.'}`.trim(),
      );
    }
    return new BadRequestException(`${fallback} ${msg}`.trim());
  }
}

function isAmplifyNotFound(e: unknown): boolean {
  const status = awsHttpStatus(e);
  const name = awsErrorName(e);
  const msg = awsErrorMessage(e);
  return status === 404 || /NotFound|ResourceNotFound/i.test(`${name} ${msg}`);
}

function isAmplifyJobBusy(e: unknown): boolean {
  const msg = `${awsErrorName(e)} ${awsErrorMessage(e)}`;
  return /already (in progress|running)|job is running/i.test(msg);
}

function awsErrorMessage(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return String(e);
}

function awsErrorName(e: unknown): string {
  if (e && typeof e === 'object' && 'name' in e) {
    return String((e as { name: unknown }).name);
  }
  return '';
}

function awsHttpStatus(e: unknown): number {
  if (e && typeof e === 'object' && '$metadata' in e) {
    const meta = (e as { $metadata?: { httpStatusCode?: number } }).$metadata;
    return meta?.httpStatusCode ?? 0;
  }
  return 0;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const limit = Math.max(1, concurrency);
  const out: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}
