import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { normalizePaging } from '../../../shared/application/pagination';
import type { Actor } from '../../../shared/domain/auth-context';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { DomainError, notFound } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { PLAN_REPOSITORY, PlanRepository } from '../../billing/domain/ports';
import { Subscription } from '../../billing/domain/subscription';
import { assertStrongPassword } from '../../identity/domain/password-policy';
import { PASSWORD_HASHER, PasswordHasher } from '../../identity/domain/ports';
import { normalizeEmail, User } from '../../identity/domain/user';
import { normalizeCompanyName, normalizeDocument, slugify } from '../domain/tenant';

export interface SignupInput {
  companyName: string;
  document?: string;
  segment?: string;
  ownerName: string;
  email: string;
  password: string;
  planCode?: string;
}

/**
 * Casos de uso do contexto de tenancy.
 * O cadastro cria empresa + proprietário + assinatura em trial numa única transação:
 * as regras vêm das entidades de cada contexto, a atomicidade vem do Prisma.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'TRIAL_DAYS'>,
  ) {}

  async signup(input: SignupInput, ip?: string) {
    const now = this.clock.now();
    const name = normalizeCompanyName(input.companyName);
    const document = normalizeDocument(input.document);
    assertStrongPassword(input.password);
    const email = normalizeEmail(input.email);
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new DomainError('CONFLICT', 'Este e-mail já está cadastrado. Faça login ou recupere o acesso.');
    }
    const plan = await this.plans.findByCode(input.planCode ?? 'PRO');
    if (!plan || !plan.isPublic) throw notFound('Plano');

    const tenantId = randomUUID();
    const owner = User.create(
      { id: randomUUID(), tenantId, email, name: input.ownerName, role: 'OWNER', passwordHash: await this.hasher.hash(input.password) },
      now,
    );
    const sub = Subscription.startTrial({ id: randomUUID(), tenantId, planId: plan.id }, now, this.env.TRIAL_DAYS);
    const slug = await this.uniqueSlug(slugify(name) || 'empresa');

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.create({ data: { id: tenantId, name, slug, document, segment: input.segment } });
      await tx.user.create({ data: { ...owner.toSnapshot() } });
      const { id, ...s } = sub.toSnapshot();
      await tx.subscription.create({ data: { id, ...s } });
    });

    await this.audit.record({
      tenantId,
      actorId: owner.id,
      action: 'tenant.created',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { plan: plan.code, trialDays: this.env.TRIAL_DAYS },
      ip,
    });
    return { tenantId, ownerId: owner.id };
  }

  async getCompany(tenantId: string) {
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw notFound('Empresa');
    return { id: t.id, name: t.name, slug: t.slug, document: t.document, segment: t.segment, status: t.status, createdAt: t.createdAt };
  }

  async updateCompany(actor: Actor, input: { name?: string; document?: string | null; segment?: string | null }) {
    const data: { name?: string; document?: string | null; segment?: string | null } = {};
    if (input.name !== undefined) data.name = normalizeCompanyName(input.name);
    if (input.document !== undefined) data.document = normalizeDocument(input.document);
    if (input.segment !== undefined) data.segment = input.segment;
    await this.prisma.tenant.update({ where: { id: actor.tenantId }, data });
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.userId, action: 'tenant.updated', entityType: 'tenant', entityId: actor.tenantId, metadata: data, ip: actor.ip });
    return this.getCompany(actor.tenantId);
  }

  /** Painel da plataforma: todas as empresas com assinatura e uso. */
  async listTenants(q: { search?: string; page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const where = q.search ? { name: { contains: q.search, mode: 'insensitive' as const } } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.tenant.findMany({
        where,
        include: {
          subscription: { include: { plan: { select: { code: true, name: true } } } },
          _count: { select: { users: true, analyses: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return {
      items: rows.map((t) => ({ ...t, storageBytesUsed: Number(t.storageBytesUsed) })),
      total,
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }

  async setTenantStatus(actor: Actor, tenantId: string, status: 'ACTIVE' | 'SUSPENDED') {
    if (tenantId === actor.tenantId) throw new DomainError('FORBIDDEN', 'Não é possível suspender a própria organização.');
    const t = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!t) throw notFound('Empresa');
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { status } });
    if (status === 'SUSPENDED') {
      await this.prisma.refreshSession.updateMany({ where: { user: { tenantId }, revokedAt: null }, data: { revokedAt: this.clock.now() } });
    }
    await this.audit.record({ tenantId, actorId: actor.userId, action: status === 'SUSPENDED' ? 'tenant.suspended' : 'tenant.reactivated', entityType: 'tenant', entityId: tenantId, ip: actor.ip });
    return { id: tenantId, status };
  }

  private async uniqueSlug(base: string) {
    let slug = base;
    for (let i = 2; await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${base}-${i}`;
    return slug;
  }
}
