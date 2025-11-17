export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

type Article = {
  sourceName: string;
  title: string;
  summary: string;
  publishedTime: string;
  author: string;
  url: string;
};

type TemplateContext = {
  date: string;
  marketOverview: string;
  preferencesUrl: string;
  unsubscribeUrl: string;
  privacyUrl: string;
  year: number;
  articles: Article[];
};

function renderTemplate(mjml: string, context: TemplateContext) {
  // Replace simple {{token}}
  let out = mjml.replace(/{{(\w+)}}/g, (_m, key: string) => {
    const k = key as keyof TemplateContext;
    const v = context[k];
    return v === undefined || v === null || typeof v === 'object' ? '' : String(v);
  });

  // Handle {{#each articles}} ... {{/each}}
  const eachMatch = out.match(/{{#each articles}}([\s\S]*?){{\/each}}/);
  if (eachMatch) {
    const block = eachMatch[1];
    const rendered = (context.articles || [])
      .map((a) =>
        block.replace(/{{this\.(\w+)}}/g, (_m, key: string) => {
          const k = key as keyof Article;
          const v = a[k];
          return v == null ? '' : String(v);
        })
      )
      .join('\n');
    out = out.replace(eachMatch[0], rendered);
  }
  return out;
}

async function loadMjmlTemplate() {
  const candidates = [
    path.join(process.cwd(), 'src', 'lib', 'email', 'templates', 'daily-newsletter.mjml'),
    path.join(process.cwd(), 'lib', 'email', 'templates', 'daily-newsletter.mjml'),
  ];
  for (const p of candidates) {
    try {
      await fs.access(p);
      return fs.readFile(p, 'utf8');
    } catch {}
  }
  // Fallback minimal template
  return `
    <mjml>
      <mj-body>
        <mj-section>
          <mj-column>
            <mj-text font-size="20px" font-weight="700">MorningPulse Preview</mj-text>
            <mj-text>{{date}}</mj-text>
            {{#each articles}}
            <mj-text><strong>{{this.title}}</strong> — {{this.summary}}</mj-text>
            {{/each}}
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `;
}

function buildMockContext(): TemplateContext {
  const articles: Article[] = [
    {
      sourceName: 'Reuters Business',
      title: 'Bitcoin 突破 $100,000 創歷史新高',
      summary: '比特幣首次站上 10 萬美元，市場交易量與波動率同步升高...',
      publishedTime: '07:30 UTC',
      author: 'Jane Doe',
      url: 'https://example.com/bitcoin',
    },
    {
      sourceName: 'CNBC Top News',
      title: 'Apple 發布革命性 AR 眼鏡',
      summary: 'Apple 公佈全新 AR 裝置，聚焦生產力與沉浸式體驗，市場反應熱烈...',
      publishedTime: '08:10 UTC',
      author: 'John Chen',
      url: 'https://example.com/apple-ar',
    },
  ];
  return {
    date: new Date().toISOString().slice(0, 10),
    marketOverview: '全球股市今日開高後震盪，美元指數走弱、黃金持穩。加密資產延續升勢。',
    preferencesUrl: 'https://example.com/preferences',
    unsubscribeUrl: 'https://example.com/unsubscribe',
    privacyUrl: 'https://example.com/privacy',
    year: new Date().getFullYear(),
    articles,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const toParam =
      (body?.to as string | undefined) ||
      new URL(req.url).searchParams.get('to') ||
      process.env.TEST_EMAIL_TO ||
      '';
    const subject = (body?.subject as string | undefined) || 'MorningPulse 測試郵件';

    // Render HTML via MJML
    const { default: mjml2html } = await import('mjml');
    const mjmlRaw = await loadMjmlTemplate();
    const context = buildMockContext();
    const mjmlFilled = renderTemplate(mjmlRaw, context);
    const { html, errors } = mjml2html(mjmlFilled, { validationLevel: 'soft' });

    // Build transporter (SMTP env → real send; fallback to Ethereal)
    const { default: nodemailer } = await import('nodemailer');

    let transporter;
    if (process.env.SMTP_HOST) {
      const secure =
        String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
        process.env.SMTP_PORT === '465';
      const smtpUser = process.env.SMTP_USER;
      const smtpPass =
        process.env.SMTP_PASS || (process.env as Record<string, string | undefined>).SMTP_PASSWORD;
      if (!smtpUser || !smtpPass) {
        return NextResponse.json(
          {
            status: 'error',
            message:
              'SMTP_HOST 已設定，但缺少 SMTP_USER 與/或 SMTP_PASS（或 SMTP_PASSWORD）。請修正 .env 後重試；或移除 SMTP_HOST 以改用 Ethereal（預覽網址），或改用 Gmail OAuth2。',
          },
          { status: 400 }
        );
      }
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
        secure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
    } else if (
      process.env.GMAIL_OAUTH_CLIENT_ID &&
      process.env.GMAIL_OAUTH_CLIENT_SECRET &&
      process.env.GMAIL_OAUTH_REFRESH_TOKEN &&
      (process.env.GMAIL_OAUTH_USER || process.env.SMTP_FROM)
    ) {
      // OAuth2 for Gmail (無需 App Password)
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user:
            process.env.GMAIL_OAUTH_USER || /<(.*)>/.exec(process.env.SMTP_FROM || '')?.[1] || '',
          clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
          clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
          refreshToken: process.env.GMAIL_OAUTH_REFRESH_TOKEN,
          // optional
          // accessToken 可省略，由 nodemailer 透過 refresh token 取得
        },
      });
    } else {
      // Ethereal test account (不會寄到真實信箱，但可拿到預覽連結)
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    }

    const from = process.env.SMTP_FROM || 'MorningPulse <no-reply@morningpulse.local>';
    const to = toParam || (process.env.SMTP_HOST ? '' : 'ethereal@ethereal.email');
    if (!to) {
      return NextResponse.json(
        {
          status: 'error',
          message: '缺少收件者 to，請在 body 或 ?to= 提供，或設定 TEST_EMAIL_TO/.env SMTP 後重試',
        },
        { status: 400 }
      );
    }

    const info = await transporter.sendMail({ from, to, subject, html });
    // 若是 Ethereal，提供預覽網址
    // nodemailer 在 runtime 提供 getTestMessageUrl（型別可能不存在），保守存取
    type NodemailerWithPreview = typeof import('nodemailer') & {
      getTestMessageUrl?: (info: unknown) => string | null;
    };
    const nm = nodemailer as NodemailerWithPreview;
    const previewUrl =
      typeof nm.getTestMessageUrl === 'function' ? nm.getTestMessageUrl(info) : null;

    return NextResponse.json({
      status: 'ok',
      to,
      subject,
      messageId: info.messageId,
      previewUrl,
      mjmlErrors: errors,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-test-email] Error:', err);
    return NextResponse.json({ status: 'error', message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  // 便於用瀏覽器/簡單工具測試：GET 也可寄
  return POST(req);
}
