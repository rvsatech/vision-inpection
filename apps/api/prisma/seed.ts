/**
 * Seed de desenvolvimento/demonstração.
 *   npm run prisma:seed -w apps/api
 *
 * Cria: catálogo de planos, organização da plataforma (admin), e a empresa
 * demo "Metalúrgica Horizonte" com usuários de cada papel e análises de exemplo
 * (imagens sintéticas + resultados reais do pipeline de visão).
 * Idempotente: pode rodar várias vezes.
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { config } from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import { PLAN_CATALOG } from './plans';

config({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
// Senhas padrão servem só para desenvolvimento local. Em produção é obrigatório
// definir SEED_ADMIN_PASSWORD (a conta PLATFORM_ADMIN controla toda a plataforma).
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || (IS_PROD ? '' : 'Plataforma@2026');
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Horizonte@2026';
if (!ADMIN_PASSWORD) {
  console.error('Em produção defina SEED_ADMIN_PASSWORD (forte e exclusiva) antes de rodar o seed.');
  process.exit(1);
}
const day = 86_400_000;

async function upsertPlans() {
  for (const p of PLAN_CATALOG) {
    const stripePriceId = p.priceEnv ? process.env[p.priceEnv] || null : null;
    const data = {
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      maxUsers: p.maxUsers,
      maxAnalysesPerMonth: p.maxAnalysesPerMonth,
      maxStorageMb: p.maxStorageMb,
      services: [...p.services],
      sortOrder: p.sortOrder,
      stripePriceId,
    };
    await prisma.plan.upsert({ where: { code: p.code }, create: { code: p.code, ...data }, update: data });
  }
  return Object.fromEntries((await prisma.plan.findMany()).map((p) => [p.code, p]));
}

async function upsertTenant(slug: string, data: { name: string; document?: string; segment?: string }) {
  return prisma.tenant.upsert({ where: { slug }, create: { slug, ...data }, update: data });
}

async function upsertUser(tenantId: string, email: string, name: string, role: Prisma.UserCreateInput['role'], password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    create: { tenantId, email, name, role, passwordHash },
    update: { tenantId, name, role, passwordHash, status: 'ACTIVE' },
  });
}

async function seedAnalyses(tenantId: string, requestedById: string) {
  const samplesDir = resolve(__dirname, '../../../services/vision/samples');
  const resultsFile = join(samplesDir, 'results.json');
  if (!existsSync(resultsFile)) {
    console.warn('• samples/results.json não encontrado — análises de exemplo não criadas.');
    return 0;
  }
  if ((await prisma.analysis.count({ where: { tenantId } })) > 0) return 0;

  const storageDir = resolve(process.env.STORAGE_DIR ?? '../../storage');
  const results: Record<string, Record<string, unknown> & { service: 'QUALITY_DEFECT' | 'PPE_COMPLIANCE' | 'OBJECT_COUNT'; summary: { verdict: 'PASS' | 'FAIL' | 'INFO'; headline: string } }> =
    JSON.parse(readFileSync(resultsFile, 'utf8'));
  const files = Object.keys(results);
  let total = 0;
  let bytes = 0;
  // ~3 rodadas das 18 imagens espalhadas nos últimos 13 dias
  for (let round = 0; round < 3; round++) {
    for (const [i, file] of files.entries()) {
      const r = results[file];
      // não conformidades aparecem só na 1ª rodada → taxa de conformidade realista (~75%)
      if (r.summary.verdict === 'FAIL' && round > 0) continue;
      const id = randomUUID();
      const key = `${tenantId}/${id}.jpg`;
      mkdirSync(join(storageDir, tenantId), { recursive: true });
      copyFileSync(join(samplesDir, file), join(storageDir, key));
      const size = statSync(join(samplesDir, file)).size;
      const createdAt = new Date(Date.now() - ((i * 7 + round * 31) % 13) * day - (i % 9) * 3_600_000);
      await prisma.analysis.create({
        data: {
          id,
          tenantId,
          requestedById,
          service: r.service,
          status: 'COMPLETED',
          imageStorage: 'local',
          imageKey: key,
          contentType: 'image/jpeg',
          sizeBytes: size,
          originalName: file.replace('_', '-linha-'),
          attempts: 1,
          verdict: r.summary.verdict,
          headline: r.summary.headline,
          result: { analysisId: id, ...r } as Prisma.InputJsonValue,
          queuedAt: createdAt,
          startedAt: new Date(createdAt.getTime() + 800),
          completedAt: new Date(createdAt.getTime() + 2100),
          createdAt,
        },
      });
      total++;
      bytes += size;
    }
  }
  await prisma.tenant.update({ where: { id: tenantId }, data: { storageBytesUsed: { increment: bytes } } });
  return total;
}

async function main() {
  const plans = await upsertPlans();
  const now = Date.now();

  const platform = await upsertTenant('vision-inspect', { name: 'Vision Inspect (plataforma)', segment: 'Outro' });
  await prisma.subscription.upsert({
    where: { tenantId: platform.id },
    create: { tenantId: platform.id, planId: plans.ENTERPRISE.id, status: 'ACTIVE', currentPeriodStart: new Date(now), currentPeriodEnd: new Date(now + 3650 * day) },
    update: {},
  });
  await upsertUser(platform.id, 'admin@visioninspect.com.br', 'Equipe Vision Inspect', 'PLATFORM_ADMIN', ADMIN_PASSWORD);

  const demo = await upsertTenant('metalurgica-horizonte', { name: 'Metalúrgica Horizonte Ltda.', document: '11.222.333/0001-81', segment: 'Metalurgia' });
  await prisma.subscription.upsert({
    where: { tenantId: demo.id },
    create: { tenantId: demo.id, planId: plans.PRO.id, status: 'TRIALING', trialEndsAt: new Date(now + 9 * day), currentPeriodStart: new Date(now - 5 * day), currentPeriodEnd: new Date(now + 9 * day) },
    update: {},
  });
  const owner = await upsertUser(demo.id, 'carla@horizonte.ind.br', 'Carla Mendes', 'OWNER', DEMO_PASSWORD);
  await upsertUser(demo.id, 'rafael@horizonte.ind.br', 'Rafael Souza', 'ADMIN', DEMO_PASSWORD);
  const inspector = await upsertUser(demo.id, 'juliana@horizonte.ind.br', 'Juliana Prado', 'OPERATOR', DEMO_PASSWORD);
  await upsertUser(demo.id, 'marcos@horizonte.ind.br', 'Marcos Lima', 'VIEWER', DEMO_PASSWORD);

  const created = await seedAnalyses(demo.id, inspector.id);
  await prisma.auditLog.create({ data: { tenantId: demo.id, actorId: owner.id, action: 'tenant.created', entityType: 'tenant', entityId: demo.id, metadata: { source: 'seed' } } });

  console.log(`
✔ Seed concluído (${created} análises de exemplo)

  Plataforma (admin)   admin@visioninspect.com.br  / ${process.env.SEED_ADMIN_PASSWORD ? '(definida em SEED_ADMIN_PASSWORD)' : ADMIN_PASSWORD}
  Demo — proprietária  carla@horizonte.ind.br      / ${DEMO_PASSWORD}
  Demo — admin         rafael@horizonte.ind.br     / ${DEMO_PASSWORD}
  Demo — inspetora     juliana@horizonte.ind.br    / ${DEMO_PASSWORD}
  Demo — leitura       marcos@horizonte.ind.br     / ${DEMO_PASSWORD}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
