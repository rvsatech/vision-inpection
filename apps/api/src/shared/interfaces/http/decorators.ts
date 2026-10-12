import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from '../../../modules/identity/domain/role';
import type { Actor } from '../../domain/auth-context';

export const IS_PUBLIC = 'isPublic';
/** Rota sem autenticação de usuário (login, planos públicos, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const IS_INTERNAL = 'isInternal';
/** Rota service-to-service: exige X-Internal-Token em vez de JWT de usuário. */
export const Internal = () => SetMetadata(IS_INTERNAL, true);

export const PERMISSIONS = 'permissions';
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);

export interface AuthedRequest extends Request {
  actor?: Actor;
}

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.actor) throw new Error('CurrentActor usado em rota sem autenticação');
  return req.actor;
});

export const clientIp = (req: Request) =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || undefined;
