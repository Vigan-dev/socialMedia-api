import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, static as serveStatic, urlencoded } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { createSameOriginWriteMiddleware } from './security/same-origin-write.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const clientOrigins = configService
    .getOrThrow<string>('CLIENT_ORIGINS')
    .split(',');

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
  await app.listen(Number(configService.get<string>('PORT') ?? 3000));
}
void bootstrap();
