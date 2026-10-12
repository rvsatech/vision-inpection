import type { Analysis } from './analysis';
import type { VisionServiceCode } from './vision-service';

export interface AnalysisRepository {
  findById(tenantId: string, id: string): Promise<Analysis | null>;
  /** Sem escopo de tenant — usado apenas pelos callbacks internos do worker. */
  findByIdUnscoped(id: string): Promise<Analysis | null>;
  findStale(queuedBefore: Date, processingBefore: Date, maxAttempts: number, limit: number): Promise<Analysis[]>;
  findWithImagesOlderThan(date: Date, limit: number): Promise<Analysis[]>;
  save(a: Analysis): Promise<void>;
}
export const ANALYSIS_REPOSITORY = Symbol('ANALYSIS_REPOSITORY');

export interface StoredImage {
  storage: 'local' | 'supabase';
  key: string;
}

export interface ImageStorage {
  readonly driver: 'local' | 'supabase';
  put(key: string, data: Buffer, contentType: string): Promise<StoredImage>;
  /** URL temporária (storage remoto) — undefined para storage local. */
  signedUrl(key: string, expiresInSeconds: number): Promise<string | undefined>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
export const IMAGE_STORAGE = Symbol('IMAGE_STORAGE');

/** Contrato vision.analysis.requested v1 (packages/contracts). */
export interface AnalysisRequestedEvent {
  eventId: string;
  eventType: 'vision.analysis.requested';
  version: 1;
  occurredAt: string;
  data: {
    analysisId: string;
    tenantId: string;
    service: VisionServiceCode;
    image: { storage: 'local' | 'supabase'; key: string; url?: string; contentType: string };
    options?: { confidenceThreshold?: number };
  };
}

export interface AnalysisQueue {
  publishRequested(event: AnalysisRequestedEvent): Promise<string>;
}
export const ANALYSIS_QUEUE = Symbol('ANALYSIS_QUEUE');

export interface TenantStorageCounter {
  add(tenantId: string, bytes: number): Promise<void>;
}
export const TENANT_STORAGE_COUNTER = Symbol('TENANT_STORAGE_COUNTER');
