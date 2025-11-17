/**
 * RSS Ingestion Service
 * Fetches articles from RSS feeds and stores them in the database
 */

import { PrismaClient, Source } from '@prisma/client';
import prisma from '../db/client';
import { rssAdapter } from '../ingest/rss-adapter';
import { normalizeUrl } from '../utils/url';
import { generateContentHash } from '../utils/hash';
import { trackSuccess, trackFailure } from './source-health';
import { logInfo, logError } from '../observability/logger';

export interface IngestResult {
  sourceId: string;
  articlesProcessed: number;
  articlesCreated: number;
  articlesDuplicate: number;
  errors: string[];
}

/**
 * Ingest articles from a single RSS source
 */
export async function ingestSource(
  source: Source,
  db: PrismaClient = prisma
): Promise<IngestResult> {
  const result: IngestResult = {
    sourceId: source.id,
    articlesProcessed: 0,
    articlesCreated: 0,
    articlesDuplicate: 0,
    errors: [],
  };

  try {
    logInfo('Starting RSS ingestion', {
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.url,
    });

    // Fetch RSS feed with caching
    const feedResult = await rssAdapter.fetchFeed(source.url, {
      useCache: true,
      timeout: 30000, // 30 seconds timeout
    });

    if (feedResult.cached) {
      logInfo('RSS feed not modified (cached)', {
        sourceId: source.id,
        etag: feedResult.etag,
      });
      await trackSuccess(source.id, db);
      return result;
    }

    logInfo('Processing RSS items', {
      sourceId: source.id,
      itemCount: feedResult.items.length,
    });

    // Process each article
    for (const item of feedResult.items) {
      try {
        result.articlesProcessed++;

        // Validate required fields
        if (!item.link || !item.title) {
          result.errors.push(`Missing link or title: ${item.guid}`);
          continue;
        }

        // Normalize URL
        const canonicalUrl = await normalizeUrl(item.link);
        const contentHash = generateContentHash(canonicalUrl, item.title);

        // Check if article already exists
        const existing = await db.article.findUnique({
          where: { contentHash },
          select: { id: true },
        });

        if (existing) {
          result.articlesDuplicate++;
          continue;
        }

        // Parse publish date
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

        // Create article
        await db.article.create({
          data: {
            sourceId: source.id,
            guid: item.guid || item.link, // Use link as fallback GUID
            title: item.title.trim(),
            canonicalUrl,
            contentHash,
            summaryRaw: item.contentSnippet?.trim() || null,
            content: item.content?.trim() || null,
            author: item.creator?.trim() || null,
            tsPublished: publishedAt,
            // NLP fields will be populated by workers
            symbols: [],
            topics: [],
            entities: [],
          },
        });

        result.articlesCreated++;

        logInfo('Article created', {
          sourceId: source.id,
          title: item.title,
          publishedAt: publishedAt.toISOString(),
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Failed to process item ${item.guid}: ${errorMsg}`);
        logError('Failed to process RSS item', error as Error, {
          sourceId: source.id,
          itemGuid: item.guid,
        });
      }
    }

    // Track success
    await trackSuccess(source.id, db);

    logInfo('RSS ingestion completed', {
      sourceId: source.id,
      articlesProcessed: result.articlesProcessed,
      articlesCreated: result.articlesCreated,
      articlesDuplicate: result.articlesDuplicate,
      errorCount: result.errors.length,
    });

    return result;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logError('RSS ingestion failed', error as Error, {
      sourceId: source.id,
      sourceName: source.name,
    });

    // Track failure
    await trackFailure(source.id, errorMsg, db);

    result.errors.push(errorMsg);
    return result;
  }
}

/**
 * Ingest articles from all active RSS sources
 */
export async function ingestAllSources(db: PrismaClient = prisma): Promise<IngestResult[]> {
  logInfo('Starting ingestion for all active sources');

  // Fetch all active RSS sources
  const sources = await db.source.findMany({
    where: {
      type: 'rss',
      status: 'active',
    },
    orderBy: {
      name: 'asc',
    },
  });

  logInfo('Found active RSS sources', { count: sources.length });

  // Process sources sequentially to avoid overwhelming the system
  const results: IngestResult[] = [];
  for (const source of sources) {
    const result = await ingestSource(source, db);
    results.push(result);
  }

  // Summary
  const totalCreated = results.reduce((sum, r) => sum + r.articlesCreated, 0);
  const totalDuplicate = results.reduce((sum, r) => sum + r.articlesDuplicate, 0);
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

  logInfo('All sources ingestion completed', {
    sourcesProcessed: results.length,
    totalCreated,
    totalDuplicate,
    totalErrors,
  });

  return results;
}

/**
 * Get sources that need ingestion (based on TTL)
 */
export async function getSourcesDueForIngestion(db: PrismaClient = prisma): Promise<Source[]> {
  const now = new Date();

  const sources = await db.source.findMany({
    where: {
      type: 'rss',
      status: 'active',
      OR: [
        // Never fetched
        { lastFetchAt: null },
        // TTL expired
        {
          lastFetchAt: {
            lt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago (default TTL)
          },
        },
      ],
    },
    orderBy: {
      lastFetchAt: 'asc', // Prioritize sources that haven't been fetched in a while
    },
  });

  logInfo('Sources due for ingestion', { count: sources.length });

  return sources;
}
