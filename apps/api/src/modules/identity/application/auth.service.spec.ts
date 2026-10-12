import { createHash } from 'node:crypto';
import type { AuditEntry } from '../../../shared/application/audit';
import type { PasswordHasher, SessionRecord, SessionRepository, TokenService, UserRepository } from '../domain/ports';
import { User } from '../domain/user';
import { AuthService } from './auth.service';
import type { TenantGate } from './tenant-gate';

/** Fakes em memória: testam o caso de uso sem banco, sem HTTP. */
class MemSessions implements SessionRepository {
  rows: SessionRecord[] = [];
  async create(d: Omit<SessionRecord, 'createdAt' | 'lastUsedAt' | 'revokedAt'>) {
    const r = { ...d, createdAt: new Date(), lastUsedAt: new Date(), revokedAt: null };
    this.rows.push(r);
    return r;
  }
  async findByTokenHash(h: string) { return this.rows.find((r) => r.tokenHash === h) ?? null; }
  async findById(id: string) { return this.rows.find((r) => r.id === id) ?? null; }
  async revoke(id: string, at: Date) { this.rows.filter((r) => r.id === id && !r.revokedAt).forEach((r) => (r.revokedAt = at)); }
  async revokeFamily(f: string, at: Date) { this.rows.filter((r) => r.familyId === f && !r.revokedAt).forEach((r) => (r.revokedAt = at)); }
  async revokeAllForUser(u: string, at: Date) { this.rows.filter((r) => r.userId === u && !r.revokedAt).forEach((r) => (r.revokedAt = at)); }
  async listActive(u: string, now: Date) { return this.rows.filter((r) => r.userId === u && !r.revokedAt && r.expiresAt > now); }
}

const hasher: PasswordHasher = { hash: async (p) => `h:${p}`, verify: async (p, h) => h === `h:${p}` };
let counter = 0;
const tokens: TokenService = {
  signAccess: async (c) => `access:${c.sub}`,
  verifyAccess: async () => { throw new Error('n/a'); },
  generateRefresh: () => { const raw = `rt-${++counter}`; return { raw, hash: createHash('sha256').update(raw).digest('hex') }; },
  hashRefresh: (raw) => createHash('sha256').update(raw).digest('hex'),
};

function setup(opts: { tenantActive?: boolean; userActive?: boolean } = {}) {
  let now = new Date('2026-10-01T12:00:00Z');
  const user = User.create({ id: 'u1', tenantId: 't1', email: 'ana@acme.com', name: 'Ana', role: 'ADMIN', passwordHash: 'h:Senha12345' }, now);
  if (opts.userActive === false) user.deactivate({ id: 'other', role: 'OWNER' });
  const users: UserRepository = {
    findById: async () => user,
    findByEmail: async (e) => (e === user.email ? user : null),
    list: async () => ({ items: [], total: 0 }),
    countActive: async () => 1,
    countActiveOwners: async () => 1,
    save: async () => undefined,
  };
  const gate: TenantGate = { isActive: async () => opts.tenantActive ?? true, findUserById: async () => user };
  const audit: AuditEntry[] = [];
  const sessions = new MemSessions();
  const svc = new AuthService(users, sessions, hasher, tokens, gate, { record: async (e) => void audit.push(e) }, { now: () => now }, {
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TTL_DAYS: 7,
  });
  return { svc, sessions, audit, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

describe('AuthService', () => {
  it('login válido emite access + refresh e audita', async () => {
    const { svc, sessions, audit } = setup();
    const r = await svc.login('ANA@acme.com', 'Senha12345', { ip: '1.1.1.1' });
    expect(r.accessToken).toBe('access:u1');
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].tokenHash).not.toBe(r.refreshToken); // só o hash é persistido
    expect(audit.map((a) => a.action)).toContain('auth.login');
  });

  it('credenciais inválidas → erro genérico e auditoria de falha', async () => {
    const { svc, audit } = setup();
    await expect(svc.login('ana@acme.com', 'errada', {})).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'E-mail ou senha inválidos.' });
    await expect(svc.login('naoexiste@acme.com', 'x', {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(audit.filter((a) => a.action === 'auth.login_failed')).toHaveLength(2);
  });

  it('bloqueia usuário desativado e empresa suspensa', async () => {
    await expect(setup({ userActive: false }).svc.login('ana@acme.com', 'Senha12345', {})).rejects.toThrow(/desativado/);
    await expect(setup({ tenantActive: false }).svc.login('ana@acme.com', 'Senha12345', {})).rejects.toThrow(/suspensa/);
  });

  it('refresh rotaciona o token na mesma família', async () => {
    const { svc, sessions } = setup();
    const first = await svc.login('ana@acme.com', 'Senha12345', {});
    const second = await svc.refresh(first.refreshToken, {});
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(sessions.rows).toHaveLength(2);
    expect(sessions.rows[0].revokedAt).not.toBeNull();
    expect(sessions.rows[1].familyId).toBe(sessions.rows[0].familyId);
  });

  it('reuso de refresh token revogado derruba a família inteira', async () => {
    const { svc, sessions, audit } = setup();
    const first = await svc.login('ana@acme.com', 'Senha12345', {});
    const second = await svc.refresh(first.refreshToken, {});
    await expect(svc.refresh(first.refreshToken, {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(sessions.rows.every((s) => s.revokedAt)).toBe(true);
    await expect(svc.refresh(second.refreshToken, {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(audit.map((a) => a.action)).toContain('auth.refresh_reuse_detected');
  });

  it('refresh expirado é recusado', async () => {
    const { svc, advance } = setup();
    const first = await svc.login('ana@acme.com', 'Senha12345', {});
    advance(8 * 86_400_000);
    await expect(svc.refresh(first.refreshToken, {})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('logout revoga a sessão', async () => {
    const { svc, sessions } = setup();
    const r = await svc.login('ana@acme.com', 'Senha12345', {});
    await svc.logout(r.refreshToken);
    expect(sessions.rows[0].revokedAt).not.toBeNull();
    await expect(svc.refresh(r.refreshToken, {})).rejects.toBeDefined();
  });
});
