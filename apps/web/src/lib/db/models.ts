/**
 * TypeScript type definitions for database models
 * These types mirror the Prisma schema for better type safety
 */

import type { Prisma } from '@prisma/client';

// ============================================
// Source Model
// ============================================

export interface Source {
  id: string;
  name: string;
  type: 'rss' | 'api' | 'scraper';
  url: string;
  trustScore: number; // 0.0-1.0
  ttlMin: number; // Time-to-live in minutes
  status: 'active' | 'degraded' | 'inactive';

  // Health tracking
  consecutiveFailures: number;
  lastFetchAt: Date | null;
  lastSuccessAt: Date | null;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export type SourceCreateInput = Prisma.SourceCreateInput;
export type SourceUpdateInput = Prisma.SourceUpdateInput;
export type SourceWhereInput = Prisma.SourceWhereInput;

// ============================================
// Article Model
// ============================================

export interface Article {
  id: string;
  sourceId: string;

  // Identifiers
  guid: string;
  canonicalUrl: string;
  contentHash: string;

  // Content
  title: string;
  summaryRaw: string | null;
  summary2: string | null; // Generated 2-sentence summary
  content: string | null;

  // Metadata
  tsPublished: Date;
  author: string | null;
  imageUrl: string | null;

  // NLP extracted data
  symbols: string[] | null; // ["AAPL", "2330.TW"]
  topics: string[] | null; // ["AI", "Semiconductors"]
  entities: Record<string, unknown> | null;

  // Clustering
  clusterId: string | null;
  simhash: string | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export type ArticleCreateInput = Prisma.ArticleCreateInput;
export type ArticleUpdateInput = Prisma.ArticleUpdateInput;
export type ArticleWhereInput = Prisma.ArticleWhereInput;

// ============================================
// Cluster Model
// ============================================

export interface Cluster {
  id: string;
  repArticleId: string | null; // Representative article
  simAvg: number | null;
  simMax: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ClusterCreateInput = Prisma.ClusterCreateInput;

// ============================================
// User Model
// ============================================

export interface User {
  id: string;
  email: string;
  name: string | null;

  // Preferences
  watchlistSymbols: string[] | null;
  topics: string[] | null;

  // Subscription status
  isActive: boolean;
  unsubscribedAt: Date | null;

  // Bounce tracking
  bounceCount: number;
  lastBounceAt: Date | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export type UserCreateInput = Prisma.UserCreateInput;
export type UserUpdateInput = Prisma.UserUpdateInput;

// ============================================
// Issue Model
// ============================================

export interface Issue {
  id: string;
  issueDate: Date;
  subject: string;
  articleIds: string[];
  htmlContent: string | null;

  // Metrics
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;

  // Timestamps
  sentAt: Date | null;
  createdAt: Date;
}

export type IssueCreateInput = Prisma.IssueCreateInput;

// ============================================
// Job Model (for async processing)
// ============================================

export type JobType = 'dedupe' | 'summarize' | 'ner' | 'send_newsletter';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  errorMessage: string | null;

  // Retry logic
  attempts: number;
  maxAttempts: number;

  // Scheduling
  scheduledFor: Date;
  startedAt: Date | null;
  completedAt: Date | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export type JobCreateInput = Prisma.JobCreateInput;
export type JobUpdateInput = Prisma.JobUpdateInput;
