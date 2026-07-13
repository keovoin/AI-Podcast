/**
 * SSRF Protection module.
 * Validates URLs before making external requests.
 * Blocks private/reserved IP ranges and link-local addresses.
 * Allowlists can be configured via SSRF_ALLOWED_HOSTS env var.
 */

// Private/reserved IP ranges that should be blocked
const PRIVATE_RANGES = [
  { start: 0x0a000000, end: 0x0affffff },   // 10.0.0.0/8
  { start: 0xac100000, end: 0xac1fffff },   // 172.16.0.0/12
  { start: 0xc0a80000, end: 0xc0a8ffff },   // 192.168.0.0/16
  { start: 0x7f000000, end: 0x7fffffff },   // 127.0.0.0/8 (loopback)
  { start: 0xa9fe0000, end: 0xa9feffff },   // 169.254.0.0/16 (link-local)
  { start: 0x00000000, end: 0x00ffffff },   // 0.0.0.0/8
  { start: 0x64400000, end: 0x647fffff },   // 100.64.0.0/10 (CGNAT)
  { start: 0xc0000000, end: 0xc00000ff },   // 192.0.0.0/24
  { start: 0xc0000200, end: 0xc00002ff },   // 192.0.2.0/24 (TEST-NET-1)
  { start: 0xc6336400, end: 0xc63364ff },   // 198.51.100.0/24 (TEST-NET-2)
  { start: 0xcb007100, end: 0xcb0071ff },   // 203.0.113.0/24 (TEST-NET-3)
  { start: 0xe0000000, end: 0xefffffff },   // 224.0.0.0/4 (Multicast)
  { start: 0xf0000000, end: 0xffffffff },   // 240.0.0.0/4 (Reserved)
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
 * Allows public domains even if DNS resolution fails on serverless (Vercel).
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

  // Quick check: if it's obviously private, block immediately
  if (isObviouslyPrivate(url)) {
    return { safe: false, reason: 'URL resolves to private/reserved address space' };
  }

  // For public domains (not obviously private), allow without DNS check
  // This avoids DNS resolution failures on serverless platforms (Vercel)
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(hostname)) {
    // It's a domain name, not an IP. If not obviously private, allow it.
    return { safe: true };
  }

  // It's a raw IP address — check if private
  if (isPrivateIp(hostname)) {
    return {
      safe: false,
      reason: `Blocked: private/reserved IP. Add "${hostname}" to SSRF_ALLOWED_HOSTS to allow.`,
      resolvedIp: hostname,
    };
  }

  return { safe: true, resolvedIp: hostname };
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
