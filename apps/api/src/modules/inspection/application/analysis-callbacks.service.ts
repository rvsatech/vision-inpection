import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { notFound } from '../../../shared/domain/domain-error';
import type { InferenceResult } from '../domain/analysis';
import { ANALYSIS_REPOSITORY, AnalysisRepository } from '../domain/ports';

/**
 * Callbacks do worker Go. A API é a única dona do banco: o worker não escreve no
 * Postgres, ele informa o resultado por aqui. Todos os métodos são idempotentes.
 */
@Injectable()
export class AnalysisCallbacksService {
  constructor(
    @Inject(ANALYSIS_REPOSITORY) private readonly analyses: AnalysisRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async started(id: string, attempt: number) {
    const a = await this.load(id);
    const changed = a.start(attempt, this.clock.now());
    if (changed) await this.analyses.save(a);
    return { status: a.status, changed };
  }

  async completed(id: string, attempt: number, result: InferenceResult) {
    const a = await this.load(id);
    const changed = a.complete(result, attempt, this.clock.now());
    if (changed) {
      await this.analyses.save(a);
      await this.audit.record({
        tenantId: a.tenantId,
        actorId: null,
        action: 'analysis.completed',
        entityType: 'analysis',
        entityId: id,
        metadata: { verdict: result.summary.verdict, mode: result.mode, latencyMs: result.latencyMs, attempt },
      });
    }
    return { status: a.status, changed };
  }

  async failed(id: string, attempt: number, reason: string) {
    const a = await this.load(id);
    const changed = a.fail(reason, attempt, this.clock.now());
    if (changed) {
      await this.analyses.save(a);
      await this.audit.record({ tenantId: a.tenantId, actorId: null, action: 'analysis.failed', entityType: 'analysis', entityId: id, metadata: { reason, attempt } });
    }
    return { status: a.status, changed };
  }

  private async load(id: string) {
    const a = await this.analyses.findByIdUnscoped(id);
    if (!a) throw notFound('Análise');
    return a;
  }
}
