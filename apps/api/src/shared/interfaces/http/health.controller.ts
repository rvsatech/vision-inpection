import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { REDIS } from '../../infrastructure/redis/redis.module';
import { Public } from './decorators';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: o processo está de pé. */
  @Public()
  @Get()
  live() {
    return { status: 'ok', service: 'api', time: new Date().toISOString() };
  }

  /** Readiness: dependências respondem. */
  @Public()
  @Get('ready')
  async ready() {
    const checks = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]);
    const [db, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'up' : 'down'));
    const body = { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', checks: { database: db, redis } };
    if (body.status !== 'ok') throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
