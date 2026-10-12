import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { Clock, CLOCK, addDays } from '../../../shared/domain/clock';
import { DomainError } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import {
  PASSWORD_HASHER,
  PasswordHasher,
  SESSION_REPOSITORY,
  SessionRecord,
  SessionRepository,
  TOKEN_SERVICE,
  TokenService,
  USER_REPOSITORY,
  UserRepository,
} from '../domain/ports';
import { normalizeEmail, User } from '../domain/user';
import { TENANT_GATE, TenantGate } from './tenant-gate';

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  user: ReturnType<typeof toPublicUser>;
}

export const toPublicUser = (u: User) => ({
  id: u.id,
  tenantId: u.tenantId,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
});

const invalidCredentials = () => new DomainError('UNAUTHORIZED', 'E-mail ou senha inválidos.');
const invalidSession = () => new DomainError('UNAUTHORIZED', 'Sessão inválida ou expirada. Faça login novamente.');

/**
 * Autenticação com access token JWT curto + refresh token opaco rotativo.
 *
 * - Refresh tokens são guardados apenas como hash (SHA-256).
 * - Cada uso gera um novo token na mesma "família" e revoga o anterior.
 * - Reuso de um token já revogado indica roubo: a família inteira é revogada.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(TENANT_GATE) private readonly tenants: TenantGate,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'JWT_ACCESS_TTL_SECONDS' | 'REFRESH_TTL_DAYS'>,
  ) {}

  async login(email: string, password: string, ctx: RequestContext): Promise<IssuedTokens> {
    const user = await this.users.findByEmail(normalizeEmail(email));
    // Compara mesmo quando o usuário não existe, para não vazar timing.
    const ok = await this.hasher.verify(password, user?.passwordHash ?? (await this.dummyHash()));
    if (!user || !ok) {
      await this.audit.record({
        tenantId: user?.tenantId ?? null,
        actorId: user?.id ?? null,
        action: 'auth.login_failed',
        metadata: { email: normalizeEmail(email) },
        ip: ctx.ip,
      });
      throw invalidCredentials();
    }
    if (!user.isActive) throw new DomainError('UNAUTHORIZED', 'Usuário desativado. Fale com o administrador da empresa.');
    if (!(await this.tenants.isActive(user.tenantId))) {
      throw new DomainError('UNAUTHORIZED', 'A conta da empresa está suspensa.');
    }

    user.recordLogin(this.clock.now());
    await this.users.save(user);
    const issued = await this.issue(user, randomUUID(), ctx);
    await this.audit.record({ tenantId: user.tenantId, actorId: user.id, action: 'auth.login', ip: ctx.ip });
    return issued;
  }

  async refresh(rawToken: string | undefined, ctx: RequestContext): Promise<IssuedTokens> {
    if (!rawToken) throw invalidSession();
    const now = this.clock.now();
    const session = await this.sessions.findByTokenHash(this.tokens.hashRefresh(rawToken));
    if (!session) throw invalidSession();

    if (session.revokedAt) {
      // Token já rotacionado sendo reapresentado → possível vazamento.
      await this.sessions.revokeFamily(session.familyId, now);
      await this.audit.record({
        tenantId: null,
        actorId: session.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'session',
        entityId: session.familyId,
        ip: ctx.ip,
      });
      throw invalidSession();
    }
    if (session.expiresAt <= now) throw invalidSession();

    const user = await this.findUserForSession(session);
    if (!user || !user.isActive || !(await this.tenants.isActive(user.tenantId))) {
      await this.sessions.revokeFamily(session.familyId, now);
      throw invalidSession();
    }

    await this.sessions.revoke(session.id, now);
    return this.issue(user, session.familyId, ctx);
  }

  async logout(rawToken: string | undefined, actorId?: string, ip?: string): Promise<void> {
    if (!rawToken) return;
    const session = await this.sessions.findByTokenHash(this.tokens.hashRefresh(rawToken));
    if (!session) return;
    await this.sessions.revokeFamily(session.familyId, this.clock.now());
    await this.audit.record({ tenantId: null, actorId: actorId ?? session.userId, action: 'auth.logout', ip });
  }

  async listSessions(userId: string) {
    const list = await this.sessions.listActive(userId, this.clock.now());
    return list.map((s) => ({
      id: s.id,
      familyId: s.familyId,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const s = await this.sessions.findById(sessionId);
    if (!s || s.userId !== userId) throw new DomainError('NOT_FOUND', 'Sessão não encontrada.');
    await this.sessions.revokeFamily(s.familyId, this.clock.now());
    await this.audit.record({ tenantId: null, actorId: userId, action: 'auth.session_revoked', entityType: 'session', entityId: s.familyId });
  }

  async me(tenantId: string, userId: string) {
    const user = await this.users.findById(tenantId, userId);
    if (!user) throw new DomainError('UNAUTHORIZED', 'Usuário não encontrado.');
    return toPublicUser(user);
  }

  private dummy?: Promise<string>;
  /** Hash descartável para equalizar o tempo de resposta quando o e-mail não existe. */
  private dummyHash(): Promise<string> {
    this.dummy ??= this.hasher.hash(randomUUID());
    return this.dummy;
  }

  private async findUserForSession(session: SessionRecord): Promise<User | null> {
    return this.tenants.findUserById(session.userId);
  }

  private async issue(user: User, familyId: string, ctx: RequestContext): Promise<IssuedTokens> {
    const now = this.clock.now();
    const refresh = this.tokens.generateRefresh();
    const expiresAt = addDays(now, this.env.REFRESH_TTL_DAYS);
    await this.sessions.create({
      id: randomUUID(),
      userId: user.id,
      familyId,
      tokenHash: refresh.hash,
      userAgent: ctx.userAgent?.slice(0, 255) ?? null,
      ip: ctx.ip ?? null,
      expiresAt,
    });
    const accessToken = await this.tokens.signAccess({ sub: user.id, tid: user.tenantId, role: user.role });
    return {
      accessToken,
      accessTokenExpiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      refreshToken: refresh.raw,
      refreshTokenExpiresAt: expiresAt,
      user: toPublicUser(user),
    };
  }
}

