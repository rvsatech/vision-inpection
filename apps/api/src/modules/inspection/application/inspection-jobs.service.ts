import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import { ANALYSIS_REPOSITORY, AnalysisRepository, IMAGE_STORAGE, ImageStorage, TENANT_STORAGE_COUNTER, TenantStorageCounter } from '../domain/ports';
import { AnalysesService } from './analyses.service';

const MINUTE = 60_000;

@Injectable()
export class InspectionJobsService {
  private readonly logger = new Logger(InspectionJobsService.name);

  constructor(
    @Inject(ANALYSIS_REPOSITORY) private readonly analyses: AnalysisRepository,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    @Inject(TENANT_STORAGE_COUNTER) private readonly storageCounter: TenantStorageCounter,
    private readonly service: AnalysesService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'ANALYSIS_MAX_ATTEMPTS' | 'FILE_RETENTION_DAYS'>,
  ) {}

  /**
   * Rede de segurança: republica análises que ficaram QUEUED (publicação falhou)
   * ou PROCESSING por tempo demais (worker caiu e a mensagem não foi reivindicada).
   */
  async requeueStale() {
    const now = this.clock.now().getTime();
    const stale = await this.analyses.findStale(new Date(now - 5 * MINUTE), new Date(now - 15 * MINUTE), this.env.ANALYSIS_MAX_ATTEMPTS, 100);
    for (const a of stale) {
      a.requeue(this.clock.now());
      await this.analyses.save(a);
      await this.service.publish(a);
    }
    if (stale.length) this.logger.warn(`Reenfileiradas ${stale.length} análises paradas.`);
    return { requeued: stale.length };
  }

  /** Remove imagens fora do prazo de retenção (LGPD: minimização de dados). */
  async cleanupFiles() {
    const cutoff = new Date(this.clock.now().getTime() - this.env.FILE_RETENTION_DAYS * 86_400_000);
    const old = await this.analyses.findWithImagesOlderThan(cutoff, 200);
    let removed = 0;
    for (const a of old) {
      const s = a.toSnapshot();
      try {
        await this.storage.delete(s.imageKey);
        a.purgeImage();
        await this.analyses.save(a);
        await this.storageCounter.add(s.tenantId, -s.sizeBytes);
        removed++;
      } catch (err) {
        this.logger.error(`Falha ao remover ${s.imageKey}: ${(err as Error).message}`);
      }
    }
    return { scanned: old.length, removed };
  }
}
