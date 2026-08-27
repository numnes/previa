/** Shared badge styles for instance / ClickUp status chips in tables. */

const BASE =
  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium';

const INSTANCE_STATUS_CLASS: Record<string, string> = {
  waiting: 'border-slate-400/30 bg-slate-500/15 text-slate-100/90',
  deploying: 'border-sky-400/35 bg-sky-500/15 text-sky-100/90',
  active: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100/90',
  paused: 'border-amber-400/35 bg-amber-500/15 text-amber-100/90',
  error: 'border-rose-400/40 bg-rose-500/15 text-rose-100/90',
};

export function instanceStatusBadgeClass(
  status: string,
  opts?: { idleSleep?: boolean },
): string {
  if (status === 'paused' && opts?.idleSleep) {
    return `${BASE} border-violet-400/35 bg-violet-500/15 text-violet-100/90`;
  }
  return `${BASE} ${INSTANCE_STATUS_CLASS[status] ?? 'border-white/15 bg-white/10 text-white/75'}`;
}

/**
 * Color ClickUp / workflow statuses by common keywords (status names are free-form).
 */
export function clickupStatusBadgeClass(status: string): string {
  const s = status.trim().toLowerCase();

  if (
    /\b(complete|completed|done|closed|resolved|shipped|deployed|aprovad|approved)\b/.test(s) ||
    s === 'complete' ||
    s === 'closed' ||
    s === 'done'
  ) {
    return `${BASE} border-emerald-400/35 bg-emerald-500/15 text-emerald-100/90`;
  }

  if (
    /\b(progress|doing|active|development|dev|wip|working|em andamento|andamento)\b/.test(s) ||
    s.includes('in progress') ||
    s.includes('in desenvolvimento')
  ) {
    return `${BASE} border-sky-400/35 bg-sky-500/15 text-sky-100/90`;
  }

  if (
    /\b(review|qa|test|testing|homolog|staging|bloquead|blocked|hold|waiting)\b/.test(s) ||
    s.includes('code review') ||
    s.includes('in review')
  ) {
    return `${BASE} border-amber-400/35 bg-amber-500/15 text-amber-100/90`;
  }

  if (/\b(open|to do|todo|backlog|new|inbox|fila|pendente)\b/.test(s) || s === 'to do') {
    return `${BASE} border-slate-400/30 bg-slate-500/15 text-slate-100/90`;
  }

  if (/\b(cancel|rejected|fail|error|won'?t|abandon)\b/.test(s)) {
    return `${BASE} border-rose-400/40 bg-rose-500/15 text-rose-100/90`;
  }

  return `${BASE} border-white/15 bg-white/10 text-white/75`;
}
