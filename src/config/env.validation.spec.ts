import { validateEnvironment } from './env.validation';

const validBaseEnv = {
  JWT_SECRET: 'a'.repeat(32),
  MONGODB_URI: 'mongodb://localhost:27017/socialmedia',
};

describe('validateEnvironment', () => {
  it('defaults client origins for local development', () => {
    const config = validateEnvironment({ ...validBaseEnv });

    expect(config.CLIENT_ORIGINS).toBe('http://localhost:3001');
    expect(config.CLIENT_ORIGIN).toBe('http://localhost:3001');
    expect(config.TRUST_PROXY_HOPS).toBe('0');
  });

  it('accepts the legacy single client origin variable', () => {
    const config = validateEnvironment({
      ...validBaseEnv,
      CLIENT_ORIGIN: 'https://app.example.com',
    });

    expect(config.CLIENT_ORIGINS).toBe('https://app.example.com');
    expect(config.CLIENT_ORIGIN).toBe('https://app.example.com');
  });

  it('normalizes comma-separated client origins', () => {
    const config = validateEnvironment({
      ...validBaseEnv,
      CLIENT_ORIGINS:
        ' http://localhost:3001, https://preview.example.com/, https://app.example.com ',
    });

    expect(config.CLIENT_ORIGINS).toBe(
      'http://localhost:3001,https://preview.example.com,https://app.example.com',
    );
    expect(config.CLIENT_ORIGIN).toBe('http://localhost:3001');
  });

  it('rejects client origins with paths', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseEnv,
        CLIENT_ORIGINS: 'https://app.example.com/feed',
      }),
    ).toThrow('CLIENT_ORIGINS values must be origins');
  });

  it('rejects non-http client origins', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseEnv,
        CLIENT_ORIGINS: 'capacitor://localhost',
      }),
    ).toThrow('CLIENT_ORIGINS must only contain http or https URLs');
  });

  it('normalizes public API URL when configured', () => {
    const config = validateEnvironment({
      ...validBaseEnv,
      PUBLIC_API_URL: 'https://api.example.com/',
    });

    expect(config.PUBLIC_API_URL).toBe('https://api.example.com');
  });

  it('rejects public API URL with paths', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseEnv,
        PUBLIC_API_URL: 'https://api.example.com/uploads',
      }),
    ).toThrow('PUBLIC_API_URL must be an origin');
  });

  it('accepts only a bounded trusted proxy hop count', () => {
    expect(
      validateEnvironment({ ...validBaseEnv, TRUST_PROXY_HOPS: '2' })
        .TRUST_PROXY_HOPS,
    ).toBe('2');

    expect(() =>
      validateEnvironment({ ...validBaseEnv, TRUST_PROXY_HOPS: '-1' }),
    ).toThrow('TRUST_PROXY_HOPS must be an integer between 0 and 10');
  });

  it('requires SMTP delivery configuration in production', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseEnv,
        NODE_ENV: 'production',
      }),
    ).toThrow('MAIL_FROM is required for SMTP mail delivery');
  });

  it('normalizes valid SMTP delivery configuration', () => {
    const config = validateEnvironment({
      ...validBaseEnv,
      MAIL_FROM: ' SocialMedia <no-reply@example.com> ',
      NODE_ENV: ' PRODUCTION ',
      SMTP_HOST: ' smtp.example.com ',
      SMTP_PASSWORD: 'secret',
      SMTP_PORT: '465',
      SMTP_USER: ' reset-user ',
    });

    expect(config).toEqual(
      expect.objectContaining({
        MAIL_FROM: 'SocialMedia <no-reply@example.com>',
        NODE_ENV: 'production',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        SMTP_USER: 'reset-user',
      }),
    );
  });

  it('requires SMTP credentials to be configured as a pair', () => {
    expect(() =>
      validateEnvironment({
        ...validBaseEnv,
        MAIL_FROM: 'no-reply@example.com',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: '587',
        SMTP_USER: 'reset-user',
      }),
    ).toThrow('SMTP_USER and SMTP_PASSWORD must be provided together');
  });
});
