import { isIP } from 'node:net';
import { getEnv } from '../env';
import { logger } from '../logger';

/**
 * The only place that derives the client IP (ADR-0003 section 4, security.md SEC-R4).
 *
 * - TRUSTED_PROXY_HOPS = 0 (local, no proxy): X-Forwarded-For is ignored.
 * - TRUSTED_PROXY_HOPS = n > 0: the n-th value from the RIGHT of X-Forwarded-For (values to
 *   the left can be forged by the client and are never read).
 * - Ports are stripped (`1.2.3.4:5678`, `[2001:db8::1]:443`).
 * - X-Real-IP, X-Client-IP and similar headers are never read.
 *
 * Next.js Route Handlers do not expose the socket address, so without a trusted proxy the
 * result is `unknown` (all local requests share one IP bucket; fine for development).
 */
export const UNKNOWN_IP = 'unknown';

export type ClientIpResult = { ip: string; warning?: 'xff_too_short' | 'xff_ignored' };

export function resolveClientIp(
  headers: Pick<Headers, 'get'>,
  trustedProxyHops: number,
  connectionIp?: string | null,
): ClientIpResult {
  const fallback = cleanIp(connectionIp ?? '') ?? UNKNOWN_IP;
  if (trustedProxyHops <= 0) {
    // F-18: a proxy is in front but not configured — every client shares one IP bucket.
    return headers.get('x-forwarded-for')
      ? { ip: fallback, warning: 'xff_ignored' }
      : { ip: fallback };
  }

  const raw = headers.get('x-forwarded-for');
  const parts = (raw ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < trustedProxyHops) return { ip: fallback, warning: 'xff_too_short' };

  const candidate = parts[parts.length - trustedProxyHops] ?? '';
  return { ip: cleanIp(candidate) ?? UNKNOWN_IP };
}

/** Strips ports and brackets; returns null when the value is not an IP address. */
export function cleanIp(value: string): string | null {
  let v = value.trim();
  if (!v) return null;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(v);
  if (bracketed?.[1]) v = bracketed[1];
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.slice(0, v.lastIndexOf(':'));
  // IPv4-mapped IPv6 → IPv4.
  const mapped = /^::ffff:(\d{1,3}(\.\d{1,3}){3})$/i.exec(v);
  if (mapped?.[1]) v = mapped[1];
  return isIP(v) ? v.toLowerCase() : null;
}

/** Expands an IPv6 address into its 8 hextets. Input must already pass isIP() === 6. */
function expandIpv6(ip: string): string[] {
  let address = ip.split('%')[0] ?? ip; // drop zone id
  // Embedded IPv4 tail (e.g. ::1.2.3.4) → two hextets.
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number) as [number, number, number, number];
    address = address.replace(
      v4[0],
      `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`,
    );
  }
  const [head = '', tail] = address.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : 8 - headParts.length - tailParts.length;
  const all = [...headParts, ...Array<string>(missing).fill('0'), ...tailParts];
  return all.map((h) => h.toLowerCase().padStart(4, '0'));
}

/**
 * Rate-limit key form of an IP (SEC-R3): IPv6 is reduced to its /64 prefix so one client
 * cannot rotate through its own subnet; IPv4 stays as is.
 */
export function ipForThrottle(ip: string): string {
  if (isIP(ip) !== 6) return ip;
  return `${expandIpv6(ip).slice(0, 4).join(':')}::/64`;
}

/**
 * `getClientIp(req)` — ADR-0003: every IP used for rate limiting, `sessions.ip` and
 * `audit_log.ip` comes from here, with TRUSTED_PROXY_HOPS from the environment.
 */
let warnedXffIgnored = false;

export function getClientIp(req: Pick<Request, 'headers'>): string {
  const result = resolveClientIp(req.headers, getEnv().TRUSTED_PROXY_HOPS);
  if (result.warning === 'xff_ignored') {
    // F-18: once per process, so a misconfigured deployment is visible without flooding.
    if (!warnedXffIgnored) {
      warnedXffIgnored = true;
      logger.warn(
        { event: 'http.xff_ignored' },
        'X-Forwarded-For received with TRUSTED_PROXY_HOPS=0; set it to the number of proxies',
      );
    }
  } else if (result.warning) {
    logger.warn(
      { event: 'http.xff_too_short' },
      'X-Forwarded-For has fewer values than trusted proxy hops',
    );
  }
  return result.ip;
}
