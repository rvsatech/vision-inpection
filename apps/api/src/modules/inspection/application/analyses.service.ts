import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_RECORDER, AuditRecorder } from '../../../shared/application/audit';
import { ENTITLEMENTS, EntitlementsPort } from '../../../shared/application/entitlements';
import type { Actor } from '../../../shared/domain/auth-context';
import { Clock, CLOCK } from '../../../shared/domain/clock';
import { DomainError, notFound } from '../../../shared/domain/domain-error';
import { APP_ENV, AppEnv } from '../../../shared/infrastructure/config/env';
import { Analysis } from '../domain/analysis';
import { assertValidImage, EXTENSIONS } from '../domain/image-validation';
import {
  ANALYSIS_QUEUE,
  ANALYSIS_REPOSITORY,
  AnalysisQueue,
  AnalysisRepository,
  AnalysisRequestedEvent,
  IMAGE_STORAGE,
  ImageStorage,
  TENANT_STORAGE_COUNTER,
  TenantStorageCounter,
} from '../domain/ports';
import type { VisionServiceCode } from '../domain/vision-service';

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
  size: number;
}

/**
 * Pedido de análise: valida, verifica limites do plano, armazena a imagem,
 * persiste a análise como QUEUED e publica o evento na fila.
 *
 * A requisição HTTP termina aqui (202). A inferência acontece de forma assíncrona:
 * Redis Stream → worker Go → serviço Python → callback interno.
 */
@Injectable()
export class AnalysesService {
  private readonly logger = new Logger(AnalysesService.name);

  constructor(
    @Inject(ANALYSIS_REPOSITORY) private readonly analyses: AnalysisRepository,
    @Inject(IMAGE_STORAGE) private readonly storage: ImageStorage,
    @Inject(ANALYSIS_QUEUE) private readonly queue: AnalysisQueue,
    @Inject(TENANT_STORAGE_COUNTER) private readonly storageCounter: TenantStorageCounter,
    @Inject(ENTITLEMENTS) private readonly entitlements: EntitlementsPort,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(APP_ENV) private readonly env: Pick<AppEnv, 'ANALYSIS_MAX_FILE_MB'>,
  ) {}

  async request(actor: Actor, service: VisionServiceCode, file: UploadedImage | undefined, options?: { confidenceThreshold?: number }) {
    const contentType = assertValidImage(file?.buffer, this.env.ANALYSIS_MAX_FILE_MB);
    const buffer = file!.buffer;
    await this.entitlements.assertCanRunAnalysis(actor.tenantId, service, buffer.length);

    const id = randomUUID();
    const key = `${actor.tenantId}/${id}.${EXTENSIONS[contentType]}`;
    const stored = await this.storage.put(key, buffer, contentType);
    const analysis = Analysis.request(
      {
        id,
        tenantId: actor.tenantId,
        requestedById: actor.userId,
        service,
        imageStorage: stored.storage,
        imageKey: stored.key,
        contentType,
        sizeBytes: buffer.length,
        originalName: file!.originalname || `imagem.${EXTENSIONS[contentType]}`,
      },
      this.clock.now(),
    );
    await this.analyses.save(analysis);
    await this.storageCounter.add(actor.tenantId, buffer.length);
    await this.publish(analysis, options);

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: 'analysis.requested',
      entityType: 'analysis',
      entityId: id,
      metadata: { service, sizeBytes: buffer.length },
      ip: actor.ip,
    });
    return analysis.toSnapshot();
  }

  async retry(actor: Actor, id: string) {
    const a = await this.analyses.findById(actor.tenantId, id);
    if (!a) throw notFound('Análise');
    if (a.status !== 'FAILED') throw new DomainError('INVALID_STATE', 'Somente análises com falha podem ser reprocessadas.');
    a.requeue(this.clock.now());
    await this.analyses.save(a);
    await this.publish(a);
    await this.audit.record({ tenantId: actor.tenantId, actorId: actor.userId, action: 'analysis.retried', entityType: 'analysis', entityId: id, ip: actor.ip });
    return a.toSnapshot();
  }

  async image(actor: Actor, id: string) {
    const a = await this.analyses.findById(actor.tenantId, id);
    if (!a) throw notFound('Análise');
    const s = a.toSnapshot();
    if (!s.imageKey) throw new DomainError('NOT_FOUND', 'Imagem removida pela política de retenção.');
    return { buffer: await this.storage.read(s.imageKey), contentType: s.contentType };
  }

  /** Publica (ou republica) o evento. Usado também pelo job de reprocessamento. */
  async publish(a: Analysis, options?: { confidenceThreshold?: number }) {
    const s = a.toSnapshot();
    const event: AnalysisRequestedEvent = {
      eventId: randomUUID(),
      eventType: 'vision.analysis.requested',
      version: 1,
      occurredAt: this.clock.now().toISOString(),
      data: {
        analysisId: s.id,
        tenantId: s.tenantId,
        service: s.service,
        image: {
          storage: s.imageStorage as 'local' | 'supabase',
          key: s.imageKey,
          contentType: s.contentType,
          ...(this.storage.driver === 'supabase' ? { url: await this.storage.signedUrl(s.imageKey, 3600) } : {}),
        },
        ...(options?.confidenceThreshold !== undefined ? { options: { confidenceThreshold: options.confidenceThreshold } } : {}),
      },
    };
    try {
      await this.queue.publishRequested(event);
    } catch (err) {
      // A análise continua QUEUED no banco; o job "requeue-stale" republica depois.
      this.logger.error(`Falha ao publicar análise ${s.id}: ${(err as Error).message}`);
    }
  }
}
