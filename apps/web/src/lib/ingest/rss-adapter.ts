/**
 * RSS Adapter Interface
 * Fetches and parses RSS feeds with ETag/Last-Modified caching support
 */

import Parser from 'rss-parser';

// Retry with exponential backoff
interface BackoffOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  factor?: number;
  jitter?: boolean;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, options: BackoffOptions = {}): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    factor = 2,
    jitter = true,
  } = options;

  let attempt = 0;
  let delay = initialDelay;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;

      const jitterAmount = jitter ? Math.random() * delay * 0.5 : 0;
      const wait = Math.min(maxDelay, delay + jitterAmount);
      await new Promise((resolve) => setTimeout(resolve, wait));
      delay = Math.min(maxDelay, delay * factor);
      attempt++;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export interface RSSItem {
  guid: string;
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  content?: string;
  creator?: string;
  categories?: string[];
}

export interface RSSFeedMetadata {
  title: string;
  link: string;
  description?: string;
  lastBuildDate?: string;
}

export interface RSSFetchResult {
  items: RSSItem[];
  metadata: RSSFeedMetadata;
  etag?: string;
  lastModified?: string;
  cached: boolean;
}

export class RSSAdapter {
  private parser: Parser;
  private etagCache: Map<string, string>;
  private lastModifiedCache: Map<string, string>;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: ['media:content', 'media:thumbnail'],
      },
    });
    this.etagCache = new Map();
    this.lastModifiedCache = new Map();
  }

  /**
   * Fetch RSS feed with conditional request support
   */
  async fetchFeed(
    url: string,
    options: {
      useCache?: boolean;
      timeout?: number;
    } = {}
  ): Promise<RSSFetchResult> {
    const { useCache = true, timeout = 10000 } = options;

    // Prepare headers for conditional request
    const headers: Record<string, string> = {
      'User-Agent': 'MorningPulse/1.0',
    };

    if (useCache) {
      const etag = this.etagCache.get(url);
      const lastModified = this.lastModifiedCache.get(url);

      if (etag) {
        headers['If-None-Match'] = etag;
      }
      if (lastModified) {
        headers['If-Modified-Since'] = lastModified;
      }
    }

    // Fetch with retry logic
    const fetchFn = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle 304 Not Modified
        if (response.status === 304) {
          return {
            items: [],
            metadata: { title: '', link: url },
            cached: true,
          };
        }

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Update cache headers
        const newEtag = response.headers.get('etag');
        const newLastModified = response.headers.get('last-modified');

        if (newEtag) {
          this.etagCache.set(url, newEtag);
        }
        if (newLastModified) {
          this.lastModifiedCache.set(url, newLastModified);
        }

        // Parse RSS content
        const xmlText = await response.text();
        const feed = await this.parser.parseString(xmlText);

        return {
          items: feed.items.map((item) => ({
            guid: item.guid || item.link || '',
            title: item.title || '',
            link: item.link || '',
            pubDate: item.pubDate || item.isoDate,
            contentSnippet: item.contentSnippet,
            content: item.content,
            creator: item.creator || item.author,
            categories: item.categories,
          })),
          metadata: {
            title: feed.title || '',
            link: feed.link || url,
            description: feed.description,
            lastBuildDate: feed.lastBuildDate,
          },
          etag: newEtag || undefined,
          lastModified: newLastModified || undefined,
          cached: false,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return retryWithBackoff(fetchFn, {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
    });
  }

  /**
   * Clear cache for a specific URL
   */
  clearCache(url: string): void {
    this.etagCache.delete(url);
    this.lastModifiedCache.delete(url);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.etagCache.clear();
    this.lastModifiedCache.clear();
  }
}

// Singleton instance
export const rssAdapter = new RSSAdapter();
