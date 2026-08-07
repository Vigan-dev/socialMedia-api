import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { MailProvider, type PasswordResetEmail } from './mail.provider';

@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly from: string | undefined;
  private readonly logger = new Logger(SmtpMailProvider.name);
  private readonly nodeEnvironment: string | undefined;
  private readonly transporter: Transporter | undefined;

  constructor(private readonly configService: ConfigService) {
    this.from = this.configService.get<string>('MAIL_FROM')?.trim();
    this.nodeEnvironment = this.configService
      .get<string>('NODE_ENV')
      ?.trim()
      .toLowerCase();

    const host = this.configService.get<string>('SMTP_HOST')?.trim();
    const port = Number(this.configService.get<string>('SMTP_PORT'));

    if (!host || !Number.isInteger(port) || !this.from) {
      return;
    }

    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const password = this.configService.get<string>('SMTP_PASSWORD');

    this.transporter = nodemailer.createTransport({
      auth: user && password ? { pass: password, user } : undefined,
      disableFileAccess: true,
      disableUrlAccess: true,
      host,
      port,
      secure: this.configService.get<string>('SMTP_SECURE') === 'true',
    });
  }

  async sendPasswordResetEmail(email: PasswordResetEmail): Promise<void> {
    if (!this.transporter || !this.from) {
      if (['development', 'test'].includes(this.nodeEnvironment ?? '')) {
        this.logger.warn(
          'SMTP is not configured; password reset email delivery was skipped in development/test mode.',
        );
        return;
      }

      throw new Error('SMTP mail provider is not configured');
    }

    const safeResetUrl = escapeHtml(email.resetUrl);

    await this.transporter.sendMail({
      from: this.from,
      html: [
        '<p>We received a request to reset your SocialMedia password.</p>',
        `<p><a href="${safeResetUrl}">Reset your password</a></p>`,
        `<p>This link expires in ${email.expiresInMinutes} minutes. If you did not request it, you can ignore this email.</p>`,
      ].join(''),
      subject: 'Reset your SocialMedia password',
      text: [
        'We received a request to reset your SocialMedia password.',
        '',
        `Reset your password: ${email.resetUrl}`,
        '',
        `This link expires in ${email.expiresInMinutes} minutes. If you did not request it, you can ignore this email.`,
      ].join('\n'),
      to: email.to,
    });
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
