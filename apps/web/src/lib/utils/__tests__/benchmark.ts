/**
 * Performance Benchmark for URL & Hash utilities
 * Verifies SDD requirements: normalizeArticleUrl < 5ms, generateContentHash < 2ms
 */

import {
  normalizeArticleUrl,
  removeTrackingParams,
  normalizeUrl,
  normalizeInternationalDomain,
} from '../url';
import { generateContentHash, stripTitle, createArticleSignature } from '../hash';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  opsPerSec: number;
  requirement?: string;
  pass?: boolean;
}

function benchmark(name: string, fn: () => void, iterations: number = 1000): BenchmarkResult {
  // Warm up
  for (let i = 0; i < 100; i++) {
    fn();
  }

  // Actual benchmark
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = performance.now();

  const totalMs = end - start;
  const avgMs = totalMs / iterations;
  const opsPerSec = (iterations / totalMs) * 1000;

  return {
    name,
    iterations,
    totalMs,
    avgMs,
    opsPerSec,
  };
}

// Test data
const testUrls = [
  'https://example.com/article?utm_source=twitter&utm_medium=social&a=1&b=2#section',
  'https://EXAMPLE.COM/path/to/article?gclid=abc123&fbclid=xyz789',
  'https://日本.jp/news/article?id=12345&ref=homepage',
  'https://reuters.com/business/finance/article.html?sa_campaign=email&rss_id=456',
];

const testTitles = [
  'Breaking News: Major Market Update',
  'Reuters: Economic Report &amp; Analysis - [速報] Global Markets',
  'CNBC Exclusive: Tech Giants Report Earnings',
  'Yahoo Finance: Stock Market Reaches New Heights',
];

function runBenchmarks() {
  console.log('🚀 URL & Hash Utilities Performance Benchmark\n');
  console.log('SDD Requirements:');
  console.log('  - normalizeArticleUrl: < 5ms per call');
  console.log('  - generateContentHash: < 2ms per call\n');

  const results: BenchmarkResult[] = [];

  // URL Benchmarks
  console.log('📊 URL Utilities:\n');

  const urlIdx = { val: 0 };
  results.push(
    benchmark(
      'removeTrackingParams',
      () => {
        removeTrackingParams(testUrls[urlIdx.val++ % testUrls.length]);
      },
      1000,
    ),
  );

  urlIdx.val = 0;
  results.push(
    benchmark(
      'normalizeUrl',
      () => {
        normalizeUrl(testUrls[urlIdx.val++ % testUrls.length]);
      },
      1000,
    ),
  );

  urlIdx.val = 0;
  results.push(
    benchmark(
      'normalizeInternationalDomain',
      () => {
        normalizeInternationalDomain(testUrls[urlIdx.val++ % testUrls.length]);
      },
      1000,
    ),
  );

  urlIdx.val = 0;
  const urlResult = benchmark(
    'normalizeArticleUrl (full pipeline)',
    () => {
      normalizeArticleUrl(testUrls[urlIdx.val++ % testUrls.length]);
    },
    1000,
  );
  urlResult.requirement = '< 5ms';
  urlResult.pass = urlResult.avgMs < 5;
  results.push(urlResult);

  // Hash Benchmarks
  console.log('\n📊 Hash Utilities:\n');

  const hashIdx = { val: 0 };
  results.push(
    benchmark(
      'stripTitle',
      () => {
        stripTitle(testTitles[hashIdx.val++ % testTitles.length]);
      },
      1000,
    ),
  );

  hashIdx.val = 0;
  const hashResult = benchmark(
    'generateContentHash',
    () => {
      const url = testUrls[hashIdx.val % testUrls.length];
      const title = testTitles[hashIdx.val % testTitles.length];
      hashIdx.val++;
      generateContentHash(url, title);
    },
    1000,
  );
  hashResult.requirement = '< 2ms';
  hashResult.pass = hashResult.avgMs < 2;
  results.push(hashResult);

  hashIdx.val = 0;
  results.push(
    benchmark(
      'createArticleSignature',
      () => {
        const url = testUrls[hashIdx.val % testUrls.length];
        const title = testTitles[hashIdx.val % testTitles.length];
        hashIdx.val++;
        createArticleSignature(url, title);
      },
      1000,
    ),
  );

  // Display results
  results.forEach((r) => {
    const status = r.requirement ? (r.pass ? '✅' : '❌') : '  ';
    const req = r.requirement ? ` (Req: ${r.requirement})` : '';
    console.log(`${status} ${r.name}${req}`);
    console.log(`   Avg: ${r.avgMs.toFixed(4)}ms | Ops/sec: ${Math.round(r.opsPerSec).toLocaleString()}`);
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  const urlTest = results.find((r) => r.name === 'normalizeArticleUrl (full pipeline)');
  const hashTest = results.find((r) => r.name === 'generateContentHash');

  const allPassed = urlTest?.pass && hashTest?.pass;

  if (allPassed) {
    console.log('✅ All SDD performance requirements met!');
  } else {
    console.log('❌ Some performance requirements not met:');
    if (!urlTest?.pass) console.log(`   - normalizeArticleUrl: ${urlTest?.avgMs.toFixed(4)}ms (req: < 5ms)`);
    if (!hashTest?.pass) console.log(`   - generateContentHash: ${hashTest?.avgMs.toFixed(4)}ms (req: < 2ms)`);
  }

  return allPassed;
}

// Run if executed directly
if (require.main === module) {
  const passed = runBenchmarks();
  process.exit(passed ? 0 : 1);
}

export { runBenchmarks };
