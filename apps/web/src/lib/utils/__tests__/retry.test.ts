/**
 * Tests for HTTP Retry Logic
 * SDD: T017 - HTTP Retry Logic with Exponential Backoff
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { retryWithBackoff, retryWithJitter } from '../retry';

describe('Retry Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retryWithBackoff(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on 429 error', async () => {
      const error = new Response(null, { status: 429, statusText: 'Too Many Requests' });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should retry on 5xx errors', async () => {
      const error500 = new Response(null, { status: 500, statusText: 'Internal Server Error' });
      const error503 = new Response(null, { status: 503, statusText: 'Service Unavailable' });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(error500)
        .mockRejectedValueOnce(error503)
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should retry on network errors', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce('success');

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const error404 = new Response(null, { status: 404, statusText: 'Not Found' });
      const fn = vi.fn().mockRejectedValue(error404);

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelay: 10,
        })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(1); // No retries
    });

    it('should throw after max retries exhausted', async () => {
      const error = new Response(null, { status: 503 });
      const fn = vi.fn().mockRejectedValue(error);

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 2,
          initialDelay: 10,
        })
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should apply exponential backoff delays', async () => {
      const error = new Response(null, { status: 503 });
      const fn = vi.fn().mockRejectedValue(error);

      const startTime = Date.now();

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 3,
          initialDelay: 100,
          maxDelay: 1000,
          backoffMultiplier: 2,
        })
      ).rejects.toThrow();

      const duration = Date.now() - startTime;

      // Expected delays: 100ms, 200ms, 400ms = 700ms total minimum
      expect(duration).toBeGreaterThanOrEqual(600);
      expect(fn).toHaveBeenCalledTimes(4);
    });

    it('should respect maxDelay cap', async () => {
      const error = new Response(null, { status: 503 });
      const fn = vi.fn().mockRejectedValue(error);

      const startTime = Date.now();

      await expect(
        retryWithBackoff(fn, {
          maxRetries: 5,
          initialDelay: 1000,
          maxDelay: 1500, // Cap at 1.5 seconds
          backoffMultiplier: 10,
        })
      ).rejects.toThrow();

      const duration = Date.now() - startTime;

      // Even though backoff would be 1000, 10000, 100000, 1000000...
      // All should be capped at 1500ms max
      // Expected: 1000 + 1500*4 = 7000ms total minimum
      expect(duration).toBeLessThan(12000); // Give more buffer for CI
    }, 15000); // Increase timeout to 15s
  });

  describe('retryWithJitter', () => {
    it('should add jitter to delay', async () => {
      const error = new Response(null, { status: 503 });
      const fn = vi.fn().mockRejectedValue(error);

      const startTime = Date.now();

      await expect(
        retryWithJitter(fn, {
          maxRetries: 2,
          initialDelay: 100,
        })
      ).rejects.toThrow();

      const duration = Date.now() - startTime;

      // With jitter, delays are 50-100% of base delay
      // So minimum is 50ms + 100ms = 150ms
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });
});
