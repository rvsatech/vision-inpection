import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DomainError } from '../../../shared/domain/domain-error';
import { ROLES } from '../domain/role';
import type { AccessTokenClaims, TokenService } from '../domain/ports';

@Injectable()
export class JwtTokenService implements TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(claims: AccessTokenClaims) {
    return this.jwt.signAsync({ ...claims, typ: 'access' });
  }

  async verifyAccess(token: string): Promise<AccessTokenClaims> {
    try {
      const p = await this.jwt.verifyAsync<AccessTokenClaims & { typ?: string }>(token, { algorithms: ['HS256'] });
      if (p.typ !== 'access' || !ROLES.includes(p.role)) throw new Error('bad claims');
      return { sub: p.sub, tid: p.tid, role: p.role };
    } catch {
      throw new DomainError('UNAUTHORIZED', 'Token de acesso inválido ou expirado.');
    }
  }

  generateRefresh() {
    const raw = randomBytes(48).toString('base64url');
    return { raw, hash: this.hashRefresh(raw) };
  }

  hashRefresh(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
