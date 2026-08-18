import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function captureRuntimeLogs(
  runtimeName: string,
  runner: 'pm2' | 'docker',
  lines = 200,
): Promise<string> {
  const safeLines = Math.min(Math.max(lines, 10), 2000);
  const safeName = runtimeName.replace(/[^\w.-]/g, '');
  if (safeName !== runtimeName) {
    return 'Nome de runtime inválido para captura de logs.';
  }

  try {
    if (runner === 'docker') {
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['logs', '--tail', String(safeLines), safeName],
        { maxBuffer: 10 * 1024 * 1024, env: { ...process.env } },
      );
      const out = [stdout, stderr].filter(Boolean).join('\n');
      return out || '(sem saída)';
    }

    const { stdout, stderr } = await execFileAsync(
      'pm2',
      ['logs', safeName, '--lines', String(safeLines), '--nostream'],
      { maxBuffer: 10 * 1024 * 1024, env: { ...process.env } },
    );
    const out = [stdout, stderr].filter(Boolean).join('\n');
    return out || '(sem saída)';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Não foi possível capturar logs do ${runner === 'docker' ? 'Docker' : 'PM2'}.\n${msg}`;
  }
}

export const RUNTIME_LOGS_MARKER = '\n\n--- Runtime logs ---\n';

export function appendRuntimeLogsToError(
  message: string,
  logs: string,
): string {
  return `${message}${RUNTIME_LOGS_MARKER}${logs}`;
}

export function extractStoredRuntimeLogs(lastDeployError: string | null): string | null {
  if (!lastDeployError?.includes(RUNTIME_LOGS_MARKER)) return null;
  const idx = lastDeployError.indexOf(RUNTIME_LOGS_MARKER);
  return lastDeployError.slice(idx + RUNTIME_LOGS_MARKER.length).trim() || null;
}
