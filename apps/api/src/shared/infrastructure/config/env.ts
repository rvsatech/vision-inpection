/**
 * Configuração tipada e validada na inicialização. Falha cedo, com mensagem
 * clara, em vez de quebrar em runtime no meio de uma requisição.
 */
export interface AppEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  APP_URL: string;
  CORS_ORIGINS: string[];
  DATABASE_URL: string;
  REDIS_URL: string;
  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TTL_DAYS: number;
  COOKIE_SECURE: boolean;
  COOKIE_SAMESITE: 'lax' | 'strict' | 'none';
  INTERNAL_API_TOKEN: string;
  STORAGE_DRIVER: 'local' | 'supabase';
  STORAGE_DIR: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_BUCKET: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_STARTER?: string;
  STRIPE_PRICE_PRO?: string;
  TRIAL_DAYS: number;
  PAST_DUE_GRACE_DAYS: number;
  ANALYSIS_MAX_ATTEMPTS: number;
  ANALYSIS_MAX_FILE_MB: number;
  FILE_RETENTION_DAYS: number;
}

const str = (env: NodeJS.ProcessEnv, key: string, fallback?: string): string => {
  const v = env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Variável de ambiente obrigatória ausente: ${key}`);
  return v;
};
const int = (env: NodeJS.ProcessEnv, key: string, fallback: number) => {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${key} deve ser numérico`);
  return n;
};
const bool = (env: NodeJS.ProcessEnv, key: string, fallback: boolean) =>
  env[key] === undefined ? fallback : ['1', 'true', 'yes'].includes(String(env[key]).toLowerCase());

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  const NODE_ENV = (env.NODE_ENV ?? 'development') as AppEnv['NODE_ENV'];
  const secret = str(env, 'JWT_ACCESS_SECRET');
  if (NODE_ENV === 'production') {
    if (secret.length < 32) throw new Error('JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres em produção');
    // Valores de exemplo do .env.example nunca podem ir para produção.
    for (const key of ['JWT_ACCESS_SECRET', 'INTERNAL_API_TOKEN']) {
      if (/troque|change-?me|dev-internal|example/i.test(env[key] ?? '')) {
        throw new Error(`${key} ainda está com o valor de exemplo. Gere um valor aleatório para produção.`);
      }
    }
  }
  const stripeKey = env.STRIPE_SECRET_KEY || undefined;
  if (stripeKey && !/^(sk|rk)_test_/.test(stripeKey)) {
    throw new Error('Somente chaves de TESTE do Stripe (sk_test_/rk_test_) são aceitas neste ambiente.');
  }
  return {
    NODE_ENV,
    PORT: int(env, 'PORT', 4000),
    APP_URL: str(env, 'APP_URL', 'http://localhost:3000'),
    CORS_ORIGINS: str(env, 'CORS_ORIGINS', 'http://localhost:3000').split(',').map((s) => s.trim()),
    DATABASE_URL: str(env, 'DATABASE_URL'),
    REDIS_URL: str(env, 'REDIS_URL', 'redis://localhost:6379'),
    JWT_ACCESS_SECRET: secret,
    JWT_ACCESS_TTL_SECONDS: int(env, 'JWT_ACCESS_TTL_SECONDS', 900),
    REFRESH_TTL_DAYS: int(env, 'REFRESH_TTL_DAYS', 7),
    COOKIE_SECURE: bool(env, 'COOKIE_SECURE', NODE_ENV === 'production'),
    COOKIE_SAMESITE: (env.COOKIE_SAMESITE as AppEnv['COOKIE_SAMESITE']) ?? 'lax',
    INTERNAL_API_TOKEN: str(env, 'INTERNAL_API_TOKEN'),
    STORAGE_DRIVER: (env.STORAGE_DRIVER as AppEnv['STORAGE_DRIVER']) ?? 'local',
    STORAGE_DIR: str(env, 'STORAGE_DIR', '../../storage'),
    SUPABASE_URL: env.SUPABASE_URL || undefined,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    SUPABASE_BUCKET: env.SUPABASE_BUCKET || 'inspections',
    STRIPE_SECRET_KEY: stripeKey,
    STRIPE_PRICE_STARTER: env.STRIPE_PRICE_STARTER || undefined,
    STRIPE_PRICE_PRO: env.STRIPE_PRICE_PRO || undefined,
    TRIAL_DAYS: int(env, 'TRIAL_DAYS', 14),
    PAST_DUE_GRACE_DAYS: int(env, 'PAST_DUE_GRACE_DAYS', 7),
    ANALYSIS_MAX_ATTEMPTS: int(env, 'ANALYSIS_MAX_ATTEMPTS', 3),
    ANALYSIS_MAX_FILE_MB: int(env, 'ANALYSIS_MAX_FILE_MB', 10),
    FILE_RETENTION_DAYS: int(env, 'FILE_RETENTION_DAYS', 90),
  };
}

export const APP_ENV = Symbol('APP_ENV');
