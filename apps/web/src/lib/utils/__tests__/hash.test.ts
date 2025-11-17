import { describe, it, expect } from 'vitest';
import {
  stripTitle,
  generateContentHash,
  quickMd5,
  verifyHashDeterminism,
  createArticleSignature,
} from '../hash';

describe('Hash utils', () => {
  it('stripTitle removes special chars', () => {
    expect(stripTitle('Hello, World!')).toBe('hello world');
  });

  it('stripTitle lowercases and normalizes spaces', () => {
    expect(stripTitle('  Hello   WORLD  ')).toBe('hello world');
  });

  it('stripTitle decodes HTML entities and drops brackets', () => {
    expect(stripTitle('Reuters: Breaking &amp; News - [速報] US Markets')).toBe(
      'reuters breaking news us markets'
    );
  });

  it('generateContentHash returns 64 hex chars', () => {
    const h = generateContentHash('https://ex.com/a', 'Title');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generateContentHash determinism', () => {
    const a = generateContentHash('u', 't');
    const b = generateContentHash('u', 't');
    expect(a).toBe(b);
  });

  it('generateContentHash different inputs -> different outputs', () => {
    const a = generateContentHash('u1', 't');
    const b = generateContentHash('u2', 't');
    expect(a).not.toBe(b);
  });

  it('generateContentHash title case-insensitive', () => {
    const a = generateContentHash('u', 'News');
    const b = generateContentHash('u', 'news');
    expect(a).toBe(b);
  });

  it('createArticleSignature returns three fields', () => {
    const s = createArticleSignature('https://ex.com', 'Title');
    expect(s.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(s.quickHash).toMatch(/^[a-f0-9]{32}$/);
    expect(typeof s.signature).toBe('string');
  });

  it('verifyHashDeterminism true for 100 iterations', () => {
    expect(verifyHashDeterminism('https://ex.com', 'hello', 100)).toBe(true);
  });

  it('handles empty url/title gracefully', () => {
    const h = generateContentHash('', '');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('quickMd5 returns 32 hex', () => {
    expect(quickMd5('x')).toMatch(/^[a-f0-9]{32}$/);
  });
});
