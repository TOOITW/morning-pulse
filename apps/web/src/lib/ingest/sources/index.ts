import { reutersSource } from './reuters';
import { cnbcSource } from './cnbc';
import { yahooFinanceSource } from './yahoo';
import type { SourceConfig } from './types';

export const DEFAULT_RSS_SOURCES: SourceConfig[] = [
  reutersSource,
  cnbcSource,
  yahooFinanceSource,
];

export * from './types';
