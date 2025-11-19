import type { SourceConfig } from './types';

export const reutersSource: SourceConfig = {
  name: 'Reuters Business',
  type: 'rss',
  url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
  trustScore: 0.9,
  ttlMin: 60,
};
