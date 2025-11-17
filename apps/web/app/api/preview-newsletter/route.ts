import { NextResponse } from 'next/server';
import { prisma } from '../../../src/lib/db/client';
import { renderDailyNewsletter } from '../../../src/lib/email/renderer';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  try {
    // Pull recent articles with source relation for rendering
    const articles = await prisma.article.findMany({
      include: { source: true },
      orderBy: { tsPublished: 'desc' },
      take: 12,
    });

    const { html } = renderDailyNewsletter(articles, {
      marketOverview: '全球股市今日開高後震盪，美元指數走弱、黃金持穩。加密資產延續升勢。',
    });

    if (format === 'html') {
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return NextResponse.json({
      status: 'ok',
      htmlLength: html.length,
      articleCount: articles.length,
      previewQuery: '?format=html',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[preview-newsletter] Error generating preview:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}
