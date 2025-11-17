/**
 * Article Filtering Guardrails
 * Implements filtering rules to ensure newsletter quality
 */

import { Article, Source } from '@prisma/client';

export interface FilteringOptions {
  minTrustScore?: number; // Minimum source trust score (default: 0.4)
  maxPerSource?: number; // Maximum articles per source (default: 3)
  maxPerCluster?: number; // Maximum articles per cluster (default: 1)
  maxTotal?: number; // Maximum total articles (default: 8)
}

export interface FilterResult {
  included: (Article & { source: Source })[];
  excluded: {
    article: Article & { source: Source };
    reason: string;
  }[];
}

/**
 * Filter articles based on quality guardrails
 */
export function filterArticles(
  articles: (Article & { source: Source })[],
  options: FilteringOptions = {}
): FilterResult {
  const { minTrustScore = 0.4, maxPerSource = 3, maxPerCluster = 1, maxTotal = 8 } = options;

  const included: (Article & { source: Source })[] = [];
  const excluded: { article: Article & { source: Source }; reason: string }[] = [];

  const sourceCount = new Map<string, number>();
  const clusterCount = new Map<string, number>();

  for (const article of articles) {
    // Stop if we've reached max total
    if (included.length >= maxTotal) {
      excluded.push({
        article,
        reason: `Exceeded max total articles (${maxTotal})`,
      });
      continue;
    }

    // Rule 1: Filter out low-trust sources
    if (article.source.trustScore < minTrustScore) {
      excluded.push({
        article,
        reason: `Source trust score too low (${article.source.trustScore} < ${minTrustScore})`,
      });
      continue;
    }

    // Rule 2: Limit articles per source
    const currentSourceCount = sourceCount.get(article.sourceId) || 0;
    if (currentSourceCount >= maxPerSource) {
      excluded.push({
        article,
        reason: `Exceeded max articles per source (${maxPerSource} from ${article.source.name})`,
      });
      continue;
    }

    // Rule 3: Limit articles per cluster (avoid redundancy)
    if (article.clusterId) {
      const currentClusterCount = clusterCount.get(article.clusterId) || 0;
      if (currentClusterCount >= maxPerCluster) {
        excluded.push({
          article,
          reason: `Exceeded max articles per cluster (${maxPerCluster})`,
        });
        continue;
      }
    }

    // Article passed all filters
    included.push(article);

    // Update counters
    sourceCount.set(article.sourceId, currentSourceCount + 1);
    if (article.clusterId) {
      const currentClusterCount = clusterCount.get(article.clusterId) || 0;
      clusterCount.set(article.clusterId, currentClusterCount + 1);
    }
  }

  return { included, excluded };
}

/**
 * Get top N articles after filtering
 * This combines filtering with truncation to desired count
 */
export function getTopArticles(
  articles: (Article & { source: Source })[],
  count: number = 8,
  options: FilteringOptions = {}
): (Article & { source: Source })[] {
  const filterResult = filterArticles(articles, {
    ...options,
    maxTotal: count,
  });

  return filterResult.included;
}

/**
 * Validate filtering configuration
 */
export function validateFilteringOptions(options: FilteringOptions): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (options.minTrustScore !== undefined) {
    if (options.minTrustScore < 0 || options.minTrustScore > 1) {
      errors.push('minTrustScore must be between 0 and 1');
    }
  }

  if (options.maxPerSource !== undefined && options.maxPerSource < 1) {
    errors.push('maxPerSource must be at least 1');
  }

  if (options.maxPerCluster !== undefined && options.maxPerCluster < 1) {
    errors.push('maxPerCluster must be at least 1');
  }

  if (options.maxTotal !== undefined && options.maxTotal < 1) {
    errors.push('maxTotal must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
