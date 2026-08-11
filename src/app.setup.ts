import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, static as serveStatic, urlencoded } from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { join } from 'node:path';
import { createSameOriginWriteMiddleware } from './security/same-origin-write.middleware';

export function configureApplication(app: INestApplication) {
  const configService = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as unknown as Express;
  const clientOrigins = configService
    .getOrThrow<string>('CLIENT_ORIGINS')
    .split(',');

  expressApp.set(
    'trust proxy',
    Number(configService.getOrThrow<string>('TRUST_PROXY_HOPS')),
  );
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.use(createSameOriginWriteMiddleware(clientOrigins));
  app.use('/uploads', serveStatic(join(process.cwd(), 'uploads')));
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));
  app.enableCors({
    origin: clientOrigins,
    credentials: true,
  });
}
