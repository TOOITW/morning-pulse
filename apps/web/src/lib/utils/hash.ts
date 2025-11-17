/**
 * Content Hash Utilities
 * - SHA256 for primary dedupe
 * - MD5 for quick pre-filtering
 */

import { createHash } from 'crypto';

/** Decode common HTML entities and collapse whitespace, remove noise words. */
export function stripTitle(title: string): string {
  const t = (title ?? '')
    // decode a few common entities & numeric refs
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d: string) => {
      const code = Number(d);
      try {
        return String.fromCharCode(code);
      } catch {
        return '';
      }
    })
    .toLowerCase()
    // remove bracketed tags like [速報] [live]
    .replace(/\[[^\]]+\]/g, ' ')
    // 保守版：僅移除明顯無資訊詞，例如「速報/快訊/新聞」等
    .replace(/\b(速報|快訊|新聞)\b/gi, ' ') // keep letters/numbers/space; drop punctuation and symbols
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** SHA256 over normalized tuple (url | strippedTitle). */
export function generateContentHash(canonicalUrl: string, title: string): string {
  const stripped = stripTitle(title);
  const content = `${canonicalUrl}|${stripped}`;
  return createHash('sha256').update(content).digest('hex');
}

/** Quick MD5 helper (for pre-filtering only). */
export function quickMd5(input: string): string {
  return createHash('md5').update(input).digest('hex');
}

/** Verify determinism by hashing multiple times with same inputs. */
export function verifyHashDeterminism(
  url: string,
  title: string,
  iterations: number = 100
): boolean {
  const first = generateContentHash(url, title);
  for (let i = 0; i < iterations; i++) {
    const v = generateContentHash(url, title);
    if (v !== first) return false;
  }
  return true;
}

/**
 * Create a combined article signature
 * - contentHash: SHA256(url|strippedTitle)
 * - quickHash:   MD5(url|strippedTitle)
 * - signature:   compact identifier including optional publish date
 */
export function createArticleSignature(
  url: string,
  title: string,
  publishDate?: Date
): { contentHash: string; quickHash: string; signature: string } {
  const stripped = stripTitle(title);
  const base = `${url}|${stripped}`;
  const contentHash = createHash('sha256').update(base).digest('hex');
  const quickHash = createHash('md5').update(base).digest('hex');
  const datePart = publishDate ? `:${publishDate.toISOString().slice(0, 10)}` : '';
  const signature = `${contentHash.slice(0, 16)}:${quickHash.slice(0, 8)}${datePart}`;
  return { contentHash, quickHash, signature };
}
