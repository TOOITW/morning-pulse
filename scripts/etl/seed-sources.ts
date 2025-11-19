/**
 * Seed initial RSS sources
 * Run this script to populate the database with financial news sources
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_RSS_SOURCES } from '../../apps/web/src/lib/ingest/sources';
import { TRAVEL_RSS_SOURCES } from '../../apps/web/src/lib/ingest/sources/travel';

const prisma = new PrismaClient();

// 支援以參數選擇來源 pack：--pack=travel | finance（預設）
const argPack = process.argv.find((a) => a.startsWith('--pack='))?.split('=')[1];
const pack = (process.env.PACK || argPack || 'finance').toLowerCase();

const RSS_SOURCES = pack === 'travel' ? TRAVEL_RSS_SOURCES : DEFAULT_RSS_SOURCES;

async function seedSources() {
  console.log(`🌱 Seeding RSS sources (pack=${pack})...`);

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
