import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { ENTITLEMENTS, EntitlementsPort } from '../../../shared/application/entitlements';
import { normalizePaging } from '../../../shared/application/pagination';
import type { Actor } from '../../../shared/domain/auth-context';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { DomainError, forbidden, notFound } from '../../../shared/domain/domain-error';
import { assertStrongPassword } from '../domain/password-policy';
import {
  PASSWORD_HASHER,
  PasswordHasher,
  SESSION_REPOSITORY,
  SessionRepository,
  USER_REPOSITORY,
  UserRepository,
} from '../domain/ports';
import { canAssignRole, Role } from '../domain/role';
import { normalizeEmail, User, UserStatus } from '../domain/user';
import { toPublicUser } from './auth.service';

export interface CreateUserInput {
  email: string;
  name: string;
  role: Role;
  password: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(ENTITLEMENTS) private readonly entitlements: EntitlementsPort,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(actor: Actor, q: { search?: string; role?: Role; status?: UserStatus; page?: number; pageSize?: number }) {
    const paging = normalizePaging(q.page, q.pageSize);
    const res = await this.users.list(actor.tenantId, { ...q, skip: paging.skip, take: paging.take });
    return { items: res.items.map(toPublicUserWithMeta), total: res.total, page: paging.page, pageSize: paging.pageSize };
  }

  async get(actor: Actor, id: string) {
    return toPublicUserWithMeta(await this.load(actor.tenantId, id));
  }

  async create(actor: Actor, input: CreateUserInput) {
    if (!canAssignRole(actor.role, input.role)) throw forbidden('Você não pode criar usuários com este papel.');
    assertStrongPassword(input.password);
    const email = normalizeEmail(input.email);
    if (await this.users.findByEmail(email)) throw new DomainError('CONFLICT', 'Já existe um usuário com este e-mail.');
    await this.entitlements.assertCanAddUser(actor.tenantId);

    const user = User.create(
      { id: randomUUID(), tenantId: actor.tenantId, email, name: input.name, role: input.role, passwordHash: await this.hasher.hash(input.password) },
      this.clock.now(),
    );
    await this.users.save(user);
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ip: actor.ip,
    });
    return toPublicUserWithMeta(user);
  }

  async update(actor: Actor, id: string, input: UpdateUserInput) {
    const user = await this.load(actor.tenantId, id);
    const before = { name: user.name, role: user.role };
    if (input.name !== undefined) {
      if (actor.userId !== user.id && !canManageSelfOrOther(actor.role, user.role)) throw forbidden();
      user.rename(input.name);
    }
    if (input.role !== undefined && input.role !== user.role) {
      if (user.role === 'OWNER') await this.assertNotLastOwner(actor.tenantId);
      user.changeRole({ id: actor.userId, role: actor.role }, input.role);
    }
    await this.users.save(user);
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: before.role !== user.role ? 'user.role_changed' : 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { before, after: { name: user.name, role: user.role } },
      ip: actor.ip,
    });
    return toPublicUserWithMeta(user);
  }

  async deactivate(actor: Actor, id: string) {
    const user = await this.load(actor.tenantId, id);
    if (user.role === 'OWNER') await this.assertNotLastOwner(actor.tenantId);
    user.deactivate({ id: actor.userId, role: actor.role });
    await this.users.save(user);
    await this.sessions.revokeAllForUser(user.id, this.clock.now());
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.userId, action: 'user.deactivated', entityType: 'user', entityId: user.id, ip: actor.ip });
    return toPublicUserWithMeta(user);
  }

  async reactivate(actor: Actor, id: string) {
    const user = await this.load(actor.tenantId, id);
    await this.entitlements.assertCanAddUser(actor.tenantId);
    user.reactivate({ id: actor.userId, role: actor.role });
    await this.users.save(user);
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.userId, action: 'user.reactivated', entityType: 'user', entityId: user.id, ip: actor.ip });
    return toPublicUserWithMeta(user);
  }

  async changeOwnPassword(actor: Actor, current: string, next: string) {
    const user = await this.load(actor.tenantId, actor.userId);
    if (!(await this.hasher.verify(current, user.passwordHash))) throw new DomainError('VALIDATION', 'Senha atual incorreta.');
    assertStrongPassword(next);
    user.changePassword(await this.hasher.hash(next));
    await this.users.save(user);
    await this.sessions.revokeAllForUser(user.id, this.clock.now());
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.userId, action: 'user.password_changed', entityType: 'user', entityId: user.id, ip: actor.ip });
  }

  private async load(tenantId: string, id: string) {
    const user = await this.users.findById(tenantId, id);
    if (!user) throw notFound('Usuário');
    return user;
  }

  private async assertNotLastOwner(tenantId: string) {
    if ((await this.users.countActiveOwners(tenantId)) <= 1) {
      throw new DomainError('INVALID_STATE', 'A empresa precisa de pelo menos um proprietário ativo.');
    }
  }
}

const canManageSelfOrOther = (actor: Role, target: Role) => canAssignRole(actor, target) || actor === 'OWNER';

const toPublicUserWithMeta = (u: User) => {
  const s = u.toSnapshot();
  return { ...toPublicUser(u), lastLoginAt: s.lastLoginAt, createdAt: s.createdAt };
};
