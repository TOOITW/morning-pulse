/**
 * Fetch and ingest articles from active RSS sources
 * Usage: pnpm tsx scripts/etl/fetch-articles.ts
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { rssAdapter } from '../../apps/web/src/lib/ingest/rss-adapter';
import { upsertArticle } from '../../apps/web/src/lib/db/repositories/articles';

const prisma = new PrismaClient();

async function ingestOneSource(sourceId: string) {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) return { sourceId, name: 'unknown', processed: 0, inserted: 0 };

  const start = Date.now();
  try {
    const res = await rssAdapter.fetchFeed(source.url, { useCache: true, timeout: 15000 });
    let inserted = 0;
    for (const item of res.items) {
      try {
        await upsertArticle({
          sourceId: source.id,
          guid: item.guid || undefined,
          canonicalUrl: item.link || undefined,
          title: item.title || '(no title)',
          publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
          contentSnippet: item.contentSnippet || null,
          contentRaw: item.content || null,
        });
        inserted++;
      } catch (e) {
        // Swallow per-item errors but continue
        // eslint-disable-next-line no-console
        console.warn(`[ingest] upsert failed for ${item.link || item.guid}:`, (e as Error).message);
      }
    }

    await prisma.source.update({
      where: { id: source.id },
      data: {
        lastFetchAt: new Date(),
        lastSuccessAt: new Date(),
        consecutiveFailures: 0,
      },
    });

    return {
      sourceId: source.id,
      name: source.name,
      processed: res.items.length,
      inserted,
      cached: res.cached,
      ms: Date.now() - start,
    };
  } catch (e) {
    await prisma.source.update({
      where: { id: source.id },
      data: {
        lastFetchAt: new Date(),
        consecutiveFailures: { increment: 1 },
      },
    }).catch(() => {});
    throw e;
  }
}

async function main() {
  // Load active RSS sources
  const sources = await prisma.source.findMany({
    where: { status: 'active', type: 'rss' },
    orderBy: { trustScore: 'desc' },
  });

  if (sources.length === 0) {
    console.log('No active RSS sources found. Run scripts/etl/seed-sources.ts first.');
    return;
  }

  console.log(`📰 Ingesting from ${sources.length} sources...`);
  const results = [] as Array<Awaited<ReturnType<typeof ingestOneSource>>>;
  for (const s of sources) {
    try {
      const r = await ingestOneSource(s.id);
      results.push(r);
      console.log(`✓ ${r.name}: processed=${r.processed}, inserted=${r.inserted}, cached=${r.cached ? 'yes' : 'no'}, ${r.ms}ms`);
    } catch (e) {
      console.error(`✗ ${s.name}:`, (e as Error).message);
    }
  }

  const totalProcessed = results.reduce((acc, r) => acc + r.processed, 0);
  const totalInserted = results.reduce((acc, r) => acc + r.inserted, 0);
  console.log(`✅ Done. processed=${totalProcessed}, inserted=${totalInserted}`);
}

main()
  .catch((err) => {
    console.error('Ingest failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
