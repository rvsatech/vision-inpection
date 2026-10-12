import { Body, Controller, Delete, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Actor } from '../../../../shared/domain/auth-context';
import { APP_ENV, AppEnv } from '../../../../shared/infrastructure/config/env';
import { clientIp, CurrentActor, Public } from '../../../../shared/interfaces/http/decorators';
import { AuthService, IssuedTokens } from '../../application/auth.service';
import { clearSessionCookie, REFRESH_COOKIE, respondWithSession } from './auth-cookie';
import { UsersService } from '../../application/users.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const issued = await this.auth.login(dto.email, dto.password, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    return this.respond(res, issued);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const issued = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], { ip: clientIp(req), userAgent: req.headers['user-agent'] });
      return this.respond(res, issued);
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], undefined, clientIp(req));
    this.clearCookie(res);
  }

  @Get('me')
  me(@CurrentActor() actor: Actor) {
    return this.auth.me(actor.tenantId, actor.userId);
  }

  @Get('sessions')
  sessions(@CurrentActor() actor: Actor) {
    return this.auth.listSessions(actor.userId);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  revokeSession(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.revokeSession(actor.userId, id);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentActor() actor: Actor, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.users.changeOwnPassword(actor, dto.currentPassword, dto.newPassword);
    this.clearCookie(res);
  }

  private respond(res: Response, issued: IssuedTokens) {
    return respondWithSession(res, this.env, issued);
  }

  private clearCookie(res: Response) {
    clearSessionCookie(res, this.env);
  }
}
