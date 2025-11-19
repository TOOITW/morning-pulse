import type { SourceConfig } from './types';

// 注意：以下 RSS 來源為常見旅遊站點的公開 feed，實際可用性請執行後驗證。
// 若有無法解析或 403/429，請視情況調整或替換。
export const TRAVEL_RSS_SOURCES: SourceConfig[] = [
  {
    name: 'Skift',
    type: 'rss',
    url: 'https://skift.com/feed/',
    trustScore: 0.8,
    ttlMin: 60,
  },
  {
    name: 'SecretFlying',
    type: 'rss',
    url: 'https://www.secretflying.com/feed/',
    trustScore: 0.75,
    ttlMin: 60,
  },
  {
    name: 'The Points Guy',
    type: 'rss',
    url: 'https://thepointsguy.com/feed/',
    trustScore: 0.8,
    ttlMin: 60,
  },
  {
    name: 'Nomadic Matt',
    type: 'rss',
    url: 'https://www.nomadicmatt.com/feed/',
    trustScore: 0.7,
    ttlMin: 60,
  },
  {
    name: 'Expert Vagabond',
    type: 'rss',
    url: 'https://expertvagabond.com/feed/',
    trustScore: 0.7,
    ttlMin: 60,
  },
];

export default TRAVEL_RSS_SOURCES;
