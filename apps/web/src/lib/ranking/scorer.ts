/**
 * Article Ranking Scorer
 * Implements scoring algorithm: 0.35×Recency + 0.25×SourceTrust + 0.25×Relevance + 0.15×Heat
 */

import { Article, Source } from '@prisma/client';

export interface ScoredArticle {
  article: Article & { source: Source };
  score: number;
  breakdown: {
    recency: number;
    trust: number;
    relevance: number;
    heat: number;
  };
}

export interface RankingOptions {
  userWatchlist?: string[]; // Stock symbols/topics user is interested in
  recencyWeight?: number;
  trustWeight?: number;
  relevanceWeight?: number;
  heatWeight?: number;
}

/**
 * Calculate recency score (0-1)
 * Articles published within last 24 hours get higher scores
 */
function calculateRecencyScore(publishedAt: Date): number {
  const now = new Date();
  const ageHours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);

  // Exponential decay: score = e^(-age/12)
  // 12-hour half-life means article at 12h gets ~0.37 score
  const score = Math.exp(-ageHours / 12);

  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate source trust score (0-1)
 * Based on source's trust_score field
 */
function calculateTrustScore(source: Source): number {
  return source.trustScore;
}

/**
 * Calculate relevance score (0-1)
 * Based on match with user's watchlist
 */
function calculateRelevanceScore(article: Article, watchlist?: string[]): number {
  if (!watchlist || watchlist.length === 0) {
    return 0.5; // Neutral score if no preferences
  }

  // Extract symbols and topics from article
  const articleSymbols = (article.symbols as string[]) || [];
  const articleTopics = (article.topics as string[]) || [];
  const articleItems = [...articleSymbols, ...articleTopics].map((s) => s.toLowerCase());

  // Count matches
  const watchlistLower = watchlist.map((w) => w.toLowerCase());
  const matches = watchlistLower.filter((w) => articleItems.includes(w)).length;

  if (matches === 0) {
    return 0.2; // Low relevance if no match
  }

  // Scale: 1 match = 0.6, 2 matches = 0.8, 3+ matches = 1.0
  const score = 0.4 + Math.min(matches * 0.2, 0.6);

  return score;
}

/**
 * Heat Score (0-1)
 * Based on cluster size (how many outlets are covering the same story)
 */
function calculateHeatScore(): number {
  // TODO: Implement cluster size lookup from database
  // For now, return neutral score
  return 0.5;
}

/**
 * Score a single article
 */
export function scoreArticle(
  article: Article & { source: Source },
  options: RankingOptions = {}
): ScoredArticle {
  const {
    userWatchlist,
    recencyWeight = 0.35,
    trustWeight = 0.25,
    relevanceWeight = 0.25,
    heatWeight = 0.15,
  } = options;

  // Calculate component scores
  const recency = calculateRecencyScore(article.tsPublished);
  const trust = calculateTrustScore(article.source);
  const relevance = calculateRelevanceScore(article, userWatchlist);
  const heat = calculateHeatScore();

  // Calculate weighted final score
  const score =
    recency * recencyWeight + trust * trustWeight + relevance * relevanceWeight + heat * heatWeight;

  return {
    article,
    score,
    breakdown: {
      recency,
      trust,
      relevance,
      heat,
    },
  };
}

/**
 * Score and rank multiple articles
 */
export function rankArticles(
  articles: (Article & { source: Source })[],
  options: RankingOptions = {}
): ScoredArticle[] {
  // Score all articles
  const scored = articles.map((article) => scoreArticle(article, options));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}
