import type { Page } from '../../../shared/application/pagination';
import type { Role } from './role';
import type { User, UserStatus } from './user';

export interface UserListFilter {
  search?: string;
  role?: Role;
  status?: UserStatus;
  skip: number;
  take: number;
}

export interface UserRepository {
  findById(tenantId: string, id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(tenantId: string, filter: UserListFilter): Promise<Omit<Page<User>, 'page' | 'pageSize'>>;
  countActive(tenantId: string): Promise<number>;
  countActiveOwners(tenantId: string): Promise<number>;
  save(user: User): Promise<void>;
}
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface SessionRecord {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionRepository {
  create(data: Omit<SessionRecord, 'createdAt' | 'lastUsedAt' | 'revokedAt'>): Promise<SessionRecord>;
  findByTokenHash(hash: string): Promise<SessionRecord | null>;
  revoke(id: string, at: Date): Promise<void>;
  revokeFamily(familyId: string, at: Date): Promise<void>;
  revokeAllForUser(userId: string, at: Date): Promise<void>;
  listActive(userId: string, now: Date): Promise<SessionRecord[]>;
  findById(id: string): Promise<SessionRecord | null>;
}
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface AccessTokenClaims {
  sub: string;
  tid: string;
  role: Role;
}
export interface TokenService {
  signAccess(claims: AccessTokenClaims): Promise<string>;
  verifyAccess(token: string): Promise<AccessTokenClaims>;
  /** Token opaco aleatório (refresh) e seu hash para persistência. */
  generateRefresh(): { raw: string; hash: string };
  hashRefresh(raw: string): string;
}
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
