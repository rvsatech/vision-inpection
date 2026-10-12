import type { Response } from 'express';
import type { AppEnv } from '../../../../shared/infrastructure/config/env';
import type { IssuedTokens } from '../../application/auth.service';

export const REFRESH_COOKIE = 'vi_rt';
/** Cookie legível pelo JS, sem segredo: só indica ao front que vale tentar renovar a sessão. */
export const SESSION_HINT_COOKIE = 'vi_s';

/** Grava o refresh token em cookie httpOnly e devolve só o que o front precisa. */
export function respondWithSession(res: Response, env: AppEnv, issued: IssuedTokens) {
  res.cookie(REFRESH_COOKIE, issued.refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    path: '/',
    expires: issued.refreshTokenExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, '1', { httpOnly: false, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE, path: '/', expires: issued.refreshTokenExpiresAt });
  return { accessToken: issued.accessToken, expiresIn: issued.accessTokenExpiresIn, user: issued.user };
}

export function clearSessionCookie(res: Response, env: AppEnv) {
  res.clearCookie(REFRESH_COOKIE, { path: '/', httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE });
  res.clearCookie(SESSION_HINT_COOKIE, { path: '/', secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAMESITE });
}
