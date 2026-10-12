import { Global, Module } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../shared/application/audit';
import { AuditQueryService } from './application/audit-query.service';
import { PrismaAuditRecorder } from './infrastructure/prisma-audit.recorder';
import { AuditController } from './interfaces/http/audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditQueryService, { provide: AUDIT_RECORDER, useClass: PrismaAuditRecorder }],
  exports: [AUDIT_RECORDER, AuditQueryService],
})
export class AuditModule {}
