import { PrismaClient } from '@prisma/client';
import prismaDefault from '../../db/client';
import { generateContentHash } from '../../utils/hash';

export type UpsertArticleInput = {
  sourceId: string;
  guid?: string | null;
  canonicalUrl?: string | null;
  title: string;
  publishedAt?: Date | null;
  contentSnippet?: string | null;
  contentRaw?: string | null;
};
export type BatchUpsertResult = {
  created: number;
  duplicates: number;
  errors: number;
};

const prisma = prismaDefault; // use app singleton

export async function upsertArticle(input: UpsertArticleInput, db: PrismaClient = prisma) {
  const hash = generateContentHash(input.canonicalUrl || '', input.title || '');

  // Prefer dedupe by (sourceId,guid) when guid is available
  if (input.guid) {
    const byGuid = await db.article.findFirst({
      where: { sourceId: input.sourceId, guid: input.guid },
    });
    if (byGuid) return byGuid;
  }

  // Fallback dedupe by contentHash
  const byHash = await db.article.findFirst({ where: { contentHash: hash } });
  if (byHash) return byHash;

  // Prisma schema requires non-null guid/canonicalUrl/tsPublished; fallback to placeholders
  const guid = input.guid || input.canonicalUrl || hash;
  const canonicalUrl = input.canonicalUrl || '';
  const published = input.publishedAt || new Date();

  return db.article.create({
    data: {
      sourceId: input.sourceId,
      guid,
      canonicalUrl,
      contentHash: hash,
      title: input.title,
      tsPublished: published,
      summaryRaw: input.contentSnippet || null,
      symbols: [],
      topics: [],
    },
  });
}

export async function listRecentArticles(limit = 10) {
  return prisma.article.findMany({
    orderBy: { tsPublished: 'desc' },
    take: limit,
  });
}

/**
 * Batch upsert articles with dedupe on content_hash (and (sourceId,guid) when provided).
 * Uses createMany + skipDuplicates for performance, returns counts only.
 */
export async function batchUpsertArticles(
  inputs: UpsertArticleInput[],
  db: PrismaClient = prisma
): Promise<BatchUpsertResult> {
  if (inputs.length === 0) return { created: 0, duplicates: 0, errors: 0 };

  // Precompute records with hashes and required fallbacks
  const records = inputs.map((i) => {
    const contentHash = generateContentHash(i.canonicalUrl || '', i.title || '');
    const guid = i.guid || i.canonicalUrl || contentHash;
    const canonicalUrl = i.canonicalUrl || '';
    const tsPublished = i.publishedAt || new Date();
    return {
      sourceId: i.sourceId,
      guid,
      canonicalUrl,
      contentHash,
      title: i.title,
      tsPublished,
      summaryRaw: i.contentSnippet || null,
      content: i.contentRaw || null,
      symbols: [],
      topics: [],
    };
  });

  // Check existing content hashes to estimate duplicates
  const hashes = Array.from(new Set(records.map((r) => r.contentHash)));
  // Insert new records; rely on unique(contentHash) and (sourceId,guid)
  const createRes = await db.article.createMany({
    data: records,
    skipDuplicates: true,
  });

  const created = createRes.count;
  // Best-effort: duplicates = total unique inputs - created
  const duplicates = Math.max(0, hashes.length - created);

  return { created, duplicates, errors: 0 };
}
