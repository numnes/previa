import { ConfigService } from '@nestjs/config';
import { execFile, spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  envVarsToDotenv,
  mergeEnvVars,
  normalizeEnvVars,
  type EnvVarsMap,
} from '../common/env-vars.util';
import { resolvePortEnvNames } from '../common/port-env-names.util';
import type { DeployMeta } from './deploy-meta';
import { pm2AppName } from './pm2-name.util';

const execFileAsync = promisify(execFile);

function coreStateDir(workRoot: string): string {
  const previa = join(workRoot, '.previa-state');
  const legacy = join(workRoot, '.deployer-state');
  if (existsSync(previa)) return previa;
  if (existsSync(legacy)) return legacy;
  return previa;
}

function deployResultPath(workRoot: string, pm2Name: string): string {
  return join(coreStateDir(workRoot), `${pm2Name}.deploy-result.json`);
}

function deployPidPath(workRoot: string, projectSlug: string, branch: string): string {
  return join(coreStateDir(workRoot), `${pm2AppName(projectSlug, branch)}.deploy.pid`);
}

/** Sessão própria para poder matar o grupo (git/npm/docker) sem derrubar a API. */
function runDetachedScript(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(script, args, {
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const err = new Error(
        `Command failed: ${script} (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''})`,
      ) as Error & { stderr?: string };
      err.stderr = output;
      reject(err);
    });
  });
}

function signalPid(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

/** Mata o deploy.sh em andamento (e filhos) a partir do PID gravado no state dir. */
export async function killCoreDeployProcess(
  config: ConfigService,
  projectSlug: string,
  branch: string,
): Promise<boolean> {
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) return false;
  const pidPath = deployPidPath(workRoot, projectSlug, branch);
  let pid = 0;
  try {
    pid = Number((await readFile(pidPath, 'utf8')).trim());
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 1) return false;
  signalPid(pid, 'SIGTERM');
  await new Promise((r) => setTimeout(r, 1500));
  signalPid(pid, 'SIGKILL');
  await unlink(pidPath).catch(() => undefined);
  return true;
}

/** Para o runtime da cor de staging, sem mexer no nginx da versão live. */
export async function abortStagingDeploy(
  config: ConfigService,
  projectSlug: string,
  branch: string,
): Promise<void> {
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) return;
  const base = pm2AppName(projectSlug, branch);
  const stateDir = coreStateDir(workRoot);
  let live = 'primary';
  try {
    const raw = (await readFile(join(stateDir, `${base}.live`), 'utf8')).trim();
    if (raw === 'next' || raw === 'primary') live = raw;
  } catch {
    /* default primary */
  }
  const stagingColor = live === 'next' ? 'primary' : 'next';
  const stagingName = stagingColor === 'next' ? `${base}.next` : base;
  const meta = {
    port: 0,
    pm2Name: base,
    stagingPm2Name: stagingName,
    stagingColor,
  } as DeployMeta;
  await runCoreAbortZeroDowntime(config, projectSlug, branch, meta);
}

export type DeployAppEnvInput = {
  projectEnv?: EnvVarsMap | null;
  instanceEnv?: EnvVarsMap | null;
  /** Extras além de PORT / SERVER_PORT / APP_PORT */
  portEnvNames?: string[] | null;
};

export async function runCoreDeployScript(
  config: ConfigService,
  projectSlug: string,
  gitUrl: string,
  branch: string,
  image?: string,
  appEnv?: DeployAppEnvInput,
  options?: { zeroDowntime?: boolean },
): Promise<DeployMeta> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const binDir = join(coreDir, 'bin');
  const env: NodeJS.ProcessEnv = { ...process.env, PREVIA_WORK_ROOT: workRoot };
  if (image) {
    env.PREVIA_IMAGE = image;
  }
  if (options?.zeroDowntime) {
    env.PREVIA_ZERO_DOWNTIME = '1';
  }

  env.PREVIA_PORT_ENV_NAMES = resolvePortEnvNames(appEnv?.portEnvNames).join(
    ',',
  );

  const merged = mergeEnvVars(
    normalizeEnvVars(appEnv?.projectEnv),
    normalizeEnvVars(appEnv?.instanceEnv),
  );
  let envFilePath: string | null = null;
  if (Object.keys(merged).length > 0) {
    envFilePath = join(
      tmpdir(),
      `previa-app-env-${randomBytes(8).toString('hex')}.env`,
    );
    await writeFile(envFilePath, envVarsToDotenv(merged), 'utf8');
    env.PREVIA_APP_ENV_FILE = envFilePath;
  }

  const script = join(binDir, 'deploy.sh');
  try {
    await runDetachedScript(script, [projectSlug, gitUrl, branch], env);
  } finally {
    if (envFilePath) {
      await unlink(envFilePath).catch(() => undefined);
    }
  }

  const pm2Name = pm2AppName(projectSlug, branch);
  const metaPath = deployResultPath(workRoot, pm2Name);
  const raw = await readFile(metaPath, 'utf8');
  const meta = JSON.parse(raw) as DeployMeta;
  await unlink(metaPath).catch(() => undefined);
  return meta;
}

