import type { SourceConfig } from './types';

export const yahooFinanceSource: SourceConfig = {
  name: 'Yahoo Finance',
  type: 'rss',
  url: 'https://finance.yahoo.com/news/rssindex',
  trustScore: 0.7,
  ttlMin: 60,
};
