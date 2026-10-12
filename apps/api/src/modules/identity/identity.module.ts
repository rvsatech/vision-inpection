import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_ENV, AppEnv } from '../../shared/infrastructure/config/env';
import { AuthService } from './application/auth.service';
import { TENANT_GATE } from './application/tenant-gate';
import { UsersService } from './application/users.service';
import { PASSWORD_HASHER, SESSION_REPOSITORY, TOKEN_SERVICE, USER_REPOSITORY } from './domain/ports';
import { BcryptPasswordHasher } from './infrastructure/bcrypt-password-hasher';
import { JwtTokenService } from './infrastructure/jwt-token.service';
import { PrismaSessionRepository } from './infrastructure/prisma-session.repository';
import { PrismaTenantGate } from './infrastructure/prisma-tenant-gate';
import { PrismaUserRepository } from './infrastructure/prisma-user.repository';
import { AuthController } from './interfaces/http/auth.controller';
import { UsersController } from './interfaces/http/users.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => ({
        secret: env.JWT_ACCESS_SECRET,
        signOptions: { expiresIn: env.JWT_ACCESS_TTL_SECONDS, algorithm: 'HS256', issuer: 'vision-inspect' },
        verifyOptions: { issuer: 'vision-inspect' },
      }),
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    AuthService,
    UsersService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: PASSWORD_HASHER, useFactory: () => new BcryptPasswordHasher() },
    { provide: TOKEN_SERVICE, useClass: JwtTokenService },
    { provide: TENANT_GATE, useClass: PrismaTenantGate },
  ],
  exports: [AuthService, TOKEN_SERVICE, PASSWORD_HASHER, USER_REPOSITORY],
})
export class IdentityModule {}
