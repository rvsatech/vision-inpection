import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { normalizePaging } from '../../../shared/application/pagination';
import { startOfMonthUtc } from '../../../shared/domain/clock';
import { notFound } from '../../../shared/domain/domain-error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { VISION_SERVICE_INFO, VISION_SERVICES, VisionServiceCode } from '../domain/vision-service';

const LIST_SELECT = {
  id: true,
  service: true,
  status: true,
  verdict: true,
  headline: true,
  originalName: true,
  sizeBytes: true,
  attempts: true,
  queuedAt: true,
  completedAt: true,
  createdAt: true,
  requestedBy: { select: { id: true, name: true } },
} satisfies Prisma.AnalysisSelect;

/** Lado de leitura do contexto de inspeção: projeções prontas para a UI. */
@Injectable()
export class InspectionQueries {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return VISION_SERVICES.map((code) => ({ code, ...VISION_SERVICE_INFO[code] }));
  }

  async list(tenantId: string, q: { service?: VisionServiceCode; status?: string; verdict?: string; page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const where: Prisma.AnalysisWhereInput = {
      tenantId,
      service: q.service,
      status: q.status as Prisma.AnalysisWhereInput['status'],
      verdict: q.verdict as Prisma.AnalysisWhereInput['verdict'],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.analysis.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take }),
      this.prisma.analysis.count({ where }),
    ]);
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }

  async get(tenantId: string, id: string) {
    const a = await this.prisma.analysis.findFirst({
      where: { id, tenantId },
      select: { ...LIST_SELECT, result: true, failureReason: true, startedAt: true, contentType: true, imageKey: true },
    });
    if (!a) throw notFound('Análise');
    const { imageKey, ...rest } = a;
    return { ...rest, imageAvailable: !!imageKey };
  }

  /** Indicadores do dashboard — mês corrente (UTC) + série dos últimos 14 dias. */
  async dashboard(tenantId: string, now: Date) {
    const monthStart = startOfMonthUtc(now);
    const since = new Date(now.getTime() - 13 * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);

    const [byServiceVerdict, byStatus, recent, daily] = await Promise.all([
      this.prisma.analysis.groupBy({
        by: ['service', 'verdict'],
        where: { tenantId, createdAt: { gte: monthStart } },
        _count: { _all: true },
      }),
      this.prisma.analysis.groupBy({ by: ['status'], where: { tenantId, createdAt: { gte: monthStart } }, _count: { _all: true } }),
      this.prisma.analysis.findMany({ where: { tenantId }, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, take: 6 }),
      this.prisma.$queryRaw<Array<{ day: Date; total: bigint; failed: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day,
               count(*) AS total,
               count(*) FILTER (WHERE verdict = 'FAIL') AS failed
          FROM analyses
         WHERE "tenantId" = ${tenantId}::uuid AND "createdAt" >= ${since}
         GROUP BY 1 ORDER BY 1`,
    ]);

    const services = VISION_SERVICES.map((code) => {
      const rows = byServiceVerdict.filter((r) => r.service === code);
      const count = (v: string | null) => rows.filter((r) => r.verdict === v).reduce((a, r) => a + r._count._all, 0);
      const total = rows.reduce((a, r) => a + r._count._all, 0);
      const pass = count('PASS');
      const fail = count('FAIL');
      return {
        code,
        name: VISION_SERVICE_INFO[code].name,
        total,
        pass,
        fail,
        conformityRate: pass + fail > 0 ? Math.round((pass / (pass + fail)) * 1000) / 10 : null,
      };
    });
    const totals = services.reduce((a, s) => ({ total: a.total + s.total, pass: a.pass + s.pass, fail: a.fail + s.fail }), { total: 0, pass: 0, fail: 0 });
    const dayMap = new Map(daily.map((d) => [d.day.toISOString().slice(0, 10), d]));
    const series = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const d = dayMap.get(day);
      return { day, total: Number(d?.total ?? 0), failed: Number(d?.failed ?? 0) };
    });

    return {
      period: { from: monthStart, to: now },
      totals: {
        ...totals,
        conformityRate: totals.pass + totals.fail > 0 ? Math.round((totals.pass / (totals.pass + totals.fail)) * 1000) / 10 : null,
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      },
      services,
      series,
      recent,
    };
  }
}
