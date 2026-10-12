import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import {
  BILLING_EVENT_STORE,
  BillingEventStore,
  PLAN_REPOSITORY,
  PlanRepository,
  SUBSCRIPTION_REPOSITORY,
  SubscriptionRepository,
  TENANT_BILLING_LOOKUP,
  TenantBillingLookup,
} from '../domain/ports';
import { fromStripeStatus, Subscription } from '../domain/subscription';

/** Contrato `billing.stripe.event.v1` (ver packages/contracts). */
export interface NormalizedBillingEvent {
  eventId: string;
  type: 'checkout.completed' | 'invoice.paid' | 'invoice.payment_failed' | 'subscription.updated' | 'subscription.canceled';
  occurredAt: string;
  livemode?: boolean;
  data: {
    tenantId?: string;
    planCode?: string;
    priceId?: string;
    customerId?: string;
    subscriptionId?: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    cancelAtPeriodEnd?: boolean;
    amount?: number;
    currency?: string;
  };
}

export type ApplyResult = 'applied' | 'duplicate' | 'ignored';

/**
 * Aplica eventos de cobrança já validados e normalizados pelo worker Go.
 * Idempotente: o mesmo eventId aplicado duas vezes não altera nada.
 */
@Injectable()
export class BillingEventsService {
  private readonly logger = new Logger(BillingEventsService.name);

  constructor(
    @Inject(BILLING_EVENT_STORE) private readonly events: BillingEventStore,
    @Inject(SUBSCRIPTION_REPOSITORY) private readonly subs: SubscriptionRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: PlanRepository,
    @Inject(TENANT_BILLING_LOOKUP) private readonly tenants: TenantBillingLookup,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'PAST_DUE_GRACE_DAYS'>,
  ) {}

  async apply(e: NormalizedBillingEvent): Promise<ApplyResult> {
    if (e.livemode) {
      this.logger.warn(`Evento live ignorado (${e.eventId}) — ambiente opera somente em modo de teste.`);
      return 'ignored';
    }
    if (await this.events.exists(e.eventId)) return 'duplicate';

    const sub = await this.resolveSubscription(e);
    if (!sub) {
      this.logger.warn(`Evento ${e.type} (${e.eventId}) sem assinatura correspondente — registrado e ignorado.`);
      await this.events.save({ id: e.eventId, tenantId: e.data.tenantId ?? null, type: e.type, payload: e });
      return 'ignored';
    }

    const before = sub.status;
    const d = e.data;
    const now = this.clock.now();
    const period = { start: d.currentPeriodStart ? new Date(d.currentPeriodStart) : null, end: d.currentPeriodEnd ? new Date(d.currentPeriodEnd) : null };

    if (d.customerId) await this.tenants.setStripeCustomer(sub.tenantId, d.customerId);
    if (d.subscriptionId && !sub.stripeSubscriptionId) sub.linkStripe(d.subscriptionId);
    const plan = d.planCode ? await this.plans.findByCode(d.planCode) : d.priceId ? await this.plans.findByStripePriceId(d.priceId) : null;
    if (plan) sub.changePlan(plan.id);

    switch (e.type) {
      case 'checkout.completed':
      case 'invoice.paid':
        sub.activate(period);
        break;
      case 'invoice.payment_failed':
        if (sub.status !== 'EXPIRED' && sub.status !== 'CANCELED') sub.markPastDue(now);
        break;
      case 'subscription.updated': {
        const target = fromStripeStatus(d.status);
        if (target === 'ACTIVE') sub.activate(period);
        else if (target === 'PAST_DUE') sub.markPastDue(now);
        else if (target === 'CANCELED') sub.cancel(now);
        else if (target === 'EXPIRED') sub.expireIfDue(now, this.env.PAST_DUE_GRACE_DAYS);
        if (d.cancelAtPeriodEnd !== undefined) sub.scheduleCancel(d.cancelAtPeriodEnd);
        break;
      }
      case 'subscription.canceled':
        sub.cancel(now);
        break;
    }

    await this.subs.save(sub);
    await this.events.save({ id: e.eventId, tenantId: sub.tenantId, type: e.type, payload: e });
    await this.audit.record({
      tenantId: sub.tenantId,
      actorId: null,
      action: `billing.${e.type}`,
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { eventId: e.eventId, from: before, to: sub.status, amount: d.amount, currency: d.currency },
    });
    return 'applied';
  }

  private async resolveSubscription(e: NormalizedBillingEvent): Promise<Subscription | null> {
    const d = e.data;
    if (d.subscriptionId) {
      const s = await this.subs.findByStripeSubscriptionId(d.subscriptionId);
      if (s) return s;
    }
    let tenantId = d.tenantId;
    if (!tenantId && d.customerId) tenantId = (await this.tenants.findTenantIdByCustomer(d.customerId)) ?? undefined;
    return tenantId ? this.subs.findByTenant(tenantId) : null;
  }
}
