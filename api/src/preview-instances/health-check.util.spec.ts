import {
  buildHealthCheckUrl,
  normalizeHealthCheckPath,
  resolveExpectedHealthStatus,
  resolveHealthCheckTimeoutMinutes,
} from './health-check.util';

describe('health-check.util', () => {
  it('normalizes health check path', () => {
    expect(normalizeHealthCheckPath(null)).toBeNull();
    expect(normalizeHealthCheckPath('')).toBeNull();
    expect(normalizeHealthCheckPath('health')).toBe('/health');
    expect(normalizeHealthCheckPath('/api/health')).toBe('/api/health');
  });

  it('resolves defaults', () => {
    expect(resolveExpectedHealthStatus(null)).toBe(200);
    expect(resolveHealthCheckTimeoutMinutes(null)).toBe(5);
    expect(resolveHealthCheckTimeoutMinutes(10)).toBe(10);
  });

  it('builds nginx URL when serverUrl is set', () => {
    const url = buildHealthCheckUrl(
      { serverUrl: 'https://preview.example.com/' },
      {
        projectSlug: 'my-app',
        branch: 'feature/foo',
        branchSlug: 'feature-foo',
        pm2Name: 'my-app-feature-foo',
        port: 3005,
      },
      '/health',
    );
    expect(url).toBe('https://preview.example.com/my-app/feature-foo/health');
  });

  it('builds localhost URL when serverUrl is missing', () => {
    const url = buildHealthCheckUrl(
      { serverUrl: null },
      {
        projectSlug: 'my-app',
        branch: 'main',
        branchSlug: 'main',
        pm2Name: 'my-app-main',
        port: 3010,
      },
      '/health',
    );
    expect(url).toBe('http://127.0.0.1:3010/health');
  });
});
