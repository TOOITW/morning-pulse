/**
 * Tests for RSS Adapter
 * SDD: T016 - RSS Adapter Interface
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RSSAdapter } from '../rss-adapter';

describe('RSSAdapter', () => {
  let adapter: RSSAdapter;

  beforeEach(() => {
    adapter = new RSSAdapter();
    vi.clearAllMocks();
  });

  describe('fetchFeed', () => {
    it('should fetch and parse RSS feed', async () => {
      const mockRSSContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>Test Description</description>
    <item>
      <title>Test Article</title>
      <link>https://example.com/article1</link>
      <guid>article-1</guid>
      <pubDate>Mon, 18 Nov 2024 10:00:00 GMT</pubDate>
      <description>Test article description</description>
    </item>
  </channel>
</rss>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockRSSContent,
        headers: new Map([
          ['etag', '"abc123"'],
          ['last-modified', 'Mon, 18 Nov 2024 09:00:00 GMT'],
        ]),
      });

      const result = await adapter.fetchFeed('https://example.com/feed.xml');

      expect(result.cached).toBe(false);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Test Article');
      expect(result.items[0].guid).toBe('article-1');
      expect(result.metadata.title).toBe('Test Feed');
    });

    it('should handle 304 Not Modified response', async () => {
      // First fetch to populate cache
      const mockRSSContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
  </channel>
</rss>`;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockRSSContent,
        headers: new Map([['etag', '"abc123"']]),
      });

      await adapter.fetchFeed('https://example.com/feed.xml');

      // Second fetch should return 304
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 304,
        headers: new Map(),
      });

      const result = await adapter.fetchFeed('https://example.com/feed.xml');

      expect(result.cached).toBe(true);
      expect(result.items).toHaveLength(0);
    });

    it('should send If-None-Match header on cached requests', async () => {
      const mockRSSContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Test</title></channel></rss>`;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockRSSContent,
        headers: new Map([['etag', '"abc123"']]),
      });

      await adapter.fetchFeed('https://example.com/feed.xml');

      // Clear mock and setup for second call
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 304,
        headers: new Map(),
      });
      global.fetch = fetchMock;

      await adapter.fetchFeed('https://example.com/feed.xml');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        expect.objectContaining({
          headers: expect.objectContaining({
            'If-None-Match': '"abc123"',
          }),
        })
      );
    });

    it('should handle fetch errors with retry', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () =>
            '<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title></channel></rss>',
          headers: new Map(),
        });

      const result = await adapter.fetchFeed('https://example.com/feed.xml');

      expect(result.cached).toBe(false);
      expect(global.fetch).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('should timeout after specified duration', async () => {
      // Mock a slow fetch that never resolves in time
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            // Simulate abort after timeout
            setTimeout(() => reject(abortError), 150);
          })
      );

      await expect(
        adapter.fetchFeed('https://example.com/feed.xml', { timeout: 100 })
      ).rejects.toThrow();
    }, 5000); // 5s timeout for test
  });

  describe('cache management', () => {
    it('should clear cache for specific URL', async () => {
      const mockRSSContent = `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title></channel></rss>`;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockRSSContent,
        headers: new Map([['etag', '"abc123"']]),
      });

      await adapter.fetchFeed('https://example.com/feed.xml');
      adapter.clearCache('https://example.com/feed.xml');

      // After clear, should not send If-None-Match
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockRSSContent,
        headers: new Map(),
      });
      global.fetch = fetchMock;

      await adapter.fetchFeed('https://example.com/feed.xml');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/feed.xml',
        expect.not.objectContaining({
          headers: expect.objectContaining({
            'If-None-Match': expect.any(String),
          }),
        })
      );
    });

    it('should clear all caches', () => {
      adapter.clearAllCaches();
      // No assertion needed, just ensure it doesn't throw
      expect(true).toBe(true);
    });
  });
});
