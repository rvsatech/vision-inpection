import { DomainError } from '../../../shared/domain/domain-error';
import type { VisionServiceCode } from './vision-service';

export type AnalysisStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
export type Verdict = 'PASS' | 'FAIL' | 'INFO';

export interface InferenceResult {
  analysisId: string;
  service: VisionServiceCode;
  mode: 'yolo' | 'heuristic';
  modelVersion: string;
  latencyMs: number;
  image: { width: number; height: number };
  summary: { verdict: Verdict; headline: string; metrics: Record<string, number> };
  detections: Array<{
    label: string;
    confidence: number;
    bbox: { x: number; y: number; w: number; h: number };
    severity?: 'info' | 'warning' | 'critical';
  }>;
}

export interface AnalysisProps {
  id: string;
  tenantId: string;
  requestedById: string;
  service: VisionServiceCode;
  status: AnalysisStatus;
  imageStorage: string;
  imageKey: string;
  contentType: string;
  sizeBytes: number;
  originalName: string;
  attempts: number;
  verdict: Verdict | null;
  headline: string | null;
  result: InferenceResult | null;
  failureReason: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Ciclo de vida de uma análise:
 *   QUEUED → PROCESSING → COMPLETED
 *                       ↘ FAILED
 * PROCESSING pode voltar a PROCESSING (retry do worker). Estados finais são imutáveis,
 * e callbacks repetidos para um estado final são ignorados (entrega at-least-once).
 */
export class Analysis {
  private constructor(private props: AnalysisProps) {}

  static request(
    input: Pick<AnalysisProps, 'id' | 'tenantId' | 'requestedById' | 'service' | 'imageStorage' | 'imageKey' | 'contentType' | 'sizeBytes' | 'originalName'>,
    now: Date,
  ) {
    return new Analysis({
      ...input,
      originalName: input.originalName.slice(0, 200),
      status: 'QUEUED',
      attempts: 0,
      verdict: null,
      headline: null,
      result: null,
      failureReason: null,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
    });
  }

  static restore(props: AnalysisProps) {
    return new Analysis({ ...props });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get status() { return this.props.status; }
  get service() { return this.props.service; }
  get isFinal() { return this.props.status === 'COMPLETED' || this.props.status === 'FAILED'; }

  toSnapshot(): Readonly<AnalysisProps> {
    return { ...this.props };
  }

  /** @returns false se o callback chegou atrasado (análise já finalizada). */
  start(attempt: number, now: Date): boolean {
    if (this.isFinal) return false;
    this.props.status = 'PROCESSING';
    this.props.attempts = Math.max(this.props.attempts, attempt);
    this.props.startedAt ??= now;
    return true;
  }

  complete(result: InferenceResult, attempt: number, now: Date): boolean {
    if (this.isFinal) return false;
    if (result.analysisId !== this.props.id || result.service !== this.props.service) {
      throw new DomainError('VALIDATION', 'Resultado não corresponde à análise.');
    }
    this.props.status = 'COMPLETED';
    this.props.attempts = Math.max(this.props.attempts, attempt);
    this.props.result = result;
    this.props.verdict = result.summary.verdict;
    this.props.headline = result.summary.headline.slice(0, 240);
    this.props.failureReason = null;
    this.props.startedAt ??= now;
    this.props.completedAt = now;
    return true;
  }

  fail(reason: string, attempt: number, now: Date): boolean {
    if (this.isFinal) return false;
    this.props.status = 'FAILED';
    this.props.attempts = Math.max(this.props.attempts, attempt);
    this.props.failureReason = reason.slice(0, 500);
    this.props.completedAt = now;
    return true;
  }

  /** Re-enfileiramento manual/automático de uma análise travada ou com falha. */
  requeue(now: Date) {
    if (this.props.status === 'COMPLETED') throw new DomainError('INVALID_STATE', 'Análise concluída não pode ser reprocessada.');
    this.props.status = 'QUEUED';
    this.props.failureReason = null;
    this.props.completedAt = null;
    this.props.queuedAt = now;
  }

  purgeImage() {
    this.props.imageKey = '';
  }
}
