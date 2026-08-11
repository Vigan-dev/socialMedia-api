import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApplication } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApplication(app);
  const configService = app.get(ConfigService);
  await app.listen(Number(configService.get<string>('PORT') ?? 3000));
}
void bootstrap();
