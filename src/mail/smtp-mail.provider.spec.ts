import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';

import { SmtpMailProvider } from './smtp-mail.provider';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpMailProvider', () => {
  const createTransport = nodemailer.createTransport as jest.MockedFunction<
    typeof nodemailer.createTransport
  >;
  const sendMail = jest.fn<
    Promise<{ messageId: string }>,
    [mailOptions: SendMailOptions]
  >();

  beforeEach(() => {
    createTransport.mockReset();
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-1' });
    createTransport.mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  it('creates an SMTP transport and sends text and HTML reset links', async () => {
    const provider = createProvider({
      MAIL_FROM: 'SocialMedia <no-reply@example.com>',
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASSWORD: 'secret',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'reset-user',
    });
    const resetUrl =
      'https://app.example.com/forgot-password?email=user%40example.com&token=abc123';

    await provider.sendPasswordResetEmail({
      expiresInMinutes: 30,
      resetUrl,
      to: 'user@example.com',
    });

    expect(createTransport).toHaveBeenCalledWith({
      auth: { pass: 'secret', user: 'reset-user' },
      disableFileAccess: true,
      disableUrlAccess: true,
      host: 'smtp.example.com',
      port: 465,
      secure: true,
    });
    const [mailOptions] = sendMail.mock.calls[0];
    expect(mailOptions).toMatchObject({
      from: 'SocialMedia <no-reply@example.com>',
      subject: 'Reset your SocialMedia password',
      to: 'user@example.com',
    });
    expect(mailOptions.text).toContain(resetUrl);
    expect(mailOptions.html).toContain(resetUrl.replace('&', '&amp;'));
    expect(mailOptions.html).toContain('30 minutes');
  });

  it('sends an email-verification link without exposing raw HTML', async () => {
    const provider = createProvider({
      MAIL_FROM: 'SocialMedia <no-reply@example.com>',
      NODE_ENV: 'production',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASSWORD: 'secret',
      SMTP_PORT: '587',
      SMTP_USER: 'mailer',
    });
    const verificationUrl =
      'https://app.example.com/verify-email?email=user%40example.com&token=abc&next=<script>';

    await provider.sendEmailVerificationEmail({
      expiresInHours: 1,
      to: 'user@example.com',
      verificationUrl,
    });

    const [mailOptions] = sendMail.mock.calls[0];
    expect(mailOptions).toMatchObject({
      subject: 'Verify your SocialMedia email',
      to: 'user@example.com',
    });
    expect(mailOptions.text).toContain(verificationUrl);
    expect(mailOptions.html).toContain('&lt;script&gt;');
    expect(mailOptions.html).not.toContain('<script>');
  });

  it('fails outside development and test when SMTP is unavailable', async () => {
    const provider = createProvider({ NODE_ENV: 'production' });

    await expect(
      provider.sendPasswordResetEmail({
        expiresInMinutes: 30,
        resetUrl: 'https://app.example.com/forgot-password?token=abc123',
        to: 'user@example.com',
      }),
    ).rejects.toThrow('SMTP mail provider is not configured');

    expect(sendMail).not.toHaveBeenCalled();
  });
});

function createProvider(config: Record<string, string>) {
  const configService = {
    get: (key: string) => config[key],
  } as ConfigService;

  return new SmtpMailProvider(configService);
}
