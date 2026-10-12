import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import type { Actor } from '../../../../shared/domain/auth-context';
import { CurrentActor, RequirePermissions } from '../../../../shared/interfaces/http/decorators';
import { AuditQueryService } from '../../application/audit-query.service';

class AuditQuery {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@CurrentActor() actor: Actor, @Query() q: AuditQuery) {
    return this.audit.list(actor.tenantId, q);
  }
}
