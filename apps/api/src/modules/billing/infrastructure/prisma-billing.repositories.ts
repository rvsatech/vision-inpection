import { Injectable } from '@nestjs/common';
import type { Plan as PlanRow, Prisma, Subscription as SubRow } from '../../../generated/prisma/client';
import { startOfMonthUtc } from '../../../shared/domain/clock';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { Plan } from '../domain/plan';
import type { TenantUsage } from '../domain/plan-limits.policy';
import type {
  BillingCustomer,
  BillingEventStore,
  PlanRepository,
  SubscriptionRepository,
  TenantBillingLookup,
  UsageReader,
} from '../domain/ports';
import { Subscription } from '../domain/subscription';

const toPlan = (r: PlanRow): Plan => ({
  id: r.id,
  code: r.code,
  name: r.name,
  description: r.description,
  priceCents: r.priceCents,
  currency: r.currency,
  stripePriceId: r.stripePriceId,
  maxUsers: r.maxUsers,
  maxAnalysesPerMonth: r.maxAnalysesPerMonth,
  maxStorageMb: r.maxStorageMb,
  services: r.services,
  isPublic: r.isPublic,
});

const toSub = (r: SubRow) =>
  Subscription.restore({
    id: r.id,
    tenantId: r.tenantId,
    planId: r.planId,
    status: r.status,
    trialEndsAt: r.trialEndsAt,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    canceledAt: r.canceledAt,
    pastDueSince: r.pastDueSince,
    stripeSubscriptionId: r.stripeSubscriptionId,
  });

@Injectable()
export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly prisma: PrismaService) {}
  async listPublic() {
    return (await this.prisma.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: 'asc' } })).map(toPlan);
  }
  async findById(id: string) {
    const r = await this.prisma.plan.findUnique({ where: { id } });
    return r ? toPlan(r) : null;
  }
  async findByCode(code: string) {
    const r = await this.prisma.plan.findUnique({ where: { code } });
    return r ? toPlan(r) : null;
  }
  async findByStripePriceId(priceId: string) {
    const r = await this.prisma.plan.findFirst({ where: { stripePriceId: priceId } });
    return r ? toPlan(r) : null;
  }
}

@Injectable()
export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}
  async findByTenant(tenantId: string) {
    const r = await this.prisma.subscription.findUnique({ where: { tenantId } });
    return r ? toSub(r) : null;
  }
  async findByStripeSubscriptionId(id: string) {
    const r = await this.prisma.subscription.findUnique({ where: { stripeSubscriptionId: id } });
    return r ? toSub(r) : null;
  }
  async findExpirable(now: Date) {
    const rows = await this.prisma.subscription.findMany({
      where: {
        OR: [
          { status: 'TRIALING', trialEndsAt: { lte: now } },
          { status: 'PAST_DUE' },
          { status: 'CANCELED', OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { lte: now } }] },
        ],
      },
      take: 500,
    });
    return rows.map(toSub);
  }
  async save(sub: Subscription) {
    const s = sub.toSnapshot();
    const { id, tenantId, ...rest } = s;
    await this.prisma.subscription.upsert({ where: { id }, create: { id, tenantId, ...rest }, update: rest });
  }
}

@Injectable()
export class PrismaUsageReader implements UsageReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(tenantId: string, now: Date): Promise<TenantUsage> {
    const [activeUsers, analysesThisMonth, tenant] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, status: 'ACTIVE', role: { not: 'PLATFORM_ADMIN' } } }),
      this.prisma.analysis.count({ where: { tenantId, createdAt: { gte: startOfMonthUtc(now) } } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { storageBytesUsed: true } }),
    ]);
    return { activeUsers, analysesThisMonth, storageBytes: Number(tenant?.storageBytesUsed ?? 0) };
  }
}

@Injectable()
export class PrismaBillingEventStore implements BillingEventStore {
  constructor(private readonly prisma: PrismaService) {}
  async exists(eventId: string) {
    return !!(await this.prisma.billingEvent.findUnique({ where: { id: eventId }, select: { id: true } }));
  }
  async save(e: { id: string; tenantId: string | null; type: string; payload: unknown }) {
    await this.prisma.billingEvent.upsert({
      where: { id: e.id },
      create: { id: e.id, tenantId: e.tenantId, type: e.type, payload: e.payload as Prisma.InputJsonValue },
      update: {},
    });
  }
}

@Injectable()
export class PrismaTenantBillingLookup implements TenantBillingLookup {
  constructor(private readonly prisma: PrismaService) {}
  async findTenantIdByCustomer(customerId: string) {
    return (await this.prisma.tenant.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } }))?.id ?? null;
  }
  async setStripeCustomer(tenantId: string, customerId: string) {
    await this.prisma.tenant.updateMany({ where: { id: tenantId, stripeCustomerId: null }, data: { stripeCustomerId: customerId } });
  }
  async getCustomer(tenantId: string, actorUserId: string): Promise<BillingCustomer> {
    const t = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actorUserId } });
    return { tenantId, tenantName: t.name, email: u.email, stripeCustomerId: t.stripeCustomerId };
  }
}
