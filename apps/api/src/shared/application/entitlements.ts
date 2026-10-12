import type { VisionServiceCode } from '../../modules/inspection/domain/vision-service';

/**
 * Porta para regras de plano/assinatura consultadas por outros contextos.
 * Implementada pelo contexto de billing (EntitlementsService).
 */
export interface EntitlementsPort {
  assertCanAddUser(tenantId: string): Promise<void>;
  assertCanRunAnalysis(tenantId: string, service: VisionServiceCode, fileBytes: number): Promise<void>;
}

export const ENTITLEMENTS = Symbol('ENTITLEMENTS');
