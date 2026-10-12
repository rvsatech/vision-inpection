import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import type { Actor } from '../../../../shared/domain/auth-context';
import { APP_ENV, AppEnv } from '../../../../shared/infrastructure/config/env';
import { clientIp, CurrentActor, Public, RequirePermissions } from '../../../../shared/interfaces/http/decorators';
import { AuthService } from '../../../identity/application/auth.service';
import { respondWithSession } from '../../../identity/interfaces/http/auth-cookie';
import { TenancyService } from '../../application/tenancy.service';
import { SEGMENTS } from '../../domain/tenant';

class SignupDto {
  @IsString() @MinLength(3) @MaxLength(120) companyName: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsIn(SEGMENTS) segment?: string;
  @IsString() @MinLength(2) @MaxLength(120) ownerName: string;
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) email: string;
  @IsString() @MinLength(10) @MaxLength(128) password: string;
  @IsOptional() @IsString() planCode?: string;
}

class UpdateCompanyDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) document?: string;
  @IsOptional() @IsIn(SEGMENTS) segment?: string;
}

class TenantsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class TenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
}

@Controller()
export class TenancyController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly auth: AuthService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const ip = clientIp(req);
    await this.tenancy.signup(dto, ip);
    const issued = await this.auth.login(dto.email, dto.password, { ip, userAgent: req.headers['user-agent'] });
    return respondWithSession(res, this.env, issued);
  }

  @Public()
  @Get('segments')
  segments() {
    return SEGMENTS;
  }

  @Get('company')
  @RequirePermissions('company:read')
  company(@CurrentActor() actor: Actor) {
    return this.tenancy.getCompany(actor.tenantId);
  }

  @Patch('company')
  @RequirePermissions('company:write')
  updateCompany(@CurrentActor() actor: Actor, @Body() dto: UpdateCompanyDto) {
    return this.tenancy.updateCompany(actor, dto);
  }

  @Get('admin/tenants')
  @RequirePermissions('platform:manage')
  tenants(@Query() q: TenantsQuery) {
    return this.tenancy.listTenants(q);
  }

  @Patch('admin/tenants/:id/status')
  @RequirePermissions('platform:manage')
  setStatus(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TenantStatusDto) {
    return this.tenancy.setTenantStatus(actor, id, dto.status);
  }
}
