import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { normalizePaging } from '../../../shared/application/pagination';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

/** Leitura (lado "query" do CQRS leve): consulta direta, sem passar por entidades. */
@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string | null, q: { action?: string; page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const where: Prisma.AuditLogWhereInput = {
      ...(tenantId ? { tenantId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: paging.skip, take: paging.take }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
    const byId = new Map(actors.map((a) => [a.id, a]));
    return {
      items: rows.map((r) => ({ ...r, actor: r.actorId ? (byId.get(r.actorId) ?? null) : null })),
      total,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }
}
