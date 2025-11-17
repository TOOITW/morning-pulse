/**
 * Nodemailer Email Sender
 * Sends emails via Gmail SMTP or Resend.com
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logInfo, logError } from '../observability/logger';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let transporterInstance: Transporter | null = null;

/**
 * Get or create email transporter
 */
function getTransporter(): Transporter {
  if (transporterInstance) {
    return transporterInstance;
  }

  const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

  if (emailProvider === 'resend') {
    // Resend.com configuration
    transporterInstance = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: {
        user: 'resend',
        pass: process.env.RESEND_API_KEY,
      },
    });

    logInfo('Email transporter initialized', { provider: 'resend' });
  } else {
    // Gmail SMTP configuration
    transporterInstance = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    logInfo('Email transporter initialized', { provider: 'gmail' });
  }

  return transporterInstance;
}

/**
 * Send email via Nodemailer
 */
export async function sendEmail(options: EmailOptions): Promise<SendResult> {
  const { to, subject, html, text, from, replyTo } = options;

  try {
    const transporter = getTransporter();

    const fromAddress = from || process.env.EMAIL_FROM || 'MorningPulse <noreply@morningpulse.com>';

    logInfo('Sending email', {
      to: Array.isArray(to) ? to.length : 1,
      subject,
    });

    const info = await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || undefined,
      replyTo: replyTo || process.env.EMAIL_REPLY_TO,
    });

    logInfo('Email sent successfully', {
      messageId: info.messageId,
      to,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    logError('Failed to send email', error as Error, {
      to,
      subject,
    });

    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Send newsletter to a single user
 */
export async function sendNewsletter(
  userEmail: string,
  html: string,
  text: string,
  date: string
): Promise<SendResult> {
  const subject = `MorningPulse • ${date}`;

  return sendEmail({
    to: userEmail,
    subject,
    html,
    text,
  });
}

/**
 * Send newsletter to multiple users (batch)
 */
export async function sendNewsletterBatch(
  userEmails: string[],
  html: string,
  text: string,
  date: string
): Promise<SendResult[]> {
  logInfo('Sending newsletter batch', {
    recipientCount: userEmails.length,
  });

  // Send emails sequentially to avoid rate limiting
  const results: SendResult[] = [];

  for (const email of userEmails) {
    const result = await sendNewsletter(email, html, text, date);
    results.push(result);

    // Add delay to respect rate limits (Gmail: 500/day, Resend: 100/day)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  logInfo('Newsletter batch completed', {
    total: results.length,
    success: successCount,
    failed: failureCount,
  });

  return results;
}

/**
 * Verify email configuration
 */
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    logInfo('Email configuration verified');
    return true;
  } catch (error) {
    logError('Email configuration verification failed', error as Error);
    return false;
  }
}