export async function runCorePromoteZeroDowntime(
  config: ConfigService,
  projectSlug: string,
  branch: string,
  meta: DeployMeta,
): Promise<void> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const stagingName = meta.stagingPm2Name || meta.pm2Name;
  const stagingColor = meta.stagingColor || 'next';
  const script = join(coreDir, 'bin', 'promote-zd.sh');
  await execFileAsync(
    script,
    [projectSlug, branch, String(meta.port), stagingColor, stagingName],
    { env: { ...process.env, PREVIA_WORK_ROOT: workRoot }, maxBuffer: 2 * 1024 * 1024 },
  );
}

export async function runCoreAbortZeroDowntime(
  config: ConfigService,
  projectSlug: string,
  branch: string,
  meta: DeployMeta,
): Promise<void> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const stagingName = meta.stagingPm2Name || meta.pm2Name;
  const script = join(coreDir, 'bin', 'abort-zd.sh');
  await execFileAsync(script, [projectSlug, branch, stagingName], {
    env: { ...process.env, PREVIA_WORK_ROOT: workRoot },
    maxBuffer: 2 * 1024 * 1024,
  });
}

export async function runCorePauseScript(
  config: ConfigService,
  projectSlug: string,
  branch: string,
): Promise<void> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const binDir = join(coreDir, 'bin');
  const env = { ...process.env, PREVIA_WORK_ROOT: workRoot };
  const script = join(binDir, 'pause.sh');
  await execFileAsync(script, [projectSlug, branch], { env });
}

function coreEnv(config: ConfigService): NodeJS.ProcessEnv {
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const apiPort = process.env.PORT || '3000';
  return {
    ...process.env,
    PREVIA_WORK_ROOT: workRoot,
    PREVIA_WAKE_UPSTREAM: `http://127.0.0.1:${apiPort}`,
  };
}

export async function runCoreSleepScript(
  config: ConfigService,
  projectSlug: string,
  branch: string,
): Promise<void> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const binDir = join(coreDir, 'bin');
  const script = join(binDir, 'sleep.sh');
  await execFileAsync(script, [projectSlug, branch], {
    env: coreEnv(config),
    maxBuffer: 2 * 1024 * 1024,
  });
}

export async function runCoreResumeScript(
  config: ConfigService,
  projectSlug: string,
  branch: string,
  appEnv?: DeployAppEnvInput,
): Promise<DeployMeta> {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  const workRoot = config.get<string>('PREVIA_WORK_ROOT');
  if (!workRoot) {
    throw new Error('PREVIA_WORK_ROOT não configurado');
  }
  const binDir = join(coreDir, 'bin');
  const env: NodeJS.ProcessEnv = {
    ...coreEnv(config),
    PREVIA_PORT_ENV_NAMES: resolvePortEnvNames(appEnv?.portEnvNames).join(','),
  };

  const merged = mergeEnvVars(
    normalizeEnvVars(appEnv?.projectEnv),
    normalizeEnvVars(appEnv?.instanceEnv),
  );
  let envFilePath: string | null = null;
  if (Object.keys(merged).length > 0) {
    envFilePath = join(
      tmpdir(),
      `previa-app-env-${randomBytes(8).toString('hex')}.env`,
    );
    await writeFile(envFilePath, envVarsToDotenv(merged), 'utf8');
    env.PREVIA_APP_ENV_FILE = envFilePath;
  }

  const script = join(binDir, 'resume.sh');
  try {
    await execFileAsync(script, [projectSlug, branch], {
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    if (envFilePath) {
      await unlink(envFilePath).catch(() => undefined);
    }
  }

  const pm2Name = pm2AppName(projectSlug, branch);
  const metaPath = deployResultPath(workRoot, pm2Name);
  const raw = await readFile(metaPath, 'utf8');
  const meta = JSON.parse(raw) as DeployMeta;
  await unlink(metaPath).catch(() => undefined);
  return meta;
}
