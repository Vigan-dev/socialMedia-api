import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
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
  app.useGlobalPipes(
    new ValidationPipe({
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));
  app.enableCors({
    origin: clientOrigins,
    credentials: true,
  });
  await app.listen(Number(configService.get<string>('PORT') ?? 3000));
}
void bootstrap();
