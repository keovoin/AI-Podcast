import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';

const resolveDns = promisify(dns.resolve4);

// Private/reserved IP ranges that should be blocked
const PRIVATE_RANGES = [
  // 10.0.0.0/8
  { start: 0x0a000000, end: 0x0affffff },
  // 172.16.0.0/12
  { start: 0xac100000, end: 0xac1fffff },
  // 192.168.0.0/16
  { start: 0xc0a80000, end: 0xc0a8ffff },
  // 127.0.0.0/8 (loopback)
  { start: 0x7f000000, end: 0x7fffffff },
  // 169.254.0.0/16 (link-local)
  { start: 0xa9fe0000, end: 0xa9feffff },
  // 0.0.0.0/8
  { start: 0x00000000, end: 0x00ffffff },
  // 100.64.0.0/10 (CGNAT)
  { start: 0x64400000, end: 0x647fffff },
  // 192.0.0.0/24 (IETF Protocol Assignments)
  { start: 0xc0000000, end: 0xc00000ff },
  // 192.0.2.0/24 (TEST-NET-1)
  { start: 0xc0000200, end: 0xc00002ff },
  // 198.51.100.0/24 (TEST-NET-2)
  { start: 0xc6336400, end: 0xc63364ff },
  // 203.0.113.0/24 (TEST-NET-3)
  { start: 0xcb007100, end: 0xcb0071ff },
  // 224.0.0.0/4 (Multicast)
  { start: 0xe0000000, end: 0xefffffff },
  // 240.0.0.0/4 (Reserved)
  { start: 0xf0000000, end: 0xffffffff },
];

function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function isPrivateIp(ip: string): boolean {
  const ipInt = ipToInt(ip);
  return PRIVATE_RANGES.some((range) => ipInt >= range.start && ipInt <= range.end);
}

function getAllowedHosts(): Set<string> {
  const hosts = process.env.SSRF_ALLOWED_HOSTS || '';
  return new Set(
    hosts
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

/**
 * Validate a URL for SSRF safety.
 * Blocks private/link-local destinations unless explicitly allowlisted.
 */
export async function validateUrl(url: string): Promise<SsrfValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Require HTTPS except for localhost
  const hostname = parsed.hostname.toLowerCase();
  if (parsed.protocol !== 'https:') {
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!isLocalhost) {
      return { safe: false, reason: 'HTTPS required for non-localhost URLs' };
    }
  }

  // Check admin allowlist for private hosts
  const allowedHosts = getAllowedHosts();
  if (allowedHosts.has(hostname)) {
    return { safe: true };
  }

  // Resolve DNS and check IP
  try {
    // Check if hostname is already an IP
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    let ip: string;

    if (ipRegex.test(hostname)) {
      ip = hostname;
    } else if (hostname === 'localhost') {
      ip = '127.0.0.1';
    } else {
      const addresses = await resolveDns(hostname);
      if (!addresses || addresses.length === 0) {
        return { safe: false, reason: 'DNS resolution failed' };
      }
      ip = addresses[0]!;
    }

    if (isPrivateIp(ip)) {
      return {
        safe: false,
        reason: `Blocked: resolved to private/reserved IP. Add "${hostname}" to SSRF_ALLOWED_HOSTS to allow.`,
        resolvedIp: ip,
      };
    }

    return { safe: true, resolvedIp: ip };
  } catch {
    return { safe: false, reason: 'DNS resolution failed' };
  }
}

/**
 * Quick synchronous check for obviously private URLs (no DNS).
 */
export function isObviouslyPrivate(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

    if (ipRegex.test(hostname)) {
      return isPrivateIp(hostname);
    }

    // Common private hostnames
    const privatePatterns = [
      /^localhost$/,
      /^.*\.local$/,
      /^.*\.internal$/,
      /^.*\.corp$/,
      /^metadata\.google\.internal$/,
      /^169\.254\.\d+\.\d+$/,
    ];

    return privatePatterns.some((p) => p.test(hostname));
  } catch {
    return true; // Invalid URLs treated as unsafe
  }
}
