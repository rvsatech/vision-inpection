import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import type { Actor } from '../../../shared/domain/auth-context';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { DomainError, notFound } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import { PlanLimitsPolicy } from '../domain/plan-limits.policy';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
  PLAN_REPOSITORY,
  PlanRepository,
  SUBSCRIPTION_REPOSITORY,
  SubscriptionRepository,
  TENANT_BILLING_LOOKUP,
  TenantBillingLookup,
  USAGE_READER,
  UsageReader,
} from '../domain/ports';
import { STATUS_LABELS } from '../domain/subscription';

@Injectable()
export class BillingService {
  private readonly policy: PlanLimitsPolicy;

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subs: SubscriptionRepository,
    @Inject(USAGE_READER) private readonly usage: UsageReader,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(TENANT_BILLING_LOOKUP) private readonly tenants: TenantBillingLookup,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {
    this.policy = new PlanLimitsPolicy(env.PAST_DUE_GRACE_DAYS);
  }

  async listPlans() {
    const plans = await this.plans.listPublic();
    return plans.map((p) => ({ ...p, checkoutAvailable: this.gateway.enabled && !!p.stripePriceId }));
  }

  async overview(tenantId: string) {
    const now = this.clock.now();
    const sub = await this.subs.findByTenant(tenantId);
    if (!sub) throw notFound('Assinatura');
    const plan = await this.plans.findById(sub.planId);
    if (!plan) throw notFound('Plano');
    const usage = await this.usage.read(tenantId, now);
    const s = sub.toSnapshot();
    return {
      subscription: {
        ...s,
        statusLabel: STATUS_LABELS[s.status],
        operational: sub.isOperational(now, this.env.PAST_DUE_GRACE_DAYS),
        managedByStripe: !!s.stripeSubscriptionId,
      },
      plan,
      usage: this.policy.usageReport(plan, usage),
      billingEnabled: this.gateway.enabled,
    };
  }

  async startCheckout(actor: Actor, planCode: string) {
    this.assertEnabled();
    const plan = await this.plans.findByCode(planCode);
    if (!plan || !plan.isPublic) throw notFound('Plano');
    if (!plan.stripePriceId) throw new DomainError('VALIDATION', 'Este plano é negociado diretamente com o time comercial.');

    const customerId = await this.ensureCustomer(actor);
    const session = await this.gateway.createCheckoutSession({
      customerId,
      tenantId: actor.tenantId,
      plan,
      successUrl: `${this.env.APP_URL}/app/billing?checkout=success`,
      cancelUrl: `${this.env.APP_URL}/app/billing?checkout=canceled`,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: 'billing.checkout_started',
      entityType: 'plan',
      entityId: plan.code,
      metadata: { checkoutSessionId: session.id },
      ip: actor.ip,
    });
    return { url: session.url };
  }

  async openPortal(actor: Actor) {
    this.assertEnabled();
    const customerId = await this.ensureCustomer(actor);
    return this.gateway.createPortalSession({ customerId, returnUrl: `${this.env.APP_URL}/app/billing` });
  }

  private async ensureCustomer(actor: Actor) {
    const customer = await this.tenants.getCustomer(actor.tenantId, actor.userId);
    if (customer.stripeCustomerId) return customer.stripeCustomerId;
    const id = await this.gateway.ensureCustomer(customer);
    await this.tenants.setStripeCustomer(actor.tenantId, id);
    return id;
  }

  private assertEnabled() {
    if (!this.gateway.enabled) {
      throw new DomainError('UNAVAILABLE', 'Cobrança não configurada: defina STRIPE_SECRET_KEY (modo de teste).');
    }
  }
}
