import { auth, createTestApp, INTERNAL, signupCompany, TestContext } from './setup/app';

describe('Auth + RBAC + multi-tenant (integração)', () => {
  let ctx: TestContext;
  beforeAll(async () => (ctx = await createTestApp()));
  afterAll(async () => ctx.app.close());

  it('signup cria empresa em trial e já autentica', async () => {
    const { token, user } = await signupCompany(ctx.http);
    expect(user.role).toBe('OWNER');
    const me = await ctx.http.get('/auth/me').set(auth(token)).expect(200);
    expect(me.body.email).toBe(user.email);
    const sub = await ctx.http.get('/billing/subscription').set(auth(token)).expect(200);
    expect(sub.body.subscription.status).toBe('TRIALING');
    expect(sub.body.plan.code).toBe('PRO');
  });

  it('login → refresh por cookie (rotação) → logout', async () => {
    const { email, password } = await signupCompany(ctx.http);
    const login = await ctx.http.post('/auth/login').send({ email, password }).expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    const cookie = login.headers['set-cookie'] as unknown as string[];
    expect(cookie.join(';')).toMatch(/vi_rt=.*HttpOnly/i);

    const refreshed = await ctx.http.post('/auth/refresh').set('Cookie', cookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    const newCookie = refreshed.headers['set-cookie'] as unknown as string[];

    // o cookie antigo foi rotacionado: reuso → 401 e família revogada
    await ctx.http.post('/auth/refresh').set('Cookie', cookie).expect(401);
    await ctx.http.post('/auth/refresh').set('Cookie', newCookie).expect(401);
  });

  it('rejeita credenciais inválidas e token ausente', async () => {
    await ctx.http.post('/auth/login').send({ email: 'ninguem@teste.com', password: 'qualquer123' }).expect(401);
    await ctx.http.get('/auth/me').expect(401);
    await ctx.http.get('/auth/me').set(auth('lixo')).expect(401);
  });

  it('proprietário gerencia usuários; operador e leitor não', async () => {
    const owner = await signupCompany(ctx.http);
    const op = await ctx.http
      .post('/users')
      .set(auth(owner.token))
      .send({ email: `op-${Date.now()}@teste.com.br`, name: 'Operador', role: 'OPERATOR', password: 'Operador@123' })
      .expect(201);
    const opLogin = await ctx.http.post('/auth/login').send({ email: op.body.email, password: 'Operador@123' }).expect(200);

    await ctx.http.get('/users').set(auth(opLogin.body.accessToken)).expect(403);
    await ctx.http.post('/users').set(auth(opLogin.body.accessToken)).send({ email: 'x@y.com', name: 'X', role: 'VIEWER', password: 'Senha@12345' }).expect(403);

    await ctx.http.patch(`/users/${op.body.id}`).set(auth(owner.token)).send({ role: 'VIEWER' }).expect(200);
    await ctx.http.post(`/users/${op.body.id}/deactivate`).set(auth(owner.token)).expect(200);
    await ctx.http.post('/auth/login').send({ email: op.body.email, password: 'Operador@123' }).expect(401);

    const audit = await ctx.http.get('/audit-logs').set(auth(owner.token)).expect(200);
    const actions = audit.body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(['user.created', 'user.role_changed', 'user.deactivated']));
  });

  it('não permite remover o último proprietário', async () => {
    const owner = await signupCompany(ctx.http);
    const res = await ctx.http.post(`/users/${owner.user.id}/deactivate`).set(auth(owner.token)).expect(409);
    expect(res.body.message).toMatch(/pelo menos um proprietário/);
  });

  it('isolamento entre empresas', async () => {
    const a = await signupCompany(ctx.http);
    const b = await signupCompany(ctx.http);
    await ctx.http.get(`/users/${a.user.id}`).set(auth(b.token)).expect(404);
    const list = await ctx.http.get('/users').set(auth(b.token)).expect(200);
    expect(list.body.items.map((u: { id: string }) => u.id)).not.toContain(a.user.id);
  });

  it('rotas internas exigem token de serviço; rotas de plataforma exigem PLATFORM_ADMIN', async () => {
    const owner = await signupCompany(ctx.http);
    await ctx.http.post('/internal/jobs/expire-subscriptions').expect(401);
    await ctx.http.post('/internal/jobs/expire-subscriptions').set(auth(owner.token)).expect(401);
    await ctx.http.post('/internal/jobs/expire-subscriptions').set(INTERNAL).expect(200);
    await ctx.http.get('/admin/tenants').set(auth(owner.token)).expect(403);
  });

  it('valida payloads (whitelist + senha fraca)', async () => {
    const owner = await signupCompany(ctx.http);
    await ctx.http.post('/users').set(auth(owner.token)).send({ email: 'a@b.com', name: 'A', role: 'OPERATOR', password: 'Senha@12345', admin: true }).expect(400);
    const weak = await ctx.http.post('/users').set(auth(owner.token)).send({ email: 'weak@b.com', name: 'Fraca', role: 'OPERATOR', password: 'aaaaaaaaaa' });
    expect(weak.status).toBe(422);
  });
});
