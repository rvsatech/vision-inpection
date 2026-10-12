import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { REDIS } from '../../src/shared/infrastructure/redis/redis.module';

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  redis: Redis;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  configureApp(app);
  await app.init();
  return { app, http: request(app.getHttpServer()), redis: app.get(REDIS) };
}

let seq = 0;
/** Cria uma empresa nova via /signup (fluxo real) e devolve o token do proprietário. */
export async function signupCompany(http: TestContext['http'], planCode = 'PRO') {
  const n = `${Date.now()}-${++seq}`;
  const email = `owner-${n}@teste.com.br`;
  const password = 'Senha@12345';
  const res = await http
    .post('/signup')
    .send({ companyName: `Indústria Teste ${n}`, ownerName: 'Dona Teste', email, password, planCode })
    .expect(201);
  return { token: res.body.accessToken as string, user: res.body.user, email, password, cookie: res.headers['set-cookie'] as unknown as string[] };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
export const INTERNAL = { 'X-Internal-Token': 'test-internal-token' };
