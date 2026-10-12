import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../../../shared/infrastructure/redis/redis.module';
import type { AnalysisQueue, AnalysisRequestedEvent } from '../domain/ports';

export const ANALYSIS_STREAM = 'vision.analysis.requested';

/**
 * Publicação em Redis Streams. Campos da entrada:
 *   type    → tipo do evento (roteamento/observabilidade)
 *   payload → JSON do contrato vision.analysis.requested v1
 *   attempt → tentativa (0 na publicação original; o worker incrementa nos retries)
 *
 * MAXLEN ~ limita o tamanho do stream (mensagens já confirmadas são descartáveis).
 */
@Injectable()
export class RedisAnalysisQueue implements AnalysisQueue {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async publishRequested(event: AnalysisRequestedEvent): Promise<string> {
    const id = await this.redis.xadd(ANALYSIS_STREAM, 'MAXLEN', '~', '50000', '*', 'type', event.eventType, 'payload', JSON.stringify(event), 'attempt', '0');
    return id ?? '';
  }
}
