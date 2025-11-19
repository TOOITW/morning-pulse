import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertArticle, batchUpsertArticles, type UpsertArticleInput } from '../articles';
import type { PrismaClient } from '@prisma/client';

// Minimal mock of PrismaClient's article delegate
interface StoredArticle {
  sourceId: string;
  guid: string;
  canonicalUrl: string;
  contentHash: string;
  title: string;
  tsPublished: Date;
  summaryRaw: string | null;
  content: string | null;
  symbols: unknown[];
  topics: unknown[];
}
interface MockArticleDelegate {
  findFirst: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface MockPrisma extends Partial<PrismaClient> {
  article: MockArticleDelegate;
}

function createMockPrisma(): MockPrisma {
  const store: StoredArticle[] = [];
  return {
    article: {
      findFirst: vi.fn(async (args: { where?: { contentHash?: string; sourceId?: string; guid?: string } }) => {
        if (args?.where?.contentHash) {
          return store.find((r) => r.contentHash === args.where!.contentHash) || null;
        }
        if (args?.where?.sourceId && args.where.guid) {
          return (
            store.find((r) => r.sourceId === args.where!.sourceId && r.guid === args.where!.guid) || null
          );
        }
        return null;
      }),
      create: vi.fn(async ({ data }: { data: StoredArticle }) => {
        store.push(data);
        return data;
      }),
      createMany: vi.fn(async ({ data, skipDuplicates }: { data: StoredArticle[]; skipDuplicates?: boolean }) => {
        let created = 0;
        for (const record of data) {
          const exists = store.find(
            (r) => r.contentHash === record.contentHash || (r.guid === record.guid && r.sourceId === record.sourceId)
          );
          if (exists) {
            if (!skipDuplicates) {
              store.push(record);
              created++;
            }
            continue;
          }
          store.push(record);
          created++;
        }
        return { count: created };
      }),
      findMany: vi.fn(async (args: { orderBy?: { tsPublished?: 'desc' }; take?: number; where?: { contentHash?: { in: string[] } } }) => {
        if (args?.orderBy?.tsPublished === 'desc') {
          return [...store].sort(
            (a, b) => new Date(b.tsPublished).getTime() - new Date(a.tsPublished).getTime()
          ).slice(0, args.take || store.length);
        }
        if (args?.where?.contentHash?.in) {
          return store.filter((r) => args.where!.contentHash!.in.includes(r.contentHash));
        }
        return store;
      }),
    },
  } as MockPrisma;
}

describe('Articles repository', () => {
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
  });

  describe('upsertArticle', () => {
    it('creates a new article when not existing', async () => {
      const result = await upsertArticle(
        {
          sourceId: 'src1',
          canonicalUrl: 'https://example.com/a',
          title: 'Title A',
          guid: 'guid-a',
        },
        mockPrisma
      );
      expect(result.guid).toBe('guid-a');
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(1);
    });

    it('dedupes by guid first', async () => {
      await upsertArticle(
        {
          sourceId: 'src1',
          canonicalUrl: 'https://example.com/a',
          title: 'Title A',
          guid: 'guid-a',
        },
        mockPrisma
      );
      const second = await upsertArticle(
        {
          sourceId: 'src1',
          canonicalUrl: 'https://example.com/a-different',
          title: 'Title A changed',
          guid: 'guid-a',
        },
        mockPrisma
      );
      expect(second.title).toBe('Title A'); // original retained
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(1);
    });

    it('falls back to contentHash dedupe', async () => {
      const first = await upsertArticle(
        {
          sourceId: 'src1',
          canonicalUrl: 'https://example.com/a',
          title: 'Same Title',
        },
        mockPrisma
      );
      const second = await upsertArticle(
        {
          sourceId: 'src2', // different source but same canonical + title -> same hash
          canonicalUrl: 'https://example.com/a',
          title: 'Same Title',
        },
        mockPrisma
      );
      expect(second).toEqual(first);
      expect(mockPrisma.article.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('batchUpsertArticles', () => {
    it('creates all non-duplicate articles', async () => {
      const inputs: UpsertArticleInput[] = [
        { sourceId: 's1', canonicalUrl: 'https://e.com/1', title: 'A' },
        { sourceId: 's2', canonicalUrl: 'https://e.com/2', title: 'B' },
        { sourceId: 's3', canonicalUrl: 'https://e.com/1', title: 'A' }, // duplicate by hash
      ];
      const res = await batchUpsertArticles(inputs, mockPrisma);
      expect(res.created).toBe(2); // third skipped
      expect(res.duplicates).toBeGreaterThanOrEqual(1);
      expect(mockPrisma.article.createMany).toHaveBeenCalledTimes(1);
    });

    it('returns zero for empty input', async () => {
      const res = await batchUpsertArticles([], mockPrisma);
      expect(res.created).toBe(0);
      expect(res.duplicates).toBe(0);
    });
  });
});
