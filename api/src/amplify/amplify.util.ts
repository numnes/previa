/** AWS default quota: branches per Amplify app. */
export const DEFAULT_AMPLIFY_BRANCH_SLOT_LIMIT = 50;

export function parseAmplifySlotLimit(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return DEFAULT_AMPLIFY_BRANCH_SLOT_LIMIT;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_AMPLIFY_BRANCH_SLOT_LIMIT;
  return Math.min(Math.floor(n), 1000);
}

export function amplifySlotUsage(used: number, limit: number) {
  const slotLimit = Math.max(1, limit);
  const slotUsed = Math.max(0, used);
  return {
    slotUsed,
    slotLimit,
    slotAvailable: Math.max(0, slotLimit - slotUsed),
  };
}

export function parseAmplifyHiddenBranches(
  raw: string | null | undefined,
): string[] {
  if (raw == null) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return uniqueNames(parsed.map((v) => String(v)));
      }
    } catch {
      // fall through to line/comma split
    }
  }

  return uniqueNames(trimmed.split(/[\n,]+/));
}

export function serializeAmplifyHiddenBranches(names: string[]): string {
  return uniqueNames(names).join('\n');
}

export function isAmplifyBranchHidden(
  branchName: string,
  hidden: string[],
): boolean {
  const needle = branchName.trim().toLowerCase();
  if (!needle) return false;
  return hidden.some((h) => h.trim().toLowerCase() === needle);
}

export function amplifyBranchPreviewUrl(
  defaultDomain: string | null | undefined,
  branchName: string,
): string | null {
  const host = defaultDomain
    ?.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const name = branchName.trim();
  if (!host || !name) return null;
  const slug = name.replace(/\//g, '-');
  return `https://${slug}.${host}`;
}

export function maskAmplifyAccessKey(key: string | null | undefined): {
  amplifyAccessKeyConfigured: boolean;
  amplifyAccessKeyLast4: string;
} {
  const trimmed = key?.trim() ?? '';
  if (!trimmed) {
    return { amplifyAccessKeyConfigured: false, amplifyAccessKeyLast4: '' };
  }
  return {
    amplifyAccessKeyConfigured: true,
    amplifyAccessKeyLast4: trimmed.slice(-4),
  };
}

export function maskAmplifySecret(secret: string | null | undefined): {
  amplifySecretConfigured: boolean;
} {
  return { amplifySecretConfigured: !!(secret?.trim()) };
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
