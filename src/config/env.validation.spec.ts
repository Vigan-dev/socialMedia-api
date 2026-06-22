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
});
