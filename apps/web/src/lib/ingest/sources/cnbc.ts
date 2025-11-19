import type { SourceConfig } from './types';

export const cnbcSource: SourceConfig = {
  name: 'CNBC Top News',
  type: 'rss',
  url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
  trustScore: 0.8,
  ttlMin: 60,
};
