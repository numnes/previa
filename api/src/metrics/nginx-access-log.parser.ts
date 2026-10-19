export type ParsedAccessLogLine = {
  remoteAddr: string;
  occurredAt: Date;
  method: string;
  path: string;
  payload: string | null;
  statusCode: number;
  userAgent: string | null;
  rawRequest: string;
};

/** Nginx combined (default) access log line. */
const COMBINED_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)] "([^"]*)" (\d{3}) \S+ "([^"]*)" "([^"]*)"/;

function parseNginxTime(raw: string): Date | null {
  // 19/Oct/2026:12:00:01 +0000
  const m =
    /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})$/.exec(
      raw.trim(),
    );
  if (!m) return null;
  const months: Record<string, number> = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };
  const month = months[m[2]];
  if (month === undefined) return null;
  const day = Number(m[1]);
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const min = Number(m[5]);
  const sec = Number(m[6]);
  const tz = m[7];
  const sign = tz.startsWith('-') ? -1 : 1;
  const tzh = Number(tz.slice(1, 3));
  const tzm = Number(tz.slice(3, 5));
  const utcMs =
    Date.UTC(year, month, day, hour, min, sec) - sign * (tzh * 60 + tzm) * 60_000;
  const d = new Date(utcMs);
  return Number.isNaN(d.getTime()) ? null : d;
}

function splitRequest(request: string): {
  method: string;
  path: string;
  payload: string | null;
} {
  const trimmed = request.trim();
  if (!trimmed || trimmed === '-') {
    return { method: '?', path: '/', payload: null };
  }
  const parts = trimmed.split(' ');
  const method = parts[0] || '?';
  const target = parts[1] || '/';
  const q = target.indexOf('?');
  if (q === -1) {
    return { method, path: target.slice(0, 2048), payload: null };
  }
  const path = target.slice(0, q).slice(0, 2048);
  const payload = target.slice(q + 1).slice(0, 2048) || null;
  return { method, path, payload };
}

export function parseNginxCombinedLine(line: string): ParsedAccessLogLine | null {
  const text = line.trim();
  if (!text) return null;
  const m = COMBINED_RE.exec(text);
  if (!m) return null;
  const occurredAt = parseNginxTime(m[2]);
  if (!occurredAt) return null;
  const { method, path, payload } = splitRequest(m[3]);
  const statusCode = Number(m[4]);
  if (!Number.isFinite(statusCode)) return null;
  const ua = m[6] && m[6] !== '-' ? m[6].slice(0, 512) : null;
  return {
    remoteAddr: m[1],
    occurredAt,
    method,
    path,
    payload,
    statusCode,
    userAgent: ua,
    rawRequest: m[3],
  };
}
