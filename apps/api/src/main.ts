import 'reflect-metadata';
import './load-env';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const env = configureApp(app);
  await app.listen(env.PORT, '0.0.0.0');
  Logger.log(`API ouvindo em http://localhost:${env.PORT}`, 'Bootstrap');
}

void bootstrap();
