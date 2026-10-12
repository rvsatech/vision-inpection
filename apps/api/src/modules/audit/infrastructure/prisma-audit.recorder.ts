import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import type { AuditEntry, AuditRecorder } from '../../../shared/application/audit';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

/**
 * Auditoria é "best effort": uma falha ao gravar o log nunca derruba a operação
 * de negócio — mas é registrada no log da aplicação para investigação.
 */
@Injectable()
export class PrismaAuditRecorder implements AuditRecorder {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: e.tenantId,
          actorId: e.actorId,
          action: e.action,
          entityType: e.entityType,
          entityId: e.entityId,
          metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          ip: e.ip,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao registrar auditoria ${e.action}: ${(err as Error).message}`);
    }
  }
}
