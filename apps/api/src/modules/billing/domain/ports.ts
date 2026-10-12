import type { Plan } from './plan';
import type { TenantUsage } from './plan-limits.policy';
import type { Subscription } from './subscription';

export interface PlanRepository {
  listPublic(): Promise<Plan[]>;
  findById(id: string): Promise<Plan | null>;
  findByCode(code: string): Promise<Plan | null>;
  findByStripePriceId(priceId: string): Promise<Plan | null>;
}
export const PLAN_REPOSITORY = Symbol('PLAN_REPOSITORY');

export interface SubscriptionRepository {
  findByTenant(tenantId: string): Promise<Subscription | null>;
  findByStripeSubscriptionId(id: string): Promise<Subscription | null>;
  findExpirable(now: Date): Promise<Subscription[]>;
  save(sub: Subscription): Promise<void>;
}
export const SUBSCRIPTION_REPOSITORY = Symbol('SUBSCRIPTION_REPOSITORY');

export interface UsageReader {
  read(tenantId: string, now: Date): Promise<TenantUsage>;
}
export const USAGE_READER = Symbol('USAGE_READER');

export interface BillingCustomer {
  tenantId: string;
  tenantName: string;
  email: string;
  stripeCustomerId: string | null;
}

/** Porta para o provedor de pagamento (Stripe). */
export interface PaymentGateway {
  readonly enabled: boolean;
  ensureCustomer(c: BillingCustomer): Promise<string>;
  createCheckoutSession(input: {
    customerId: string;
    tenantId: string;
    plan: Plan;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string; id: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
}
export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** Registro idempotente de eventos de cobrança já aplicados. */
export interface BillingEventStore {
  exists(eventId: string): Promise<boolean>;
  save(e: { id: string; tenantId: string | null; type: string; payload: unknown }): Promise<void>;
}
export const BILLING_EVENT_STORE = Symbol('BILLING_EVENT_STORE');

export interface TenantBillingLookup {
  findTenantIdByCustomer(customerId: string): Promise<string | null>;
  setStripeCustomer(tenantId: string, customerId: string): Promise<void>;
  getCustomer(tenantId: string, actorUserId: string): Promise<BillingCustomer>;
}
export const TENANT_BILLING_LOOKUP = Symbol('TENANT_BILLING_LOOKUP');
