/**
 * Newsletter Builder Service
 * Orchestrates the newsletter generation pipeline
 */

import { PrismaClient, Article, Source } from '@prisma/client';
import prisma from '../db/client';
import { rankArticles } from '../ranking/scorer';
import { getTopArticles } from '../ranking/filter';
import { renderDailyNewsletter } from '../email/renderer';
import { sendNewsletterBatch } from '../email/nodemailer-sender';
import { logInfo, logError } from '../observability/logger';

export interface NewsletterResult {
  issueId: string;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  articlesIncluded: number;
}

/**
 * Build and send daily newsletter
 */
export async function buildAndSendNewsletter(
  db: PrismaClient = prisma
): Promise<NewsletterResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  logInfo('Starting newsletter generation', {
    date: today.toISOString(),
  });

  try {
    // Check idempotency: ensure we haven't sent newsletter today
    const existingIssue = await db.issue.findFirst({
      where: {
        sentAt: {
          gte: today,
        },
      },
    });

    if (existingIssue) {
      logInfo('Newsletter already sent today', {
        issueId: existingIssue.id,
      });

      const articleIds = existingIssue.articleIds as string[];

      return {
        issueId: existingIssue.id,
        recipientCount: 0,
        successCount: 0,
        failureCount: 0,
        articlesIncluded: articleIds.length,
      };
    }

    // Step 1: Fetch recent articles (last 24 hours)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const articles = await db.article.findMany({
      where: {
        tsPublished: {
          gte: yesterday,
        },
        summary2: {
          not: null, // Only articles that have been summarized
        },
      },
      include: {
        source: true,
      },
      orderBy: {
        tsPublished: 'desc',
      },
    });

    logInfo('Fetched recent articles', {
      articleCount: articles.length,
    });

    if (articles.length === 0) {
      throw new Error('No articles available for newsletter');
    }

    // Step 2: Rank articles
    const rankedArticles = rankArticles(articles);

    // Step 3: Filter and select top articles
    const topArticles = getTopArticles(
      rankedArticles.map((r) => r.article),
      8 // Top 8 articles
    );

    logInfo('Selected top articles', {
      selectedCount: topArticles.length,
    });

    // Step 4: Create Issue record
    const issue = await db.issue.create({
      data: {
        issueDate: today,
        subject: `MorningPulse • ${today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
        sentAt: new Date(),
        articleIds: topArticles.map((a) => a.id),
      },
    });

    logInfo('Created issue record', {
      issueId: issue.id,
    });

    // Step 5: Render email
    const { html, text } = renderDailyNewsletter(topArticles, {
      marketOverview: generateMarketOverview(topArticles),
    });

    // Step 6: Get active subscribers
    const subscribers = await db.user.findMany({
      where: {
        unsubscribedAt: null,
      },
      select: {
        id: true,
        email: true,
      },
    });

    logInfo('Fetched active subscribers', {
      subscriberCount: subscribers.length,
    });

    if (subscribers.length === 0) {
      logInfo('No active subscribers, skipping send');
      return {
        issueId: issue.id,
        recipientCount: 0,
        successCount: 0,
        failureCount: 0,
        articlesIncluded: topArticles.length,
      };
    }

    // Step 7: Send emails
    const dateStr = today.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const sendResults = await sendNewsletterBatch(
      subscribers.map((s) => s.email),
      html,
      text,
      dateStr
    );

    // Step 8: Record delivery status
    const successCount = sendResults.filter((r) => r.success).length;
    const failureCount = sendResults.length - successCount;

    for (let i = 0; i < subscribers.length; i++) {
      const subscriber = subscribers[i];
      const result = sendResults[i];

      await db.issueDelivery.create({
        data: {
          issueId: issue.id,
          userId: subscriber.id,
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
          errorMessage: result.error || null,
        },
      });
    }

    logInfo('Newsletter sent successfully', {
      issueId: issue.id,
      recipientCount: subscribers.length,
      successCount,
      failureCount,
    });

    return {
      issueId: issue.id,
      recipientCount: subscribers.length,
      successCount,
      failureCount,
      articlesIncluded: topArticles.length,
    };
  } catch (error) {
    logError('Newsletter generation failed', error as Error);
    throw error;
  }
}

/**
 * Generate market overview text based on articles
 */
function generateMarketOverview(
  articles: (Article & { source: Source })[]
): string {
  // Simple rule-based overview
  const topics = new Set<string>();

  articles.forEach((article) => {
    const articleTopics = (article.topics as string[]) || [];
    articleTopics.forEach((topic) => topics.add(topic));
  });

  if (topics.size === 0) {
    return 'Financial markets continue to evolve with various developments across sectors. Key stories are highlighted below.';
  }

  const topicList = Array.from(topics).slice(0, 3).join(', ');
  return `Today's key financial developments focus on ${topicList}. Our curated selection brings you the most important updates.`;
}
