export type SourceConfig = {
  name: string;
  type: 'rss' | 'api' | 'scraper';
  url: string;
  trustScore: number; // 0..1
  ttlMin: number; // minutes
};
