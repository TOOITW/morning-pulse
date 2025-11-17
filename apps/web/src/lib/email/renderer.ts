/**
 * MJML Email Renderer
 * Compiles MJML templates to HTML
 */

import mjml2html from 'mjml';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Article, Source } from '@prisma/client';
import { logInfo, logError } from '../observability/logger';

export interface ArticleForEmail {
  title: string;
  summary: string;
  sourceName: string;
  url: string;
  publishedTime: string;
  author?: string;
}

export interface NewsletterData {
  date: string;
  marketOverview: string;
  articles: ArticleForEmail[];
  preferencesUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
  year: string;
}

/**
 * Load MJML template from file
 */
function loadTemplate(templateName: string): string {
  const templatePath = join(process.cwd(), 'src/lib/email/templates', `${templateName}.mjml`);

  try {
    return readFileSync(templatePath, 'utf-8');
  } catch (error) {
    logError('Failed to load email template', error as Error, {
      templateName,
      templatePath,
    });
    throw error;
  }
}

/**
 * Simple Handlebars-like template replacement
 */
function renderTemplate(template: string, data: NewsletterData): string {
  let rendered = template;

  // Replace simple variables {{variable}}
  (Object.keys(data) as (keyof NewsletterData)[]).forEach((key) => {
    if (key !== 'articles') {
      const value = data[key];
      const regex = new RegExp(`{{${String(key)}}}`, 'g');
      rendered = rendered.replace(regex, String(value));
    }
  });

  // Handle articles array {{#each articles}}...{{/each}}
  const articlesMatch = rendered.match(/{{#each articles}}([\s\S]*?){{\/each}}/);

  if (articlesMatch) {
    const articleTemplate = articlesMatch[1];
    const articles: ArticleForEmail[] = data.articles || [];

    const articlesHtml = articles
      .map((article: ArticleForEmail) => {
        let articleHtml = articleTemplate;

        // Replace article properties
        (Object.keys(article) as (keyof ArticleForEmail)[]).forEach((key) => {
          const value = article[key] ?? '';
          const regex = new RegExp(`{{this\\.${String(key)}}}`, 'g');
          articleHtml = articleHtml.replace(regex, String(value));
        });

        return articleHtml;
      })
      .join('');

    rendered = rendered.replace(articlesMatch[0], articlesHtml);
  }

  return rendered;
}

/**
 * Convert Article to ArticleForEmail format
 */
export function formatArticleForEmail(article: Article & { source: Source }): ArticleForEmail {
  const publishedDate = new Date(article.tsPublished);
  const now = new Date();
  const hoursAgo = Math.floor((now.getTime() - publishedDate.getTime()) / (1000 * 60 * 60));

  let publishedTime: string;
  if (hoursAgo < 1) {
    publishedTime = 'Just now';
  } else if (hoursAgo < 24) {
    publishedTime = `${hoursAgo}h ago`;
  } else {
    publishedTime = publishedDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return {
    title: article.title,
    summary: article.summary2 || article.summaryRaw || '',
    sourceName: article.source.name,
    url: article.canonicalUrl,
    publishedTime,
    author: article.author || undefined,
  };
}

/**
 * Render daily newsletter email
 */
export function renderDailyNewsletter(
  articles: (Article & { source: Source })[],
  options: {
    marketOverview?: string;
    userId?: string;
  } = {}
): { html: string; text: string } {
  const { marketOverview, userId } = options;

  logInfo('Rendering daily newsletter', {
    articleCount: articles.length,
    userId,
  });

  // Prepare data
  const now = new Date();
  const data: NewsletterData = {
    date: now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    marketOverview:
      marketOverview || 'Markets showed mixed performance today. Stay tuned for detailed analysis.',
    articles: articles.map(formatArticleForEmail),
    preferencesUrl: userId
      ? `${process.env.APP_URL}/preferences?userId=${userId}`
      : `${process.env.APP_URL}/preferences`,
    unsubscribeUrl: userId
      ? `${process.env.APP_URL}/api/unsubscribe?userId=${userId}`
      : `${process.env.APP_URL}/unsubscribe`,
    privacyUrl: `${process.env.APP_URL}/privacy`,
    year: now.getFullYear().toString(),
  };

  // Load and render template
  const mjmlTemplate = loadTemplate('daily-newsletter');
  const renderedMjml = renderTemplate(mjmlTemplate, data);

  // Compile MJML to HTML
  const result = mjml2html(renderedMjml, {
    validationLevel: 'soft',
  });

  if (result.errors.length > 0) {
    logError('MJML compilation errors', undefined, {
      errors: result.errors,
    });
  }

  // Generate plain text version (simple fallback)
  const text = generatePlainTextVersion(data);

  logInfo('Newsletter rendered successfully', {
    htmlLength: result.html.length,
    textLength: text.length,
  });

  return {
    html: result.html,
    text,
  };
}

/**
 * Generate plain text version of newsletter
 */
function generatePlainTextVersion(data: NewsletterData): string {
  const lines = [
    'MORNINGPULSE',
    data.date,
    '',
    '═══════════════════════════════════════',
    '',
    '📊 MARKET OVERVIEW',
    '',
    data.marketOverview,
    '',
    '═══════════════════════════════════════',
    '',
    '🔥 TOP STORIES',
    '',
  ];

  data.articles.forEach((article, index) => {
    lines.push(`${index + 1}. ${article.title}`);
    lines.push(`   Source: ${article.sourceName} • ${article.publishedTime}`);
    lines.push('');
    lines.push(`   ${article.summary}`);
    lines.push('');
    lines.push(`   Read more: ${article.url}`);
    lines.push('');
    lines.push('───────────────────────────────────────');
    lines.push('');
  });

  lines.push('');
  lines.push('───────────────────────────────────────');
  lines.push('');
  lines.push(`Manage preferences: ${data.preferencesUrl}`);
  lines.push(`Unsubscribe: ${data.unsubscribeUrl}`);
  lines.push('');
  lines.push(`© ${data.year} MorningPulse. All rights reserved.`);

  return lines.join('\n');
}
