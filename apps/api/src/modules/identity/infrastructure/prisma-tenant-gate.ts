import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { TenantGate } from '../application/tenant-gate';
import { toDomainUser } from './prisma-user.repository';

@Injectable()
export class PrismaTenantGate implements TenantGate {
  constructor(private readonly prisma: PrismaService) {}

  async isActive(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
    return t?.status === 'ACTIVE';
  }

  async findUserById(userId: string) {
    const r = await this.prisma.user.findUnique({ where: { id: userId } });
    return r ? toDomainUser(r) : null;
  }
}
