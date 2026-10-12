import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { APP_ENV, AppEnv } from './shared/infrastructure/config/env';

/** Configuração HTTP compartilhada entre main.ts e os testes de integração. */
export function configureApp(app: INestApplication) {
  const env = app.get<AppEnv>(APP_ENV);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  // Atrás de proxy (Next.js rewrites / Render / Fly): req.ip passa a vir do X-Forwarded-For.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  return env;
}
