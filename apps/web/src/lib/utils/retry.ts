/**
 * HTTP Retry Logic with Exponential Backoff
 * Handles 429 (Too Many Requests) and 5xx errors
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt);
  return Math.min(delay, maxDelay);
}

/**
 * Check if error is retryable
 */
function isRetryableError(error: unknown, retryableStatuses: number[]): boolean {
  if (error instanceof Response) {
    return retryableStatuses.includes(error.status);
  }
  
  if (error instanceof Error) {
    // Network errors
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound')
    );
  }
  
  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error, opts.retryableStatuses)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier
      );

      // Wait before retry
      await sleep(delay);
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry with jitter to avoid thundering herd
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        break;
      }

      if (!isRetryableError(error, opts.retryableStatuses)) {
        throw error;
      }

      // Calculate base delay
      const baseDelay = calculateDelay(
        attempt,
        opts.initialDelay,
        opts.maxDelay,
        opts.backoffMultiplier
      );

      // Add jitter (random factor between 0 and 1)
      const jitter = Math.random();
      const delay = baseDelay * (0.5 + jitter * 0.5); // 50-100% of base delay

      await sleep(delay);
    }
  }

  throw lastError;
}
