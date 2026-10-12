import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { BillingModule } from './modules/billing/billing.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InspectionModule } from './modules/inspection/inspection.module';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { AppConfigModule } from './shared/infrastructure/config/config.module';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module';
import { RedisModule } from './shared/infrastructure/redis/redis.module';
import { AuthGuard } from './shared/interfaces/http/auth.guard';
import { AllExceptionsFilter } from './shared/interfaces/http/domain-exception.filter';
import { HealthController } from './shared/interfaces/http/health.controller';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    AuditModule,
    IdentityModule,
    BillingModule,
    TenancyModule,
    InspectionModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
