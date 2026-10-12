import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, Permission } from '../../../modules/identity/domain/role';
import { TOKEN_SERVICE, TokenService } from '../../../modules/identity/domain/ports';
import { APP_ENV, AppEnv } from '../../infrastructure/config/env';
import { AuthedRequest, clientIp, IS_INTERNAL, IS_PUBLIC, PERMISSIONS } from './decorators';

/**
 * Guard global. Ordem de decisão:
 * 1. @Internal() → valida X-Internal-Token (comparação em tempo constante).
 * 2. @Public()   → libera.
 * 3. Caso geral  → exige Bearer JWT válido e checa @RequirePermissions.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly internalToken: Buffer;

  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    this.internalToken = Buffer.from(env.INTERNAL_API_TOKEN);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, targets)) {
      const given = Buffer.from(String(req.headers['x-internal-token'] ?? ''));
      if (given.length !== this.internalToken.length || !timingSafeEqual(given, this.internalToken)) {
        throw new UnauthorizedException('Token interno inválido.');
      }
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Autenticação necessária.');
    const claims = await this.tokens.verifyAccess(token);
    req.actor = { userId: claims.sub, tenantId: claims.tid, role: claims.role, ip: clientIp(req) };

    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS, targets) ?? [];
    const missing = required.filter((p) => !hasPermission(claims.role, p));
    if (missing.length) throw new ForbiddenException('Você não tem permissão para esta ação.');
    return true;
  }
}
