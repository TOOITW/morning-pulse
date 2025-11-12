import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();

export type UpsertArticleInput = {
  sourceId: string;
  guid?: string | null;
  canonicalUrl?: string | null;
  title: string;
  publishedAt?: Date | null;
  contentSnippet?: string | null;
  contentRaw?: string | null;
};

function contentHash(input: { canonicalUrl?: string | null; title?: string | null }) {
  const base = `${input.canonicalUrl || ''}|${(input.title || '').trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(base).digest('hex');
}

export async function upsertArticle(input: UpsertArticleInput) {
  const hash = contentHash({ canonicalUrl: input.canonicalUrl, title: input.title });

  // Dedupe by contentHash
  const existing = await prisma.article.findFirst({ where: { contentHash: hash } });
  if (existing) return existing;

  // Prisma schema requires non-null guid/canonicalUrl/tsPublished; fallback to placeholders
  const guid = input.guid || input.canonicalUrl || hash;
  const canonicalUrl = input.canonicalUrl || '';
  const published = input.publishedAt || new Date();

  return prisma.article.create({
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
