import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_DATABASE_URL =
  'postgresql://postgres:deployer@localhost:5432/deployer';

/** Aceita nomes antigos DEPLOYER_* após o rename para Previa. */
const ENV_ALIASES: [string, string][] = [
  ['PREVIA_WORK_ROOT', 'DEPLOYER_WORK_ROOT'],
  ['PREVIA_CORE_DIR', 'DEPLOYER_CORE_DIR'],
  ['PREVIA_LOCATIONS_DIR', 'DEPLOYER_LOCATIONS_DIR'],
  ['PREVIA_SETUP_KEY', 'DEPLOYER_SETUP_KEY'],
  ['PREVIA_CLUSTER_SECRET', 'DEPLOYER_CLUSTER_SECRET'],
  ['PREVIA_DEPLOY_CONCURRENCY', 'DEPLOYER_DEPLOY_CONCURRENCY'],
  ['PREVIA_NODE_LABEL', 'DEPLOYER_NODE_LABEL'],
  ['PREVIA_WAKE_UPSTREAM', 'DEPLOYER_WAKE_UPSTREAM'],
  ['PREVIA_IMAGE', 'DEPLOYER_IMAGE'],
  ['PREVIA_PORT_ENV_NAMES', 'DEPLOYER_PORT_ENV_NAMES'],
  ['PREVIA_APP_ENV_FILE', 'DEPLOYER_APP_ENV_FILE'],
];

function applyEnvAliases(): void {
  for (const [neu, old] of ENV_ALIASES) {
    const n = process.env[neu]?.trim();
    const o = process.env[old]?.trim();
    if (n && !o) process.env[old] = n;
    else if (o && !n) process.env[neu] = o;
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** PM2 may inject empty env vars; Nest/dotenv skip overriding existing keys. */
export function patchEmptyEnvFromFile(): void {
  applyEnvAliases();
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    if (!process.env.DATABASE_URL?.trim()) {
      process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
    }
    applyEnvAliases();
    return;
  }

  const parsed = parseEnvFile(readFileSync(envPath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (!value) continue;
    const current = process.env[key];
    if (current === undefined || current === '') {
      process.env[key] = value;
    }
  }

  if (!process.env.DATABASE_URL?.trim()) {
    process.env.DATABASE_URL =
      parsed.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;
  }
  applyEnvAliases();
}
