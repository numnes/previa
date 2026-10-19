import { isPrivateOrLocalIp, resolveRegion } from './geo-region.util';

describe('geo-region', () => {
  it('marks private and loopback as local', () => {
    expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrLocalIp('10.1.2.3')).toBe(true);
    expect(isPrivateOrLocalIp('192.168.0.9')).toBe(true);
    expect(isPrivateOrLocalIp('172.16.0.1')).toBe(true);
    expect(resolveRegion('10.0.0.1')).toBe('Local');
  });

  it('treats public IPv4 as non-private', () => {
    expect(isPrivateOrLocalIp('203.0.113.10')).toBe(false);
  });
});
