import { Injectable } from '@nestjs/common';
import type { Analysis as AnalysisRow, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Analysis, InferenceResult } from '../domain/analysis';
import type { AnalysisRepository, TenantStorageCounter } from '../domain/ports';

const toDomain = (r: AnalysisRow) =>
  Analysis.restore({
    id: r.id,
    tenantId: r.tenantId,
    requestedById: r.requestedById,
    service: r.service,
    status: r.status,
    imageStorage: r.imageStorage,
    imageKey: r.imageKey,
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    originalName: r.originalName,
    attempts: r.attempts,
    verdict: r.verdict,
    headline: r.headline,
    result: (r.result as unknown as InferenceResult | null) ?? null,
    failureReason: r.failureReason,
    queuedAt: r.queuedAt,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
  });

@Injectable()
export class PrismaAnalysisRepository implements AnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string) {
    const r = await this.prisma.analysis.findFirst({ where: { id, tenantId } });
    return r ? toDomain(r) : null;
  }

  async findByIdUnscoped(id: string) {
    const r = await this.prisma.analysis.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }

  async findStale(queuedBefore: Date, processingBefore: Date, maxAttempts: number, limit: number) {
    const rows = await this.prisma.analysis.findMany({
      where: {
        attempts: { lt: maxAttempts },
        OR: [
          { status: 'QUEUED', queuedAt: { lt: queuedBefore } },
          { status: 'PROCESSING', startedAt: { lt: processingBefore } },
        ],
      },
      orderBy: { queuedAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async findWithImagesOlderThan(date: Date, limit: number) {
    const rows = await this.prisma.analysis.findMany({
      where: { createdAt: { lt: date }, imageKey: { not: '' }, status: { in: ['COMPLETED', 'FAILED'] } },
      take: limit,
    });
    return rows.map(toDomain);
  }

  async save(a: Analysis) {
    const { id, result, ...rest } = a.toSnapshot();
    const data = { ...rest, result: (result ?? undefined) as Prisma.InputJsonValue | undefined };
    await this.prisma.analysis.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
}

@Injectable()
export class PrismaTenantStorageCounter implements TenantStorageCounter {
  constructor(private readonly prisma: PrismaService) {}
  async add(tenantId: string, bytes: number) {
    await this.prisma.$executeRaw`UPDATE tenants SET "storageBytesUsed" = GREATEST(0, "storageBytesUsed" + ${bytes}) WHERE id = ${tenantId}::uuid`;
  }
}
