import { Global, Module } from '@nestjs/common';
import { ENTITLEMENTS } from '../../shared/application/entitlements';
import { BillingAdminQuery } from './application/billing-admin.query';
import { BillingEventsService } from './application/billing-events.service';
import { BillingService } from './application/billing.service';
import { EntitlementsService } from './application/entitlements.service';
import { SubscriptionJobsService } from './application/subscription-jobs.service';
import {
  BILLING_EVENT_STORE,
  PAYMENT_GATEWAY,
  PLAN_REPOSITORY,
  SUBSCRIPTION_REPOSITORY,
  TENANT_BILLING_LOOKUP,
  USAGE_READER,
} from './domain/ports';
import {
  PrismaBillingEventStore,
  PrismaPlanRepository,
  PrismaSubscriptionRepository,
  PrismaTenantBillingLookup,
  PrismaUsageReader,
} from './infrastructure/prisma-billing.repositories';
import { StripePaymentGateway } from './infrastructure/stripe-payment.gateway';
import { AdminBillingController, BillingController, InternalBillingController, PlansController } from './interfaces/http/billing.controllers';

@Global()
@Module({
  controllers: [PlansController, BillingController, AdminBillingController, InternalBillingController],
  providers: [
    BillingService,
    BillingEventsService,
    SubscriptionJobsService,
    BillingAdminQuery,
    EntitlementsService,
    { provide: ENTITLEMENTS, useExisting: EntitlementsService },
    { provide: PLAN_REPOSITORY, useClass: PrismaPlanRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: PrismaSubscriptionRepository },
    { provide: USAGE_READER, useClass: PrismaUsageReader },
    { provide: BILLING_EVENT_STORE, useClass: PrismaBillingEventStore },
    { provide: TENANT_BILLING_LOOKUP, useClass: PrismaTenantBillingLookup },
    { provide: PAYMENT_GATEWAY, useClass: StripePaymentGateway },
  ],
  exports: [ENTITLEMENTS, PLAN_REPOSITORY, USAGE_READER],
})
export class BillingModule {}
