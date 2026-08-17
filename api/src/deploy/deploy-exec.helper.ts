import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { randomBytes } from 'crypto';
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
    await execFileAsync(script, [projectSlug, gitUrl, branch], {
      env,
      maxBuffer: 10 * 1024 * 1024,
    });
  } finally {
    if (envFilePath) {
      await unlink(envFilePath).catch(() => undefined);
    }
  }

  const pm2Name = pm2AppName(projectSlug, branch);
  const metaPath = join(workRoot, '.previa-state', `${pm2Name}.deploy-result.json`);
  const raw = await readFile(metaPath, 'utf8');
  const meta = JSON.parse(raw) as DeployMeta;
  await unlink(metaPath).catch(() => undefined);
  return meta;
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
  const metaPath = join(workRoot, '.previa-state', `${pm2Name}.deploy-result.json`);
  const raw = await readFile(metaPath, 'utf8');
  const meta = JSON.parse(raw) as DeployMeta;
  await unlink(metaPath).catch(() => undefined);
  return meta;
}
