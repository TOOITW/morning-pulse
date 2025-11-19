import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const limit = Number(process.env.DEDUP_BATCH_LIMIT || 200);
    const sinceMs = 48 * 60 * 60 * 1000; // 48h
    const since = new Date(Date.now() - sinceMs);

    // Fetch recent article IDs (48h window)
    const articles = await prisma.article.findMany({
      where: { tsPublished: { gte: since } },
      select: { id: true },
      orderBy: { tsPublished: 'desc' },
      take: limit,
    });

    if (articles.length === 0) {
      console.log('No articles found in the last 48 hours.');
      return;
    }

    const articleIds = articles.map((a) => a.id);

    // Enqueue deduplication job
    const job = await prisma.job.create({
      data: {
        type: 'deduplication',
        payload: { article_ids: articleIds },
      },
      select: { id: true, createdAt: true },
    });

    console.log(
      `✅ Enqueued deduplication job ${job.id} with ${articleIds.length} articles (since ${since.toISOString()})`
    );
    console.log('Run the Python worker to process jobs:');
    console.log('  cd services/nlp-py && poetry install && python src/workers/deduplicator.py');
  } catch (err) {
    console.error('❌ Failed to enqueue deduplication job:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
