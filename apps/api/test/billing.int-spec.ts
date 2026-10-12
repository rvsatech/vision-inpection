import { createTestApp, auth, INTERNAL, signupCompany, TestContext } from './setup/app';

describe('Billing (integração)', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(async () => ctx.app.close());

  it('lista planos publicamente', async () => {
    const res = await ctx.http.get('/plans').expect(200);
    expect(res.body.map((p: { code: string }) => p.code)).toEqual(['STARTER', 'PRO', 'ENTERPRISE']);
  });

  it('aplica eventos normalizados do worker de forma idempotente', async () => {
    const { token, user } = await signupCompany(ctx.http, 'STARTER');
    const evt = (id: string, type: string, data: object) => ({ eventId: id, type, occurredAt: new Date().toISOString(), livemode: false, data });
    const subId = `sub_${Date.now()}`;

    const r1 = await ctx.http
      .post('/internal/billing/events')
      .set(INTERNAL)
      .send(evt(`evt_co_${subId}`, 'checkout.completed', { tenantId: user.tenantId, planCode: 'PRO', customerId: `cus_${subId}`, subscriptionId: subId }))
      .expect(200);
    expect(r1.body.result).toBe('applied');
    const dup = await ctx.http
      .post('/internal/billing/events')
      .set(INTERNAL)
      .send(evt(`evt_co_${subId}`, 'checkout.completed', { tenantId: user.tenantId, subscriptionId: subId }))
      .expect(200);
    expect(dup.body.result).toBe('duplicate');

    let sub = await ctx.http.get('/billing/subscription').set(auth(token)).expect(200);
    expect(sub.body.subscription.status).toBe('ACTIVE');
    expect(sub.body.plan.code).toBe('PRO');

    await ctx.http.post('/internal/billing/events').set(INTERNAL).send(evt(`evt_pf_${subId}`, 'invoice.payment_failed', { subscriptionId: subId })).expect(200);
    sub = await ctx.http.get('/billing/subscription').set(auth(token)).expect(200);
    expect(sub.body.subscription.status).toBe('PAST_DUE');
    expect(sub.body.subscription.operational).toBe(true); // carência

    await ctx.http.post('/internal/billing/events').set(INTERNAL).send(evt(`evt_cn_${subId}`, 'subscription.canceled', { subscriptionId: subId })).expect(200);
    sub = await ctx.http.get('/billing/subscription').set(auth(token)).expect(200);
    expect(sub.body.subscription.status).toBe('CANCELED');
  });

  it('rejeita evento malformado', async () => {
    await ctx.http.post('/internal/billing/events').set(INTERNAL).send({ eventId: 'x', type: 'invoice.qualquer', occurredAt: 'ontem', data: {} }).expect(400);
  });

  it('checkout sem Stripe configurado responde 503 com mensagem clara', async () => {
    if (process.env.STRIPE_SECRET_KEY) return;
    const { token } = await signupCompany(ctx.http);
    const res = await ctx.http.post('/billing/checkout').set(auth(token)).send({ planCode: 'PRO' }).expect(503);
    expect(res.body.message).toMatch(/STRIPE_SECRET_KEY/);
  });

  // Executado apenas quando há chave de TESTE do Stripe (secret do CI ou .env local).
  const withStripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO ? it : it.skip;
  withStripe('cria sessão de checkout real no Stripe (test mode)', async () => {
    const { token } = await signupCompany(ctx.http);
    const res = await ctx.http.post('/billing/checkout').set(auth(token)).send({ planCode: 'PRO' }).expect(201);
    expect(res.body.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});
