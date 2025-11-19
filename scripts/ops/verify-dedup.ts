import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function contentLength(a: { content: string | null; summaryRaw: string | null; title: string }) {
  return (
    (a.content?.length ?? 0) || (a.summaryRaw?.length ?? 0) || (a.title?.length ?? 0)
  );
}

async function main() {
  try {
    const sinceMs = 48 * 60 * 60 * 1000;
    const since = new Date(Date.now() - sinceMs);

    const totalClusters = await prisma.cluster.count();
    const recentArticles = await prisma.article.count({
      where: { tsPublished: { gte: since } },
    });

    console.log(`🔎 Total clusters: ${totalClusters}`);
    console.log(`📰 Articles in last 48h: ${recentArticles}`);

    // Pick the latest 10 clusters to validate representative logic
    const clusters = await prisma.cluster.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, repArticleId: true, createdAt: true },
    });

    if (clusters.length === 0) {
      console.log('No clusters found to verify.');
      return;
    }

    let ok = 0;
    let fail = 0;

    for (const c of clusters) {
      const articles = await prisma.article.findMany({
        where: { clusterId: c.id },
        select: {
          id: true,
          title: true,
          summaryRaw: true,
          content: true,
          tsPublished: true,
          source: { select: { trustScore: true, name: true } },
        },
      });

      if (articles.length === 0) continue;

      const expected = [...articles].sort((a, b) => {
        const lenDiff = contentLength(b) - contentLength(a);
        if (lenDiff !== 0) return lenDiff;
        const trustDiff = (b.source?.trustScore ?? 0) - (a.source?.trustScore ?? 0);
        if (trustDiff !== 0) return trustDiff;
        return b.tsPublished.getTime() - a.tsPublished.getTime();
      })[0];

      const repMatches = expected.id === c.repArticleId;

      if (repMatches) {
        ok++;
      } else {
        fail++;
        console.log(`❌ Cluster ${c.id} representative mismatch:`);
        console.log(`   Expected: ${expected.id} (${contentLength(expected)} chars, trust=${expected.source?.trustScore ?? 0})`);
        console.log(`   Actual:   ${c.repArticleId}`);
      }

      // Check 48h window adherence (all articles should be within 48h if job used enqueue script)
      const outside = articles.filter((a) => a.tsPublished < since);
      if (outside.length > 0) {
        console.log(`⚠️  Cluster ${c.id} has ${outside.length} articles older than 48h.`);
      }
    }

    console.log(`\n✅ Representative checks passed: ${ok}, failed: ${fail}`);
    if (fail === 0) {
      console.log('All checked clusters have correct representative selection.');
    }
  } catch (err) {
    console.error('❌ Verification error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
