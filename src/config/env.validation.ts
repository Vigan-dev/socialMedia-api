type Environment = Record<string, string | undefined>;

const defaultClientOrigin = 'http://localhost:3001';

function parseClientOrigins(value: string) {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      let url: URL;

      try {
        url = new URL(origin);
      } catch {
        throw new Error('CLIENT_ORIGINS must contain valid URLs');
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('CLIENT_ORIGINS must only contain http or https URLs');
      }

      if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error(
          'CLIENT_ORIGINS values must be origins without paths, query strings, or fragments',
        );
      }

      return url.origin;
    });

  if (origins.length === 0) {
    throw new Error('CLIENT_ORIGINS must include at least one origin');
  }

  return [...new Set(origins)];
}

function parsePublicApiUrl(value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_API_URL must be a valid URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('PUBLIC_API_URL must use http or https');
  }

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      'PUBLIC_API_URL must be an origin without a path, query string, or fragment',
    );
  }

  return url.origin;
}

export function validateEnvironment(config: Environment) {
  const mongodbUri = config.MONGODB_URI;
  const jwtSecret = config.JWT_SECRET?.trim();

  if (!mongodbUri) {
    throw new Error('MONGODB_URI is required');
  }

  if (!jwtSecret) {
    throw new Error('JWT_SECRET is required');
  }

  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }

  if (jwtSecret === 'dev-secret') {
    throw new Error('JWT_SECRET must not use the old unsafe dev-secret value');
  }

  config.JWT_SECRET = jwtSecret;

  if (
    !mongodbUri.startsWith('mongodb://') &&
    !mongodbUri.startsWith('mongodb+srv://')
  ) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  if (config.PORT && Number.isNaN(Number(config.PORT))) {
    throw new Error('PORT must be a number');
  }

  const clientOrigins = parseClientOrigins(
    config.CLIENT_ORIGINS ?? config.CLIENT_ORIGIN ?? defaultClientOrigin,
  );
  config.CLIENT_ORIGINS = clientOrigins.join(',');
  config.CLIENT_ORIGIN = clientOrigins[0];

  if (config.OLLAMA_HOST && !URL.canParse(config.OLLAMA_HOST)) {
    throw new Error('OLLAMA_HOST must be a valid URL');
  }

  config.OLLAMA_HOST ??= 'http://localhost:11434';
  config.OLLAMA_MODEL ??= 'llama3.2:3b';

  if (config.PUBLIC_API_URL) {
    config.PUBLIC_API_URL = parsePublicApiUrl(config.PUBLIC_API_URL.trim());
  }

  if (config.ADMIN_EMAIL || config.ADMIN_PASSWORD || config.ADMIN_USERNAME) {
    if (!config.ADMIN_EMAIL?.trim()) {
      throw new Error(
        'ADMIN_EMAIL is required when admin bootstrap is enabled',
      );
    }

    if (!config.ADMIN_USERNAME?.trim()) {
      throw new Error(
        'ADMIN_USERNAME is required when admin bootstrap is enabled',
      );
    }

    if (!config.ADMIN_PASSWORD || config.ADMIN_PASSWORD.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters');
    }
  }

  return config;
}
