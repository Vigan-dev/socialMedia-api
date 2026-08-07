import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { SmtpMailProvider } from './smtp-mail.provider';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpMailProvider', () => {
  const createTransport = nodemailer.createTransport as jest.MockedFunction<
    typeof nodemailer.createTransport
  >;
  const sendMail = jest.fn();

  beforeEach(() => {
    createTransport.mockReset();
    sendMail.mockReset().mockResolvedValue({ messageId: 'message-1' });
    createTransport.mockReturnValue({ sendMail } as unknown as Transporter);
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
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'SocialMedia <no-reply@example.com>',
        subject: 'Reset your SocialMedia password',
        text: expect.stringContaining(resetUrl),
        to: 'user@example.com',
      }),
    );
    expect(sendMail.mock.calls[0][0].html).toContain(
      resetUrl.replace('&', '&amp;'),
    );
    expect(sendMail.mock.calls[0][0].html).toContain('30 minutes');
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
