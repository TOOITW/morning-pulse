/**
 * Seed initial RSS sources
 * Run this script to populate the database with financial news sources
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RSS_SOURCES = [
  {
    name: 'Reuters Business',
    type: 'rss',
    url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best',
    trustScore: 0.9,
    ttlMin: 60,
  },
  {
    name: 'CNBC Top News',
    type: 'rss',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    trustScore: 0.8,
    ttlMin: 60,
  },
  {
    name: 'Yahoo Finance',
    type: 'rss',
    url: 'https://finance.yahoo.com/news/rssindex',
    trustScore: 0.7,
    ttlMin: 60,
  },
];

async function seedSources() {
  console.log('🌱 Seeding RSS sources...');

  for (const sourceData of RSS_SOURCES) {
    const existing = await prisma.source.findFirst({
      where: {
        url: sourceData.url,
      },
    });

    if (existing) {
      console.log(`✓ Source already exists: ${sourceData.name}`);
      continue;
    }

    await prisma.source.create({
      data: sourceData,
    });

    console.log(`✓ Created source: ${sourceData.name}`);
  }

  console.log('✅ RSS sources seeded successfully!');
}

seedSources()
  .catch((error) => {
    console.error('❌ Error seeding sources:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
