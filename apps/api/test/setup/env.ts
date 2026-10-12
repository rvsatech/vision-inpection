import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Ambiente dos testes de integração. Sobrescreva via variáveis no CI.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgresql://vision:vision@localhost:5432/vision_test';
process.env.REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/15';
process.env.JWT_ACCESS_SECRET = 'test-secret-with-enough-length-for-hs256-signing';
process.env.INTERNAL_API_TOKEN = 'test-internal-token';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = join(tmpdir(), 'vision-inspect-test-storage');
process.env.BCRYPT_ROUNDS = '4';
process.env.STRIPE_PRICE_STARTER = process.env.STRIPE_PRICE_STARTER ?? '';
process.env.STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO ?? '';
