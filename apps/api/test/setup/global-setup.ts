import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PLAN_CATALOG } from '../../prisma/plans';

/**
 * Recria o schema do banco de teste aplicando as migrations SQL versionadas
 * (as mesmas que `prisma migrate deploy` aplica), e insere o catálogo de planos.
 */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST ?? 'postgresql://vision:vision@localhost:5432/vision_test';
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    const dir = join(__dirname, '../../prisma/migrations');
    for (const m of readdirSync(dir).filter((d) => /^\d+_/.test(d)).sort()) {
      await client.query(readFileSync(join(dir, m, 'migration.sql'), 'utf8'));
    }
    for (const p of PLAN_CATALOG) {
      await client.query(
        `INSERT INTO plans (id, code, name, description, "priceCents", "maxUsers", "maxAnalysesPerMonth", "maxStorageMb", services, "sortOrder", "stripePriceId", "updatedAt")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::"VisionService"[], $9, $10, now())`,
        [p.code, p.name, p.description, p.priceCents, p.maxUsers, p.maxAnalysesPerMonth, p.maxStorageMb, p.services, p.sortOrder, p.priceEnv ? process.env[p.priceEnv] || null : null],
      );
    }
  } finally {
    await client.end();
  }
}
