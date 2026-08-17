#!/usr/bin/env node
/**
 * Create or update admin user via Previa API (setup key).
 *
 * Usage:
 *   node scripts/seed-default-user.js count
 *   node scripts/seed-default-user.js list
 *   PREVIA_SEED_EMAIL=... PREVIA_SEED_PASSWORD=... node scripts/seed-default-user.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, 'api', '.env');
const SETUP_KEY_HEADER = 'x-previa-setup-key';

function loadEnvVar(key) {
  if (process.env[key]) return process.env[key].trim();
  if (!fs.existsSync(ENV_PATH)) return '';
  const line = fs
    .readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.startsWith(`${key}=`))
    .pop();
  if (!line) return '';
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

function apiBase() {
  const fromEnv = (process.env.PREVIA_API_URL || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const port = loadEnvVar('PORT') || '3000';
  return `http://127.0.0.1:${port}`;
}

function setupKey() {
  const key = (
    process.env.PREVIA_SETUP_KEY ||
    loadEnvVar('PREVIA_SETUP_KEY') ||
    process.env.DEPLOYER_SETUP_KEY ||
    loadEnvVar('DEPLOYER_SETUP_KEY')
  ).trim();
  if (!key) {
    throw new Error(
      'PREVIA_SETUP_KEY não encontrada. Rode previa setup ou defina em api/.env.',
    );
  }
  return key;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApi() {
  const base = apiBase();
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`${base}/docs`, { method: 'GET' });
      if (res.ok || res.status === 301 || res.status === 302) return;
    } catch {
      // API ainda não disponível
    }
    await sleep(1000);
  }
  throw new Error(`API não respondeu em ${base}. Confirme que previa-api está rodando.`);
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      [SETUP_KEY_HEADER]: setupKey(),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && (body.message || body.error)) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join('; ') : String(msg));
  }

  return body;
}

async function listUsers() {
  const rows = await apiFetch('/users');
  return Array.isArray(rows) ? rows : [];
}

async function countUsers() {
  const rows = await listUsers();
  return rows.length;
}

async function listUserEmails() {
  const rows = await listUsers();
  return rows.map((r) => r.email).filter(Boolean);
}

async function seedUser() {
  const email = (process.env.PREVIA_SEED_EMAIL || '').trim();
  const password = process.env.PREVIA_SEED_PASSWORD || '';

  if (!email || !password) {
    console.error('[seed-user] PREVIA_SEED_EMAIL and PREVIA_SEED_PASSWORD are required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[seed-user] Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[seed-user] Invalid email.');
    process.exit(1);
  }

  const existing = (await listUsers()).some((u) => u.email === email);
  await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (existing) {
    console.log(`[seed-user] Password updated for ${email}`);
  } else {
    console.log(`[seed-user] User created: ${email}`);
  }
}

async function main() {
  await waitForApi();
  const mode = process.argv[2];

  if (mode === 'count') {
    const count = await countUsers();
    process.stdout.write(String(count));
    return;
  }

  if (mode === 'list') {
    const emails = await listUserEmails();
    for (const email of emails) {
      process.stdout.write(`${email}\n`);
    }
    return;
  }

  await seedUser();
}

main().catch((e) => {
  console.error('[seed-user] Error:', e.message || e);
  process.exit(1);
});
