import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plan } from '../domain/plan';
import type { BillingEventStore, PlanRepository, SubscriptionRepository, TenantBillingLookup } from '../domain/ports';
import { Subscription } from '../domain/subscription';
import { BillingEventsService, NormalizedBillingEvent } from './billing-events.service';

const now = new Date('2026-10-11T12:00:00Z');
const pro: Plan = { id: 'p-pro', code: 'PRO', name: 'Profissional', description: '', priceCents: 1, currency: 'brl', stripePriceId: 'price_pro', maxUsers: 1, maxAnalysesPerMonth: 1, maxStorageMb: 1, services: [], isPublic: true };

function setup() {
  const tenantId = 'a3c9e2d1-5f4b-4e6a-9c8d-7b1a0f2e3d45';
  const sub = Subscription.startTrial({ id: 's1', tenantId, planId: 'p-starter' }, new Date('2026-10-01T00:00:00Z'), 14);
  const saved: string[] = [];
  const store: BillingEventStore = { exists: async (id) => saved.includes(id), save: async (e) => void saved.push(e.id) };
  const subs: SubscriptionRepository = {
    findByTenant: async (t) => (t === tenantId ? sub : null),
    findByStripeSubscriptionId: async (id) => (id === sub.stripeSubscriptionId ? sub : null),
    findExpirable: async () => [],
    save: async () => undefined,
  };
  const plans: PlanRepository = { listPublic: async () => [pro], findById: async () => pro, findByCode: async (c) => (c === 'PRO' ? pro : null), findByStripePriceId: async () => pro };
  const customers: Record<string, string> = {};
  const tenants: TenantBillingLookup = {
    findTenantIdByCustomer: async (c) => customers[c] ?? null,
    setStripeCustomer: async (t, c) => void (customers[c] = t),
    getCustomer: async () => { throw new Error('n/a'); },
  };
  const svc = new BillingEventsService(store, subs, plans, tenants, { record: async () => undefined }, { now: () => now }, { PAST_DUE_GRACE_DAYS: 7 });
  return { svc, sub, saved, tenantId };
}

const ev = (type: NormalizedBillingEvent['type'], data: NormalizedBillingEvent['data'], eventId = `evt_${type}`): NormalizedBillingEvent => ({
  eventId,
  type,
  occurredAt: now.toISOString(),
  livemode: false,
  data,
});

describe('BillingEventsService', () => {
  it('aplica o exemplo do contrato billing.stripe.event.v1', async () => {
    const { svc, sub } = setup();
    const example = JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/contracts/examples/billing.stripe.event.v1.json'), 'utf8'));
    expect(await svc.apply(example)).toBe('applied');
    expect(sub.status).toBe('ACTIVE');
    expect(sub.stripeSubscriptionId).toBe('sub_TestSubscription');
  });

  it('checkout → ativa, troca plano e vincula IDs do Stripe', async () => {
    const { svc, sub, tenantId } = setup();
    await svc.apply(ev('checkout.completed', { tenantId, planCode: 'PRO', customerId: 'cus_1', subscriptionId: 'sub_1' }));
    expect(sub.toSnapshot()).toMatchObject({ status: 'ACTIVE', planId: 'p-pro', stripeSubscriptionId: 'sub_1' });
  });

  it('é idempotente por eventId', async () => {
    const { svc, tenantId } = setup();
    const e = ev('invoice.paid', { tenantId });
    expect(await svc.apply(e)).toBe('applied');
    expect(await svc.apply(e)).toBe('duplicate');
  });

  it('falha de pagamento → PAST_DUE; cancelamento → CANCELED', async () => {
    const { svc, sub, tenantId } = setup();
    await svc.apply(ev('checkout.completed', { tenantId, subscriptionId: 'sub_9' }));
    await svc.apply(ev('invoice.payment_failed', { subscriptionId: 'sub_9' }));
    expect(sub.status).toBe('PAST_DUE');
    await svc.apply(ev('subscription.canceled', { subscriptionId: 'sub_9' }));
    expect(sub.status).toBe('CANCELED');
  });

  it('resolve tenant pelo customerId quando não há metadata', async () => {
    const { svc, sub, tenantId } = setup();
    await svc.apply(ev('checkout.completed', { tenantId, customerId: 'cus_77' }, 'evt_a'));
    await svc.apply(ev('subscription.updated', { customerId: 'cus_77', status: 'past_due' }, 'evt_b'));
    expect(sub.status).toBe('PAST_DUE');
  });

  it('ignora eventos de produção (livemode) e eventos órfãos', async () => {
    const { svc } = setup();
    expect(await svc.apply({ ...ev('invoice.paid', {}), livemode: true })).toBe('ignored');
    expect(await svc.apply(ev('invoice.paid', { customerId: 'cus_desconhecido' }, 'evt_orfao'))).toBe('ignored');
  });
});
