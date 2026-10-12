import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { SessionRecord, SessionRepository } from '../domain/ports';

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Omit<SessionRecord, 'createdAt' | 'lastUsedAt' | 'revokedAt'>) {
    return this.prisma.refreshSession.create({ data });
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.refreshSession.findUnique({ where: { tokenHash } });
  }

  findById(id: string) {
    return this.prisma.refreshSession.findUnique({ where: { id } });
  }

  async revoke(id: string, at: Date) {
    await this.prisma.refreshSession.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: at, lastUsedAt: at } });
  }

  async revokeFamily(familyId: string, at: Date) {
    await this.prisma.refreshSession.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } });
  }

  async revokeAllForUser(userId: string, at: Date) {
    await this.prisma.refreshSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: at } });
  }

  listActive(userId: string, now: Date) {
    return this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
