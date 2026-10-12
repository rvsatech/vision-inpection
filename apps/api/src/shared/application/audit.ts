/** Porta de auditoria usada por todos os casos de uso. Implementada pelo módulo audit. */
export interface AuditEntry {
  tenantId: string | null;
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export interface AuditRecorder {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_RECORDER = Symbol('AUDIT_RECORDER');
