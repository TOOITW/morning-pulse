/**
 * Tests for Source Health Tracking
 * SDD: T018 - Source Health Tracking Service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  trackSuccess,
  trackFailure,
  getHealthStatus,
  getDegradedSources,
  markInactive,
  resetHealth,
} from '../source-health';

const prisma = new PrismaClient();

describe('Source Health Tracking', () => {
  let testSourceId: string;

  beforeEach(async () => {
    // Create a test source
    const source = await prisma.source.create({
      data: {
        name: 'Test Source',
        type: 'rss',
        url: 'https://test.example.com/feed.xml',
        trustScore: 0.8,
        status: 'active',
        consecutiveFailures: 0,
      },
    });
    testSourceId = source.id;
  });

  afterEach(async () => {
    // Cleanup
    await prisma.source.deleteMany({
      where: { name: 'Test Source' },
    });
  });

  describe('trackSuccess', () => {
    it('should reset consecutive failures and mark as active', async () => {
      // First mark as degraded
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          consecutiveFailures: 5,
          status: 'degraded',
        },
      });

      const result = await trackSuccess(testSourceId, prisma);

      expect(result.status).toBe('active');
      expect(result.consecutiveFailures).toBe(0);
      expect(result.lastSuccessAt).toBeTruthy();
      expect(result.lastFetchAt).toBeTruthy();
    });
  });

  describe('trackFailure', () => {
    it('should increment consecutive failures', async () => {
      const result = await trackFailure(testSourceId, 'Network timeout', prisma);

      expect(result.consecutiveFailures).toBe(1);
      expect(result.status).toBe('active'); // Not degraded yet
    });

    it('should mark as degraded after 5 consecutive failures', async () => {
      // Simulate 4 failures
      await prisma.source.update({
        where: { id: testSourceId },
        data: { consecutiveFailures: 4 },
      });

      const result = await trackFailure(testSourceId, 'Network timeout', prisma);

      expect(result.consecutiveFailures).toBe(5);
      expect(result.status).toBe('degraded');
    });

    it('should throw error for non-existent source', async () => {
      await expect(trackFailure('non-existent-id', 'Error', prisma)).rejects.toThrow(
        'Source not found'
      );
    });
  });

  describe('getHealthStatus', () => {
    it('should return health metrics for a source', async () => {
      const metrics = await getHealthStatus(testSourceId, prisma);

      expect(metrics.sourceId).toBe(testSourceId);
      expect(metrics.status).toBe('active');
      expect(metrics.consecutiveFailures).toBe(0);
    });

    it('should throw error for non-existent source', async () => {
      await expect(getHealthStatus('non-existent-id', prisma)).rejects.toThrow(
        'Source not found'
      );
    });
  });

  describe('getDegradedSources', () => {
    it('should return only degraded sources', async () => {
      // Create another degraded source
      const degradedSource = await prisma.source.create({
        data: {
          name: 'Degraded Source',
          type: 'rss',
          url: 'https://degraded.example.com/feed.xml',
          status: 'degraded',
          consecutiveFailures: 5,
        },
      });

      const sources = await getDegradedSources(prisma);

      expect(sources).toHaveLength(1);
      expect(sources[0].id).toBe(degradedSource.id);

      // Cleanup
      await prisma.source.delete({ where: { id: degradedSource.id } });
    });

    it('should return empty array when no degraded sources', async () => {
      const sources = await getDegradedSources(prisma);

      expect(sources).toHaveLength(0);
    });
  });

  describe('markInactive', () => {
    it('should mark source as inactive', async () => {
      const result = await markInactive(testSourceId, 'Source discontinued', prisma);

      expect(result.status).toBe('inactive');
    });
  });

  describe('resetHealth', () => {
    it('should reset health metrics', async () => {
      // First mark as degraded
      await prisma.source.update({
        where: { id: testSourceId },
        data: {
          consecutiveFailures: 10,
          status: 'degraded',
        },
      });

      const result = await resetHealth(testSourceId, prisma);

      expect(result.status).toBe('active');
      expect(result.consecutiveFailures).toBe(0);
    });
  });
});
