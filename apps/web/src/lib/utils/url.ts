import { toASCII } from 'punycode';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'msclkid',
  '_ga',
  '_gid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  't',
  'smart_id',
  'smart_param',
]);

const TRACKING_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^mc_/i,
  /^sa_/i,
  /^rss_/i,
  /^igshid$/i,
  /^twclid$/i,
  /^wbraid$/i,
  /^gbraid$/i,
  /^smart_/i,
];

function isTrackingParam(name: string): boolean {
  if (!name) return false;
  const normalized = name.toLowerCase();
  if (TRACKING_PARAMS.has(normalized)) return true;
  return TRACKING_PATTERNS.some((p) => p.test(name));
}

function dedupeQueryParams(entries: [string, string][]): [string, string][] {
  const seen = new Set<string>();
  const deduped: [string, string][] = [];
  for (const [key, value] of entries) {
    if (isTrackingParam(key)) continue;
    const k = key.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push([key, value]);
  }
  return deduped;
}

/** Validate if URL is well-formed and safe (HTTP/S only). */
export function isValidUrl(url: string): boolean {
  if (!url || url.length > 2048) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Remove tracking params and deduplicate repeated query keys. */
export function removeTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    const cleaned = dedupeQueryParams(Array.from(u.searchParams.entries()));
    u.search = '';
    for (const [k, v] of cleaned) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

/** Normalize: lowercase hostname, drop fragment, sort query params. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    const sorted = Array.from(u.searchParams.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    u.search = '';
    for (const [k, v] of sorted) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

/** Convert IDN to ASCII using punycode. */
export function normalizeInternationalDomain(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname) u.hostname = toASCII(u.hostname);
    return u.toString();
  } catch {
    return url;
  }
}

/** Full article URL normalization pipeline. */
export function normalizeArticleUrl(url: string): string {
  let out = removeTrackingParams(url);
  out = normalizeInternationalDomain(out);
  out = normalizeUrl(out);
  return out;
}

/** Extract canonical URL from HTML or fallback. */
export function extractCanonicalUrl(html: string, fallbackUrl: string): string {
  const m1 = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (m1) return m1[1];
  const m2 = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (m2) return m2[1];
  return fallbackUrl;
}

/** Follow redirects with timeout, UA header, and loop detection. */
export async function followRedirects(
  url: string,
  maxRedirects: number = 5,
  timeoutMs: number = 5000
): Promise<string> {
  let current = url;
  let count = 0;
  const visited = new Set<string>([current]);

  while (count < maxRedirects) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(current, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'MorningPulse/1.0 (+https://morningpulse.io)' },
      });
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break;
        const next = new URL(loc, current).toString();
        if (visited.has(next)) break; // loop detected
        visited.add(next);
        current = next;
        count += 1;
        continue;
      }

      // Not a redirect; stop following.
      break;
    } catch {
      clearTimeout(timer);
      break;
    }
  }

  return current;
}
