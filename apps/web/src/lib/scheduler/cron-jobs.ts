/**
 * Scheduled Cron Jobs
 * Triggers newsletter generation and other periodic tasks
 */

import cron from 'node-cron';
import { buildAndSendNewsletter } from '../services/newsletter-builder';
import { ingestAllSources } from '../services/rss-ingest';
import { cleanupOldJobs } from '../queue/job-queue';
import { logInfo, logError } from '../observability/logger';

/**
 * Daily newsletter job - runs at 7:30 AM Taipei time (23:30 UTC-8 = 23:30 UTC)
 * Cron pattern: "30 23 * * *" (11:30 PM UTC)
 */
export function scheduleDailyNewsletter() {
  const cronPattern = process.env.NEWSLETTER_CRON || '30 23 * * *';

  logInfo('Scheduling daily newsletter', {
    pattern: cronPattern,
    timezone: 'Asia/Taipei',
  });

  cron.schedule(
    cronPattern,
    async () => {
      logInfo('Daily newsletter cron triggered');

      try {
        const result = await buildAndSendNewsletter();

        logInfo('Daily newsletter completed', {
          issueId: result.issueId,
          recipientCount: result.recipientCount,
          successCount: result.successCount,
          failureCount: result.failureCount,
        });
      } catch (error) {
        logError('Daily newsletter cron failed', error as Error);
      }
    },
    {
      timezone: 'Asia/Taipei',
    }
  );

  logInfo('Daily newsletter scheduled successfully');
}

/**
 * RSS ingestion job - runs every hour
 * Cron pattern: "0 * * * *" (at minute 0 of every hour)
 */
export function scheduleRSSIngestion() {
  const cronPattern = '0 * * * *';

  logInfo('Scheduling RSS ingestion', {
    pattern: cronPattern,
  });

  cron.schedule(cronPattern, async () => {
    logInfo('RSS ingestion cron triggered');

    try {
      const results = await ingestAllSources();

      const totalCreated = results.reduce(
        (sum, r) => sum + r.articlesCreated,
        0
      );
      const totalDuplicate = results.reduce(
        (sum, r) => sum + r.articlesDuplicate,
        0
      );

      logInfo('RSS ingestion completed', {
        sourcesProcessed: results.length,
        totalCreated,
        totalDuplicate,
      });
    } catch (error) {
      logError('RSS ingestion cron failed', error as Error);
    }
  });

  logInfo('RSS ingestion scheduled successfully');
}

/**
 * Job queue cleanup - runs daily at 2 AM
 * Cron pattern: "0 2 * * *"
 */
export function scheduleJobCleanup() {
  const cronPattern = '0 2 * * *';

  logInfo('Scheduling job cleanup', {
    pattern: cronPattern,
  });

  cron.schedule(cronPattern, async () => {
    logInfo('Job cleanup cron triggered');

    try {
      const deletedCount = await cleanupOldJobs(7); // Delete jobs older than 7 days

      logInfo('Job cleanup completed', {
        deletedCount,
      });
    } catch (error) {
      logError('Job cleanup cron failed', error as Error);
    }
  });

  logInfo('Job cleanup scheduled successfully');
}

/**
 * Initialize all scheduled jobs
 */
export function initializeScheduler() {
  logInfo('Initializing scheduler');

  scheduleDailyNewsletter();
  scheduleRSSIngestion();
  scheduleJobCleanup();

  logInfo('All cron jobs initialized');
}

/**
 * Manually trigger newsletter (for testing)
 */
export async function triggerNewsletterNow() {
  logInfo('Manually triggering newsletter');

  try {
    const result = await buildAndSendNewsletter();

    logInfo('Manual newsletter trigger completed', {
      issueId: result.issueId,
      recipientCount: result.recipientCount,
      successCount: result.successCount,
    });

    return result;
  } catch (error) {
    logError('Manual newsletter trigger failed', error as Error);
    throw error;
  }
}
