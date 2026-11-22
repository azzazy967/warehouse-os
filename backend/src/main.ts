import 'reflect-metadata';
import { ClassSerializerInterceptor, Logger, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { mkdir } from 'fs/promises';
import { AppModule } from './app.module';
import { UPLOAD_DIR, UPLOAD_URL_PREFIX } from './config/upload.config';

const logger = new Logger('Bootstrap');

function corsOrigins(): string[] | RegExp[] | false {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;
  if (process.env.NODE_ENV === 'production') return false;
  return [/^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await mkdir(UPLOAD_DIR, { recursive: true });
  // Product images are intentionally public (rendered in <img> tags without a token).
  // Filenames are random UUIDs, so URLs are unguessable; keep this route outside
  // the global JWT guard and CORS allowlist.
  app.useStaticAssets(UPLOAD_DIR, { prefix: `${UPLOAD_URL_PREFIX}/` });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableCors({ origin: corsOrigins(), credentials: false });
  app.setGlobalPrefix('api', { exclude: ['health'] });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Warehouse API listening on http://localhost:${port}/api`);
}

bootstrap();
