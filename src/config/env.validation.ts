type Environment = Record<string, string | undefined>;

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

  if (config.OLLAMA_HOST && !URL.canParse(config.OLLAMA_HOST)) {
    throw new Error('OLLAMA_HOST must be a valid URL');
  }

  config.OLLAMA_HOST ??= 'http://localhost:11434';
  config.OLLAMA_MODEL ??= 'llama3.2:3b';

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
