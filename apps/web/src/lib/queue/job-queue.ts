/**
 * SQLite-based Job Queue using Prisma
 * Simple async job processing without external dependencies
 */

import { PrismaClient, Job, Prisma } from '@prisma/client';
import prisma from '../db/client';
import { logInfo, logError, logWarn } from '../observability/logger';

export type JobType =
  | 'deduplication'
  | 'summarization'
  | 'ner'
  | 'email_render'
  | 'email_send';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobPayload {
  [key: string]: unknown;
}

export interface EnqueueJobOptions {
  scheduledFor?: Date;
  maxAttempts?: number;
}

/**
 * Enqueue a new job
 */
export async function enqueueJob(
  type: JobType,
  payload: JobPayload,
  options: EnqueueJobOptions = {},
  db: PrismaClient = prisma
): Promise<Job> {
  const { scheduledFor = new Date(), maxAttempts = 3 } = options;

  logInfo('Enqueueing job', {
    type,
    scheduledFor: scheduledFor.toISOString(),
  });

  return await db.job.create({
    data: {
      type,
      payload: payload as Prisma.InputJsonValue,
      status: 'pending',
      scheduledFor,
      maxAttempts,
      attempts: 0,
    },
  });
}

/**
 * Dequeue the next available job
 * Returns null if no jobs are available
 */
export async function dequeueJob(
  db: PrismaClient = prisma
): Promise<Job | null> {
  const now = new Date();

  // Find the next pending job that is due
  const job = await db.job.findFirst({
    where: {
      status: 'pending',
      scheduledFor: {
        lte: now,
      },
    },
    orderBy: [{ scheduledFor: 'asc' }],
  });

  if (!job) {
    return null;
  }

  // Mark as processing
  try {
    const updatedJob = await db.job.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: now,
        attempts: { increment: 1 },
      },
    });

    logInfo('Dequeued job', {
      jobId: job.id,
      type: job.type,
      attempt: updatedJob.attempts,
    });

    return updatedJob;
  } catch (error) {
    // Handle race condition where another worker grabbed the job
    logWarn('Failed to dequeue job (race condition)', {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Mark a job as completed
 */
export async function completeJob(
  jobId: string,
  result?: JobPayload,
  db: PrismaClient = prisma
): Promise<Job> {
  logInfo('Completing job', { jobId });

  return await db.job.update({
    where: { id: jobId },
    data: {
      status: 'completed',
      result: result as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });
}

/**
 * Mark a job as failed
 * If max retries not exceeded, reschedule the job
 */
export async function failJob(
  jobId: string,
  error: string,
  db: PrismaClient = prisma
): Promise<Job> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { attempts: true, maxAttempts: true, type: true },
  });

  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  const shouldRetry = job.attempts < job.maxAttempts;

  logError(
    shouldRetry ? 'Job failed, will retry' : 'Job failed permanently',
    undefined,
    {
      jobId,
      type: job.type,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      error,
    }
  );

  if (shouldRetry) {
    // Reschedule with exponential backoff (1min, 2min, 4min, ...)
    const backoffMinutes = Math.pow(2, job.attempts - 1);
    const scheduledFor = new Date(Date.now() + backoffMinutes * 60 * 1000);

    return await db.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        scheduledFor,
        result: { error } as Prisma.InputJsonValue,
      },
    });
  } else {
    return await db.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        result: { error } as Prisma.InputJsonValue,
      },
    });
  }
}

/**
 * Get job statistics
 */
export async function getJobStats(
  db: PrismaClient = prisma
): Promise<Record<JobStatus, number>> {
  const stats = await db.job.groupBy({
    by: ['status'],
    _count: {
      id: true,
    },
  });

  const result: Record<string, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };

  for (const stat of stats) {
    result[stat.status] = stat._count.id;
  }

  return result as Record<JobStatus, number>;
}

/**
 * Clean up old completed/failed jobs
 */
export async function cleanupOldJobs(
  olderThanDays: number = 7,
  db: PrismaClient = prisma
): Promise<number> {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const result = await db.job.deleteMany({
    where: {
      status: {
        in: ['completed', 'failed'],
      },
      completedAt: {
        lt: cutoffDate,
      },
    },
  });

  logInfo('Cleaned up old jobs', {
    deletedCount: result.count,
    olderThanDays,
  });

  return result.count;
}
