import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auth, createTestApp, INTERNAL, signupCompany, TestContext } from './setup/app';

const STREAM = 'vision.analysis.requested';
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(512, 7)]);

describe('Análises: upload → fila → callbacks (integração)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.redis.flushdb();
  });
  afterAll(async () => ctx.app.close());

  it('fluxo completo com contrato de resultado', async () => {
    const { token } = await signupCompany(ctx.http);
    const created = await ctx.http
      .post('/analyses')
      .set(auth(token))
      .field('service', 'PPE_COMPLIANCE')
      .attach('image', jpeg, { filename: 'area-3.jpg', contentType: 'image/jpeg' })
      .expect(202);
    expect(created.body.status).toBe('QUEUED');
    const id = created.body.id as string;

    // a mensagem está no Redis Stream com o payload do contrato
    const entries = await ctx.redis.xrange(STREAM, '-', '+');
    const last = entries.at(-1)!;
    const fields = Object.fromEntries(Array.from({ length: last[1].length / 2 }, (_, i) => [last[1][i * 2], last[1][i * 2 + 1]]));
    const event = JSON.parse(fields.payload);
    expect(event.data.analysisId).toBe(id);
    expect(fields.attempt).toBe('0');

    // worker: started → completed (com o exemplo do contrato de inferência)
    await ctx.http.post(`/internal/analyses/${id}/started`).set(INTERNAL).send({ attempt: 1, workerId: 'test' }).expect(200);
    const result = JSON.parse(readFileSync(join(__dirname, '../../../packages/contracts/examples/vision.infer.response.v1.json'), 'utf8'));
    result.analysisId = id;
    const done = await ctx.http.post(`/internal/analyses/${id}/completed`).set(INTERNAL).send({ attempt: 1, result }).expect(200);
    expect(done.body).toEqual({ status: 'COMPLETED', changed: true });

    // entrega duplicada é ignorada
    const dup = await ctx.http.post(`/internal/analyses/${id}/failed`).set(INTERNAL).send({ attempt: 2, reason: 'atrasado' }).expect(200);
    expect(dup.body.changed).toBe(false);

    const detail = await ctx.http.get(`/analyses/${id}`).set(auth(token)).expect(200);
    expect(detail.body).toMatchObject({ status: 'COMPLETED', verdict: 'FAIL', imageAvailable: true });
    const img = await ctx.http.get(`/analyses/${id}/image`).set(auth(token)).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    const dash = await ctx.http.get('/dashboard').set(auth(token)).expect(200);
    expect(dash.body.totals.fail).toBe(1);
  });

  it('bloqueia serviço fora do plano (STARTER não inclui EPI) com 402', async () => {
    const { token } = await signupCompany(ctx.http, 'STARTER');
    const res = await ctx.http
      .post('/analyses')
      .set(auth(token))
      .field('service', 'PPE_COMPLIANCE')
      .attach('image', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(402);
    expect(res.body.code).toBe('LIMIT_EXCEEDED');
  });

  it('rejeita arquivo que não é imagem mesmo com extensão .jpg', async () => {
    const { token } = await signupCompany(ctx.http);
    await ctx.http
      .post('/analyses')
      .set(auth(token))
      .field('service', 'OBJECT_COUNT')
      .attach('image', Buffer.from('MZ\x90\x00 executavel'), { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(422);
  });

  it('falha → retry manual republica na fila', async () => {
    const { token } = await signupCompany(ctx.http);
    const created = await ctx.http.post('/analyses').set(auth(token)).field('service', 'OBJECT_COUNT').attach('image', jpeg, 'a.jpg').expect(202);
    const id = created.body.id;
    await ctx.http.post(`/internal/analyses/${id}/failed`).set(INTERNAL).send({ attempt: 3, reason: 'serviço de visão indisponível' }).expect(200);
    const before = await ctx.redis.xlen(STREAM);
    const retried = await ctx.http.post(`/analyses/${id}/retry`).set(auth(token)).expect(202);
    expect(retried.body.status).toBe('QUEUED');
    expect(await ctx.redis.xlen(STREAM)).toBe(before + 1);
  });
});
