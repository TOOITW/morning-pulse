import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const limit = Number(process.env.SUMMARY_BATCH_LIMIT || 200);
    const sinceMs = Number(process.env.SUMMARY_SINCE_HOURS || 48) * 60 * 60 * 1000; // default 48h
    const since = new Date(Date.now() - sinceMs);

    // Fetch recent article IDs that need summarization (no summary_2 yet)
    const articles = await prisma.article.findMany({
      where: {
        tsPublished: { gte: since },
        summary2: null,
      },
      select: { id: true },
      orderBy: { tsPublished: 'desc' },
      take: limit,
    });

    if (articles.length === 0) {
      console.log('No articles requiring summarization in the selected window.');
      return;
    }

    const articleIds = articles.map((a) => a.id);

    // Enqueue summarization job
    const job = await prisma.job.create({
      data: {
        type: 'summarization',
        payload: { article_ids: articleIds },
      },
      select: { id: true, createdAt: true },
    });

    console.log(
      `✅ Enqueued summarization job ${job.id} with ${articleIds.length} articles (since ${since.toISOString()})`
    );
    console.log('Run the Python worker to process jobs:');
    console.log('  cd services/nlp-py && poetry install && python src/workers/summarizer.py');
  } catch (err) {
    console.error('❌ Failed to enqueue summarization job:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
