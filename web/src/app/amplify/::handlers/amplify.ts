import { apiBaseClient, httpJson } from '@/lib/http';
import { getTokenClient } from '@/lib/client-auth';

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

export async function listAmplifyBranches(): Promise<AmplifyBranchesPayload> {
  const token = getTokenClient();
  return await httpJson<AmplifyBranchesPayload>(`${apiBaseClient()}/amplify/branches`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function deleteAmplifyBranch(branchName: string): Promise<{ ok: true; branchName: string }> {
  const token = getTokenClient();
  return await httpJson<{ ok: true; branchName: string }>(
    `${apiBaseClient()}/amplify/branches/delete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ branchName }),
    },
  );
}

export function nestErrorMessage(e: unknown, fallback: string): string {
  if (!(e instanceof Error) || !e.message) return fallback;
  try {
    const parsed = JSON.parse(e.message) as { message?: string | string[] };
    if (typeof parsed?.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
    if (Array.isArray(parsed?.message) && parsed.message.length) {
      return parsed.message.join(' ');
    }
  } catch {
    // not a Nest JSON body
  }
  return e.message || fallback;
}
