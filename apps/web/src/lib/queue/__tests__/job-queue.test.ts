/**
 * Tests for Job Queue
 * SDD: T021 - SQLite-based Job Queue using Prisma
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  enqueueJob,
  dequeueJob,
  completeJob,
  failJob,
  getJobStats,
  cleanupOldJobs,
} from '../job-queue';

const prisma = new PrismaClient();

describe('Job Queue', () => {
  beforeEach(async () => {
    // Clean up any existing test jobs
    await prisma.job.deleteMany({});
  });

  afterEach(async () => {
    await prisma.job.deleteMany({});
  });

  describe('enqueueJob', () => {
    it('should create a new pending job', async () => {
      const job = await enqueueJob(
        'deduplication',
        { articleIds: ['1', '2', '3'] },
        {},
        prisma
      );

      expect(job.type).toBe('deduplication');
      expect(job.status).toBe('pending');
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(3);
    });

    it('should schedule job for future execution', async () => {
      const scheduledFor = new Date(Date.now() + 60000); // 1 minute from now

      const job = await enqueueJob(
        'email_send',
        { recipients: ['test@example.com'] },
        { scheduledFor },
        prisma
      );

      expect(job.scheduledFor.getTime()).toBeGreaterThan(Date.now());
    });

    it('should allow custom maxAttempts', async () => {
      const job = await enqueueJob('summarization', { articleId: '1' }, { maxAttempts: 5 }, prisma);

      expect(job.maxAttempts).toBe(5);
    });
  });

  describe('dequeueJob', () => {
    it('should dequeue the next pending job', async () => {
      await enqueueJob('deduplication', { data: 'test1' }, {}, prisma);
      await enqueueJob('deduplication', { data: 'test2' }, {}, prisma);

      const job = await dequeueJob(prisma);

      expect(job).toBeTruthy();
      expect(job!.status).toBe('processing');
      expect(job!.attempts).toBe(1);
    });

    it('should return null when no jobs available', async () => {
      const job = await dequeueJob(prisma);

      expect(job).toBeNull();
    });

    it('should not dequeue future-scheduled jobs', async () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now

      await enqueueJob('email_send', { data: 'test' }, { scheduledFor: futureDate }, prisma);

      const job = await dequeueJob(prisma);

      expect(job).toBeNull();
    });

    it('should dequeue jobs in order of scheduledFor', async () => {
      const now = Date.now();
      await enqueueJob('test', { order: 2 }, { scheduledFor: new Date(now + 1000) }, prisma);
      await enqueueJob('test', { order: 1 }, { scheduledFor: new Date(now - 1000) }, prisma);
      await enqueueJob('test', { order: 3 }, { scheduledFor: new Date(now + 2000) }, prisma);

      const job1 = await dequeueJob(prisma);
      expect((job1!.payload as { order: number }).order).toBe(1);
    });
  });

  describe('completeJob', () => {
    it('should mark job as completed', async () => {
      const job = await enqueueJob('deduplication', { data: 'test' }, {}, prisma);
      await dequeueJob(prisma);

      const completed = await completeJob(job.id, { clustersCreated: 5 }, prisma);

      expect(completed.status).toBe('completed');
      expect(completed.completedAt).toBeTruthy();
      expect((completed.result as { clustersCreated: number }).clustersCreated).toBe(5);
    });
  });

  describe('failJob', () => {
    it('should reschedule job if retries remaining', async () => {
      const job = await enqueueJob('summarization', { articleId: '1' }, { maxAttempts: 3 }, prisma);
      await dequeueJob(prisma);

      const failed = await failJob(job.id, 'Network timeout', prisma);

      expect(failed.status).toBe('pending'); // Rescheduled
      expect((failed.result as { error: string }).error).toBe('Network timeout');
    });

    it('should mark as failed if max retries exceeded', async () => {
      const job = await enqueueJob('summarization', { articleId: '1' }, { maxAttempts: 1 }, prisma);
      await dequeueJob(prisma);

      const failed = await failJob(job.id, 'Permanent error', prisma);

      expect(failed.status).toBe('failed');
      expect(failed.completedAt).toBeTruthy();
    });

    it('should apply exponential backoff on retry', async () => {
      const job = await enqueueJob('test', { data: 'test' }, { maxAttempts: 3 }, prisma);

      // First failure (attempt 1)
      await dequeueJob(prisma);
      const failed1 = await failJob(job.id, 'Error 1', prisma);

      // Second failure (attempt 2)
      await prisma.job.update({
        where: { id: job.id },
        data: { scheduledFor: new Date() },
      });
      await dequeueJob(prisma);
      const failed2 = await failJob(job.id, 'Error 2', prisma);

      // Check that scheduledFor increases exponentially
      const delay1 = failed1.scheduledFor.getTime() - Date.now();
      const delay2 = failed2.scheduledFor.getTime() - Date.now();

      expect(delay2).toBeGreaterThan(delay1);
    });
  });

  describe('getJobStats', () => {
    it('should return job counts by status', async () => {
      await enqueueJob('test', { data: '1' }, {}, prisma);
      await enqueueJob('test', { data: '2' }, {}, prisma);

      const job1 = await dequeueJob(prisma);
      await completeJob(job1!.id, {}, prisma);

      const job2 = await dequeueJob(prisma);
      await failJob(job2!.id, 'Error', prisma);

      await enqueueJob('test', { data: '3' }, {}, prisma);

      const stats = await getJobStats(prisma);

      expect(stats.pending).toBeGreaterThanOrEqual(1); // Includes rescheduled job
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(0); // Job was rescheduled, not permanently failed
    });
  });

  describe('cleanupOldJobs', () => {
    it('should delete old completed and failed jobs', async () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

      // Create old completed job
      const oldJob = await enqueueJob('test', { data: 'old' }, {}, prisma);
      await dequeueJob(prisma);
      await completeJob(oldJob.id, {}, prisma);

      // Manually update completedAt to be old
      await prisma.job.update({
        where: { id: oldJob.id },
        data: { completedAt: oldDate },
      });

      // Create recent completed job
      const recentJob = await enqueueJob('test', { data: 'recent' }, {}, prisma);
      await dequeueJob(prisma);
      await completeJob(recentJob.id, {}, prisma);

      const deletedCount = await cleanupOldJobs(7, prisma);

      expect(deletedCount).toBe(1); // Only old job deleted

      const remaining = await prisma.job.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(recentJob.id);
    });
  });
});
