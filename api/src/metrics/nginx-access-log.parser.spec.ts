import { parseNginxCombinedLine } from './nginx-access-log.parser';

describe('parseNginxCombinedLine', () => {
  it('parses combined format with query payload', () => {
    const line =
      '203.0.113.10 - - [19/Oct/2026:12:34:56 +0000] "GET /cicm-api/cicm-3636/health?x=1 HTTP/1.1" 200 123 "-" "curl/8.0"';
    const parsed = parseNginxCombinedLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed!.remoteAddr).toBe('203.0.113.10');
    expect(parsed!.method).toBe('GET');
    expect(parsed!.path).toBe('/cicm-api/cicm-3636/health');
    expect(parsed!.payload).toBe('x=1');
    expect(parsed!.statusCode).toBe(200);
    expect(parsed!.userAgent).toBe('curl/8.0');
    expect(parsed!.occurredAt.toISOString()).toBe('2026-10-19T12:34:56.000Z');
  });

  it('returns null for garbage', () => {
    expect(parseNginxCombinedLine('not a log line')).toBeNull();
  });
});
