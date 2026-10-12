import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { normalizePaging } from '../../../shared/application/pagination';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

/** Consultas do painel administrativo da plataforma (somente leitura). */
@Injectable()
export class BillingAdminQuery {
  constructor(private readonly prisma: PrismaService) {}

  async subscriptions(q: { status?: string; page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const where: Prisma.SubscriptionWhereInput = q.status ? { status: q.status as Prisma.EnumSubscriptionStatusFilter['equals'] } : {};
    const [rows, total, byStatus] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: { plan: { select: { code: true, name: true, priceCents: true } }, tenant: { select: { id: true, name: true, slug: true, status: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    ]);
    const mrrCents = await this.prisma.subscription
      .findMany({ where: { status: 'ACTIVE' }, select: { plan: { select: { priceCents: true } } } })
      .then((s) => s.reduce((acc, x) => acc + x.plan.priceCents, 0));
    return {
      items: rows,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      summary: { byStatus: Object.fromEntries(byStatus.map((b) => [b.status, (b._count as { _all: number })._all])), mrrCents },
    };
  }

  async events(q: { page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.billingEvent.findMany({ orderBy: { processedAt: 'desc' }, skip: paging.skip, take: paging.take }),
      this.prisma.billingEvent.count(),
    ]);
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }
}
