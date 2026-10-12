import { config } from 'dotenv';

config({ path: ['.env', '../../.env'], quiet: true });
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Para migrations use a conexão direta (sem pooler). No Supabase: porta 5432.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
