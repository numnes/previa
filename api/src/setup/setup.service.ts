import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { access, readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type NginxCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type NginxCheckResult = {
  ok: boolean;
  locationsDir: string;
  checks: NginxCheckItem[];
};

export type ProjectTemplateFile = {
  path: string;
  content: string;
};

export type ProjectTemplatesResult = {
  cliCommand: string;
  files: ProjectTemplateFile[];
};

@Injectable()
export class SetupService {
  constructor(private readonly config: ConfigService) {}

  private repoRoot(): string {
    const core = this.config.get<string>('PREVIA_CORE_DIR');
    if (core) return join(core, '..');
    const home = homedir();
    const next = join(home, 'previa');
    const legacy = join(home, 'deployer');
    return existsSync(next) ? next : existsSync(legacy) ? legacy : next;
  }

  private locationsDir(): string {
    const configured = this.config.get<string>('PREVIA_LOCATIONS_DIR');
    if (configured) return configured;
    const home = homedir();
    const next = join(home, 'previa', 'locations');
    const legacy = join(home, 'deployer', 'locations');
    if (existsSync(next)) return next;
    if (existsSync(legacy)) return legacy;
    return next;
  }

  async checkNginx(): Promise<NginxCheckResult> {
    const locationsDir = this.locationsDir();
    const checks: NginxCheckItem[] = [];

    let dirOk = false;
    try {
      await access(locationsDir);
      dirOk = true;
      checks.push({
        id: 'locations_dir',
        label: 'Diretório de locations',
        ok: true,
        detail: locationsDir,
      });
    } catch {
      checks.push({
        id: 'locations_dir',
        label: 'Diretório de locations',
        ok: false,
        detail: `Não encontrado: ${locationsDir}`,
      });
    }

    if (dirOk) {
      try {
        const files = await readdir(locationsDir);
        const locations = files.filter((f) => f.endsWith('.location'));
        checks.push({
          id: 'location_files',
          label: 'Arquivos *.location',
          ok: true,
          detail:
            locations.length > 0
              ? `${locations.length} arquivo(s): ${locations.slice(0, 5).join(', ')}${locations.length > 5 ? '…' : ''}`
              : 'Nenhum ainda (normal antes do primeiro deploy)',
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        checks.push({
          id: 'location_files',
          label: 'Arquivos *.location',
          ok: false,
          detail: msg,
        });
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync('nginx', ['-t'], {
        env: { ...process.env },
        maxBuffer: 1024 * 1024,
      });
      const out = [stdout, stderr].filter(Boolean).join('\n').trim();
      checks.push({
        id: 'nginx_test',
        label: 'nginx -t (sintaxe)',
        ok: true,
        detail: out || 'configuração OK',
      });
    } catch (e) {
      const err = e as { message?: string; stderr?: string; stdout?: string };
      const out = [err.stdout, err.stderr, err.message]
        .filter(Boolean)
        .join('\n')
        .trim();
      checks.push({
        id: 'nginx_test',
        label: 'nginx -t (sintaxe)',
        ok: false,
        detail: out || 'nginx -t falhou',
      });
    }

    try {
      await execFileAsync('pgrep', ['-x', 'nginx'], { env: { ...process.env } });
      checks.push({
        id: 'nginx_running',
        label: 'Processo nginx',
        ok: true,
        detail: 'nginx em execução',
      });
    } catch {
      checks.push({
        id: 'nginx_running',
        label: 'Processo nginx',
        ok: false,
        detail: 'nginx não está rodando (ou pgrep indisponível)',
      });
    }

    const snippet = join(locationsDir, 'nginx-server-snippet.conf');
    try {
      await access(snippet);
      checks.push({
        id: 'snippet',
        label: 'Snippet server (opcional)',
        ok: true,
        detail: snippet,
      });
    } catch {
      checks.push({
        id: 'snippet',
        label: 'Snippet server (opcional)',
        ok: true,
        detail: `Não gerado ainda. Rode: core/bin/setup-nginx.sh <domínio>`,
      });
    }

    const criticalOk = checks
      .filter((c) => c.id === 'locations_dir' || c.id === 'nginx_test' || c.id === 'nginx_running')
      .every((c) => c.ok);

    return {
      ok: criticalOk,
      locationsDir,
      checks,
    };
  }

  async getProjectTemplates(): Promise<ProjectTemplatesResult> {
    const root = this.repoRoot();
    const specs = [
      { path: '.github/workflows/deploy-preview.yml', src: join(root, 'actions', 'deploy-preview.yml') },
      { path: '.github/workflows/deploy-preview-docker-local.yml', src: join(root, 'actions', 'deploy-preview-docker-local.yml') },
      { path: '.github/workflows/deploy-preview-docker-remote.yml', src: join(root, 'actions', 'deploy-preview-docker-remote.yml') },
      { path: '.github/workflows/teardown-preview.yml', src: join(root, 'actions', 'teardown-preview.yml') },
      { path: 'previa.yaml', src: join(root, 'examples', 'previa.yaml') },
      { path: 'previa.pm2.yaml', src: join(root, 'examples', 'previa.pm2.yaml') },
      { path: 'previa.docker-local.yaml', src: join(root, 'examples', 'previa.docker-local.yaml') },
      { path: 'previa.docker-remote.yaml', src: join(root, 'examples', 'previa.docker-remote.yaml') },
    ];

    const files: ProjectTemplateFile[] = [];
    for (const spec of specs) {
      const content = await readFile(spec.src, 'utf8');
      files.push({ path: spec.path, content });
    }

    return {
      cliCommand: 'previa project init',
      files,
    };
  }
}
