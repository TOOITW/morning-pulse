/**
 * Simple Metrics Logger
 * Logs key metrics for monitoring (replaces Grafana)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface Metrics {
  sourceHealth: {
    active: number;
    degraded: number;
    inactive: number;
  };
  articleIngestion: {
    last24h: number;
    last7d: number;
    avgPerDay: number;
  };
  deduplication: {
    totalClusters: number;
    avgClusterSize: number;
    duplicateRate: number;
  };
  emailDelivery: {
    lastIssue: {
      date: string;
      sent: number;
      opened: number;
      clicked: number;
      bounced: number;
      openRate: number;
      clickRate: number;
    } | null;
  };
}

async function getSourceHealthMetrics() {
  const sources = await prisma.source.groupBy({
    by: ['status'],
    _count: {
      id: true,
    },
  });

  const stats = {
    active: 0,
    degraded: 0,
    inactive: 0,
  };

  for (const source of sources) {
    if (source.status in stats) {
      stats[source.status as keyof typeof stats] = source._count.id;
    }
  }

  return stats;
}

async function getArticleIngestionMetrics() {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const last7d = new Date(now);
  last7d.setDate(last7d.getDate() - 7);

  const [count24h, count7d] = await Promise.all([
    prisma.article.count({
      where: {
        createdAt: {
          gte: yesterday,
        },
      },
    }),
    prisma.article.count({
      where: {
        createdAt: {
          gte: last7d,
        },
      },
    }),
  ]);

  return {
    last24h: count24h,
    last7d: count7d,
    avgPerDay: Math.round(count7d / 7),
  };
}

async function getDeduplicationMetrics() {
  const [totalClusters, totalArticles] = await Promise.all([
    prisma.cluster.count(),
    prisma.article.count({
      where: {
        clusterId: {
          not: null,
        },
      },
    }),
  ]);

  const avgClusterSize =
    totalClusters > 0 ? totalArticles / totalClusters : 0;
  const duplicateRate =
    totalArticles > 0 ? ((totalArticles - totalClusters) / totalArticles) * 100 : 0;

  return {
    totalClusters,
    avgClusterSize: Math.round(avgClusterSize * 10) / 10,
    duplicateRate: Math.round(duplicateRate * 10) / 10,
  };
}

async function getEmailDeliveryMetrics() {
  const lastIssue = await prisma.issue.findFirst({
    orderBy: {
      sentAt: 'desc',
    },
    select: {
      issueDate: true,
      totalSent: true,
      totalOpened: true,
      totalClicked: true,
      totalBounced: true,
    },
  });

  if (!lastIssue) {
    return { lastIssue: null };
  }

  const openRate =
    lastIssue.totalSent > 0
      ? Math.round((lastIssue.totalOpened / lastIssue.totalSent) * 1000) / 10
      : 0;

  const clickRate =
    lastIssue.totalSent > 0
      ? Math.round((lastIssue.totalClicked / lastIssue.totalSent) * 1000) / 10
      : 0;

  return {
    lastIssue: {
      date: lastIssue.issueDate.toISOString().split('T')[0],
      sent: lastIssue.totalSent,
      opened: lastIssue.totalOpened,
      clicked: lastIssue.totalClicked,
      bounced: lastIssue.totalBounced,
      openRate,
      clickRate,
    },
  };
}

async function collectMetrics(): Promise<Metrics> {
  console.log('📊 Collecting metrics...\n');

  const [sourceHealth, articleIngestion, deduplication, emailDelivery] =
    await Promise.all([
      getSourceHealthMetrics(),
      getArticleIngestionMetrics(),
      getDeduplicationMetrics(),
      getEmailDeliveryMetrics(),
    ]);

  return {
    sourceHealth,
    articleIngestion,
    deduplication,
    emailDelivery,
  };
}

function displayMetrics(metrics: Metrics) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('                  MORNINGPULSE METRICS                 ');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log('📡 SOURCE HEALTH');
  console.log(`   Active:    ${metrics.sourceHealth.active}`);
  console.log(`   Degraded:  ${metrics.sourceHealth.degraded}`);
  console.log(`   Inactive:  ${metrics.sourceHealth.inactive}\n`);

  console.log('📰 ARTICLE INGESTION');
  console.log(`   Last 24h:  ${metrics.articleIngestion.last24h} articles`);
  console.log(`   Last 7d:   ${metrics.articleIngestion.last7d} articles`);
  console.log(`   Avg/day:   ${metrics.articleIngestion.avgPerDay} articles\n`);

  console.log('🔄 DEDUPLICATION');
  console.log(`   Total Clusters:     ${metrics.deduplication.totalClusters}`);
  console.log(`   Avg Cluster Size:   ${metrics.deduplication.avgClusterSize}`);
  console.log(`   Duplicate Rate:     ${metrics.deduplication.duplicateRate}%\n`);

  console.log('📧 EMAIL DELIVERY');
  if (metrics.emailDelivery.lastIssue) {
    const issue = metrics.emailDelivery.lastIssue;
    console.log(`   Last Issue:    ${issue.date}`);
    console.log(`   Sent:          ${issue.sent}`);
    console.log(`   Opened:        ${issue.opened} (${issue.openRate}%)`);
    console.log(`   Clicked:       ${issue.clicked} (${issue.clickRate}%)`);
    console.log(`   Bounced:       ${issue.bounced}`);
  } else {
    console.log('   No issues sent yet');
  }

  console.log('\n═══════════════════════════════════════════════════════\n');
}

async function main() {
  try {
    const metrics = await collectMetrics();
    displayMetrics(metrics);

    // Optionally save to log file
    const timestamp = new Date().toISOString();
    console.log(`✅ Metrics collected at ${timestamp}\n`);
  } catch (error) {
    console.error('❌ Error collecting metrics:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
