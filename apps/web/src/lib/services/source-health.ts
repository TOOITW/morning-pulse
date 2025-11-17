/**
 * Source Health Tracking Service
 * Monitors RSS source reliability and marks degraded sources
 */

import { PrismaClient, Source } from '@prisma/client';
import prisma from '../db/client';

export type SourceStatus = 'active' | 'degraded' | 'inactive';

export interface HealthMetrics {
  sourceId: string;
  status: string;
  consecutiveFailures: number;
  lastFetchAt?: Date;
  lastSuccessAt?: Date;
}

/**
 * Track a successful fetch from a source
 * Resets consecutive failures and marks source as active
 */
export async function trackSuccess(sourceId: string, db: PrismaClient = prisma): Promise<Source> {
  return await db.source.update({
    where: { id: sourceId },
    data: {
      status: 'active',
      consecutiveFailures: 0,
      lastFetchAt: new Date(),
      lastSuccessAt: new Date(),
    },
  });
}

/**
 * Track a failed fetch from a source
 * Increments consecutive failures and marks as degraded if threshold exceeded
 */
export async function trackFailure(
  sourceId: string,
  errorMessage: string,
  db: PrismaClient = prisma
): Promise<Source> {
  // Get current source state
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: { consecutiveFailures: true },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const newFailureCount = source.consecutiveFailures + 1;
  const threshold = 5; // Mark degraded after 5 consecutive failures

  return await db.source.update({
    where: { id: sourceId },
    data: {
      consecutiveFailures: newFailureCount,
      status: newFailureCount >= threshold ? 'degraded' : 'active',
      lastFetchAt: new Date(),
    },
  });
}

/**
 * Get health status for a specific source
 */
export async function getHealthStatus(
  sourceId: string,
  db: PrismaClient = prisma
): Promise<HealthMetrics> {
  const source = await db.source.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      status: true,
      consecutiveFailures: true,
      lastFetchAt: true,
      lastSuccessAt: true,
    },
  });

  if (!source) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  return {
    sourceId: source.id,
    status: source.status,
    consecutiveFailures: source.consecutiveFailures,
    lastFetchAt: source.lastFetchAt || undefined,
    lastSuccessAt: source.lastSuccessAt || undefined,
  };
}

/**
 * Get all degraded or inactive sources
 */
export async function getDegradedSources(db: PrismaClient = prisma): Promise<Source[]> {
  return await db.source.findMany({
    where: {
      status: {
        in: ['degraded', 'inactive'],
      },
    },
    orderBy: {
      consecutiveFailures: 'desc',
    },
  });
}

/**
 * Manually mark a source as inactive (e.g., permanently discontinued)
 */
export async function markInactive(
  sourceId: string,
  reason: string,
  db: PrismaClient = prisma
): Promise<Source> {
  return await db.source.update({
    where: { id: sourceId },
    data: {
      status: 'inactive',
    },
  });
}

/**
 * Reset health metrics for a source (e.g., after manual intervention)
 */
export async function resetHealth(sourceId: string, db: PrismaClient = prisma): Promise<Source> {
  return await db.source.update({
    where: { id: sourceId },
    data: {
      status: 'active',
      consecutiveFailures: 0,
    },
  });
}
