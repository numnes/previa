import {
  buildConnectionEnv,
  defaultContainerPortsForImage,
  envPrefixFromSlug,
} from './resource-connection.util';

describe('resource-connection.util', () => {
  it('maps well-known images to default ports', () => {
    expect(defaultContainerPortsForImage('redis:7-alpine')).toEqual([6379]);
    expect(defaultContainerPortsForImage('postgres:16')).toEqual([5432]);
    expect(defaultContainerPortsForImage('busybox')).toEqual([]);
  });

  it('builds HOST/PORT envs from the slug and published ports', () => {
    const env = buildConnectionEnv({
      slug: 'cache-redis',
      publishedPorts: { '6379': 16421 },
      runtimeEnv: { REDIS_PASSWORD: 's3cret' },
    });
    expect(env.CACHE_REDIS_HOST).toBe('127.0.0.1');
    expect(env.CACHE_REDIS_PORT).toBe('16421');
    expect(env.REDIS_PASSWORD).toBe('s3cret');
    expect(envPrefixFromSlug('cache-redis')).toBe('CACHE_REDIS');
  });
});
