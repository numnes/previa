import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { envVarsToDotenv, normalizeEnvVars, type EnvVarsMap } from '../common/env-vars.util';
import type { ResourceKind } from '../entities/provisioned-resource.entity';

export type ResourceUpResult = {
  runtimeName: string;
  kind: string;
  publishedPorts: Record<string, number>;
};

function coreBin(config: ConfigService): string {
  const coreDir =
    config.get<string>('PREVIA_CORE_DIR') ||
    join(__dirname, '..', '..', '..', 'core');
  return join(coreDir, 'bin');
}

function workRoot(config: ConfigService): string {
  const root = config.get<string>('PREVIA_WORK_ROOT');
  if (!root) throw new Error('PREVIA_WORK_ROOT não configurado');
  return root;
}

function stateDir(work: string): string {
  const previa = join(work, '.previa-state');
  const legacy = join(work, '.deployer-state');
  if (existsSync(previa)) return previa;
  if (existsSync(legacy)) return legacy;
  return previa;
}

export function resourceWorkDir(config: ConfigService, slug: string): string {
  return join(stateDir(workRoot(config)), 'resources', slug);
}

function runScript(
  script: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(script, args, {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const append = (chunk: Buffer | string) => {
      output += chunk.toString();
      if (output.length > 200_000) output = output.slice(-200_000);
    };
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve(output);
        return;
      }
      const err = new Error(
        `Command failed: ${script} (code ${code ?? 'null'}${signal ? `, signal ${signal}` : ''})`,
      ) as Error & { stderr?: string };
      err.stderr = output;
      reject(err);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.on('exit', (code, signal) => finish(code, signal));
  });
}

export async function writeResourceSources(
  config: ConfigService,
  slug: string,
  kind: ResourceKind,
  dockerfile: string | null,
  composeYaml: string | null,
): Promise<string> {
  const dir = resourceWorkDir(config, slug);
  await mkdir(dir, { recursive: true });
  if (kind === 'dockerfile' && dockerfile) {
    await writeFile(join(dir, 'Dockerfile'), dockerfile, 'utf8');
  }
  if (kind === 'compose' && composeYaml) {
    await writeFile(join(dir, 'docker-compose.yml'), composeYaml, 'utf8');
  }
  return dir;
}

export async function runResourceUp(opts: {
  config: ConfigService;
  slug: string;
  kind: ResourceKind;
  image: string | null;
  dockerfile: string | null;
  composeYaml: string | null;
  containerPorts: number[];
  envVars: EnvVarsMap;
}): Promise<ResourceUpResult> {
  const dir = await writeResourceSources(
    opts.config,
    opts.slug,
    opts.kind,
    opts.dockerfile,
    opts.composeYaml,
  );
  const resultPath = join(
    tmpdir(),
    `previa-res-${randomBytes(8).toString('hex')}.json`,
  );
  let envFilePath: string | null = null;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PREVIA_WORK_ROOT: workRoot(opts.config),
    PREVIA_RESOURCE_KIND: opts.kind,
    PREVIA_RESOURCE_DIR: dir,
    PREVIA_RESOURCE_PORTS: opts.containerPorts.join(','),
    PREVIA_RESOURCE_RESULT: resultPath,
  };
  if (opts.image) env.PREVIA_RESOURCE_IMAGE = opts.image;
  const normalized = normalizeEnvVars(opts.envVars);
  if (Object.keys(normalized).length > 0) {
    envFilePath = join(
      tmpdir(),
      `previa-res-env-${randomBytes(8).toString('hex')}.env`,
    );
    await writeFile(envFilePath, envVarsToDotenv(normalized), 'utf8');
    env.PREVIA_APP_ENV_FILE = envFilePath;
  }
  const script = join(coreBin(opts.config), 'resource-up.sh');
  try {
    await runScript(script, [opts.slug], env);
    const raw = await readFile(resultPath, 'utf8');
    const parsed = JSON.parse(raw) as ResourceUpResult;
    return {
      runtimeName: parsed.runtimeName,
      kind: parsed.kind,
      publishedPorts: parsed.publishedPorts ?? {},
    };
  } finally {
    await unlink(resultPath).catch(() => undefined);
    if (envFilePath) await unlink(envFilePath).catch(() => undefined);
  }
}

export async function runResourceDown(
  config: ConfigService,
  slug: string,
): Promise<void> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PREVIA_WORK_ROOT: workRoot(config),
    PREVIA_RESOURCE_DIR: resourceWorkDir(config, slug),
  };
  const script = join(coreBin(config), 'resource-down.sh');
  await runScript(script, [slug], env);
}
