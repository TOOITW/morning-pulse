import { describe, it, expect, vi } from 'vitest';
import {
  removeTrackingParams,
  normalizeUrl,
  normalizeArticleUrl,
  extractCanonicalUrl,
  isValidUrl,
  normalizeInternationalDomain,
  followRedirects,
} from '../url';

// Helper to mock fetch for redirect tests
function mockHeadRedirectChain(chain: Array<{ status: number; location?: string }>) {
  let call = 0;
  global.fetch = vi.fn(async () => {
    const res = chain[Math.min(call, chain.length - 1)];
    call++;
    return {
      status: res.status,
      headers: {
        get: (k: string) => (k.toLowerCase() === 'location' ? (res.location ?? null) : null),
      },
    } as Response;
  });
}

describe('URL utils', () => {
  it('removeTrackingParams removes UTM', () => {
    const input = 'https://ex.com?a=1&utm_source=x&utm_medium=y';
    const out = removeTrackingParams(input);
    expect(out).toBe('https://ex.com/?a=1');
  });

  it('removeTrackingParams removes fbclid', () => {
    const input = 'https://ex.com?fbclid=abc';
    expect(removeTrackingParams(input)).toBe('https://ex.com/');
  });

  it('removeTrackingParams removes gclid', () => {
    const input = 'https://ex.com?gclid=xyz';
    expect(removeTrackingParams(input)).toBe('https://ex.com/');
  });

  it('removeTrackingParams preserves legal params and dedupes duplicates', () => {
    const input = 'https://ex.com?a=1&utm_campaign=zzz&a=2&ref=tw';
    expect(removeTrackingParams(input)).toBe('https://ex.com/?a=1');
  });

  it('normalizeUrl lowercases hostname', () => {
    const out = normalizeUrl('https://EXAMPLE.com/Path');
    expect(out).toBe('https://example.com/Path');
  });

  it('normalizeUrl removes fragment', () => {
    const out = normalizeUrl('https://ex.com/path#frag');
    expect(out).toBe('https://ex.com/path');
  });

  it('normalizeUrl sorts query params', () => {
    const out = normalizeUrl('https://ex.com/path?b=2&a=1');
    expect(out).toBe('https://ex.com/path?a=1&b=2');
  });

  it('normalizeArticleUrl full pipeline', () => {
    const input = 'https://EX.com/path?b=2&utm_source=x&a=1#frag';
    const out = normalizeArticleUrl(input);
    expect(out).toBe('https://ex.com/path?a=1&b=2');
  });

  it('extractCanonicalUrl from link tag', () => {
    const html = '<link rel="canonical" href="https://ex.com/canon">';
    expect(extractCanonicalUrl(html, 'https://ex.com/fallback')).toBe('https://ex.com/canon');
  });

  it('extractCanonicalUrl from og:url', () => {
    const html = '<meta property="og:url" content="https://ex.com/og">';
    expect(extractCanonicalUrl(html, 'https://ex.com/fallback')).toBe('https://ex.com/og');
  });

  it('extractCanonicalUrl falls back when missing', () => {
    const html = '<html><head></head><body></body></html>';
    expect(extractCanonicalUrl(html, 'https://ex.com/fallback')).toBe('https://ex.com/fallback');
  });

  it('isValidUrl accepts http/https', () => {
    expect(isValidUrl('http://ex.com')).toBe(true);
    expect(isValidUrl('https://ex.com')).toBe(true);
  });

  it('isValidUrl rejects javascript:', () => {
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });

  it('isValidUrl rejects empty', () => {
    expect(isValidUrl('')).toBe(false);
  });

  it('normalizeInternationalDomain converts IDN', () => {
    const out = normalizeInternationalDomain('https://日本.jp/news?id=1');
    expect(out).toContain('https://xn--');
    expect(out).toContain('.jp/news?id=1');
  });

  it('followRedirects follows single redirect', async () => {
    mockHeadRedirectChain([{ status: 301, location: '/b' }, { status: 200 }]);
    const out = await followRedirects('https://ex.com/a');
    expect(out).toBe('https://ex.com/b');
  });

  it('followRedirects stops on loop', async () => {
    mockHeadRedirectChain([{ status: 302, location: '/a' }]);
    const out = await followRedirects('https://ex.com/a');
    expect(out).toBe('https://ex.com/a');
  });

  it('followRedirects returns original on timeout', async () => {
    // Mock fetch to reject immediately (simulating abort/timeout)
    global.fetch = vi.fn(() => Promise.reject(new Error('Aborted')));

    const out = await followRedirects('https://ex.com/a', 5, 10);
    expect(out).toBe('https://ex.com/a');
  });
});
