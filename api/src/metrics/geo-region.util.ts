/** IPs privados / loopback → "Local"; públicos dependem de GeoIP opcional. */
export function isPrivateOrLocalIp(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  if (!v || v === 'unknown' || v === '-') return true;
  if (v === '::1' || v === '127.0.0.1' || v === '0.0.0.0') return true;
  if (v.startsWith('::ffff:')) {
    return isPrivateOrLocalIp(v.slice(7));
  }
  // IPv4
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6 ULA / link-local
  if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
  return false;
}

type GeoLookup = {
  lookup: (ip: string) => { country?: string; region?: string; city?: string } | null;
};

let geoip: GeoLookup | null | undefined;

function tryLoadGeoip(): GeoLookup | null {
  if (geoip !== undefined) return geoip;
  try {
    // Opcional: `npm install geoip-lite` no host melhora a região.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    geoip = require('geoip-lite') as GeoLookup;
  } catch {
    geoip = null;
  }
  return geoip;
}

export function resolveRegion(ip: string): string | null {
  if (isPrivateOrLocalIp(ip)) return 'Local';
  const lib = tryLoadGeoip();
  if (!lib) return null;
  try {
    const g = lib.lookup(ip);
    if (!g) return null;
    const parts = [g.city, g.region, g.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  } catch {
    return null;
  }
}
