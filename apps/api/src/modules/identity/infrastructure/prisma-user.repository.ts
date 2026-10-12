import { Injectable } from '@nestjs/common';
import type { Prisma, User as UserRow } from '../../../generated/prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { UserListFilter, UserRepository } from '../domain/ports';
import { User } from '../domain/user';

export const toDomainUser = (r: UserRow) =>
  User.restore({
    id: r.id,
    tenantId: r.tenantId,
    email: r.email,
    name: r.name,
    passwordHash: r.passwordHash,
    role: r.role,
    status: r.status,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  });

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(tenantId: string, id: string) {
    const r = await this.prisma.user.findFirst({ where: { id, tenantId } });
    return r ? toDomainUser(r) : null;
  }

  async findByEmail(email: string) {
    const r = await this.prisma.user.findUnique({ where: { email } });
    return r ? toDomainUser(r) : null;
  }

  async list(tenantId: string, f: UserListFilter) {
    const where: Prisma.UserWhereInput = {
      tenantId,
      role: f.role ?? { not: 'PLATFORM_ADMIN' },
      status: f.status,
      ...(f.search
        ? { OR: [{ name: { contains: f.search, mode: 'insensitive' } }, { email: { contains: f.search, mode: 'insensitive' } }] }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy: [{ status: 'asc' }, { name: 'asc' }], skip: f.skip, take: f.take }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toDomainUser), total };
  }

  countActive(tenantId: string) {
    return this.prisma.user.count({ where: { tenantId, status: 'ACTIVE', role: { not: 'PLATFORM_ADMIN' } } });
  }

  countActiveOwners(tenantId: string) {
    return this.prisma.user.count({ where: { tenantId, status: 'ACTIVE', role: 'OWNER' } });
  }

  async save(user: User) {
    const s = user.toSnapshot();
    await this.prisma.user.upsert({
      where: { id: s.id },
      create: { ...s },
      update: { name: s.name, role: s.role, status: s.status, passwordHash: s.passwordHash, lastLoginAt: s.lastLoginAt },
    });
  }
}
