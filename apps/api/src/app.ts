import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { browserOrigins } from './cors';
export async function createApp() {
  const origins = browserOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('v1');
  if (origins.length)
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
      maxAge: 600,
    });
  app.enableShutdownHooks();
  return app;
}
